/**
 * Resolution of an adversary attack against a player character (§ Résolution).
 *
 * Asymmetric rule: the adversary rolls its dice pool and SUMS it (0–20), then
 * compares the total to the player's Guard score — the value the PC obtained on
 * their guard reaction. total ≥ guard → ✅ onSuccess, else ❌ onFailure. There
 * is no flaw ⚠️. Independently, if the roll shows at least `onFives.count` fives,
 * the ⭐ onFives effect fires as well.
 *
 * The PC → adversary direction (a player attacking the creature) is not here: it
 * rolls normally against the creature's FIXED guard value and lands on a declared
 * body part via combatant.damagePart.
 */

import type { CombatEffect } from '../combat/types'
import type { AdversaryCardDef } from './types'
import {
  rollAdversary, type AdversaryDie, type AdversaryRollResult,
} from './dice'
import { adversaryEffectToCombatEffects } from './effects'

/** Outcome of one adversary attack: roll, hit/fives flags, and effects to apply. */
export interface AdversaryAttackResult {
  cardId:         string
  roll:           AdversaryRollResult
  /** total ≥ player guard score. */
  hit:            boolean
  /** roll showed at least the card's onFives.count fives. */
  fivesTriggered: boolean
  /** Engine effects to apply to the target PC (onSuccess/onFailure + onFives). */
  effects:        CombatEffect[]
  notes:          string[]
}

/**
 * Score an already-rolled adversary attack (pure — no RNG).
 *
 * @param roll         The adversary's summed roll (from rollAdversary).
 * @param card         The card being played.
 * @param guardScore   The PC's guard score to meet or beat.
 * @param targetId     The PC being attacked.
 * @param selfId       The attacking creature — receives self-targeted ops
 *                     (gainStability); those ops are dropped when omitted.
 */
export function scoreAdversaryAttack(
  roll:       AdversaryRollResult,
  card:       AdversaryCardDef,
  guardScore: number,
  targetId:   string,
  selfId?:    string,
): AdversaryAttackResult {
  const hit  = roll.total >= guardScore
  const base = hit ? card.onSuccess : card.onFailure

  const effects = adversaryEffectToCombatEffects(base.effect, targetId, selfId)
  const notes   = [hit
    ? `✅ ${roll.total} ≥ garde ${guardScore} — ${base.text || 'succès'}`
    : `◐ ${roll.total} < garde ${guardScore} — ${base.text || 'succès partiel'}`]

  let fivesTriggered = false
  if (card.onFives && roll.fives >= card.onFives.count) {
    fivesTriggered = true
    effects.push(...adversaryEffectToCombatEffects(card.onFives.effect, targetId, selfId))
    notes.push(`⭐ Repérez ${card.onFives.count}×5 (${roll.fives} obtenu${roll.fives > 1 ? 's' : ''}) — ${card.onFives.text || 'effet'}`)
  }

  return { cardId: card.id, roll, hit, fivesTriggered, effects, notes }
}

/**
 * Roll and resolve an adversary attack in one step.
 *
 * @param dice   The adversary's dice pool (sheet.dice, or a card-specific pool).
 * @param opts   Guard-matchup / trait advantages (🟩) and disadvantages (🟥),
 *               each shifting one die's quality by a rung; `selfId` routes
 *               self-targeted card ops (gainStability) to the attacker.
 */
export function resolveAdversaryAttack(
  dice:       AdversaryDie[],
  card:       AdversaryCardDef,
  guardScore: number,
  targetId:   string,
  opts:       { advantages?: number; disadvantages?: number; selfId?: string } = {},
): AdversaryAttackResult {
  return scoreAdversaryAttack(rollAdversary(dice, opts), card, guardScore, targetId, opts.selfId)
}
