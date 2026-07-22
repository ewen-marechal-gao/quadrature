/**
 * Tests for planner/prob.ts — exact check distributions.
 *
 * The exact path is validated against closed-form values computed
 * independently here (uniform 0–5 dice make the arithmetic tractable),
 * and cross-checked against the live dieSystem roller on a large sample.
 */

import {
  checkDistribution, pAtLeast, evOver,
  adversaryDistribution, advPAtLeast, advEvOver,
} from '../../src/planner/prob'
import { roll } from '../../src/dieSystem/roll'
import { buildPool } from '../../src/dieSystem/pool'

/** Sum of all cell probabilities. */
const mass = (cells: Array<{ p: number }>): number =>
  cells.reduce((s, c) => s + c.p, 0)

describe('checkDistribution — exact path (no relance)', () => {
  it('is a probability distribution (mass 1)', () => {
    for (const params of [
      { characteristic: 0, skill: 0 },
      { characteristic: 3, skill: 2 },
      { characteristic: 5, skill: 5, advantages: 2 },
      { characteristic: 2, skill: 1, disadvantages: 1 },
    ]) {
      expect(mass(checkDistribution(params).cells)).toBeCloseTo(1, 10)
    }
  })

  it('char 1 / skill 2: four independent uniform dice — mean 10, flags 11/36', () => {
    // 🟦 + 🟨🟨 + ⬜, all uniform 0–5: E = 4 × 2.5 = 10.
    const dist = checkDistribution({ characteristic: 1, skill: 2 })
    expect(dist.mean).toBeCloseTo(10, 10)
    // ⚠️ = P(at least one of the two kept 🟨 = 0) = 1 − (5/6)² = 11/36. Same for ✴️.
    expect(dist.pFlaw).toBeCloseTo(11 / 36, 10)
    expect(dist.pCritical).toBeCloseTo(11 / 36, 10)
  })

  it('characteristic dice keep the max: E[max of N uniform 0–5]', () => {
    // E[max of N] = Σ v · (((v+1)/6)^N − (v/6)^N)
    const eMax = (n: number): number => {
      let e = 0
      for (let v = 0; v <= 5; v++) e += v * (Math.pow((v + 1) / 6, n) - Math.pow(v / 6, n))
      return e
    }
    for (const charVal of [2, 3, 5]) {
      const dist = checkDistribution({ characteristic: charVal, skill: 2 })
      expect(dist.mean).toBeCloseTo(eMax(charVal) + 5 + 2.5, 10)   // + E[🟨🟨] + E[⬜]
    }
  })

  it('advantage keeps the highest wild die, disadvantage the lowest', () => {
    const base = checkDistribution({ characteristic: 1, skill: 2 })
    const adv  = checkDistribution({ characteristic: 1, skill: 2, advantages: 1 })
    const dis  = checkDistribution({ characteristic: 1, skill: 2, disadvantages: 1 })
    // E[max of 2 uniform 0–5] = 125/36 ; E[min of 2] = 2·2.5 − 125/36 = 55/36.
    expect(adv.mean - base.mean).toBeCloseTo(125 / 36 - 2.5, 10)
    expect(dis.mean - base.mean).toBeCloseTo(55 / 36 - 2.5, 10)
    // 🟩+🟥 pairs cancel back to the bare wild die.
    const both = checkDistribution({ characteristic: 1, skill: 2, advantages: 1, disadvantages: 1 })
    expect(both.mean).toBeCloseTo(base.mean, 10)
  })

  it('characteristic 0 rolls a weakened 🟪 (faces 0,0,1,2,3,4 — mean 5/3)', () => {
    const dist = checkDistribution({ characteristic: 0, skill: 2 })
    expect(dist.mean).toBeCloseTo(5 / 3 + 5 + 2.5, 10)
  })

  it('skill < 2 pads with weakened 🟪 and never yields ✴️ from the pad', () => {
    // skill 0 → 🟪🟪 kept: crit impossible (🟪 max face = 4).
    const dist = checkDistribution({ characteristic: 1, skill: 0 })
    expect(dist.pCritical).toBe(0)
    // ⚠️ = 1 − P(no zero on both 🟪) = 1 − (4/6)² = 5/9.
    expect(dist.pFlaw).toBeCloseTo(5 / 9, 10)
  })

  it('pAtLeast is a proper survival function', () => {
    const dist = checkDistribution({ characteristic: 3, skill: 3 })
    expect(pAtLeast(dist, 0)).toBeCloseTo(1, 10)
    expect(pAtLeast(dist, 21)).toBe(0)
    expect(pAtLeast(dist, 10)).toBeGreaterThan(pAtLeast(dist, 14))
  })

  it('evOver reproduces the mean', () => {
    const dist = checkDistribution({ characteristic: 2, skill: 4, advantages: 1 })
    expect(evOver(dist, c => c.total)).toBeCloseTo(dist.mean, 10)
  })

  it('matches the live dieSystem roller on a 30k-sample mean', () => {
    const params = { characteristic: 3, skill: 2, advantages: 1 }
    const dist = checkDistribution(params)
    let sum = 0
    const N = 30_000
    for (let i = 0; i < N; i++) sum += roll(buildPool(params)).total
    expect(sum / N).toBeGreaterThan(dist.mean - 0.15)
    expect(sum / N).toBeLessThan(dist.mean + 0.15)
  })
})

describe('checkDistribution — Monte-Carlo path (relances ⟳)', () => {
  it('is deterministic and near-normalised', () => {
    const a = checkDistribution({ characteristic: 3, skill: 2, rerolls: 1 })
    const b = checkDistribution({ characteristic: 3, skill: 2, rerolls: 1 })
    expect(b).toBe(a)   // memoised — same object
    expect(mass(a.cells)).toBeCloseTo(1, 6)
  })

  it('rerolling the worst die raises the mean', () => {
    const base = checkDistribution({ characteristic: 3, skill: 2 })
    const rr   = checkDistribution({ characteristic: 3, skill: 2, rerolls: 1 })
    expect(rr.mean).toBeGreaterThan(base.mean)
    // ...and lowers the flaw rate (zeros get rerolled first).
    expect(rr.pFlaw).toBeLessThan(base.pFlaw)
  })
})

describe('adversaryDistribution', () => {
  it('sums the dice: 4×⬜ threat mean 10, 4×🟫 danger mean 14, 4×🟧 nuisance mean 6', () => {
    expect(adversaryDistribution(['threat', 'threat', 'threat', 'threat']).mean).toBeCloseTo(10, 10)
    expect(adversaryDistribution(['danger', 'danger', 'danger', 'danger']).mean).toBeCloseTo(14, 10)
    expect(adversaryDistribution(['nuisance', 'nuisance', 'nuisance', 'nuisance']).mean).toBeCloseTo(6, 10)
    expect(mass(adversaryDistribution(['danger', 'threat', 'threat', 'threat']).cells)).toBeCloseTo(1, 10)
  })

  it('🟩/🟥 move one die a rung: ±1 in expectation (§ Avantage et désavantage)', () => {
    const base = adversaryDistribution(['threat', 'threat', 'threat', 'threat'])
    const up   = adversaryDistribution(['threat', 'threat', 'threat', 'threat'], { advantages: 1 })
    const down = adversaryDistribution(['threat', 'threat', 'threat', 'threat'], { disadvantages: 1 })
    expect(up.mean - base.mean).toBeCloseTo(1, 10)
    expect(down.mean - base.mean).toBeCloseTo(-1, 10)
  })

  it('keep-4: a fifth die can only help', () => {
    const four = adversaryDistribution(['threat', 'threat', 'threat', 'threat'])
    const five = adversaryDistribution(['threat', 'threat', 'threat', 'threat', 'threat'])
    expect(five.mean).toBeGreaterThan(four.mean)
    expect(five.cells.every(c => c.total <= 20)).toBe(true)
  })

  it('⭐ fives: P(≥1 five) on 4×🟫 danger = 1 − (5/6)⁴', () => {
    const dist = adversaryDistribution(['danger', 'danger', 'danger', 'danger'])
    const pFive = advEvOver(dist, c => (c.fives >= 1 ? 1 : 0))
    expect(pFive).toBeCloseTo(1 - Math.pow(5 / 6, 4), 10)
  })

  it('advPAtLeast is monotone', () => {
    const dist = adversaryDistribution(['danger', 'threat', 'threat', 'threat'])
    expect(advPAtLeast(dist, 0)).toBeCloseTo(1, 10)
    expect(advPAtLeast(dist, 8)).toBeGreaterThan(advPAtLeast(dist, 12))
    expect(advPAtLeast(dist, 21)).toBe(0)
  })
})
