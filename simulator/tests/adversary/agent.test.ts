/**
 * Target-part selection heuristic, against the real Faucheur.
 * Faucheur part tags: head/body support · sickles offensive · rearLeg mobility · tail defensive.
 */
import { loadAdversary } from '../../src/adversary/io'
import { initAdversary, damagePart, type AdversaryCombatant } from '../../src/adversary/combatant'
import { targetPriority, selectTargetPart, planAdversaryCard, cardRank } from '../../src/adversary/agent'

async function faucheur(): Promise<AdversaryCombatant> {
  return initAdversary(await loadAdversary('faucheur'))
}
const card = (c: AdversaryCombatant, id: string) => c.sheet.cards.find(k => k.id === id)!

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

// ─── Card selection ───────────────────────────────────────────────────────────

describe('cardRank', () => {
  it('ranks wound-dealers ahead of other offensive cards', async () => {
    const c = await faucheur()
    // physicalDamage → tier 0
    expect(cardRank(card(c, 'sickleStrike'))).toBe(0)
    expect(cardRank(card(c, 'bite'))).toBe(0)
    expect(cardRank(card(c, 'charge'))).toBe(0)
    // offensive but not physicalDamage → tier 1
    expect(cardRank(card(c, 'shriek'))).toBe(1)     // mentalDamage
    expect(cardRank(card(c, 'tailSweep'))).toBe(1)  // fatigueDamage
  })
})

describe('planAdversaryCard', () => {
  it('prefers a wound-dealer over the equally-costed Cri (⚫⚫)', async () => {
    const c = await faucheur()
    // Both sickleStrike and shriek are base cost 2; the wound-dealer wins.
    expect(planAdversaryCard(c, 'pc')!.card).toBe('sickleStrike')
  })

  it('falls back to a wound-dealer (bite) once the Serpes are gone, not the Cri', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    // Destroy both Serpes blocks → sickleStrike leaves the deck.
    c = damagePart(c, 'sickles', { heavy: 1 })
    c = damagePart(c, 'sickles', { heavy: 1 })
    // Remaining physicalDamage cards: bite (init 3) and charge (init 5) → bite by deck order.
    expect(planAdversaryCard(c, 'pc')!.card).toBe('bite')
  })

  it('plays the Cri only when no wound-dealer is playable', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    // Destroy every physicalDamage source: Serpes (2 → sickleStrike), Pattes (2 →
    // charge), and the head's top two blocks (◇ then bite) while keeping the head's
    // shriek block intact (destruction is top → bottom).
    c = damagePart(c, 'sickles', { heavy: 1 })
    c = damagePart(c, 'sickles', { heavy: 1 })
    c = damagePart(c, 'rearLeg', { heavy: 1 })
    c = damagePart(c, 'rearLeg', { heavy: 1 })
    c = damagePart(c, 'head', { heavy: 1 })
    c = damagePart(c, 'head', { heavy: 1 })
    // Remaining offensive cards: shriek (mental, cost 2) and tailSweep (fatigue, cost 1).
    expect(planAdversaryCard(c, 'pc')!.card).toBe('shriek')
  })

  it('returns null when the creature is defeated', async () => {
    let c = await faucheur()
    c = { ...c, fatigue: c.sheet.fatigue, endurance: 0 }
    expect(planAdversaryCard(c, 'pc')).toBeNull()
  })
})
