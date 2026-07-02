/**
 * Unit tests for the adversary dice model.
 *
 * Random rolls are validated against structural invariants (face membership,
 * tier min/max/keep-4). Scoring and quality adjustment are tested as pure
 * functions with explicit values.
 */
import {
  ADVERSARY_FACES, DICE_BY_POWER,
  adjustDie, adjustPoolQuality,
  rollAdversaryDie, scoreAdversaryRoll, rollAdversary,
  type AdversaryDie, type RolledAdversaryDie,
} from '../../src/adversary/dice'

// ─── Faces ──────────────────────────────────────────────────────────────────

describe('adversary dice — faces', () => {
  it('nuisance / threat / danger match the rules (§ Dés d\'adversaires)', () => {
    expect(ADVERSARY_FACES.nuisance).toEqual([0, 1, 1, 2, 2, 3])
    expect(ADVERSARY_FACES.threat).toEqual([0, 1, 2, 3, 4, 5])
    expect(ADVERSARY_FACES.danger).toEqual([2, 3, 3, 4, 4, 5])
  })

  it('danger die (🟫) differs from the player reinforced die — never confuse them', () => {
    // Player reinforced is 1,2,3,4,5,5; adversary danger has a floor of 2 and one 5.
    expect(ADVERSARY_FACES.danger).not.toEqual([1, 2, 3, 4, 5, 5])
  })

  it('rollAdversaryDie always returns a face of the die', () => {
    for (const die of ['nuisance', 'threat', 'danger'] as AdversaryDie[]) {
      for (let i = 0; i < 200; i++) {
        expect(ADVERSARY_FACES[die]).toContain(rollAdversaryDie(die))
      }
    }
  })
})

// ─── Quality adjustment (🟩 / 🟥) ───────────────────────────────────────────

describe('adversary dice — quality adjustment', () => {
  it('adjustDie walks the ladder nuisance → threat → danger and clamps', () => {
    expect(adjustDie('nuisance', +1)).toBe('threat')
    expect(adjustDie('threat', +1)).toBe('danger')
    expect(adjustDie('danger', +1)).toBe('danger')   // clamped at ceiling
    expect(adjustDie('threat', -1)).toBe('nuisance')
    expect(adjustDie('nuisance', -1)).toBe('nuisance') // clamped at floor
  })

  it('one advantage upgrades exactly one die (the lowest quality)', () => {
    const pool: AdversaryDie[] = ['threat', 'threat', 'nuisance', 'threat']
    expect(adjustPoolQuality(pool, +1)).toEqual(['threat', 'threat', 'threat', 'threat'])
  })

  it('one disadvantage downgrades exactly one die (the highest quality)', () => {
    const pool: AdversaryDie[] = ['threat', 'danger', 'threat', 'threat']
    expect(adjustPoolQuality(pool, -1)).toEqual(['threat', 'threat', 'threat', 'threat'])
  })

  it('does not mutate the input pool', () => {
    const pool: AdversaryDie[] = ['nuisance', 'nuisance']
    adjustPoolQuality(pool, +1)
    expect(pool).toEqual(['nuisance', 'nuisance'])
  })

  it('stops when every die is already at the ceiling', () => {
    const pool: AdversaryDie[] = ['danger', 'danger']
    expect(adjustPoolQuality(pool, +3)).toEqual(['danger', 'danger'])
  })
})

// ─── Scoring (pure) ─────────────────────────────────────────────────────────

describe('adversary dice — scoreAdversaryRoll', () => {
  const rolled = (vals: Array<[AdversaryDie, number]>): RolledAdversaryDie[] =>
    vals.map(([die, value]) => ({ die, value }))

  it('sums four kept dice for the total', () => {
    const r = scoreAdversaryRoll(rolled([['threat', 3], ['threat', 5], ['threat', 0], ['threat', 4]]))
    expect(r.total).toBe(12)
    expect(r.values).toEqual([3, 5, 0, 4])
  })

  it('counts the 5s among kept dice (⭐ Repérez X 5)', () => {
    const r = scoreAdversaryRoll(rolled([['threat', 5], ['danger', 5], ['threat', 2], ['nuisance', 1]]))
    expect(r.fives).toBe(2)
  })

  it('keeps the four highest dice when the pool is larger than four', () => {
    const r = scoreAdversaryRoll(rolled([
      ['threat', 1], ['threat', 5], ['threat', 4], ['threat', 3], ['threat', 5],
    ]))
    // Keeps 5,5,4,3 → total 17, two fives; the lone 1 is dropped.
    expect(r.total).toBe(17)
    expect(r.fives).toBe(2)
  })

  it('has no flaw concept — a 0 is just a low die, not a special readout', () => {
    const r = scoreAdversaryRoll(rolled([['threat', 0], ['threat', 0], ['threat', 0], ['threat', 0]]))
    expect(r.total).toBe(0)
    expect(r.fives).toBe(0)
    expect(r).not.toHaveProperty('flaw')
  })
})

// ─── Full roll — tier invariants ────────────────────────────────────────────

describe('adversary dice — rollAdversary tier bounds', () => {
  const bounds: Record<string, [number, number]> = {
    // tier : [min possible, max possible] for the summed 4-die pool
    insignificant: [0, 12],  // 4× nuisance (max face 3)
    initiate:      [0, 20],  // 4× threat
    elite:         [8, 20],  // 4× danger (min face 2)
  }

  for (const [tier, [min, max]] of Object.entries(bounds)) {
    it(`${tier} totals stay within [${min}, ${max}] over many rolls`, () => {
      const dice = DICE_BY_POWER[tier as keyof typeof DICE_BY_POWER]
      for (let i = 0; i < 500; i++) {
        const r = rollAdversary(dice)
        expect(r.total).toBeGreaterThanOrEqual(min)
        expect(r.total).toBeLessThanOrEqual(max)
        expect(r.dice).toHaveLength(4)
      }
    })
  }

  it('advantage cannot lower the expected total (neutral-to-positive shift)', () => {
    // Compare large-sample means: an advantage upgrades one die's quality.
    const dice = DICE_BY_POWER.novice
    const mean = (adv: number) => {
      let sum = 0
      for (let i = 0; i < 4000; i++) sum += rollAdversary(dice, { advantages: adv }).total
      return sum / 4000
    }
    // +1 advantage ≈ +1 expectation; allow generous slack for RNG.
    expect(mean(1)).toBeGreaterThan(mean(0) - 0.5)
  })
})
