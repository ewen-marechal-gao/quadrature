/**
 * Target-part selection heuristic, against the real Faucheur.
 * Faucheur part tags: head/body support · sickles offensive · rearLeg mobility · tail defensive.
 */
import { loadAdversary } from '../../src/adversary/io'
import { initAdversary, damagePart, type AdversaryCombatant } from '../../src/adversary/combatant'
import { targetPriority, selectTargetPart } from '../../src/adversary/agent'

async function faucheur(): Promise<AdversaryCombatant> {
  return initAdversary(await loadAdversary('faucheur'))
}

describe('selectTargetPart', () => {
  it('a melee attacker strikes the offensive part first (Serpes)', async () => {
    const c = await faucheur()
    expect(selectTargetPart(c, 'melee')!.type).toBe('sickles')
  })

  it('a ranged attacker strikes the mobility part first (Pattes)', async () => {
    const c = await faucheur()
    expect(selectTargetPart(c, 'ranged')!.type).toBe('rearLeg')
  })

  it('melee priority orders offensive > defensive > mobility > support', async () => {
    const c = await faucheur()
    expect(targetPriority(c, 'melee').map(p => p.type))
      .toEqual(['sickles', 'tail', 'rearLeg', 'head', 'body'])
  })

  it('falls through to the next priority once the top part is destroyed', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    // Destroy both Serpes blocks → offensive part gone; melee falls to defensive (tail).
    c = damagePart(c, 'sickles', { heavy: 1 })
    c = damagePart(c, 'sickles', { heavy: 1 })
    expect(selectTargetPart(c, 'melee')!.type).toBe('tail')
  })
})
