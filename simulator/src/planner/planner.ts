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

import type { CombatantState, ActionId, GuardId, CardTag, RankedPlan } from '../combat/types'
export type { RankedPlan }
import {
  ACTION_DEFS, GUARD_DEFS, canUseAction, canAffordAction, availableGuards,
  checkRollParams, rollParamsFrom, defFor, guardConcession, guardAnswers, type ActionDef,
} from '../combat/actions'
import {
  spendActionCost, mentalRollModifiers, MENTAL_STATE_EFFECTS, applyEffectToState,
} from '../combat/combatant'
import { opsToCombatEffects, type EffectOp } from '../combat/effect-ops'
import type { PlannedAction, PlannedCard } from '../combat/round'
import { bandOf, BANDS, type Band } from '../combat/bands'
import { distance } from '../combat/position'
import { type Actor, isAdversaryActor, actorDefeated } from '../adversary/actor'
import {
  effectiveGuard, activeDeck, canPlayCard, spendCardCost, isAdversaryDefeated,
  mentalDieRank, type AdversaryCombatant,
} from '../adversary/combatant'
import { selectTargetPart, cardMoveBudget } from '../adversary/agent'
import { attackAdvantages } from '../adversary/traits'
import { adversaryEffectToCombatEffects } from '../adversary/effects'
import type { AdversaryCardDef } from '../adversary/types'
import type { ReactionProvider, ReactionOption } from '../combat/triggers'
import { checkDistribution, evOver, adversaryDistribution } from './prob'
import {
  scoreEffects, PERSONA_WEIGHTS, PRICE,
  type Weights, type ScoreContext, type PlannerPersona,
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

// ─── Plan ranking (for visualisation) ─────────────────────────────────────────

/** Top-N complete plans by score, marking the one chosen. Pure. */
function toRanking<T extends { plan: Array<{ band: Band; id: string }>; score: number }>(
  complete: T[],
  chosen:   T | null,
  topN =    3,
): RankedPlan[] {
  return [...complete]
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(node => ({
      actions: node.plan.map(({ band, id }) => ({ band, action: id })),
      utility: node.score,
      chosen:  node === chosen,
    }))
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Plan the round from `fromBand` onward: at most one action per remaining band,
 * PA-reserved across them, utility-best.
 *
 * `fromBand` is the band-by-band adaptation hook (§ resolveRoundBands): called
 * again at each reveal with the current state, it re-optimises the bands still
 * open — it never re-assigns a resolved band (their PA is already spent in the
 * live state). Default 'I' plans the whole round (optimiser / tests).
 *
 * Movement (Marche/Course/Charge) is NOT planned here yet — the approach
 * pattern in combat/agent.ts still owns it until the positional-value étape.
 */
export function planRoundUtility(
  self:      CombatantState,
  opponent:  Actor,
  config:    PlannerConfig,
  fromBand:  Band = 'I',
  usedBands: ReadonlySet<Band> = new Set(),
  ranking?:  RankedPlan[],
): PlannedAction[] {
  const weights = config.weights ?? PERSONA_WEIGHTS[config.persona]
  const ctx = makeContext(self, opponent, weights, config)
  const startIdx = BANDS.indexOf(fromBand)

  // Candidate actions, partitioned by the band their initiative pins them to.
  // `usedBands` are already spoken for (positioning committed a move there).
  const byBand = new Map<Band, ActionId[]>()
  for (const id of ALL_ACTION_IDS) {
    const def = ACTION_DEFS[id]
    if (def.movement) continue                      // positioning's turf (planPositioning)
    if (def.trigger) continue                       // réaction ⚡ : jamais planifiée
    if (!isAllowed(id, config)) continue
    const band = bandOf(def.initiative)
    if (band === null || BANDS.indexOf(band) < startIdx || usedBands.has(band)) continue
    byBand.set(band, [...(byBand.get(band) ?? []), id])
  }

  // Exhaustive sweep of the open bands' assignments (≤ ~100 leaves), reserving
  // PA and simulating self-effects so later bands see what earlier ones set up.
  interface Node { plan: Array<{ band: Band; id: ActionId }>; score: number }
  const complete: Node[] = []

  const dfs = (bandIdx: number, state: CombatantState, plan: Node['plan'], score: number): void => {
    if (bandIdx === BANDS.length) {
      complete.push({ plan, score })
      return
    }
    const band = BANDS[bandIdx]
    // Passing the band is always an option (and the only one when dry).
    dfs(bandIdx + 1, state, plan, score)
    if (usedBands.has(band)) return                 // band taken by a committed move
    for (const id of byBand.get(band) ?? []) {
      if (!canUseAction(state, id) || !canAffordAction(state, id)) continue
      const s = scorePlayerAction(id, state, opponent, ctx)
      const next = simulateSelfEffects(spendActionCost(state, defFor(state, id).cost), id)
      dfs(bandIdx + 1, next, [...plan, { band, id }], score + s)
    }
  }
  dfs(startIdx, self, [], 0)

  const chosen = pickPlan(complete, weights.noise)
  if (ranking) ranking.push(...toRanking(complete, chosen))
  if (!chosen) return []

  return chosen.plan.map(({ id }) => ACTION_DEFS[id].selfTargeted
    ? { actorId: self.id, action: id }
    : { actorId: self.id, action: id, targetId: config.targetId })
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
    if (def.movement || def.trigger || !isAllowed(id, config)) continue
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
  /**
   * Def sous laquelle l'action est jouée. Défaut : celle du porteur (traits ⚒️
   * compris). Le provider de réaction passe ici la VARIANTE réactive — sans
   * quoi il facturerait le ⚫ de l'action normale au lieu du ⚡ réel, et
   * déciderait sur un prix qui n'est pas celui qu'il paiera.
   */
  override?: ActionDef,
): number {
  const def = override ?? defFor(actor, id)
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
  // A ranged weapon has a range BAND — too close (engaged, under minRange) counts
  // as out of range just as much as too far.
  const gap = actor.pos && opponent.pos ? distance(actor.pos, opponent.pos) : null
  const connects = gap === null || def.reach == null
    || (gap > (def.minRange ?? 0) && gap <= def.reach)
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

// ─── Guard selection by expected value ─────────────────────────────────────────

/** Expected DC of a guard's roll (mental-state aware, via the exact distribution). */
function guardExpectedDC(defender: CombatantState, guardId: GuardId): number {
  const gd   = GUARD_DEFS[guardId]
  const mods = mentalRollModifiers(defender.mentalState, 'defensive')
  const params = rollParamsFrom(defender, gd.rollChar, gd.rollSkill,
    mods.disadvantages > 0 ? { disadvantages: mods.disadvantages, rerolls: mods.rerolls }
                           : { rerolls: mods.rerolls })
  return checkDistribution(params).mean
}

/**
 * Pick the guard that best protects the defender against an attack of this
 * initiative, by EXPECTED VALUE rather than a raw stat sum.
 *
 * The score of a guard is its **effective DC** — the mean roll it would set as
 * the threshold — minus the advantage it hands the attacker: Encaisser grants
 * the attacker a free 🟩 (worth ~1 point on their roll), the active guards none.
 * So a tanky Vigueur/Récupération pool still wins on Encaisser, but a coin-flip
 * between an active guard and Encaisser breaks toward the active one, which the
 * attacker cannot exploit.
 *
 * The ⚡ an active guard spends carries no opportunity cost here: a guard is
 * rolled once per round and reactions have no other use — when the defender is
 * out of ⚡, only Encaisser is `available` in the first place, so availability,
 * not the score, rations reactions.
 *
 * Returns both the chosen guard and its (rounded) expected DC, so the attacker's
 * planner can price against the very guard the defender will roll.
 */
export function selectGuardByEV(
  defender:         CombatantState,
  available:        GuardId[],
  attackInitiative: number,
  attackTags?:      readonly CardTag[],
): { dc: number; guardId: GuardId } {
  const TIEBREAK_ORDER: GuardId[] = ['dodge', 'parry', 'block', 'evade', 'absorb']
  const scored = available
    // 🕐 Vitesse de Garde : la Garde doit être au moins aussi rapide que l'action.
    .filter(gid => guardAnswers(gid, attackInitiative))
    .map(gid => {
      const dc      = guardExpectedDC(defender, gid)
      // La concession n'est facturée que si elle s'applique VRAIMENT à cette
      // action : la Parade ne concède rien à une lame, tout à une flèche.
      const penalty = guardConcession(gid, attackTags) * PRICE.dieMod
      return { gid, dc, value: dc - penalty, rank: TIEBREAK_ORDER.indexOf(gid) }
    })
    .sort((a, b) => b.value - a.value || a.rank - b.rank)

  const best = scored[0]
  if (!best) return { dc: Math.round(guardExpectedDC(defender, 'absorb')), guardId: 'absorb' }
  return { dc: Math.round(best.dc), guardId: best.gid }
}

/** Back-compat alias — the planner's DC estimate is the guard the defender picks. */
export const estimateGuard = (defender: CombatantState, attackInitiative: number) =>
  selectGuardByEV(defender, availableGuards(defender), attackInitiative)

// ─── Plan-level helpers ───────────────────────────────────────────────────────

/**
 * Apply an action's SELF-EFFECTS to a planning-time state — only the fields a
 * later band gates on (élan for the Charge, Essoufflé for the Course, and the
 * Respiration clearing it). Not a resolution: no rolls, no target, no board.
 */
/**
 * Enemy sentinel for onPlay projection : les ops ciblées partent vers cet id
 * bidon et sont écartées (on ne garde que les ops SELF). Il suffit qu'il diffère
 * de l'id du lanceur.
 */
const PLANNER_ENEMY_SENTINEL = '__planner_enemy__'

/**
 * Replie dans l'état du lanceur les ops SELF d'un tier ▶️ onPlay (⊖ auto-chargée,
 * dissipation, 🔥, Inertie…). Les ops ciblées (adversaire) partent vers le
 * sentinel et sont écartées : cet état ne modélise que le lanceur. Pur et
 * exporté pour être testé sans carte réelle.
 */
export function projectOnPlaySelf(
  state:  CombatantState,
  onPlay: { effect: EffectOp[] } | undefined,
): CombatantState {
  if (!onPlay) return state
  let s = state
  for (const e of opsToCombatEffects(onPlay.effect, PLANNER_ENEMY_SENTINEL, s.id)) {
    if (e.targetId === s.id) s = applyEffectToState(s, e)
  }
  return s
}

/**
 * Projette dans l'état de PLANIFICATION les ressources qu'une action pose à COUP
 * SÛR, pour que les bandes suivantes du DFS les voient (« la Course arme la
 * Charge de la bande III »). Deux sources de garanties :
 *
 *  1. les drapeaux déclarés sur la def — Inertie ➡️, statut posé/levé ;
 *  2. le tier ▶️ **onPlay**, inconditionnel par construction : ses ops SELF
 *     (⊖ auto-chargée, dissipation, 🔥, Inertie…) tombent quel que soit le jet,
 *     donc le planificateur peut compter dessus pour la suite de la manche.
 *     C'est CE chaînage qui rend visibles les combos d'Électromancie
 *     (charger en bande I → convertir en bande III).
 *
 * On ne propage QUE onPlay : les tiers conditionnels (succès/critique) dépendent
 * du dé et ne sont pas un acquis. Les ops ciblant l'adversaire sont écartées
 * (filtre sur l'id du lanceur) — cet état ne modélise que le lanceur.
 */
export function simulateSelfEffects(state: CombatantState, id: ActionId): CombatantState {
  const def = ACTION_DEFS[id]
  let s = state
  if (def.grantsInertia != null) s = { ...s, inertia: def.grantsInertia }
  if (def.grantsStatus && !s.status.includes(def.grantsStatus)) {
    s = { ...s, status: [...s.status, def.grantsStatus] }
  }
  if (def.clearsStatus) s = { ...s, status: s.status.filter(x => x !== def.clearsStatus) }

  return projectOnPlaySelf(s, def.outcomes?.onPlay)
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
    hasChargeSink:  hasChargeSinkFor(config),
  }
}

/**
 * Le kit contient-il une action de DÉCHARGE — qui dissipe les ⊖ du lanceur (op
 * `dissipateCharge`) ? Gate la valeur du stock de ⊖ : sans exutoire, se charger
 * ne vaut rien (façon `pushDirectionsFor`). Une décharge ciblant l'adversaire
 * (`dissipateTargetCharge`) ne compte pas : elle ne vide pas SA propre batterie.
 */
function hasChargeSinkFor(config: PlannerConfig): boolean {
  for (const id of ALL_ACTION_IDS) {
    if (!isAllowed(id, config)) continue
    const out = ACTION_DEFS[id].outcomes
    if (!out) continue
    for (const tier of [out.onSuccess, out.onFailure, out.onCritical, out.onFlaw, out.onPlay]) {
      for (const op of tier?.effect ?? []) {
        if ('dissipateCharge' in op) return true
      }
    }
  }
  return false
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
    for (const tier of [out.onSuccess, out.onFailure, out.onCritical, out.onFlaw, out.onPlay]) {
      for (const op of tier?.effect ?? []) {
        if ('mental' in op)        { if (op.mental > 0) rage = true; else if (op.mental < 0) terror = true }
        if ('shiftIfBroken' in op) { if (op.shiftIfBroken > 0) rage = true; else terror = true }
      }
    }
  }
  return { rage, terror }
}

// ─── Réactions ⚡ : décider si le déclencheur vaut d'être saisi ─────────────────

/**
 * Provider de réaction *scripté* : note chaque option avec les MÊMES scoreurs que
 * la planification de manche (`scorePlayerAction` / `scoreAdversaryCard`) et joue
 * la meilleure si son utilité est positive — « on fait tourner le planificateur
 * pour savoir si c'est avantageux » (décision créateur). Sinon, on s'abstient :
 * garder ses ⚡ vaut mieux qu'une réaction qui coûte plus qu'elle ne rapporte.
 */
export function makeReactionProvider(
  configFor: (actorId: string) => PlannerConfig,
): ReactionProvider {
  return (_event, options, states) => {
    let best: { option: ReactionOption; score: number } | null = null

    for (const option of options) {
      const reactor = states.get(option.reactorId)
      const target  = states.get(option.targetId)
      if (!reactor || !target) continue

      const config  = configFor(option.reactorId)
      const weights = config.weights ?? PERSONA_WEIGHTS[config.persona]
      let score: number

      if (isAdversaryActor(reactor)) {
        if (isAdversaryActor(target)) continue          // adv. vs adv. hors périmètre
        const card = reactor.sheet.cards.find(c => c.id === option.action)
        if (!card) continue
        score = scoreAdversaryCard(card, reactor, target, makeAdversaryContext(reactor, target, weights))
      } else {
        // `option.def` = la def RÉACTIVE (variante de trait ⚒️ ou déclencheur
        // natif) : c'est son prix qu'il faut peser, pas celui de l'action normale.
        score = scorePlayerAction(
          option.action as ActionId, reactor, target,
          makeContext(reactor, target, weights, config),
          option.def,
        )
      }

      if (score > 0 && (!best || score > best.score)) best = { option, score }
    }
    return best?.option ?? null
  }
}

// ─── Adversary utility (unified brain — same value layer as the PC planner) ─────

/** Positional worth of a case closed toward an out-of-reach target, in offense
 *  units — small enough never to outweigh a real hit, big enough to beat passing
 *  (so an out-of-range Charge is played to approach). */
const APPROACH_VALUE = 0.2

/** ScoreContext for a creature planning against a PC (reuses the value layer). */
function makeAdversaryContext(self: AdversaryCombatant, opponent: CombatantState, weights: Weights): ScoreContext {
  return {
    selfId:   self.id,
    isEnemy:  id => id === opponent.id,
    getActor: id => id === self.id ? self : id === opponent.id ? opponent : undefined,
    weights,
  }
}

/**
 * Expected utility of a creature playing `card` now against the PC `opponent` —
 * the adversary mirror of scorePlayerAction. The attack is asymmetric (summed
 * dice vs the PC's estimated guard, ⭐ onFives, no ⚠️). Out-of-reach blows keep
 * the card's own move (positional worth) but lose the damage, exactly like the
 * engine's gateByReach — so an out-of-range Charge earns the ground it closes.
 */
export function scoreAdversaryCard(
  card:     AdversaryCardDef,
  self:     AdversaryCombatant,
  opponent: CombatantState,
  baseCtx:  ScoreContext,
): number {
  // Price self-effects against the SIMULATED creature (mid-round fatigue), not
  // the round-start snapshot the shared context was built from.
  const ctx: ScoreContext = { ...baseCtx, getActor: id => id === self.id ? self : baseCtx.getActor(id) }

  // Self-cost: fatigue paid to play (⚫ is rationed by the band budget, not priced).
  let score = scoreEffects(
    card.fatigueCost ? [{ targetId: self.id, kind: 'add-fatigue', amount: card.fatigueCost }] : [],
    ctx,
  )
  if (actorDefeated(opponent)) return score

  // Reach gate (§ gateByReach): does the blow connect, its own move included?
  const gap      = self.pos && opponent.pos ? distance(self.pos, opponent.pos) : null
  const move     = cardMoveBudget(card)
  const afterGap = gap === null ? null : Math.max(1, gap - move)
  const connects = gap === null || card.reach == null || (afterGap !== null && afterGap <= card.reach)

  // Ground closed toward an out-of-reach target still buys next round's reach.
  if (gap !== null && card.reach != null && move > 0) {
    const closed = Math.max(0, Math.min(move, gap - card.reach))
    score += ctx.weights.offense * APPROACH_VALUE * closed
  }
  if (!connects) return score

  // Offensive EV: summed dice vs the PC's estimated guard + ⭐ onFives.
  const { dc } = estimateGuard(opponent, card.initiative)
  const rank   = mentalDieRank(self.mentalState)
  const adv    = attackAdvantages(self, card, opponent)
  const dist   = adversaryDistribution(self.sheet.dice, {
    advantages:    adv.advantages + Math.max(0, rank),
    disadvantages: Math.max(0, -rank),
  })
  for (const cell of dist.cells) {
    const base = cell.total >= dc ? card.onSuccess : card.onFailure
    const eff  = adversaryEffectToCombatEffects(base.effect, opponent.id, self.id)
    if (card.onFives && cell.fives >= card.onFives.count) {
      eff.push(...adversaryEffectToCombatEffects(card.onFives.effect, opponent.id, self.id))
    }
    score += cell.p * scoreEffects(eff, ctx)
  }
  return score
}

/**
 * Plan a creature's whole round by UTILITY — the unified brain, mirror of
 * planRoundUtility. DFS over the open bands' card assignments (one card per
 * band from the active deck), PA/fatigue reserved across them, utility-best.
 * Fills `ranking` (top-3) when provided.
 */
export function planAdversaryRoundUtility(
  self:      AdversaryCombatant,
  opponent:  CombatantState,
  config:    PlannerConfig,
  fromBand:  Band = 'I',
  usedBands: ReadonlySet<Band> = new Set(),
  ranking?:  RankedPlan[],
): PlannedCard[] {
  if (isAdversaryDefeated(self) || actorDefeated(opponent)) return []
  const weights  = config.weights ?? PERSONA_WEIGHTS[config.persona]
  const ctx      = makeAdversaryContext(self, opponent, weights)
  const startIdx = BANDS.indexOf(fromBand)

  // Candidate cards partitioned by the band their initiative pins them to.
  const byBand = new Map<Band, AdversaryCardDef[]>()
  for (const card of activeDeck(self)) {
    const band = bandOf(card.initiative)
    if (band === null || BANDS.indexOf(band) < startIdx || usedBands.has(band)) continue
    byBand.set(band, [...(byBand.get(band) ?? []), card])
  }

  interface Node { plan: Array<{ band: Band; id: string }>; score: number }
  const complete: Node[] = []
  const dfs = (bandIdx: number, state: AdversaryCombatant, plan: Node['plan'], score: number): void => {
    if (bandIdx === BANDS.length) { complete.push({ plan, score }); return }
    const band = BANDS[bandIdx]
    dfs(bandIdx + 1, state, plan, score)            // passing the band is always an option
    if (usedBands.has(band)) return
    for (const card of byBand.get(band) ?? []) {
      if (!canPlayCard(state, card.id)) continue
      const s = scoreAdversaryCard(card, state, opponent, ctx)
      dfs(bandIdx + 1, spendCardCost(state, card.id), [...plan, { band, id: card.id }], score + s)
    }
  }
  dfs(startIdx, self, [], 0)

  const chosen = pickPlan(complete, weights.noise)
  if (ranking) ranking.push(...toRanking(complete, chosen))
  if (!chosen) return []
  return chosen.plan.map(({ id }) => ({ actorId: self.id, card: id, targetId: config.targetId }))
}
