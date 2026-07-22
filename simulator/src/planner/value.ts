/**
 * Generic effect valuation — the planner's sense of worth.
 *
 * The utility agent never knows actions by name: it reads the CombatEffects an
 * action WOULD produce (every resolve() is pure — it computes amounts without
 * rolling dice) and prices them against the state they land on. A new YAML
 * card is automatically playable the moment its effects are worth something.
 *
 * ── Unit ──
 * All burdens are expressed in 💢-equivalents: 1.0 ≈ one light wound landing
 * on a healthy PC. Everything else (fatigue, statuses, mental pressure, block
 * destruction) is priced on that scale, from the DEFINITIONS that already
 * describe it mechanically (STATUS_DEFS, MENTAL_STATE_EFFECTS,
 * ADVERSARY_MENTAL_EFFECTS) — never from hard-coded action names.
 *
 * ── Sign convention ──
 * `effectBurden(e, target)` is how COSTLY the effect is for whoever it lands
 * on: positive = harmful, negative = beneficial (heals, recoveries, ◇ gains).
 * `scoreEffects` then folds burdens into one signed utility for the ACTOR:
 * harm on an enemy counts as offense, harm on self counts against caution.
 *
 * ── Personas ──
 * Tactical styles are WEIGHT VECTORS, not candidate lists: aggressive prices
 * enemy harm high and its own low; cautious the reverse; opportunist ramps up
 * near a finish; inexperienced keeps neutral weights but picks noisily
 * (softmax temperature, applied by the planner).
 */

import type {
  CombatantState, CombatEffect, MentalState, StatusEffect,
} from '../combat/types'
import { MENTAL_STATES } from '../combat/types'
import {
  effChar, resistanceThreshold, stabilityPool, MENTAL_STATE_EFFECTS,
} from '../combat/combatant'
import { STATUS_DEFS } from '../combat/status'
import { PHYSICAL_CHARACTERISTICS, MENTAL_CHARACTERISTICS } from '../character/data'
import { type Actor, isAdversaryActor } from '../adversary/actor'
import {
  isBlockDestroyed, isPartDestroyed, grantedArmorAll, isAdversaryWinded,
  ADVERSARY_MENTAL_EFFECTS, type AdversaryCombatant, type AdversaryMental,
  type PartState,
} from '../adversary/combatant'

// ─── Personas ─────────────────────────────────────────────────────────────────

/** Tactical style — same ids as the historical agent (public API preserved). */
export type PlannerPersona = 'aggressive' | 'cautious' | 'opportunist' | 'inexperienced'

/** How a persona prices the world. */
export interface Weights {
  /** Multiplier on harm inflicted on enemies. */
  offense:  number
  /** Multiplier on harm suffered by self (costs, retaliation exposure). */
  caution:  number
  /**
   * Extra multiplier applied to DECISIVE progress (incapacitation, part or
   * clock completion) — the opportunist's nose for a finish.
   */
  finisher: number
  /**
   * Softmax temperature used at pick time: 0 = strict argmax; higher = the
   * agent plausibly picks a slightly worse plan (inexperience as noise, not
   * as a hand-written short list).
   */
  noise:    number
}

export const PERSONA_WEIGHTS: Record<PlannerPersona, Weights> = {
  aggressive:    { offense: 1.35, caution: 0.65, finisher: 1.0, noise: 0   },
  cautious:      { offense: 0.80, caution: 1.40, finisher: 1.0, noise: 0   },
  opportunist:   { offense: 1.00, caution: 1.00, finisher: 1.6, noise: 0   },
  inexperienced: { offense: 1.00, caution: 1.00, finisher: 1.0, noise: 1.2 },
}

// ─── Price list (💢-equivalents) ──────────────────────────────────────────────
//
// Central knobs, deliberately few. Derivations in comments; the batch harness
// is the judge of fine-tuning.

/** One PA ⚫ — roughly one cheap action's worth of tempo. */
const PA_VALUE = 1.5
/** One reaction ⚡ — a guard upgrade or a future reaction option. */
const REACTION_VALUE = 1.0
/** One net 🟥 on every roll ≈ E[⬜] − E[min ⬜🟥] = 2.5 − 55/36 ≈ 0.97 per roll. */
const DIE_MOD_VALUE = 0.95
/** A heavy wound 💔 — permanently drops a physical characteristic. */
const HEAVY_VALUE = 5
/** A trauma — same permanence, on the mental side (§ États extrêmes). */
const TRAUMA_VALUE = 4
/** Chipping one 🛡️ point off armor (the wound is absorbed, the plate cedes). */
const ARMOR_CHIP_VALUE = 1.5
/** A PC ◇ — combat-long, non-regenerating buffer against mental shocks. */
const STABILITY_PC_VALUE = 0.8
/** An adversary ◇ — regenerates at round start: draining it is cheaper. */
const STABILITY_ADV_VALUE = 0.4
/** Base worth of one fatigue point 💧 on a PC (escalates near 10 and 20). */
const FATIGUE_VALUE = 0.4
/** Destroying an adversary block — a conferred capability goes dark. */
const BLOCK_VALUE = 3
/** Finishing a whole part (its tag, its cards, its resources). */
const PART_VALUE = 4
/** Taking an actor out of the fight. */
const DECISIVE_VALUE = 40
/** One 🩸 token — future wounds that pierce protection (PC) / armor (adversary). */
const BLEED_VALUE = 1.2

// ─── Public API ───────────────────────────────────────────────────────────────

/** What scoreEffects needs to know about the battlefield. */
export interface ScoreContext {
  /** The planning actor (whose utility we compute). */
  selfId:   string
  /** Faction test: true when the id belongs to an opposing faction. */
  isEnemy:  (id: string) => boolean
  /** Live actor lookup — effects are priced against the state they land on. */
  getActor: (id: string) => Actor | undefined
  weights:  Weights
  /**
   * Mental-track directions the actor can ACTUALLY push (from its available
   * actions' 🔺/🔻 ops). Draining a regenerating adversary ◇ is only worth
   * something if a door it guards can be pushed — and pushed in a direction
   * that hurts. Absent = both (standalone pricing).
   */
  pushDirections?: { rage: boolean; terror: boolean }
}

/**
 * Signed utility of a list of effects, from the planning actor's perspective:
 * harm on an enemy scores +offense × burden, harm on self (or an ally) scores
 * −caution × burden. Beneficial effects flip signs naturally (negative burden).
 */
export function scoreEffects(effects: readonly CombatEffect[], ctx: ScoreContext): number {
  let score = 0
  for (const e of effects) {
    const target = ctx.getActor(e.targetId)
    if (!target) continue
    const burden = effectBurden(e, target, e.targetPart, ctx.pushDirections)
    if (ctx.isEnemy(e.targetId)) {
      // Decisive progress (K.O., last part, trauma at the extreme) gets the
      // finisher multiplier — the opportunist smells blood, by the numbers.
      const finisher = burden >= DECISIVE_VALUE ? ctx.weights.finisher : 1
      score += ctx.weights.offense * finisher * burden
    } else {
      score += -ctx.weights.caution * burden
    }
  }
  return score
}

/**
 * How costly one effect is for the actor it lands on (positive = harmful).
 *
 * `partType` names the adversary part the blow was declared against, when
 * known — the effects produced by resolve() do not carry it yet (routing
 * happens later, in resolvePlans).
 */
export function effectBurden(
  e:        CombatEffect,
  target:   Actor,
  partType?: string,
  push?:    { rage: boolean; terror: boolean },
): number {
  return isAdversaryActor(target)
    ? adversaryBurden(e, target, partType, push ?? { rage: true, terror: true })
    : pcBurden(e, target)
}

// ─── PC burdens ───────────────────────────────────────────────────────────────

function pcBurden(e: CombatEffect, s: CombatantState): number {
  switch (e.kind) {
    case 'light-wound':    return lightWoundBurdenPc(s, e.amount)
    case 'heavy-wound':    return heavyWoundBurdenPc(s)
    case 'heal-wounds':    return -Math.min(e.amount, s.lightWounds)
    case 'add-fatigue':    return fatigueBurdenPc(s, e.amount)
    case 'remove-fatigue': return -fatigueBurdenPc({ ...s, fatigue: Math.max(1, s.fatigue - e.amount) },
                                                   Math.min(e.amount, s.fatigue - 1))
    // Hémorragie 🩸 PJ : un COMPTEUR de jetons (add = +1 jeton, remove = tout
    // vider — § applyEffectToState), pas un statut binaire.
    case 'add-status':     return e.status === 'hemorrhage'
                                  ? bleedStockBurdenPc(s, 1) - bleedStockBurdenPc(s, 0)
                                  : s.status.includes(e.status) ? 0 : statusBurdenPc(s, e.status)
    case 'remove-status':  return e.status === 'hemorrhage'
                                  ? -bleedStockBurdenPc(s, 0)
                                  : s.status.includes(e.status) ? -statusBurdenPc(s, e.status) : 0
    case 'spend-actions':  return e.amount * PA_VALUE
    case 'add-reaction':   return -REACTION_VALUE
    case 'spend-reaction': return s.reactions > 0 ? REACTION_VALUE : 0
    case 'add-temp-protection': return -ARMOR_CHIP_VALUE
    case 'shift-mental':        return mentalShiftBurdenPc(s, e.direction)
    case 'shift-mental-broken': return s.stability > 0 ? 0
                                     : mentalShiftBurdenPc(s, e.direction as 'toward-terror' | 'toward-rage')
    case 'set-mental':     return mentalStateBurdenPc(e.state) - mentalStateBurdenPc(s.mentalState)
    case 'add-stability':  return -Math.min(e.amount, Math.max(0, stabilityPool(s) - s.stability))
                                  * STABILITY_PC_VALUE
    case 'drain-stability': {
      const drained = Math.min(e.amount, s.stability)
      // Emptying the pool exposes the track to every further shock.
      return drained * STABILITY_PC_VALUE + (drained === s.stability && drained > 0 ? 0.5 : 0)
    }
    case 'destabilize':    return 0            // adversary-only mechanic (◇ regen skip)
    case 'set-inertia':    return 0            // tempo handled by the planner (élan enables Charge)
    case 'move':
    case 'move-toward':    return 0            // positional term lives in the planner (étape 4)
  }
}

/**
 * Light wounds 💢, priced with the conversion in sight: the base point value
 * plus the heavy wounds 💔 the round-end 3:1 conversion over the Résistance
 * threshold would yield (§ processRoundEnd). Pushing a wounded target over the
 * line is worth more than opening on a fresh one — the finisher emerges from
 * the pricing, not from a special case.
 */
function lightWoundBurdenPc(s: CombatantState, amount: number): number {
  const t       = resistanceThreshold(s)
  const before  = Math.max(0, s.lightWounds - t)
  const after   = Math.max(0, s.lightWounds + amount - t)
  const heavies = Math.floor(after / 3) - Math.floor(before / 3)
  return amount + heavies * (heavyWoundBurdenPc(s) - 1)
}

/** A heavy wound 💔 — absorbed by 🛡️ (attrition) or landing on a characteristic. */
function heavyWoundBurdenPc(s: CombatantState): number {
  if (s.tempProtection > 0 || s.protection > 0) return ARMOR_CHIP_VALUE
  const capacityLeft = PHYSICAL_CHARACTERISTICS
    .reduce((sum, name) => sum + effChar(s, name), 0)
  if (capacityLeft <= 1) return DECISIVE_VALUE          // next 💔 → Aux portes de la Mort
  // Each wound bites harder as capacity shrinks (a 4-point pool loses 25%…).
  return HEAVY_VALUE * (1 + 2 / capacityLeft)
}

/**
 * Fatigue 💧, integrated point by point: cheap while fresh, expensive near the
 * endurance-test line (10 — the Essoufflé risk), decisive at 20 (K.O.).
 */
function fatigueBurdenPc(s: CombatantState, amount: number): number {
  if (amount <= 0) return 0
  let burden = 0
  for (let f = s.fatigue + 1; f <= Math.min(20, s.fatigue + amount); f++) {
    burden += FATIGUE_VALUE * (1 + 3 * Math.pow(f / 20, 2))
    if (f === 10) burden += 1          // endurance tests begin; Essoufflé looms
    if (f === 20) burden += DECISIVE_VALUE
  }
  return burden
}

/** Status burden, read from the mechanics STATUS_DEFS declares — never by name. */
function statusBurdenPc(s: CombatantState, id: StatusEffect): number {
  const def = STATUS_DEFS[id]
  if (!def) return 0
  if (def.incapacitates) return DECISIVE_VALUE
  let burden = 0
  if (def.drainReactions)     burden += Math.min(s.reactions, s.maxReactions) * REACTION_VALUE
  if (def.drainActions)       burden += def.drainActions * PA_VALUE
  if (def.rollDisadvantage)   burden += def.rollDisadvantage * DIE_MOD_VALUE * 2  // every roll, ~2 rolls/round
  if (def.attackerAdvantage)  burden += def.attackerAdvantage * DIE_MOD_VALUE
  if (def.preventsEndRound)   burden += 0.5
  if (def.onTokenReset) {
    const preview = def.onTokenReset(s)
    burden += preview.actionPenalty * PA_VALUE * (preview.clear ? 1 : 2)  // recurring if not cleared
  }
  return burden
}

/**
 * Future wounds a bleed 🩸 stock will deposit (§ processRoundEnd) : chaque
 * manche, les jetons décroissent de la Récupération et le reste tombe en 💢 —
 * un stock sous la Récupération ne saigne jamais. Les 💢 de saignée percent la
 * Protection à la conversion, d'où le léger sur-prix.
 */
function bleedStockBurdenPc(s: CombatantState, extra: number): number {
  const recovery = s.skills.recovery
  let tokens = s.bleed + extra
  let total  = 0
  while (tokens > recovery) {
    tokens -= recovery
    total  += tokens
  }
  return total * BLEED_VALUE
}

/**
 * Standing burden of a mental state, from MENTAL_STATE_EFFECTS: what the state
 * costs per round in dice, reactions and fatigue. Negative terms are the perks
 * (rage states reroll their attacks; focused banks a reaction).
 */
function mentalStateBurdenPc(m: MentalState): number {
  const fx = MENTAL_STATE_EFFECTS[m]
  return (fx.disadvantages.offensive + fx.disadvantages.defensive) * DIE_MOD_VALUE
       + (fx.canReact ? 0 : 2 * REACTION_VALUE)
       + fx.fatiguePerAction * 2 * FATIGUE_VALUE
       - fx.bonusReactions * REACTION_VALUE
       - (fx.rerolls.offensive + fx.rerolls.defensive) * 0.5
}

/** One 🔻/🔺/recentre shock on the PC mental track (§ shiftMentalState). */
function mentalShiftBurdenPc(
  s: CombatantState,
  direction: 'toward-terror' | 'toward-rage' | 'toward-focused',
): number {
  const idx = MENTAL_STATES.indexOf(s.mentalState)
  if (direction === 'toward-focused') {
    if (idx === 3) return 0
    const next = idx < 3 ? idx + 1 : idx - 1
    return mentalStateBurdenPc(MENTAL_STATES[next]) - mentalStateBurdenPc(s.mentalState)
  }
  // Harmful shocks are absorbed by ◇ first (§ Stabilité).
  if (s.stability > 0) return STABILITY_PC_VALUE
  const step = direction === 'toward-terror' ? 1 : -1
  const next = idx + step
  if (next < 0 || next >= MENTAL_STATES.length) {
    // § États extrêmes : one shock too many — trauma + bounce toward centre.
    const mentalLeft = MENTAL_CHARACTERISTICS.reduce((sum, n) => sum + effChar(s, n), 0)
    return mentalLeft <= 1 ? DECISIVE_VALUE : TRAUMA_VALUE
  }
  return mentalStateBurdenPc(MENTAL_STATES[next]) - mentalStateBurdenPc(s.mentalState)
}

// ─── Adversary burdens ────────────────────────────────────────────────────────

function adversaryBurden(
  e:        CombatEffect,
  c:        AdversaryCombatant,
  partType: string | undefined,
  push:     { rage: boolean; terror: boolean },
): number {
  switch (e.kind) {
    case 'light-wound':    return lightWoundBurdenAdv(c, e.amount, partType)
    case 'heavy-wound':    return heavyWoundBurdenAdv(c, partType)
    case 'add-fatigue':    return fatigueBurdenAdv(c, e.amount)
    case 'add-status':     return e.status === 'stunned' && !c.stunned ? 2 : 0
    case 'shift-mental':        return mentalShiftBurdenAdv(c, e.direction)
    case 'shift-mental-broken': return c.stability > 0 ? 0
                                     : mentalShiftBurdenAdv(c, e.direction as 'toward-terror' | 'toward-rage')
    case 'drain-stability': {
      if (drainPotentialAdv(c, push) <= 0) return 0    // no harmful door to push
      const drained = Math.min(e.amount, c.stability)
      return drained * STABILITY_ADV_VALUE + (drained === c.stability && drained > 0 ? 0.5 : 0)
    }
    case 'destabilize':    return c.destabilized || drainPotentialAdv(c, push) <= 0
                                  ? 0 : 1              // skips one whole ◇ regen
    case 'add-stability':  return -e.amount * STABILITY_ADV_VALUE
    case 'set-inertia':
    case 'move':
    case 'move-toward':    return 0
    // PC-economy effects have no adversary meaning (no ⚡, no PA effects target them).
    default:               return 0
  }
}

/** The part a blow lands on: the declared one, else the first targetable. */
function resolvePart(c: AdversaryCombatant, partType?: string): PartState | undefined {
  const all = [...c.parts, ...c.weapons].filter(p => p.blocks.length > 0 && !isPartDestroyed(p))
  return (partType ? all.find(p => p.type === partType) : undefined) ?? all[0]
}

/** Blocks destroyed + part/defeat progress from marking `through` cases. */
function blockProgress(c: AdversaryCombatant, part: PartState, through: number): number {
  let burden = 0
  let remaining = through
  let destroyed = 0
  for (const b of part.blocks) {
    if (remaining <= 0) break
    if (isBlockDestroyed(b)) continue
    const room = b.cases - b.damage
    const put  = Math.min(room, remaining)
    remaining -= put
    if (put >= room) { destroyed++; burden += BLOCK_VALUE }
  }
  const intact = part.blocks.filter(b => !isBlockDestroyed(b)).length
  if (destroyed >= intact && intact > 0) {
    burden += PART_VALUE
    // Last damageable part → the creature is out (§ isAdversaryDefeated).
    const partsLeft = c.parts.filter(p => p.blocks.length > 0 && !isPartDestroyed(p)).length
    if (partsLeft === 1 && c.parts.includes(part)) burden += DECISIVE_VALUE
  }
  return burden
}

/** 💢 on a part: armor-reduced (min 1 through), then priced by block progress. */
function lightWoundBurdenAdv(c: AdversaryCombatant, amount: number, partType?: string): number {
  const part = resolvePart(c, partType)
  if (!part) return 0
  const armor   = part.armor + grantedArmorAll(c, part.type)
  const through = amount > 0 ? Math.max(1, amount - armor) : 0
  return through + blockProgress(c, part, through)
}

/** 💔 on a part: dodged by 🍀, eaten by a plate, or a whole block goes dark. */
function heavyWoundBurdenAdv(c: AdversaryCombatant, partType?: string): number {
  if (c.evasion > 0 && !c.stunned) return 1        // converted to 3💢 elsewhere — mild
  const part = resolvePart(c, partType)
  if (!part) return 0
  if (part.armor > 0) return ARMOR_CHIP_VALUE       // the plate cedes (attrition)
  const top = part.blocks.find(b => !isBlockDestroyed(b))
  if (!top) return 0
  return blockProgress(c, part, top.cases - top.damage)
}

/**
 * Fatigue 💧 on the death clock: 🫁 absorbs all but 1, each landed mark is
 * direct progress toward the clock (defeat when full), with a bonus for
 * crossing the Essoufflé half (−1 ⚫ per round).
 */
function fatigueBurdenAdv(c: AdversaryCombatant, amount: number): number {
  if (amount <= 0) return 0
  const absorbed = Math.min(c.endurance, amount - 1)
  const landed   = Math.min(amount - absorbed, c.sheet.fatigue - c.fatigue)
  if (landed <= 0) return 0.2 * absorbed             // burning 🫁 still has some worth
  const clock = c.sheet.fatigue
  let burden  = landed * (12 / clock) + 0.2 * absorbed
  const wasWinded = isAdversaryWinded(c)
  if (!wasWinded && (c.fatigue + landed) > clock / 2) burden += PA_VALUE
  if (c.fatigue + landed >= clock) burden += DECISIVE_VALUE
  return burden
}

/** Standing burden of an adversary mental state: its threat minus its guard. */
function mentalStateBurdenAdv(m: AdversaryMental): number {
  const fx = ADVERSARY_MENTAL_EFFECTS[m]
  // dieRank ≈ ±1 expected total per rank on THEIR attacks; guard is OUR to-hit.
  return -(fx.dieRank * 1.2) + fx.guard * 0.8
}

const ADV_TRACK: AdversaryMental[] = ['enraged', 'aggressive', 'cautious', 'panicked']

/**
 * One 🔻/🔺 shock on the 4-state creature track.
 *
 * A shock absorbed by a ◇ is only worth a FRACTION of the track move it opens
 * the way to — and nothing at all when that move would HELP the creature
 * (pushing a Faucheur toward Enragé feeds its dice ⬆; its ◇ regenerates, so
 * blind draining is water into sand). Intimidation toward Paniqué stays
 * valuable; Provocation toward Enragé prices itself out.
 */
function mentalShiftBurdenAdv(
  c: AdversaryCombatant,
  direction: 'toward-terror' | 'toward-rage' | 'toward-focused',
): number {
  if (direction === 'toward-focused') return 0       // creatures have no recentre
  const idx  = ADV_TRACK.indexOf(c.mentalState)
  const step = direction === 'toward-terror' ? 1 : -1
  const next = Math.max(0, Math.min(ADV_TRACK.length - 1, idx + step))
  const moveBurden = next === idx ? 0                 // clamped at the end — no effect
    : mentalStateBurdenAdv(ADV_TRACK[next]) - mentalStateBurdenAdv(c.mentalState)
  if (c.stability > 0) return STABILITY_ADV_VALUE * Math.max(0, Math.sign(moveBurden))
  return moveBurden
}

/**
 * How much a creature's next track move could hurt IT, restricted to the
 * directions the actor can actually push. This is what its ◇ stock guards —
 * and therefore what draining that stock is worth.
 */
function drainPotentialAdv(
  c:    AdversaryCombatant,
  push: { rage: boolean; terror: boolean },
): number {
  const idx = ADV_TRACK.indexOf(c.mentalState)
  const moveBurden = (step: number): number => {
    const next = Math.max(0, Math.min(ADV_TRACK.length - 1, idx + step))
    return next === idx ? 0
      : mentalStateBurdenAdv(ADV_TRACK[next]) - mentalStateBurdenAdv(c.mentalState)
  }
  let potential = 0
  if (push.terror) potential = Math.max(potential, moveBurden(+1))
  if (push.rage)   potential = Math.max(potential, moveBurden(-1))
  return potential
}

// ─── Exposed price points (planner + tests) ───────────────────────────────────

/** Prices the planner shares (PA reservation, ⚡ economy, decisive detection). */
export const PRICE = {
  pa:        PA_VALUE,
  reaction:  REACTION_VALUE,
  dieMod:    DIE_MOD_VALUE,
  decisive:  DECISIVE_VALUE,
  bleed:     BLEED_VALUE,
} as const
