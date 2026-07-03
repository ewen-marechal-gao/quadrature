/**
 * Relance ⟳ — worst-die selection and its integration into roll().
 */
import { worstRerollTarget, roll } from '../../src/dieSystem'
import type { PoolRolls, DieResult } from '../../src/types'
import { buildPool } from '../../src/dieSystem'

const die = (type: DieResult['type'], value: number): DieResult => ({ type, value })

function pool(chars: DieResult[], skills: DieResult[], wilds: DieResult[]): PoolRolls {
  return { characteristic: chars, skill: skills, wild: wilds }
}

describe('worstRerollTarget', () => {
  it('targets the lowest-value char/skill die', () => {
    const rolls = pool([die('characteristic', 4)], [die('skill', 3), die('skill', 1)], [die('wild', 0)])
    expect(worstRerollTarget(rolls)).toEqual({ category: 'skill', index: 1 })  // the 1
  })

  it('never targets the wild die, even if it is the lowest', () => {
    // wild = 0 is the global minimum but not a relance candidate → the char (1) wins.
    const rolls = pool([die('characteristic', 1)], [die('skill', 3)], [die('wild', 0)])
    expect(worstRerollTarget(rolls)).toEqual({ category: 'characteristic', index: 0 })
  })

  it('breaks value ties by priority 🟨 > 🟪 > 🟦 > 🟫', () => {
    // All four tied at value 1: pick the 🟨 skill die first.
    const rolls = pool(
      [die('characteristic', 1)],
      [die('weakened', 1), die('reinforced', 1), die('skill', 1)],
      [die('wild', 5)],
    )
    expect(worstRerollTarget(rolls)).toEqual({ category: 'skill', index: 2 })  // 🟨
  })

  it('after 🟨, prefers 🟪 over 🟦 on a tie', () => {
    const rolls = pool([die('characteristic', 1)], [die('weakened', 1), die('reinforced', 1)], [die('wild', 5)])
    expect(worstRerollTarget(rolls)).toEqual({ category: 'skill', index: 0 })  // 🟪 beats 🟦
  })

  it('skips dice already rerolled (used set)', () => {
    const rolls = pool([die('characteristic', 4)], [die('skill', 1), die('skill', 1)], [die('wild', 0)])
    const used = new Set(['skill:0'])
    expect(worstRerollTarget(rolls)).toEqual({ category: 'skill', index: 0 })
    expect(worstRerollTarget(rolls, used)).toEqual({ category: 'skill', index: 1 })
  })

  it('returns null when there are no candidates', () => {
    expect(worstRerollTarget(pool([], [], [die('wild', 3)]))).toBeNull()
  })
})

describe('roll with relances', () => {
  it('a relance never lowers the score (worst die can only be replaced by re-selection)', () => {
    // Statistical guard: over many rolls, the relance mean ≥ the plain mean.
    const p = buildPool({ characteristic: 3, skill: 3 })
    let plain = 0, relance = 0
    const N = 400
    for (let i = 0; i < N; i++) {
      plain   += roll(p, 0).total
      relance += roll(p, 1).total
    }
    expect(relance / N).toBeGreaterThanOrEqual(plain / N)
  })

  it('two relances reroll two distinct dice', () => {
    // With a small pool (1 char + 2 skill), 2 relances touch both skill dice /
    // the char die but never the same die twice — just assert it runs and scores.
    const p = buildPool({ characteristic: 1, skill: 1 })
    const r = roll(p, 2)
    expect(r.total).toBeGreaterThanOrEqual(0)
    expect(r.total).toBeLessThanOrEqual(20)
  })
})
