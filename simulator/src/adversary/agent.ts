/**
 * Adversary decision helpers.
 *
 * Card SELECTION is no longer here: creatures now plan and decide by UTILITY,
 * through the same planner as the PCs (planAdversaryRoundUtility in
 * src/planner/planner.ts). What remains is orthogonal to that choice:
 *
 *  - Target-PART selection: which of the creature's parts an ATTACKER strikes,
 *    by combat style and the parts' functional tags (a melee fighter disables
 *    weapons first, a ranged one cuts off escape).
 *  - `cardMoveBudget`: the ground a card covers, read by the planner (positional
 *    value) and by the PC positioning layer (enemy threat range).
 */

import type { PartTag, AdversaryCardDef } from './types'
import { isPartDestroyed, type AdversaryCombatant, type PartState } from './combatant'

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

/** Ground a card covers, in cases — the biggest `move` op across its outcomes. */
export function cardMoveBudget(card: AdversaryCardDef): number {
  const ops = [...card.onSuccess.effect, ...card.onFailure.effect]
  return ops.reduce((max, op) => 'move' in op ? Math.max(max, op.move) : max, 0)
}
