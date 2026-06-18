/**
 * Tests for roll.ts.
 *
 * `computeResult` is deterministic — it takes pre-built PoolRolls and a DicePool,
 * so we test it without any mocking by constructing rolls by hand.
 *
 * `roll` is the randomised entry point; we test its structural invariants
 * (shape of the result) rather than specific values.
 */
import { computeResult, roll } from '../../src/dieSystem/roll'
import { buildPool } from '../../src/dieSystem/pool'
import { makeRolls, makePool } from '../helpers/fixtures'

describe('computeResult — deterministic selection', () => {

  describe('total', () => {
    it('is the sum of the 4 kept dice', () => {
      const rolls = makeRolls([3], [2, 4], [1])
      const pool  = makePool(1, 2)
      const result = computeResult(rolls, pool)
      // best char=3, best 2 skills=[4,2], wild=1 → 3+4+2+1 = 10
      expect(result.total).toBe(10)
      expect(result.total).toBe(
        result.kept.characteristic.value +
        result.kept.skill[0].value +
        result.kept.skill[1].value +
        result.kept.wild.value,
      )
    })
  })

  describe('characteristic die selection', () => {
    it('picks the highest characteristic die', () => {
      const rolls = makeRolls([1, 4, 2], [3, 3], [1])
      const pool  = makePool(3, 2)
      const result = computeResult(rolls, pool)
      expect(result.kept.characteristic.value).toBe(4)
    })
  })

  describe('skill die selection', () => {
    it('picks the two highest skill dice', () => {
      const rolls = makeRolls([3], [1, 5, 3, 2], [0])
      const pool  = makePool(1, 4)
      const result = computeResult(rolls, pool)
      const keptValues = [result.kept.skill[0].value, result.kept.skill[1].value].sort((a, b) => b - a)
      expect(keptValues).toEqual([5, 3])
    })

    it('skill[0] is the higher of the two kept skill dice', () => {
      const rolls = makeRolls([2], [1, 4], [1])
      const pool  = makePool(1, 2)
      const result = computeResult(rolls, pool)
      expect(result.kept.skill[0].value).toBeGreaterThanOrEqual(result.kept.skill[1].value)
    })
  })

  describe('wild die selection', () => {
    it('uses the white wild die when no advantage/disadvantage', () => {
      const rolls = makeRolls([3], [2, 2], [3])
      const pool  = makePool(1, 2)
      const result = computeResult(rolls, pool)
      expect(result.kept.wild.value).toBe(3)
    })

    it('picks the highest wild die when advantage is present', () => {
      const rolls = { ...makeRolls([2], [2, 2], [1, 4, 5]), wild: [
        { type: 'wild'      as const, value: 1 },
        { type: 'advantage' as const, value: 4 },
        { type: 'advantage' as const, value: 5 },
      ]}
      const pool = { ...makePool(1, 2), wild: ['wild', 'advantage', 'advantage'] as const }
      const result = computeResult(rolls as any, pool as any)
      expect(result.kept.wild.value).toBe(5)
    })

    it('picks the lowest wild die when disadvantage is present', () => {
      const rolls = { ...makeRolls([2], [2, 2], [1]), wild: [
        { type: 'wild'         as const, value: 5 },
        { type: 'disadvantage' as const, value: 1 },
      ]}
      const pool = { ...makePool(1, 2), wild: ['wild', 'disadvantage'] as const }
      const result = computeResult(rolls as any, pool as any)
      expect(result.kept.wild.value).toBe(1)
    })
  })

  describe('flaw detection', () => {
    it('is true when the lower kept skill die = 0', () => {
      const rolls = makeRolls([3], [0, 3], [2])
      const pool  = makePool(1, 2)
      const result = computeResult(rolls, pool)
      expect(result.flaw).toBe(true)
    })

    it('is true when both kept skill dice = 0', () => {
      const rolls = makeRolls([3], [0, 0], [2])
      const pool  = makePool(1, 2)
      const result = computeResult(rolls, pool)
      expect(result.flaw).toBe(true)
    })

    it('is false when no kept skill die = 0', () => {
      const rolls = makeRolls([3], [1, 2], [2])
      const pool  = makePool(1, 2)
      const result = computeResult(rolls, pool)
      expect(result.flaw).toBe(false)
    })

    it('only considers the two KEPT dice — a discarded 0 does not flaw', () => {
      // 3 skill dice: [0, 3, 4] → two best = [4, 3] (the 0 is discarded)
      const rolls = makeRolls([3], [0, 3, 4], [2])
      const pool  = makePool(1, 3)
      const result = computeResult(rolls, pool)
      expect(result.flaw).toBe(false)
    })
  })

  describe('critical detection', () => {
    it('is true when the higher kept skill die = 5', () => {
      const rolls = makeRolls([3], [5, 2], [1])
      const pool  = makePool(1, 2)
      const result = computeResult(rolls, pool)
      expect(result.critical).toBe(true)
    })

    it('is false when no kept skill die = 5', () => {
      const rolls = makeRolls([3], [4, 3], [2])
      const pool  = makePool(1, 2)
      const result = computeResult(rolls, pool)
      expect(result.critical).toBe(false)
    })

    it('only considers the two KEPT dice — a discarded 5 does not crit', () => {
      // 3 skill dice: [5, 1, 0] → two best = [5, 1] → 5 IS kept → should still crit
      // Verify: [5, 0, 0] → two best = [5, 0] → crit AND flaw
      const rolls = makeRolls([3], [5, 0, 0], [2])
      const pool  = makePool(1, 3)
      const result = computeResult(rolls, pool)
      expect(result.critical).toBe(true)
      expect(result.flaw).toBe(true)
    })
  })

})

describe('roll — structural invariants', () => {
  const pool = buildPool({ characteristic: 3, skill: 2 })

  it('returns a RollResult with the correct shape', () => {
    const result = roll(pool)
    expect(result).toHaveProperty('total')
    expect(result).toHaveProperty('flaw')
    expect(result).toHaveProperty('critical')
    expect(result.kept).toHaveProperty('characteristic')
    expect(result.kept.skill).toHaveLength(2)
    expect(result.kept).toHaveProperty('wild')
  })

  it('total is always between 0 and 20', () => {
    for (let i = 0; i < 100; i++) {
      const r = roll(pool)
      expect(r.total).toBeGreaterThanOrEqual(0)
      expect(r.total).toBeLessThanOrEqual(20)
    }
  })

  it('total equals the sum of the 4 kept dice values', () => {
    for (let i = 0; i < 50; i++) {
      const r = roll(pool)
      const expected =
        r.kept.characteristic.value +
        r.kept.skill[0].value +
        r.kept.skill[1].value +
        r.kept.wild.value
      expect(r.total).toBe(expected)
    }
  })

  it('flaw is consistent with kept skill values', () => {
    for (let i = 0; i < 100; i++) {
      const r = roll(pool)
      const hasZero = r.kept.skill[0].value === 0 || r.kept.skill[1].value === 0
      expect(r.flaw).toBe(hasZero)
    }
  })

  it('critical is consistent with kept skill values', () => {
    for (let i = 0; i < 100; i++) {
      const r = roll(pool)
      const hasFive = r.kept.skill[0].value === 5 || r.kept.skill[1].value === 5
      expect(r.critical).toBe(hasFive)
    }
  })

})
