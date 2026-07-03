import type { DieResult, DieType, PoolRolls, RollResult } from '../types'
import type { DicePool } from './pool'
import { rollDie } from './dice'

/**
 * Reroll priority when several candidate dice tie for the lowest value.
 * Reroll the 🟨 skill die first, then 🟪 weakened, then 🟦 characteristic, and
 * the 🟫 reinforced (a strong die) last. Only characteristic/skill dice are
 * relance candidates — never the wild ⬜/🟩/🟥.
 */
const REROLL_PRIORITY: Partial<Record<DieType, number>> = {
  skill:          0,  // 🟨
  weakened:       1,  // 🟪
  characteristic: 2,  // 🟦
  reinforced:     3,  // 🟫
}

/**
 * Pick the single die a relance ⟳ should reroll: the worst (lowest value) among
 * the characteristic and skill dice, breaking ties by REROLL_PRIORITY. Dice in
 * `used` (already rerolled this roll) are skipped. Pure — no RNG.
 */
type RerollCandidate = { category: 'characteristic' | 'skill'; index: number; value: number; prio: number }

export function worstRerollTarget(
  rolls: PoolRolls,
  used: Set<string> = new Set(),
): { category: 'characteristic' | 'skill'; index: number } | null {
  const candidates: RerollCandidate[] = []
  const collect = (category: 'characteristic' | 'skill', dice: DieResult[]) => {
    dice.forEach((d, index) => {
      if (used.has(`${category}:${index}`)) return
      candidates.push({ category, index, value: d.value, prio: REROLL_PRIORITY[d.type] ?? 9 })
    })
  }
  collect('characteristic', rolls.characteristic)
  collect('skill', rolls.skill)
  if (candidates.length === 0) return null
  // Worst value first; break ties by reroll priority (🟨 < 🟪 < 🟦 < 🟫).
  candidates.sort((a, b) => a.value - b.value || a.prio - b.prio)
  return { category: candidates[0].category, index: candidates[0].index }
}

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

/**
 * Complete roll in one step, applying `rerolls` relances ⟳ before selection.
 * Each relance rerolls the current worst char/skill die (worstRerollTarget),
 * a die is never rerolled twice, and the final 4 kept dice are then selected.
 */
export function roll(pool: DicePool, rerolls = 0): RollResult {
  let rolls = rollPool(pool)
  if (rerolls > 0) {
    const used = new Set<string>()
    for (let i = 0; i < rerolls; i++) {
      const target = worstRerollTarget(rolls, used)
      if (!target) break
      used.add(`${target.category}:${target.index}`)
      rolls = rerollDice(rolls, [target])
    }
  }
  return computeResult(rolls, pool)
}
