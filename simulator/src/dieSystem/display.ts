import type { DieResult, RollResult, PoolRolls } from '../types'
import type { DicePool } from './pool'
import { EMOJI } from './dice'

function fmt(d: DieResult): string {
  return `${EMOJI[d.type]}${d.value}`
}

/** Format the dice pool composition (types only, no values) */
export function formatPool(pool: DicePool): string {
  const parts = [
    pool.characteristic.map(t => EMOJI[t]).join(''),
    pool.skill.map(t => EMOJI[t]).join(''),
    pool.wild.map(t => EMOJI[t]).join(''),
  ].filter(Boolean)
  return `Pool     : ${parts.join('  ')}`
}

/** Format all raw dice results after rolling */
export function formatRolls(rolls: PoolRolls): string {
  const all = [
    ...rolls.characteristic.map(fmt),
    ...rolls.skill.map(fmt),
    ...rolls.wild.map(fmt),
  ]
  return `Rolled   : ${all.join('  ')}`
}

/** Format the 4 kept dice, the total, and any flaw/critical effects */
export function formatResult(r: RollResult): string {
  const [s1, s2] = r.kept.skill
  const lines = [
    `Kept     : ${fmt(r.kept.characteristic)} + ${fmt(s1)} + ${fmt(s2)} + ${fmt(r.kept.wild)} = ${r.total}`,
  ]
  if (r.flaw)     lines.push(`           ⚠️  FLAW (skill die = 0)`)
  if (r.critical) lines.push(`           ✴️  CRITICAL (skill die = 5)`)
  return lines.join('\n')
}

/**
 * Interpret a score against the standard Quadrature difficulty thresholds.
 * Useful for quickly reading how a result compares to a target difficulty.
 */
export function interpretScore(total: number): string {
  if (total <  6) return `${total} → Below trivial      (DC 6)`
  if (total <  8) return `${total} → Trivial             (DC 6)`
  if (total < 10) return `${total} → Simple              (DC 8)`
  if (total < 12) return `${total} → Routine             (DC 10)`
  if (total < 14) return `${total} → Demanding           (DC 12)`
  if (total < 16) return `${total} → Hard                (DC 14)`
  if (total < 18) return `${total} → Heroic              (DC 16)`
  return              `${total} → Near-legendary       (DC 18)`
}
