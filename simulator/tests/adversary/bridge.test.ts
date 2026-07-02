/**
 * PC → adversary effect translation: a player's attack effects landing on a
 * declared body part, plus fatigue and mental shifts.
 */
import { applyPcEffectsToAdversary } from '../../src/adversary/effects'
import { loadAdversary } from '../../src/adversary/io'
import { initAdversary, isBlockDestroyed, type AdversaryCombatant } from '../../src/adversary/combatant'
import type { CombatEffect } from '../../src/combat/types'

async function faucheur(): Promise<AdversaryCombatant> {
  return initAdversary(await loadAdversary('faucheur'))
}
const part = (c: AdversaryCombatant, type: string) =>
  [...c.parts, ...c.weapons].find(p => p.type === type)!

describe('applyPcEffectsToAdversary', () => {
  it('light wounds land on the declared part (armor applies)', async () => {
    const c = await faucheur()
    const fx: CombatEffect[] = [{ targetId: c.id, kind: 'light-wound', amount: 3 }]
    // rearLeg armor 1 → 3−1 = 2 into the top |▢▢| block (destroyed).
    const { state } = applyPcEffectsToAdversary(c, fx, 'rearLeg')
    expect(part(state, 'rearLeg').blocks[0].damage).toBe(2)
    expect(isBlockDestroyed(part(state, 'rearLeg').blocks[0])).toBe(true)
  })

  it('a heavy wound destroys a block on the declared part (evasion spent first)', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }  // no evasion → heavy destroys a block
    const fx: CombatEffect[] = [{ targetId: c.id, kind: 'heavy-wound' }]
    const { state } = applyPcEffectsToAdversary(c, fx, 'sickles')
    expect(isBlockDestroyed(part(state, 'sickles').blocks[0])).toBe(true)
  })

  it('fatigue feeds the death clock, buffered by endurance', async () => {
    const c = await faucheur()  // endurance 1
    const fx: CombatEffect[] = [{ targetId: c.id, kind: 'add-fatigue', amount: 3 }]
    const { state } = applyPcEffectsToAdversary(c, fx, 'body')
    expect(state.endurance).toBe(0)
    expect(state.fatigue).toBe(2)
  })

  it('a mental shift toward Peur moves the 3-state track once stability is gone', async () => {
    let c = await faucheur()
    c = { ...c, stability: 0 }
    const fx: CombatEffect[] = [{ targetId: c.id, kind: 'shift-mental', direction: 'toward-terror' }]
    const { state } = applyPcEffectsToAdversary(c, fx, 'head')
    expect(state.mentalState).toBe('panicked')
  })

  it('collects statuses the adversary model does not represent (not applied)', async () => {
    const c = await faucheur()
    const fx: CombatEffect[] = [{ targetId: c.id, kind: 'add-status', status: 'knockdown' }]
    const { state, unhandledStatuses } = applyPcEffectsToAdversary(c, fx, 'head')
    expect(unhandledStatuses).toEqual(['knockdown'])
    expect(state).toEqual(c)  // nothing changed
  })
})
