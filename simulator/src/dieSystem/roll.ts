import type { DieResult, PoolRolls, RollResult } from '../types'
import type { DicePool } from './pool'
import { rollDie } from './dice'

/**
 * Step 2: roll all dice in the pool.
 * Returns raw results before any selection.
 */
export function rollPool(pool: DicePool): PoolRolls {
  return {
    characteristic: pool.characteristic.map(type => ({ type, value: rollDie(type) })),
    skill:          pool.skill.map(type => ({ type, value: rollDie(type) })),
    wild:           pool.wild.map(type => ({ type, value: rollDie(type) })),
  }
}

/**
 * Reroll specific dice before selection.
 * Each die may only be rerolled once — enforcing this is the caller's responsibility.
 *
 * @param rolls  Current pool rolls
 * @param rerolls  Array of { category, index } identifying which dice to reroll
 */
export function rerollDice(
  rolls: PoolRolls,
  rerolls: Array<{ category: keyof PoolRolls; index: number }>
): PoolRolls {
  const result: PoolRolls = {
    characteristic: [...rolls.characteristic],
    skill:          [...rolls.skill],
    wild:           [...rolls.wild],
  }
  for (const { category, index } of rerolls) {
    const die = result[category][index]
    if (die) result[category][index] = { type: die.type, value: rollDie(die.type) }
  }
  return result
}

/**
 * Steps 3–5: select the 4 kept dice and compute the final result.
 *
 * Selection rules:
 *  - 1 best characteristic die
 *  - 2 best skill dice
 *  - 1 wild die (highest if advantage present, lowest if disadvantage, otherwise the ⬜)
 *
 * Flaw ⚠️     : either of the 2 kept skill dice = 0
 * Critical ✴️ : either of the 2 kept skill dice = 5
 */
export function computeResult(rolls: PoolRolls, pool: DicePool): RollResult {
  // Best characteristic die
  const bestChar = rolls.characteristic.reduce((b, d) => d.value > b.value ? d : b)

  // Two best skill dice
  const sortedSkill = [...rolls.skill].sort((a, b) => b.value - a.value)
  const skill1 = sortedSkill[0]
  const skill2 = sortedSkill[1]

  // Wild die selection
  const hasAdv = pool.wild.includes('advantage')
  const hasDis = pool.wild.includes('disadvantage')
  let bestWild: DieResult
  if (hasAdv) {
    bestWild = rolls.wild.reduce((b, d) => d.value > b.value ? d : b)
  } else if (hasDis) {
    bestWild = rolls.wild.reduce((b, d) => d.value < b.value ? d : b)
  } else {
    bestWild = rolls.wild[0]
  }

  const total = bestChar.value + skill1.value + skill2.value + bestWild.value

  // 🟫 can never = 0; 🟪 can never = 5 (guaranteed by their faces)
  const flaw     = skill1.value === 0 || skill2.value === 0
  const critical = skill1.value === 5 || skill2.value === 5

  return {
    rolls,
    kept: { characteristic: bestChar, skill: [skill1, skill2], wild: bestWild },
    total,
    flaw,
    critical,
    wild: hasAdv ? 'advantage' : hasDis ? 'disadvantage' : 'none',
  }
}

/** Complete roll in one step (no manual rerolls) */
export function roll(pool: DicePool): RollResult {
  return computeResult(rollPool(pool), pool)
}
