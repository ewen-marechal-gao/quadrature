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

  it('a heavy wound destroys a block once armor and evasion are gone', async () => {
    let c = await faucheur()
    // Ni évasion ni armure sur les Serpes → la 💔 détruit directement le bloc.
    c = { ...c, evasion: 0, parts: c.parts.map(p => p.type === 'sickles' ? { ...p, armor: 0 } : p) }
    const fx: CombatEffect[] = [{ targetId: c.id, kind: 'heavy-wound' }]
    const { state } = applyPcEffectsToAdversary(c, fx, 'sickles')
    expect(isBlockDestroyed(part(state, 'sickles').blocks[0])).toBe(true)
  })

  it('fatigue feeds the death clock, buffered by endurance', async () => {
    const c = await faucheur()  // endurance 2
    const fx: CombatEffect[] = [{ targetId: c.id, kind: 'add-fatigue', amount: 3 }]
    const { state } = applyPcEffectsToAdversary(c, fx, 'body')
    expect(state.endurance).toBe(0)
    expect(state.fatigue).toBe(1)   // 3 − 2 buffered
  })

  it('a mental shift toward Peur moves the track once stability is gone (aggressive → cautious)', async () => {
    let c = await faucheur()
    c = { ...c, stability: 0 }
    const fx: CombatEffect[] = [{ targetId: c.id, kind: 'shift-mental', direction: 'toward-terror' }]
    const { state } = applyPcEffectsToAdversary(c, fx, 'head')
    expect(state.mentalState).toBe('cautious')
  })

  it('collects statuses the adversary model does not represent (not applied)', async () => {
    const c = await faucheur()
    const fx: CombatEffect[] = [{ targetId: c.id, kind: 'add-status', status: 'knockdown' }]
    const { state, unhandledStatuses } = applyPcEffectsToAdversary(c, fx, 'head')
    expect(unhandledStatuses).toEqual(['knockdown'])
    expect(state).toEqual(c)  // nothing changed
  })

  it('Sonné 🫨 IS wired — it sets the stunned flag (Evasion disabled)', async () => {
    const c = await faucheur()
    const fx: CombatEffect[] = [{ targetId: c.id, kind: 'add-status', status: 'stunned' }]
    const { state, unhandledStatuses } = applyPcEffectsToAdversary(c, fx, 'head')
    expect(state.stunned).toBe(true)
    expect(unhandledStatuses).toEqual([])  // handled, not collected
  })
})
