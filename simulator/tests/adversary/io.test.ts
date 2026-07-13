/**
 * Loader tests — read the real generated fiches from data/bestiary/cards/.
 *
 * These assert the structural contract the engine relies on (dice pool, fixed
 * guard, parts/blocks, deck ids). Display prose is checked only lightly.
 */
import {
  loadAdversary, loadAllAdversaries, deserializeAdversary,
} from '../../src/adversary/io'

describe('adversary loader — Faucheur', () => {
  it('loads the fiche with its power tier and 4-threat dice pool', async () => {
    const a = await loadAdversary('faucheur')
    expect(a.id).toBe('faucheur')
    expect(a.name).toBe('Faucheur')
    expect(a.power).toBe('initiate')
    expect(a.dice).toEqual(['threat', 'threat', 'threat', 'threat'])
  })

  it('exposes the fixed guard (Esquive 10)', async () => {
    const a = await loadAdversary('faucheur')
    expect(a.guard).toEqual({ type: 'dodge', value: 10 })
  })

  it('carries the named body parts with armor and capability blocks', async () => {
    const a = await loadAdversary('faucheur')
    const types = a.parts.map(p => p.type)
    expect(types).toEqual(['head', 'body', 'sickles', 'rearLeg', 'tail'])

    const sickles = a.parts.find(p => p.type === 'sickles')!
    expect(sickles.blocks).toHaveLength(2)
    // Both blocks carry display prose; the structured grants gate the deck / cost.
    expect(sickles.blocks.every(b => b.grants.text.length > 0)).toBe(true)
    // Upper block overrides the card cost; lower block confers the action.
    expect(sickles.blocks[0].grants.cardCost).toEqual({ card: 'sickleStrike', cost: 1 })
    expect(sickles.blocks[1].grants.grantsCard).toBe('sickleStrike')
  })

  it('exposes the deck by stable card ids', async () => {
    const a = await loadAdversary('faucheur')
    const ids = a.cards.map(c => c.id)
    expect(ids).toContain('sickleStrike')
    expect(ids).toContain('charge')

    const charge = a.cards.find(c => c.id === 'charge')!
    expect(charge.initiative).toBe(5)
    expect(charge.cost).toBe(1)
  })

  it('carries structured effects on card outcomes', async () => {
    const a = await loadAdversary('faucheur')
    const sickle = a.cards.find(c => c.id === 'sickleStrike')!
    expect(sickle.onSuccess.effect).toEqual([{ wound: 3 }])
    expect(sickle.onFailure.effect).toEqual([{ wound: 1 }])
    expect(sickle.onFives).toMatchObject({ count: 1, effect: [{ mental: -1 }] })
    expect(sickle.onSuccess.text).toBe('Inflige 💢💢💢')

    const charge = a.cards.find(c => c.id === 'charge')!
    expect(charge.onSuccess.effect).toEqual([{ move: 6 }, { wound: 2 }])
    expect(charge.onFives).toMatchObject({ count: 2, effect: [{ status: 'entrapped' }] })
  })

  it('carries the Sanguinaire passive trait', async () => {
    const a = await loadAdversary('faucheur')
    // Innate Sanguinaire + the Stabilité trait surfaced from the intact tail block.
    const sanguinaire = a.traits.find(t => t.name === 'Sanguinaire')
    expect(sanguinaire).toMatchObject({ kind: 'passive' })
  })

  it('has no weapons (attacks are conferred by mutated parts)', async () => {
    const a = await loadAdversary('faucheur')
    expect(a.weapons).toEqual([])
  })
})

describe('adversary loader — Bandit des Cimes (equipment)', () => {
  it('parries at 11 and carries weapons as a separate section', async () => {
    const a = await loadAdversary('bandit-cimes')
    expect(a.guard).toEqual({ type: 'parry', value: 11 })
    const weaponTypes = a.weapons.map(w => w.type)
    expect(weaponTypes).toEqual(['sword', 'bow'])
  })
})

describe('adversary loader — collection', () => {
  it('loads every fiche in the bestiary, ordered by filename', async () => {
    const all = await loadAllAdversaries()
    const ids = all.map(a => a.id)
    expect(ids).toEqual(['bandit-cimes', 'cuirassard', 'evoluant', 'faucheur', 'happe-fond', 'lacerateur'])
  })

  it('resolves the requested locale for display strings', async () => {
    const a = await loadAdversary('faucheur', 'en')
    expect(a.name).toBe('Reaper')
  })
})

describe('adversary loader — deserialize', () => {
  it('throws when the fiche has no id', () => {
    expect(() => deserializeAdversary('name:\n  fr: X')).toThrow(/missing required field "id"/)
  })
})
