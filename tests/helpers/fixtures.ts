/**
 * Shared test fixtures for the Quadrature simulator test suite.
 */

import type { Character } from '../../src/character/types'
import type { CombatantState } from '../../src/combat/types'
import type { PoolRolls } from '../../src/types'
import type { DicePool } from '../../src/dieSystem/pool'
import { initCombatant, resetRoundTokens } from '../../src/combat/combatant'

// ─── Character ────────────────────────────────────────────────────────────────

/**
 * A well-rounded test character that has all skill prerequisites met:
 *  power ≥ 1     → brutal-strike
 *  precision ≥ 1 → sharp-strike
 *  endurance ≥ 1 → respiration
 *  recovery ≥ 1  → stabilize
 *  reactivity = 2 → 2 reactions per round
 */
export function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: 'TestFighter',
    characteristics: {
      strength:     { value: 3, wounds: 0 },
      agility:      { value: 3, wounds: 0 },
      vigor:        { value: 3, wounds: 0 },
      grace:        { value: 2, wounds: 0 },
      acuity:       { value: 2, wounds: 0 },
      willpower:    { value: 2, wounds: 0 },
      intelligence: { value: 2, wounds: 0 },
      tenacity:     { value: 2, wounds: 0 },
      charisma:     { value: 2, wounds: 0 },
      lucidity:     { value: 2, wounds: 0 },
    },
    skills: {
      power: 2, robustness: 2,
      precision: 2, mobility: 2,
      endurance: 2, recovery: 2,
      composure: 1, disguise: 0,
      observation: 1, vigilance: 2,
      authority: 0, discipline: 0,
      logic: 0, reactivity: 2,
      conviction: 0, resilience: 0,
      eloquence: 0, manipulation: 0,
      foresight: 0, intuition: 0,
    },
    ...overrides,
  }
}

/** Create a ready-to-fight combatant (reset tokens applied) */
export function makeCombatant(name = 'TestFighter', charOverrides: Partial<Character> = {}): CombatantState {
  return resetRoundTokens(initCombatant(makeCharacter({ name, ...charOverrides })))
}

// ─── Dice pool helpers ────────────────────────────────────────────────────────

/** Build a simple DicePool with N characteristic, M skill, and the wild die */
export function makePool(char: number, skill: number): DicePool {
  return {
    characteristic: Array(char).fill('characteristic'),
    skill:          Array(Math.max(2, skill)).fill('skill'),
    wild:           ['wild'],
  }
}

/**
 * Build a PoolRolls with explicit values.
 * characteristic and skill default to single-value arrays; wild defaults to [wildVal].
 */
export function makeRolls(
  charValues:  number[],
  skillValues: number[],
  wildValues:  number[],
): PoolRolls {
  return {
    characteristic: charValues.map(v => ({ type: 'characteristic' as const, value: v })),
    skill:          skillValues.map(v => ({ type: 'skill'          as const, value: v })),
    wild:           wildValues.map(v => ({ type: 'wild'            as const, value: v })),
  }
}
