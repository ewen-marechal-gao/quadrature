/**
 * Adversary → PC attack resolution: effect-op translation and scoring.
 *
 * Scoring is tested as a pure function with crafted rolls; the full roll path is
 * checked for hit/miss branching with extreme guard scores.
 */
import { adversaryEffectToCombatEffects } from '../../src/adversary/effects'
import { scoreAdversaryAttack, resolveAdversaryAttack } from '../../src/adversary/attack'
import { loadAdversary } from '../../src/adversary/io'
import type { AdversaryRollResult } from '../../src/adversary/dice'
import type { AdversaryCardDef } from '../../src/adversary/types'

const roll = (total: number, fives = 0): AdversaryRollResult => ({
  dice: ['threat', 'threat', 'threat', 'threat'],
  values: [],
  total,
  fives,
})

async function card(id: string): Promise<AdversaryCardDef> {
  const a = await loadAdversary('faucheur')
  return a.cards.find(c => c.id === id)!
}

// ─── Effect-op translation ────────────────────────────────────────────────────

describe('adversaryEffectToCombatEffects', () => {
  it('maps damage ops to engine effects', () => {
    expect(adversaryEffectToCombatEffects([{ wound: 3 }], 'PC'))
      .toEqual([{ targetId: 'PC', kind: 'light-wound', amount: 3 }])
    expect(adversaryEffectToCombatEffects([{ fatigue: 2 }], 'PC'))
      .toEqual([{ targetId: 'PC', kind: 'add-fatigue', amount: 2 }])
  })

  it('expands a heavy wound count into individual heavy-wound effects', () => {
    expect(adversaryEffectToCombatEffects([{ heavyWound: 2 }], 'PC'))
      .toEqual([
        { targetId: 'PC', kind: 'heavy-wound' },
        { targetId: 'PC', kind: 'heavy-wound' },
      ])
  })

  it('maps a status op to add-status', () => {
    expect(adversaryEffectToCombatEffects([{ status: 'entrapped' }], 'PC'))
      .toEqual([{ targetId: 'PC', kind: 'add-status', status: 'entrapped' }])
  })

  it('maps mental shifts: −N = toward-terror (🔻), +N = toward-rage (🔺)', () => {
    expect(adversaryEffectToCombatEffects([{ mental: -1 }], 'PC'))
      .toEqual([{ targetId: 'PC', kind: 'shift-mental', direction: 'toward-terror' }])
    expect(adversaryEffectToCombatEffects([{ mental: 2 }], 'PC'))
      .toEqual([
        { targetId: 'PC', kind: 'shift-mental', direction: 'toward-rage' },
        { targetId: 'PC', kind: 'shift-mental', direction: 'toward-rage' },
      ])
  })

  it('ignores move ops (no spatial model)', () => {
    expect(adversaryEffectToCombatEffects([{ move: 6 }, { wound: 2 }], 'PC'))
      .toEqual([{ targetId: 'PC', kind: 'light-wound', amount: 2 }])
  })
})

// ─── Scoring: hit / miss / fives (Faucheur cards) ─────────────────────────────

describe('scoreAdversaryAttack — sickleStrike', () => {
  it('total ≥ guard applies onSuccess (3💢)', async () => {
    const r = scoreAdversaryAttack(roll(12), await card('sickleStrike'), 10, 'PC')
    expect(r.hit).toBe(true)
    expect(r.effects).toContainEqual({ targetId: 'PC', kind: 'light-wound', amount: 3 })
  })

  it('total < guard applies onFailure (1💢)', async () => {
    const r = scoreAdversaryAttack(roll(8), await card('sickleStrike'), 10, 'PC')
    expect(r.hit).toBe(false)
    expect(r.effects).toContainEqual({ targetId: 'PC', kind: 'light-wound', amount: 1 })
  })

  it('a single 5 triggers onFives (🔻 mental shift)', async () => {
    const r = scoreAdversaryAttack(roll(12, 1), await card('sickleStrike'), 10, 'PC')
    expect(r.fivesTriggered).toBe(true)
    expect(r.effects).toContainEqual({ targetId: 'PC', kind: 'shift-mental', direction: 'toward-terror' })
  })

  it('no 5 → onFives does not fire', async () => {
    const r = scoreAdversaryAttack(roll(12, 0), await card('sickleStrike'), 10, 'PC')
    expect(r.fivesTriggered).toBe(false)
    expect(r.effects.some(e => e.kind === 'shift-mental')).toBe(false)
  })
})

describe('scoreAdversaryAttack — charge (needs TWO 5s for onFives)', () => {
  it('two 5s entrap the target; the move op is dropped', async () => {
    const r = scoreAdversaryAttack(roll(14, 2), await card('charge'), 10, 'PC')
    expect(r.hit).toBe(true)
    expect(r.effects).toContainEqual({ targetId: 'PC', kind: 'light-wound', amount: 2 })
    expect(r.effects).toContainEqual({ targetId: 'PC', kind: 'add-status', status: 'entrapped' })
    expect(r.effects.some(e => (e as { kind: string }).kind === 'move')).toBe(false)
  })

  it('one 5 is not enough (count 2)', async () => {
    const r = scoreAdversaryAttack(roll(14, 1), await card('charge'), 10, 'PC')
    expect(r.fivesTriggered).toBe(false)
    expect(r.effects.some(e => e.kind === 'add-status')).toBe(false)
  })
})

// ─── Full roll path ───────────────────────────────────────────────────────────

describe('resolveAdversaryAttack — roll path', () => {
  it('always hits against guard 0 and always misses against guard 21', async () => {
    const c = await card('sickleStrike')
    for (let i = 0; i < 50; i++) {
      expect(resolveAdversaryAttack(['threat', 'threat', 'threat', 'threat'], c, 0, 'PC').hit).toBe(true)
      expect(resolveAdversaryAttack(['threat', 'threat', 'threat', 'threat'], c, 21, 'PC').hit).toBe(false)
    }
  })
})
