/**
 * Adversary decision heuristics.
 *
 * Target selection: an attacker picks which of the creature's parts to strike
 * based on its own combat style and the parts' functional tags. A melee fighter
 * favours disabling weapons first (offensive), a ranged one favours cutting off
 * escape (mobility). Untagged parts rank last; destroyed / block-less parts are
 * not eligible.
 */

import type { PartTag } from './types'
import type { PlannedCard } from '../combat/round'
import {
  isPartDestroyed, activeDeck, canPlayCard, isAdversaryDefeated,
  type AdversaryCombatant, type PartState,
} from './combatant'

/** Combat style of the attacker choosing a target part. */
export type CombatStyle = 'melee' | 'ranged'

/** Tag priority (most → least attractive to strike) per combat style. */
export const TARGET_PRIORITY: Record<CombatStyle, PartTag[]> = {
  melee:  ['offensive', 'defensive', 'mobility', 'support'],
  ranged: ['mobility', 'defensive', 'offensive', 'support'],
}

/** Parts that can still be attacked (have blocks and are not destroyed). */
function targetableParts(c: AdversaryCombatant): PartState[] {
  return [...c.parts, ...c.weapons].filter(p => p.blocks.length > 0 && !isPartDestroyed(p))
}

/**
 * Order the creature's targetable parts by attractiveness for the given style
 * (highest priority first). Untagged parts rank last; ties keep anatomical order
 * (stable sort).
 */
export function targetPriority(c: AdversaryCombatant, style: CombatStyle): PartState[] {
  const order = TARGET_PRIORITY[style]
  const rank = (p: PartState): number => {
    const i = p.tag ? order.indexOf(p.tag) : -1
    return i === -1 ? order.length : i
  }
  return targetableParts(c)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(x => x.p)
}

/** The part a combatant of the given style would choose to strike, if any. */
export function selectTargetPart(c: AdversaryCombatant, style: CombatStyle): PartState | undefined {
  return targetPriority(c, style)[0]
}

// ─── Card selection ───────────────────────────────────────────────────────────

/**
 * Plan the creature's next card play for one wave (scripted, synchronous).
 *
 * Heuristic: among the currently playable cards (in the deck AND affordable at
 * their current cost), pick the one with the highest BASE cost — a proxy for
 * card power (a cost-override block makes a strong card cheap, not weak).
 * Ties keep deck order. Returns null when the creature cannot (or need not) act.
 */
export function planAdversaryCard(
  c:        AdversaryCombatant,
  targetId: string,
): PlannedCard | null {
  if (isAdversaryDefeated(c)) return null
  const playable = activeDeck(c).filter(card => canPlayCard(c, card.id))
  if (playable.length === 0) return null
  const best = [...playable].sort((a, b) => b.cost - a.cost)[0]
  return { actorId: c.id, card: best.id, targetId }
}
