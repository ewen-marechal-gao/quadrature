/**
 * Utility-based round planner — the scripted agents' new brain.
 *
 * Replaces the per-persona candidate lists: the planner enumerates every
 * LEGAL action (canUseAction/canAffordAction — the same contract the engine
 * enforces), prices each one exactly — P(outcome) from planner/prob × worth of
 * the effects its pure resolve() would produce from planner/value — and
 * searches the round's band assignments for the best combination.
 *
 * ── Why the whole round at once ──
 * A card's initiative pins it to a band (I 1-3 · II 4-6 · III 7-9) and a
 * combatant lays down one card per band from a SHARED pool of 3 PA: the choice
 * is a per-band pick under a common budget, with sequencing effects (a Band-I
 * Respiration clears the Essoufflé that reopens the Band-II Course; a Course's
 * élan arms the Band-III Charge). The option space is tiny (≤ ~10 actions,
 * ≤ ~100 assignments), so the search is exhaustive — reservation is optimal
 * instead of greedy. Étape 2 re-plans at each band reveal.
 *
 * ── Outcome pricing ──
 * For a checked action, every distribution cell (total, ⚠️, ✴️) maps to the
 * flags resolve() consumes. resolve() is PURE — calling it with hypothetical
 * flags yields the exact effects (dynamic amounts included: Respiration heals
 * 1+Endurance) which scoreEffects prices against live states. Eight flag
 * combinations at most, memoised per action.
 *
 * The attack DC is exact against an adversary (effectiveGuard) and an estimate
 * against a PC: the defender's stat-best eligible guard (mirroring the guard
 * provider) priced at its expected roll.
 */

import type { CombatantState, ActionId, GuardId } from '../combat/types'
import {
  ACTION_DEFS, GUARD_DEFS, canUseAction, canAffordAction, availableGuards,
  checkRollParams, rollParamsFrom,
} from '../combat/actions'
import {
  spendActionCost, mentalRollModifiers, MENTAL_STATE_EFFECTS,
} from '../combat/combatant'
import type { PlannedAction } from '../combat/round'
import { bandOf, BANDS, type Band } from '../combat/bands'
import { distance } from '../combat/position'
import { type Actor, isAdversaryActor, actorDefeated } from '../adversary/actor'
import { effectiveGuard } from '../adversary/combatant'
import { selectTargetPart } from '../adversary/agent'
import { checkDistribution, evOver } from './prob'
import {
  scoreEffects, PERSONA_WEIGHTS, type Weights, type ScoreContext, type PlannerPersona,
} from './value'

// ─── Configuration (mirror of AgentConfig, dependency-free) ───────────────────

/** What the planner needs to know about the combatant's orders. */
export interface PlannerConfig {
  persona:         PlannerPersona
  targetId:        string
  /** Scenario whitelist — absent/empty = every action allowed. */
  allowedActions?: ActionId[]
  /** Weight override (optimiser hook); defaults to the persona's vector. */
  weights?:        Weights
}

const isAllowed = (id: ActionId, config: PlannerConfig): boolean =>
  !config.allowedActions?.length || config.allowedActions.includes(id)

/** Every action known to the engine, in data/player_actions.yaml order. */
const ALL_ACTION_IDS = Object.keys(ACTION_DEFS) as ActionId[]

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Plan a full round: at most one action per band, PA-reserved, utility-best.
 * Movement (Marche/Course/Charge) is NOT planned here yet — the approach
 * pattern in combat/agent.ts still owns it until the positional-value étape.
 */
export function planRoundUtility(
  self:     CombatantState,
  opponent: Actor,
  config:   PlannerConfig,
): PlannedAction[] {
  const weights = config.weights ?? PERSONA_WEIGHTS[config.persona]
  const ctx = makeContext(self, opponent, weights, config)

  // Candidate actions, partitioned by the band their initiative pins them to.
  const byBand = new Map<Band, ActionId[]>()
  for (const id of ALL_ACTION_IDS) {
    const def = ACTION_DEFS[id]
    if (def.movement) continue                      // approach pattern's turf (étape 4)
    if (!isAllowed(id, config)) continue
    const band = bandOf(def.initiative)
    if (band === null) continue
    byBand.set(band, [...(byBand.get(band) ?? []), id])
  }

  // Exhaustive sweep of the band assignments (≤ ~100 leaves), reserving PA and
  // simulating self-effects so later bands see what earlier ones set up.
  interface Node { plan: Array<ActionId | null>; score: number }
  const complete: Node[] = []

  const dfs = (bandIdx: number, state: CombatantState, plan: Array<ActionId | null>, score: number): void => {
    if (bandIdx === BANDS.length) {
      complete.push({ plan, score })
      return
    }
    const band = BANDS[bandIdx]
    // Passing the band is always an option (and the only one when dry).
    dfs(bandIdx + 1, state, [...plan, null], score)
    for (const id of byBand.get(band) ?? []) {
      if (!canUseAction(state, id) || !canAffordAction(state, id)) continue
      const s = scorePlayerAction(id, state, opponent, ctx)
      const next = simulateSelfEffects(spendActionCost(state, ACTION_DEFS[id].cost), id)
      dfs(bandIdx + 1, next, [...plan, id], score + s)
    }
  }
  dfs(0, self, [], 0)

  const chosen = pickPlan(complete, weights.noise)
  if (!chosen) return []

  const plans: PlannedAction[] = []
  chosen.plan.forEach(id => {
    if (id === null) return
    const def = ACTION_DEFS[id]
    plans.push(def.selfTargeted
      ? { actorId: self.id, action: id }
      : { actorId: self.id, action: id, targetId: config.targetId })
  })
  return plans
}

/**
 * Best single action for one band given the current state — the approach
 * pattern uses it to fill Bande I while the feet do the rest of the round.
 * Returns null when passing scores best (nothing is worth its cost).
 */
export function bestActionForBand(
  state:    CombatantState,
  band:     Band,
  opponent: Actor,
  config:   PlannerConfig,
): ActionId | null {
  const weights = config.weights ?? PERSONA_WEIGHTS[config.persona]
  const ctx = makeContext(state, opponent, weights, config)
  let best: ActionId | null = null
  let bestScore = 0                                  // passing scores 0
  for (const id of ALL_ACTION_IDS) {
    const def = ACTION_DEFS[id]
    if (def.movement || !isAllowed(id, config)) continue
    if (bandOf(def.initiative) !== band) continue
    if (!canUseAction(state, id) || !canAffordAction(state, id)) continue
    const s = scorePlayerAction(id, state, opponent, ctx)
    if (s > bestScore) { best = id; bestScore = s }
  }
  return best
}

// ─── Action scoring ───────────────────────────────────────────────────────────

/**
 * Expected utility of playing `id` right now: Σ P(cell) × worth(effects the
 * flags would produce) − the action's own price (💧 cost, enraged surcharge,
 * ⚡). Out-of-reach attacks keep their costs and lose their payoff — which is
 * exactly why they stop being picked.
 */
export function scorePlayerAction(
  id:       ActionId,
  actor:    CombatantState,
  opponent: Actor,
  baseCtx:  ScoreContext,
): number {
  const def = ACTION_DEFS[id]
  // Price self-effects against the SIMULATED state (mid-round fatigue, statuses),
  // not the round-start snapshot the shared context was built from.
  const ctx: ScoreContext = {
    ...baseCtx,
    getActor: aid => aid === actor.id ? actor : baseCtx.getActor(aid),
  }

  // ── The action's own price, expressed as effects on self ──
  const surcharge = MENTAL_STATE_EFFECTS[actor.mentalState].fatiguePerAction
  const costFatigue = (def.cost.fatigue ?? 0) + surcharge
  let score = scoreEffects([
    ...(costFatigue > 0 ? [{ targetId: actor.id, kind: 'add-fatigue' as const, amount: costFatigue }] : []),
    ...(def.cost.reactions > 0 ? [{ targetId: actor.id, kind: 'spend-reaction' as const }] : []),
  ], ctx)

  // ── Self-targeted: roll vs dynamic DC, effects computed by the pure resolve ──
  if (def.selfTargeted) {
    const dc   = def.getDC ? def.getDC(actor) : 0
    const dist = checkDistribution(checkRollParams(actor, id))
    return score + evOver(dist, cell =>
      payoffFor(id, actor, undefined, undefined, cell.total >= dc, cell.critical, cell.flaw, ctx))
  }

  // ── Offensive: needs a live target ──
  if (actorDefeated(opponent)) return score

  // Reach gate (§ portée): a blow that cannot connect pays its costs for nothing.
  const gap = actor.pos && opponent.pos ? distance(actor.pos, opponent.pos) : null
  const connects = gap === null || def.reach == null || gap <= def.reach
  if (!connects) return score

  if (isAdversaryActor(opponent)) {
    // Exact DC (effectiveGuard), damage routed to the melee-priority part.
    const dc       = effectiveGuard(opponent)
    const partType = selectTargetPart(opponent, 'melee')?.type
    const dist     = checkDistribution(checkRollParams(actor, id, opponent))
    return score + evOver(dist, cell =>
      payoffFor(id, actor, opponent, partType, cell.total >= dc, cell.critical, cell.flaw, ctx))
  }

  // PC vs PC: estimate the guard the defender would pick, and its expected roll.
  const { dc, guardId } = estimateGuard(opponent, def.initiative)
  const dist = checkDistribution(checkRollParams(actor, id, opponent, guardId))
  return score + evOver(dist, cell =>
    payoffFor(id, actor, opponent, undefined, cell.total >= dc, cell.critical, cell.flaw, ctx))
}

/**
 * Worth of the effects `resolve()` would emit for one flag combination.
 * Eight combinations at most — memoised per call site by the tiny cache.
 */
function payoffFor(
  id:        ActionId,
  actor:     CombatantState,
  target:    Actor | undefined,
  partType:  string | undefined,
  hit:       boolean,
  critical:  boolean,
  flaw:      boolean,
  ctx:       ScoreContext,
): number {
  const key = (hit ? 1 : 0) | (critical ? 2 : 0) | (flaw ? 4 : 0)
  let cache = payoffCache.get(id)
  if (!cache || cache.actor !== actor || cache.target !== target) {
    cache = { actor, target, values: new Array<number | undefined>(8) }
    payoffCache.set(id, cache)
  }
  const hitVal = cache.values[key]
  if (hitVal !== undefined) return hitVal

  const { effects } = ACTION_DEFS[id].resolve(
    { hit, critical, flaw },
    actor,
    target as CombatantState | undefined,
  )
  const routed = partType
    ? effects.map(e => e.targetId === target?.id ? { ...e, targetPart: partType } : e)
    : effects
  const value = scoreEffects(routed, ctx)
  cache.values[key] = value
  return value
}

interface PayoffCache { actor: CombatantState; target: Actor | undefined; values: Array<number | undefined> }
const payoffCache = new Map<ActionId, PayoffCache>()

// ─── Guard estimation (PC defender) ───────────────────────────────────────────

/**
 * The guard a stat-optimal defender would choose against an attack of this
 * initiative, and the expected total of its roll — the planner's DC estimate.
 * Mirrors makeGuardProvider: initiative filter, best char+skill pool, active
 * guards preferred on ties, absorb as the floor.
 */
export function estimateGuard(
  defender:         CombatantState,
  attackInitiative: number,
): { dc: number; guardId: GuardId } {
  const TIEBREAK_ORDER: GuardId[] = ['dodge', 'parry', 'block', 'absorb']
  const eligible = availableGuards(defender)
    .filter(gid => GUARD_DEFS[gid].initiative < attackInitiative)
    .map(gid => {
      const gd = GUARD_DEFS[gid]
      const score = rollParamsFrom(defender, gd.rollChar, gd.rollSkill).characteristic
                  + defender.skills[gd.rollSkill]
      return { gid, score, rank: TIEBREAK_ORDER.indexOf(gid) }
    })
    .sort((a, b) => b.score - a.score || a.rank - b.rank)

  const guardId = eligible[0]?.gid ?? 'absorb'
  const gd = GUARD_DEFS[guardId]
  const mods = mentalRollModifiers(defender.mentalState, 'defensive')
  const params = rollParamsFrom(defender, gd.rollChar, gd.rollSkill,
    mods.disadvantages > 0 ? { disadvantages: mods.disadvantages, rerolls: mods.rerolls }
                           : { rerolls: mods.rerolls })
  return { dc: Math.round(checkDistribution(params).mean), guardId }
}

// ─── Plan-level helpers ───────────────────────────────────────────────────────

/**
 * Apply an action's SELF-EFFECTS to a planning-time state — only the fields a
 * later band gates on (élan for the Charge, Essoufflé for the Course, and the
 * Respiration clearing it). Not a resolution: no rolls, no target, no board.
 */
export function simulateSelfEffects(state: CombatantState, id: ActionId): CombatantState {
  const def = ACTION_DEFS[id]
  let s = state
  if (def.grantsInertia != null) s = { ...s, inertia: def.grantsInertia }
  if (def.grantsStatus && !s.status.includes(def.grantsStatus)) {
    s = { ...s, status: [...s.status, def.grantsStatus] }
  }
  if (def.clearsStatus) s = { ...s, status: s.status.filter(x => x !== def.clearsStatus) }
  return s
}

/**
 * Choose among the complete plans: strict argmax when noise = 0, softmax over
 * scores otherwise — the inexperienced picks PLAUSIBLY suboptimal plans
 * instead of following a hand-written short list.
 */
function pickPlan<T extends { score: number }>(plans: T[], noise: number): T | null {
  if (plans.length === 0) return null
  if (noise <= 0) {
    return plans.reduce((best, p) => p.score > best.score ? p : best)
  }
  const max = Math.max(...plans.map(p => p.score))
  const weights = plans.map(p => Math.exp((p.score - max) / noise))
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < plans.length; i++) {
    r -= weights[i]
    if (r <= 0) return plans[i]
  }
  return plans[plans.length - 1]
}

/** Battlefield wiring for scoreEffects: self, one enemy, live lookups. */
function makeContext(
  self:     CombatantState,
  opponent: Actor,
  weights:  Weights,
  config:   PlannerConfig,
): ScoreContext {
  return {
    selfId:  self.id,
    isEnemy: id => id === opponent.id,
    getActor: id => id === self.id ? self : id === opponent.id ? opponent : undefined,
    weights,
    pushDirections: pushDirectionsFor(config),
  }
}

/**
 * Which mental-track directions this combatant's available actions can push
 * (🔺 rage / 🔻 terror), read from the declarative ops. Gates the worth of
 * draining a regenerating adversary ◇: a door nobody can push is worthless.
 */
function pushDirectionsFor(config: PlannerConfig): { rage: boolean; terror: boolean } {
  let rage = false, terror = false
  for (const id of ALL_ACTION_IDS) {
    if (!isAllowed(id, config)) continue
    const out = ACTION_DEFS[id].outcomes
    if (!out) continue
    for (const tier of [out.onSuccess, out.onFailure, out.onCritical, out.onFlaw]) {
      for (const op of tier?.effect ?? []) {
        if ('mental' in op)        { if (op.mental > 0) rage = true; else if (op.mental < 0) terror = true }
        if ('shiftIfBroken' in op) { if (op.shiftIfBroken > 0) rage = true; else terror = true }
      }
    }
  }
  return { rage, terror }
}
