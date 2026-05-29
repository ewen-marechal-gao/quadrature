import type { DieType, RollParams } from '../types'

/** The dice pool to be rolled, organised by category */
export interface DicePool {
  /** Characteristic dice: N × 🟦, or 1 × 🟪 when characteristic = 0 */
  characteristic: DieType[]
  /** Skill dice: always ≥ 2 (🟨/🟫, padded with 🟪 when skill < 2) */
  skill: DieType[]
  /** Wild dice: ⬜ plus any net 🟩 or 🟥 after pair cancellation */
  wild: DieType[]
}

/**
 * Builds the dice pool according to Quadrature rules (roll step 1).
 *
 * Application order:
 *   1. Characteristic dice (🟦 × value, or 🟪 when value = 0)
 *   2. Skill dice (🟨 × value + 🟪 to reach a minimum of 2)
 *   3. Sacrifices ⛞ (remove 1 🟦 to upgrade 1 🟪 skill die → 🟨)
 *   4. Boosts ⬆ (🟨 → 🟫 only; 🟪 cannot be boosted this way)
 *   5. Wild dice (⬜ + net 🟩 or 🟥 after pair cancellation)
 */
export function buildPool(params: RollParams): DicePool {
  const {
    characteristic: charVal,
    skill: skillVal,
    advantages = 0,
    disadvantages = 0,
    sacrifices = 0,
    skillBoosts = 0,
  } = params

  // 1. Characteristic
  let charDice: DieType[] = charVal === 0
    ? ['weakened']
    : Array<DieType>(charVal).fill('characteristic')

  // 2. Skill (minimum 2 dice, padded with weakened 🟪)
  let skillDice: DieType[] = [
    ...Array<DieType>(Math.min(skillVal, 5)).fill('skill'),
    ...Array<DieType>(Math.max(2 - skillVal, 0)).fill('weakened'),
  ]

  // 3. Sacrifices ⛞: remove 1 🟦 (requires ≥ 2) → upgrade 1 🟪 skill die to 🟨
  let normalCharCount = charDice.filter(d => d === 'characteristic').length
  for (let i = 0; i < sacrifices; i++) {
    if (normalCharCount < 2) break  // cannot sacrifice without at least 2 characteristic dice
    const weakenedIdx = skillDice.findIndex(d => d === 'weakened')
    if (weakenedIdx === -1) break   // no weakened skill dice to upgrade

    charDice.splice(charDice.lastIndexOf('characteristic'), 1)
    normalCharCount--
    skillDice[weakenedIdx] = 'skill'
  }

  // 4. Boosts ⬆ (via traits): 🟨 → 🟫 only — cannot upgrade 🟪 weakened dice
  for (let i = 0; i < skillBoosts; i++) {
    const skillIdx = skillDice.findIndex(d => d === 'skill')
    if (skillIdx !== -1) skillDice[skillIdx] = 'reinforced'
  }

  // 5. Wild dice: cancel 🟩/🟥 pairs, then add the net balance to ⬜
  const pairs = Math.min(advantages, disadvantages)
  const netAdv = advantages - pairs
  const netDis = disadvantages - pairs

  const wildDice: DieType[] = ['wild']
  if (netAdv > 0) wildDice.push(...Array<DieType>(netAdv).fill('advantage'))
  else if (netDis > 0) wildDice.push(...Array<DieType>(netDis).fill('disadvantage'))

  return { characteristic: charDice, skill: skillDice, wild: wildDice }
}
