/**
 * Round resolution for the Quadrature combat module.
 *
 * Core rules implemented here:
 *
 * 1. Initiative ordering (§Actions):
 *    Actions are resolved in ascending initiative order (1 = first).
 *    Actions with the same initiative value form a group resolved simultaneously.
 *
 * 2. Snapshot-then-apply (simultaneous resolution):
 *    Before processing each initiative group, a snapshot of every involved
 *    combatant is taken. All rolls within the group use those snapshots.
 *    All resulting effects are collected first, then applied at once.
 *
 * 3. Guard persistence (§Le système de Garde):
 *    The first time a combatant is attacked in a round, the GuardProvider
 *    callback is invoked once to choose and roll the guard.
 *    That result is cached for the rest of the round.
 *    All subsequent attackers face the same score; no additional reaction is spent.
 *    The cache is shared across all waves within a round.
 *
 * 4. Guard reactions (§Réactions):
 *    Guards are reactions, not passive modifiers.
 *    Encaisser costs 0 reactions (always available as default).
 *    Esquive / Parade / Blocage cost 1⚡ on their first use per round.
 *
 * 5. End-of-round processing:
 *    Light-wound overflow → 1 heavy wound; hemorrhage token consumed on conversion.
 *
 * 6. Band-swept round structure (§ b) Phase d'actions):
 *    A round sweeps the three initiative bands — I, then II, then III. A band
 *    is revealed only once the previous one has resolved, so a slow card
 *    commits knowing the outcome of the fast ones, but blind to the rest of its
 *    own band. Within a band, resolution stays ordered by the fine 1-10
 *    initiative (rule 1).
 *    Use resolveRoundBands for this behaviour; resolveRound is kept for tests.
 */

import type { RollResult } from '../types'
import type {
  CombatantState, CombatEffect, CombatantSnapshot,
  RoundLog, PhaseLog, ActionLogEntry,
  ActionId, GuardId, ResolvedAction, MaintenanceEntry,
} from './types'
import {
  resolveAction, type ActionContext,
  ACTION_DEFS, GUARD_DEFS,
  availableGuards,
} from './actions'
import {
  spendActionCost, processRoundEnd,
  toCombatantSnapshot, isDefeated,
} from './combatant'
import {
  type Actor, isAdversaryActor, actorDefeated, actorEndRound,
  snapshotActor, applyEffectsToActors,
} from '../adversary/actor'
import {
  spendCardCost, toAdversarySnapshot, type AdversarySnapshot,
  mentalDieRank, effectiveGuard,
} from '../adversary/combatant'
import { resolveAdversaryAttack } from '../adversary/attack'
import { attackAdvantages } from '../adversary/traits'
import { selectTargetPart } from '../adversary/agent'
import { BANDS, bandOf, type Band } from './bands'

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * A combatant's declared intention for one wave.
 * Guard choice is NOT declared here — it is made reactively during resolution
 * via the GuardProvider callback passed to resolveRound / resolveRoundWaves.
 */
export interface PlannedAction {
  actorId:    string
  action:     ActionId
  /** Target of an offensive action. Undefined for self-targeted actions. */
  targetId?:  string
  /** Declared body part when the target is an adversary (§ Cibler une partie). */
  targetPart?: string
  /** Cri de guerre ou réaction émotionnelle — visible dans les logs (agent LLM) */
  battleCry?: string
  /** Raisonnement interne de l'agent — non transmis à l'adversaire (agent LLM) */
  reasoning?: string
}

/**
 * An adversary's declared card play for one wave. The creature rolls its summed
 * dice pool against the target PC's guard score (asymmetric resolution).
 */
export interface PlannedCard {
  actorId:    string
  /** Card id from the creature's deck (e.g. sickleStrike). */
  card:       string
  /** The PC being attacked (adversary vs adversary is out of scope). */
  targetId:   string
  battleCry?: string
  reasoning?: string
}

/** A wave plan: a PC action or an adversary card play. */
export type Plan = PlannedAction | PlannedCard

/** Structural discriminant between the two plan kinds. */
export function isCardPlan(p: Plan): p is PlannedCard {
  return 'card' in p
}

/**
 * Called exactly once per target per round, the first time they are attacked.
 * Returns the GuardId the defender wants to use for this round.
 *
 * The guard is then cached; all subsequent attackers this round face the same result.
 *
 * @param targetId   ID of the combatant being attacked
 * @param state      Pre-action snapshot of the defender (always a PC — adversaries
 *                   defend with a fixed value and never roll a guard)
 * @param available  Guards the defender can currently use (canUseGuard filtered)
 * @param attackerId ID of the attacking combatant
 * @param actionId   The incoming attack: an ActionId, or a card id when the
 *                   attacker is an adversary
 * @param attackInitiative  Initiative of the incoming attack (needed to filter
 *                   guards when actionId is a card id)
 */
export type GuardProvider = (
  targetId:   string,
  state:      CombatantState,
  available:  GuardId[],
  attackerId: string,
  actionId:   ActionId | string,
  attackInitiative?: number,
) => GuardId

// ─── Internal types ───────────────────────────────────────────────────────────

interface CachedGuard {
  guardId: GuardId
  roll:    RollResult
}

// ─── Wave resolution (internal) ───────────────────────────────────────────────

/**
 * Resolve one set of plans — in practice, everything committed to a single band.
 *
 * Plans are resolved by initiative group: same-initiative actions are truly
 * simultaneous (snapshot-then-apply), while distinct initiatives sequence, each
 * group seeing the previous one's result. Action costs are spent here.
 *
 * The guard cache must be shared across every band within a round so that a
 * combatant's guard is rolled only once per round (§Système de Garde).
 *
 * @returns Updated state map and the PhaseLog entries produced by these plans.
 */
function resolvePlans(
  inputStates: ReadonlyMap<string, Actor>,
  plans:       Plan[],
  getGuard:    GuardProvider,
  guardCache:  Map<string, CachedGuard>,
): { states: Map<string, Actor>; phaseLogs: PhaseLog[] } {

  // ── Step 1: Spend action costs ──────────────────────────────────────────────
  let states = new Map(inputStates)
  for (const plan of plans) {
    const s = states.get(plan.actorId)
    if (!s || actorDefeated(s)) continue
    if (isCardPlan(plan)) {
      if (isAdversaryActor(s)) states.set(plan.actorId, spendCardCost(s, plan.card))
    } else if (!isAdversaryActor(s)) {
      states.set(plan.actorId, spendActionCost(s, ACTION_DEFS[plan.action].cost))
    }
  }

  // ── Step 2: Sort and group by initiative (ascending) ───────────────────────
  const groups = groupByInitiative(
    plans
      .map(plan => ({ plan, initiative: initiativeOf(plan, inputStates) }))
      .sort((a, b) => a.initiative - b.initiative),
  )

  const phaseLogs: PhaseLog[] = []

  // ── Step 3: Resolve each initiative group (snapshot-then-apply) ────────────
  for (const group of groups) {
    const initiative = group.initiative

    // a. Snapshot every actor (and their target) before any rolls
    const snapshots = new Map<string, Actor>()
    for (const plan of group.plans) {
      for (const id of [plan.actorId, plan.targetId].filter(Boolean) as string[]) {
        if (!snapshots.has(id)) {
          const s = states.get(id)
          if (s) snapshots.set(id, snapshotActor(s))
        }
      }
    }

    const phaseEffects: CombatEffect[] = []
    const actionLogs:   ActionLogEntry[] = []

    // b. Resolve each action using snapshots
    for (const plan of group.plans) {
      const actorSnap = snapshots.get(plan.actorId)
      if (!actorSnap || actorDefeated(actorSnap)) continue

      // Tokens the actor had at the start of this wave (before cost was spent)
      const preSpend = inputStates.get(plan.actorId)
      const preActions   = preSpend?.actions ?? 0
      const preReactions = preSpend && 'reactions' in preSpend ? preSpend.reactions : 0

      // ── Adversary card play (asymmetric: summed dice vs PC guard score) ───
      if (isCardPlan(plan)) {
        if (!isAdversaryActor(actorSnap)) continue
        const card = actorSnap.sheet.cards.find(k => k.id === plan.card)
        if (!card) continue
        const targetSnap = snapshots.get(plan.targetId)
        // Adversary vs adversary is out of scope; the target must be a PC.
        if (!targetSnap || actorDefeated(targetSnap) || isAdversaryActor(targetSnap)) continue

        // The PC's guard score is the threshold — same once-per-round cache.
        const { guardId, guardRoll, reaction } = getOrRollGuard(
          plan.targetId, targetSnap,
          plan.actorId,  plan.card, card.initiative,
          getGuard, guardCache,
        )
        // Structured traits (e.g. Sanguinaire) may upgrade dice quality 🟩 ;
        // l'état mental de la créature ⬆/⬇ le RANG de ses dés de menace (empilé).
        const traits = attackAdvantages(actorSnap, card, targetSnap)
        const rank   = mentalDieRank(actorSnap.mentalState)
        const result = resolveAdversaryAttack(
          actorSnap.sheet.dice, card, guardRoll.total, plan.targetId,
          {
            advantages:    traits.advantages + Math.max(0, rank),
            disadvantages: Math.max(0, -rank),
            selfId:        plan.actorId,
          },
        )
        const effects = [...reaction.effects, ...result.effects]
        phaseEffects.push(...effects)
        actionLogs.push({
          actorId:        plan.actorId,
          action:         card.id,
          targetId:       plan.targetId,
          guardId,
          guardRoll,
          adversaryRoll:  result.roll,
          threshold:      guardRoll.total,
          hit:            result.hit,
          effects,
          notes:          [...reaction.notes, ...traits.notes, ...result.notes],
          actorActions:   preActions,
          actorReactions: 0,
          ...(plan.battleCry && { battleCry: plan.battleCry }),
          ...(plan.reasoning && { reasoning: plan.reasoning }),
        })
        continue
      }

      // ── Player-character plans ─────────────────────────────────────────────
      if (isAdversaryActor(actorSnap)) continue  // adversaries only submit card plans
      const def = ACTION_DEFS[plan.action]

      // ── Self-targeted actions (Respiration, Stabiliser) ──────────────────
      if (def.selfTargeted) {
        // DC uses the live state (most current before this phase) for dynamic values
        const live      = states.get(plan.actorId)
        const actorLive = live && !isAdversaryActor(live) ? live : actorSnap
        const ctx: ActionContext = {
          dc:            def.getDC!(actorLive),
          guardReaction: { effects: [], notes: [] },
        }
        const resolved = resolveAction(actorSnap, plan.action, ctx)
        phaseEffects.push(...resolved.effects)
        actionLogs.push(toActionLogEntry(resolved, preActions, preReactions, plan.battleCry, plan.reasoning))
        continue
      }

      // ── Offensive actions ─────────────────────────────────────────────────
      if (!plan.targetId) continue
      const targetSnap = snapshots.get(plan.targetId)
      if (!targetSnap || actorDefeated(targetSnap)) continue

      // ── PC attacks an adversary: fixed guard value, declared body part ────
      if (isAdversaryActor(targetSnap)) {
        const targetPart = plan.targetPart ?? selectTargetPart(targetSnap, 'melee')?.type
        const ctx: ActionContext = {
          // Garde de base + bonus des blocs intacts ± état mental (source unique).
          dc:            effectiveGuard(targetSnap),
          guardReaction: { effects: [], notes: [] },
          target:        targetSnap,
        }
        const resolved = resolveAction(actorSnap, plan.action, ctx)
        // Wound effects land on the declared part (routed by applyEffectsToActors)
        const routed = resolved.effects.map(e =>
          e.targetId === plan.targetId && targetPart ? { ...e, targetPart } : e)
        phaseEffects.push(...routed)
        actionLogs.push({
          ...toActionLogEntry(resolved, preActions, preReactions, plan.battleCry, plan.reasoning),
          effects: routed,
          ...(targetPart && { targetPart }),
        })
        continue
      }

      // ── PC attacks a PC: guard rolled fresh on first attack, cached after ─
      const { guardId, guardRoll, reaction } = getOrRollGuard(
        plan.targetId, targetSnap,
        plan.actorId,  plan.action, def.initiative,
        getGuard, guardCache,
      )

      const ctx: ActionContext = {
        dc:            guardRoll.total,
        dcRoll:        guardRoll,
        guardId,
        guardReaction: reaction,
        target:        targetSnap,
      }
      const resolved = resolveAction(actorSnap, plan.action, ctx)
      phaseEffects.push(...resolved.effects)
      actionLogs.push(toActionLogEntry(resolved, preActions, preReactions, plan.battleCry, plan.reasoning))
    }

    // c. Apply all effects collected in this phase at once
    states = applyEffectsToActors(states, phaseEffects)
    phaseLogs.push({ initiative, actions: actionLogs })
  }

  return { states, phaseLogs }
}

// ─── Public entry points ──────────────────────────────────────────────────────

/**
 * Resolve a complete combat round (single-wave, backward-compatible).
 *
 * All plans are resolved in one pass, grouped by initiative.
 * Suitable for tests and scenarios where actions are pre-planned.
 *
 * For iterative wave-by-wave resolution (one action per combatant per wave),
 * use resolveRoundWaves instead.
 *
 * @param inputStates  Current states of all combatants (not mutated)
 * @param plans        One or more PlannedActions per active combatant
 * @param round        Round number (1-based, for logging)
 * @param getGuard     Callback invoked once per target per round to choose a guard
 * @param maintenance  Optional maintenance entries from resetRoundTokensWithLog
 * @returns Updated state map and a structured RoundLog
 */
export function resolveRound(
  inputStates: ReadonlyMap<string, CombatantState>,
  plans:       PlannedAction[],
  round:       number,
  getGuard:    GuardProvider,
  maintenance: MaintenanceEntry[] = [],
): { states: Map<string, CombatantState>; log: RoundLog } {

  const guardCache = new Map<string, CachedGuard>()
  const { states: waveStates, phaseLogs } = resolvePlans(inputStates, plans, getGuard, guardCache)

  // All inputs were PCs and resolveWave never changes an actor's kind,
  // so narrowing the union map back to CombatantState is sound.
  const states = waveStates as Map<string, CombatantState>

  // End-of-round processing
  for (const [id, s] of states) {
    states.set(id, processRoundEnd(s))
  }

  const log: RoundLog = {
    round,
    maintenance,
    phases:     phaseLogs,
    endOfRound: [...states.values()].map(toCombatantSnapshot),
  }

  return { states, log }
}

/**
 * Resolve a full combat round by sweeping the three initiative bands.
 *
 * For each band I → II → III:
 *  1. getPlans(currentStates, band) is called — returns what every combatant
 *     commits to THIS band. An empty band is normal (a combatant may sit one
 *     out): unlike a wave loop, the sweep carries on to the next band.
 *  2. The band is resolved via resolvePlans, ordered by fine initiative.
 *  3. States are updated; onBandResolved fires; the sweep moves on.
 *
 * Plans whose initiative does not fall in the requested band are dropped —
 * the band is the contract, and honouring it is the planner's job.
 *
 * The guard cache is shared across all bands: a combatant's guard is rolled
 * once per round (§Système de Garde), whichever band the attacks land in.
 *
 * End-of-round processing (wound conversion, etc.) runs once, after band III.
 *
 * @param inputStates  Current states of all combatants (not mutated)
 * @param round        Round number (1-based, for logging)
 * @param getGuard     Callback invoked once per target per round to choose a guard
 * @param maintenance  Maintenance entries from resetRoundTokensWithLog (logged but not re-applied)
 * @param getPlans        Called once per band; returns what is committed to it.
 *                        May be synchronous or asynchronous (e.g. LLM agent).
 * @param onBandResolved  Optional callback invoked synchronously after each band
 *                        resolves, BEFORE the next band's getPlans call. Used for
 *                        real-time display and to update LLM session context.
 * @returns Updated state map and a structured RoundLog
 */
export async function resolveRoundBands<A extends Actor>(
  inputStates:     ReadonlyMap<string, A>,
  round:           number,
  getGuard:        GuardProvider,
  maintenance:     MaintenanceEntry[],
  getPlans:        (currentStates: ReadonlyMap<string, A>, band: Band) => Plan[] | Promise<Plan[]>,
  onBandResolved?: (band: Band, phaseLogs: PhaseLog[]) => void,
): Promise<{ states: Map<string, A>; log: RoundLog }> {

  const guardCache = new Map<string, CachedGuard>()
  const allPhases: PhaseLog[] = []
  let   states: Map<string, Actor> = new Map(inputStates)

  for (const band of BANDS) {
    // resolvePlans never changes an actor's kind, so the map stays A-shaped
    // (the double cast is required: TS cannot see that invariant).
    const declared = await Promise.resolve(
      getPlans(states as unknown as ReadonlyMap<string, A>, band),
    )
    const plans = oneCardPerActor(declared.filter(p => bandOf(initiativeOf(p, states)) === band))
    if (plans.length === 0) continue

    const { states: next, phaseLogs } = resolvePlans(states, plans, getGuard, guardCache)
    states = next
    allPhases.push(...phaseLogs)

    // Notify: display + LLM context update — BEFORE the next band's getPlans
    onBandResolved?.(band, phaseLogs)

    // Stop early if all combatants are defeated mid-round
    if ([...states.values()].every(actorDefeated)) break
  }

  // ── End-of-round processing (PC wound overflow; adversaries: none) ─────────
  for (const [id, s] of states) {
    states.set(id, actorEndRound(s))
  }

  // Round-end snapshots, split per actor kind
  const pcSnaps:  CombatantSnapshot[] = []
  const advSnaps: AdversarySnapshot[] = []
  for (const s of states.values()) {
    if (isAdversaryActor(s)) advSnaps.push(toAdversarySnapshot(s))
    else                     pcSnaps.push(toCombatantSnapshot(s))
  }

  const log: RoundLog = {
    round,
    maintenance,
    phases:     allPhases,
    endOfRound: pcSnaps,
    ...(advSnaps.length > 0 && { adversariesEndOfRound: advSnaps }),
  }

  return { states: states as unknown as Map<string, A>, log }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Enforce « une carte par bande, au plus » (§ b) : each combatant lays down a
 * single card per reveal, so every band is a choice — heal or strike, not both.
 * At most three cards a round, one per band.
 *
 * The first plan wins; the rest are dropped. Planners are expected to respect
 * the rule themselves — this is the contract's safety net.
 */
function oneCardPerActor(plans: Plan[]): Plan[] {
  const seen = new Set<string>()
  return plans.filter(p => {
    if (seen.has(p.actorId)) return false
    seen.add(p.actorId)
    return true
  })
}

/** Initiative of a plan: ACTION_DEFS for a PC action, the card's for an adversary play. */
function initiativeOf(plan: Plan, states: ReadonlyMap<string, Actor>): number {
  if (isCardPlan(plan)) {
    const a = states.get(plan.actorId)
    if (a && isAdversaryActor(a)) {
      return a.sheet.cards.find(c => c.id === plan.card)?.initiative ?? 99
    }
    return 99
  }
  return ACTION_DEFS[plan.action].initiative
}

/** Group consecutive plans sharing the same (pre-computed) initiative value. */
function groupByInitiative(
  sorted: Array<{ plan: Plan; initiative: number }>,
): Array<{ initiative: number; plans: Plan[] }> {
  const groups: Array<{ initiative: number; plans: Plan[] }> = []
  for (const { plan, initiative } of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.initiative === initiative) last.plans.push(plan)
    else groups.push({ initiative, plans: [plan] })
  }
  return groups
}

/**
 * Return the guard DC for a target this round, rolling it fresh on first call.
 *
 * First attack on a target:
 *   1. GuardProvider callback chooses the guard
 *   2. GuardDef.rollDC() rolls it (encapsulated in the def)
 *   3. GuardDef.effects() produces the reaction cost (spend-reaction if non-absorb)
 *   4. Result is cached
 *
 * Subsequent attacks on the same target (same or later waves):
 *   Cached roll is returned; reaction is empty (no additional cost).
 */
function getOrRollGuard(
  targetId:   string,
  targetSnap: CombatantState,
  attackerId: string,
  actionId:   ActionId | string,
  attackInitiative: number,
  getGuard:   GuardProvider,
  cache:      Map<string, CachedGuard>,
): { guardId: GuardId; guardRoll: RollResult; reaction: { effects: CombatEffect[]; notes: string[] } } {
  const existing = cache.get(targetId)
  if (existing) {
    return {
      guardId:   existing.guardId,
      guardRoll: existing.roll,
      reaction:  { effects: [], notes: [] },
    }
  }

  // First attack on this target this round
  const available = availableGuards(targetSnap)
  const requested = getGuard(targetId, targetSnap, available, attackerId, actionId, attackInitiative)
  const guardId   = available.includes(requested) ? requested : 'absorb'

  const gd        = GUARD_DEFS[guardId]
  const guardRoll = gd.rollDC(targetSnap)
  const reaction  = gd.effects(
    { flaw: guardRoll.flaw, critical: guardRoll.critical },
    targetSnap, /* isFirstUse */ true,
  )

  cache.set(targetId, { guardId, roll: guardRoll })
  return { guardId, guardRoll, reaction }
}

function toActionLogEntry(
  resolved:       ResolvedAction,
  actorActions:   number,
  actorReactions: number,
  battleCry?:     string,
  reasoning?:     string,
): ActionLogEntry {
  return {
    actorId:        resolved.actorId,
    action:         resolved.action,
    targetId:       resolved.targetId,
    checkRoll:      resolved.checkRoll,
    guardId:        resolved.guardId,
    guardRoll:      resolved.guardRoll,
    threshold:      resolved.threshold,
    hit:            resolved.hit,
    effects:        resolved.effects,
    notes:          resolved.notes,
    actorActions,
    actorReactions,
    ...(battleCry && { battleCry }),
    ...(reasoning && { reasoning }),
  }
}
