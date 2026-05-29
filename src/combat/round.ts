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
 * 6. Wave-based round structure:
 *    A round is a loop of waves. Each wave, every active combatant declares
 *    ONE action. Waves repeat until no combatant can (or wants to) act.
 *    Use resolveRoundWaves for this behaviour; resolveRound is kept for tests.
 */

import type { RollResult } from '../types'
import type {
  CombatantState, CombatEffect,
  RoundLog, PhaseLog, ActionLogEntry,
  ActionId, GuardId, ResolvedAction, MaintenanceEntry,
} from './types'
import {
  resolveAction, type ActionContext,
  ACTION_DEFS, GUARD_DEFS,
  availableGuards,
} from './actions'
import {
  spendActionCost, applyEffects, processRoundEnd,
  snapshotCombatant, toCombatantSnapshot, isDefeated,
} from './combatant'

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
  /** Cri de guerre ou réaction émotionnelle — visible dans les logs (agent LLM) */
  battleCry?: string
  /** Raisonnement interne de l'agent — non transmis à l'adversaire (agent LLM) */
  reasoning?: string
}

/**
 * Called exactly once per target per round, the first time they are attacked.
 * Returns the GuardId the defender wants to use for this round.
 *
 * The guard is then cached; all subsequent attackers this round face the same result.
 *
 * @param targetId   ID of the combatant being attacked
 * @param state      Pre-action snapshot of the defender
 * @param available  Guards the defender can currently use (canUseGuard filtered)
 * @param attackerId ID of the attacking combatant
 * @param actionId   The incoming attack action
 */
export type GuardProvider = (
  targetId:   string,
  state:      CombatantState,
  available:  GuardId[],
  attackerId: string,
  actionId:   ActionId,
) => GuardId

// ─── Internal types ───────────────────────────────────────────────────────────

interface CachedGuard {
  guardId: GuardId
  roll:    RollResult
}

// ─── Wave resolution (internal) ───────────────────────────────────────────────

/**
 * Resolve one wave of actions.
 *
 * A wave is a set of PlannedActions (typically one per combatant), resolved
 * simultaneously by initiative group. Action costs are spent here.
 *
 * The guard cache must be shared across all waves within a round so that a
 * combatant's guard is rolled only once per round (§Système de Garde).
 *
 * @returns Updated state map and the PhaseLog entries produced by this wave.
 */
function resolveWave(
  inputStates: ReadonlyMap<string, CombatantState>,
  plans:       PlannedAction[],
  getGuard:    GuardProvider,
  guardCache:  Map<string, CachedGuard>,
): { states: Map<string, CombatantState>; phaseLogs: PhaseLog[] } {

  // ── Step 1: Spend action costs ──────────────────────────────────────────────
  let states = new Map(inputStates)
  for (const plan of plans) {
    const s = states.get(plan.actorId)
    if (!s || isDefeated(s)) continue
    states.set(plan.actorId, spendActionCost(s, ACTION_DEFS[plan.action].cost))
  }

  // ── Step 2: Sort and group by initiative (ascending) ───────────────────────
  const sorted = [...plans].sort((a, b) =>
    ACTION_DEFS[a.action].initiative - ACTION_DEFS[b.action].initiative
  )
  const groups = groupByInitiative(sorted)

  const phaseLogs: PhaseLog[] = []

  // ── Step 3: Resolve each initiative group (snapshot-then-apply) ────────────
  for (const group of groups) {
    const initiative = ACTION_DEFS[group[0].action].initiative

    // a. Snapshot every actor (and their target) before any rolls
    const snapshots = new Map<string, CombatantState>()
    for (const plan of group) {
      for (const id of [plan.actorId, plan.targetId].filter(Boolean) as string[]) {
        if (!snapshots.has(id)) {
          const s = states.get(id)
          if (s) snapshots.set(id, snapshotCombatant(s))
        }
      }
    }

    const phaseEffects: CombatEffect[] = []
    const actionLogs:   ActionLogEntry[] = []

    // b. Resolve each action using snapshots
    for (const plan of group) {
      const actorSnap = snapshots.get(plan.actorId)
      if (!actorSnap || isDefeated(actorSnap)) continue

      const def = ACTION_DEFS[plan.action]

      // Tokens the actor had at the start of this wave (before cost was spent)
      const preSpend = inputStates.get(plan.actorId)

      // ── Self-targeted actions (Respiration, Stabiliser) ──────────────────
      if (def.selfTargeted) {
        // DC uses the live state (most current before this phase) for dynamic values
        const actorLive = states.get(plan.actorId) ?? actorSnap
        const ctx: ActionContext = {
          dc:            def.getDC!(actorLive),
          guardReaction: { effects: [], notes: [] },
        }
        const resolved = resolveAction(actorSnap, plan.action, ctx)
        phaseEffects.push(...resolved.effects)
        actionLogs.push(toActionLogEntry(resolved, preSpend?.actions ?? 0, preSpend?.reactions ?? 0, plan.battleCry, plan.reasoning))
        continue
      }

      // ── Offensive actions ─────────────────────────────────────────────────
      if (!plan.targetId) continue
      const targetSnap = snapshots.get(plan.targetId)
      if (!targetSnap || isDefeated(targetSnap)) continue

      // Obtain the guard DC — rolled fresh on first attack, cached thereafter
      const { guardId, guardRoll, reaction } = getOrRollGuard(
        plan.targetId, targetSnap,
        plan.actorId,  plan.action,
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
      actionLogs.push(toActionLogEntry(resolved, preSpend?.actions ?? 0, preSpend?.reactions ?? 0, plan.battleCry, plan.reasoning))
    }

    // c. Apply all effects collected in this phase at once
    states = applyEffects(states, phaseEffects)
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
  const { states: waveStates, phaseLogs } = resolveWave(inputStates, plans, getGuard, guardCache)

  // End-of-round processing
  let states = waveStates
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
 * Resolve a full combat round using a wave-based loop.
 *
 * Each wave:
 *  1. getPlans(currentStates) is called — returns one PlannedAction per
 *     combatant who still has PA and can act.
 *  2. The wave is resolved via resolveWave.
 *  3. States are updated; the loop repeats.
 *
 * The loop ends when getPlans() returns an empty array (no one can act), or
 * when all combatants are defeated, or when the safety cap is reached.
 *
 * The guard cache is shared across all waves: a combatant's guard roll is done
 * once per round (§Système de Garde), regardless of how many waves occur.
 *
 * End-of-round processing (wound conversion, etc.) runs once, after all waves.
 *
 * @param inputStates  Current states of all combatants (not mutated)
 * @param round        Round number (1-based, for logging)
 * @param getGuard     Callback invoked once per target per round to choose a guard
 * @param maintenance  Maintenance entries from resetRoundTokensWithLog (logged but not re-applied)
 * @param getPlans     Called each wave; returns actions for this wave (empty = stop).
 *                     May be synchronous or asynchronous (e.g. LLM agent).
 * @returns Updated state map and a structured RoundLog
 */
export async function resolveRoundWaves(
  inputStates: ReadonlyMap<string, CombatantState>,
  round:       number,
  getGuard:    GuardProvider,
  maintenance: MaintenanceEntry[],
  getPlans:    (currentStates: ReadonlyMap<string, CombatantState>) => PlannedAction[] | Promise<PlannedAction[]>,
): Promise<{ states: Map<string, CombatantState>; log: RoundLog }> {

  const guardCache = new Map<string, CachedGuard>()
  const allPhases: PhaseLog[] = []
  let   states    = new Map(inputStates)

  // Safety cap — a round can never have more waves than the max PA per combatant
  const MAX_WAVES = 10

  for (let wave = 0; wave < MAX_WAVES; wave++) {
    const plans = await Promise.resolve(getPlans(states))
    if (plans.length === 0) break

    const { states: next, phaseLogs } = resolveWave(states, plans, getGuard, guardCache)
    states = next
    allPhases.push(...phaseLogs)

    // Stop early if all combatants are defeated mid-round
    if ([...states.values()].every(isDefeated)) break
  }

  // ── End-of-round processing ────────────────────────────────────────────────
  for (const [id, s] of states) {
    states.set(id, processRoundEnd(s))
  }

  const log: RoundLog = {
    round,
    maintenance,
    phases:     allPhases,
    endOfRound: [...states.values()].map(toCombatantSnapshot),
  }

  return { states, log }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByInitiative(sorted: PlannedAction[]): PlannedAction[][] {
  if (sorted.length === 0) return []
  const groups: PlannedAction[][] = []
  let current: PlannedAction[] = [sorted[0]]
  let currentInit = ACTION_DEFS[sorted[0].action].initiative

  for (let i = 1; i < sorted.length; i++) {
    const init = ACTION_DEFS[sorted[i].action].initiative
    if (init === currentInit) {
      current.push(sorted[i])
    } else {
      groups.push(current)
      current     = [sorted[i]]
      currentInit = init
    }
  }
  groups.push(current)
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
  actionId:   ActionId,
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
  const requested = getGuard(targetId, targetSnap, available, attackerId, actionId)
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
