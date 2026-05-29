import type { DieType } from '../types'

/**
 * Faces for each Quadrature die type.
 * Dice are numbered 0–5 (not 1–6 like standard d6).
 */
export const FACES: Record<DieType, number[]> = {
  characteristic: [0, 1, 2, 3, 4, 5],
  skill:          [0, 1, 2, 3, 4, 5],
  advantage:      [0, 1, 2, 3, 4, 5],
  disadvantage:   [0, 1, 2, 3, 4, 5],
  wild:           [0, 1, 2, 3, 4, 5],
  reinforced:     [1, 2, 3, 4, 5, 5],  // no 0 → never a flaw; 5 appears twice → frequent criticals
  weakened:       [0, 0, 1, 2, 3, 4],  // 0 appears twice → frequent flaws; max 4 → never a critical
}

/** Emoji symbol for each die type (used in display) */
export const EMOJI: Record<DieType, string> = {
  characteristic: '🟦',
  skill:          '🟨',
  advantage:      '🟩',
  disadvantage:   '🟥',
  wild:           '⬜',
  reinforced:     '🟫',
  weakened:       '🟪',
}

/** Roll a single die of the given type, returning a random face value */
export function rollDie(type: DieType): number {
  const faces = FACES[type]
  return faces[Math.floor(Math.random() * faces.length)]
}
