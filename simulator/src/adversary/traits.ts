/**
 * Structured trait registry for adversaries.
 *
 * A trait fires from its stable `id` (annotated in the species file, carried
 * through the fiche by the consolidator) — the prose `effect` stays a pure
 * display string, never parsed. Traits without an `id` are prose-only and have
 * no mechanical hook.
 *
 * Implemented traits (§ Traits d'adversaires, regles_adversaires.md):
 *  - sanguinaire — si la cible souffre d'au moins une hémorragie 🩸, la
 *    créature gagne 🟩 sur ses actions offensives (un dé monte d'un cran).
 */

import type { CombatantState, CardTag } from '../combat/types'
import type { AdversaryCardDef } from './types'
import type { AdversaryCombatant } from './combatant'

/** True if the creature carries the structured trait `id`. */
export function hasTrait(a: AdversaryCombatant, id: string): boolean {
  return a.sheet.traits.some(t => t.id === id)
}

/** True if the card carries `tag` (shared CardTag vocabulary, from the fiche). */
export function hasCardTag(card: AdversaryCardDef, tag: CardTag): boolean {
  return card.tags.includes(tag)
}

/**
 * Dice-quality advantages 🟩 a creature gets when playing `card` against a PC,
 * from its structured traits. Returns the net advantage count plus display
 * notes for the combat log (one per trait that fired).
 */
export function attackAdvantages(
  a:      AdversaryCombatant,
  card:   AdversaryCardDef,
  target: CombatantState,
): { advantages: number; notes: string[] } {
  let advantages = 0
  const notes: string[] = []

  if (hasTrait(a, 'sanguinaire') && hasCardTag(card, 'physicalDamage') && target.status.includes('hemorrhage')) {
    advantages += 1
    notes.push('🟩 Sanguinaire — la cible saigne 🩸')
  }

  return { advantages, notes }
}
