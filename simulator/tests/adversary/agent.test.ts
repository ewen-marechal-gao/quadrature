/**
 * Target-part selection heuristic, against the real Faucheur.
 * Faucheur part tags: head/body support · sickles offensive · rearLeg mobility · tail defensive.
 */
import { loadAdversary } from '../../src/adversary/io'
import { initAdversary, damagePart, type AdversaryCombatant } from '../../src/adversary/combatant'
import { targetPriority, selectTargetPart, cardMoveBudget } from '../../src/adversary/agent'
import { planAdversaryRoundUtility } from '../../src/planner/planner'
import { makeCombatant } from '../helpers/fixtures'

async function faucheur(): Promise<AdversaryCombatant> {
  return initAdversary(await loadAdversary('faucheur'))
}
const card = (c: AdversaryCombatant, id: string) => c.sheet.cards.find(k => k.id === id)!
/** Évasion 0 + armure 0 partout : une 💔 détruit directement un bloc (isole le ciblage/deck). */
const bare = (c: AdversaryCombatant): AdversaryCombatant => ({
  ...c, evasion: 0,
  parts:   c.parts.map(p => ({ ...p, armor: 0 })),
  weapons: c.weapons.map(p => ({ ...p, armor: 0 })),
})

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
    let c = bare(await faucheur())
    // Destroy both Serpes blocks → offensive part gone; melee falls to defensive (tail).
    c = damagePart(c, 'sickles', { heavy: 1 })
    c = damagePart(c, 'sickles', { heavy: 1 })
    expect(selectTargetPart(c, 'melee')!.type).toBe('tail')
  })
})

// ─── cardMoveBudget (lu par le planificateur : valeur positionnelle) ─────────

describe('cardMoveBudget', () => {
  it('reads the ground a card covers from its ops', async () => {
    const c = await faucheur()
    expect(cardMoveBudget(card(c, 'charge'))).toBe(6)   // 6 en succès, 4 en échec → le meilleur
    expect(cardMoveBudget(card(c, 'bite'))).toBe(0)     // une morsure n'avance pas
  })
})

// ─── Cerveau unifié : le planificateur par utilité décide les cartes ─────────

describe('planAdversaryRoundUtility', () => {
  const pcAt = (x: number, y: number) => ({ ...makeCombatant('pc'), pos: { x, y } })
  const cfg = { persona: 'aggressive' as const, targetId: 'pc' }

  it('au contact, arrête un plan non vide (des cartes jouables)', async () => {
    const c = { ...await faucheur(), pos: { x: 1, y: 5 } }
    const plan = planAdversaryRoundUtility(c, pcAt(0, 5), cfg)   // gap 1
    expect(plan.length).toBeGreaterThan(0)
    expect(plan.every(p => c.sheet.cards.some(k => k.id === p.card))).toBe(true)
  })

  it('de loin, le plan cherche à fermer la distance (carte à déplacement)', async () => {
    const c = { ...await faucheur(), pos: { x: 12, y: 5 } }
    const plan = planAdversaryRoundUtility(c, pcAt(0, 5), cfg)   // gap 12
    expect(plan.some(p => cardMoveBudget(card(c, p.card)) > 0)).toBe(true)
  })

  it('renvoie [] quand la créature est vaincue', async () => {
    let c = { ...await faucheur(), pos: { x: 1, y: 5 } }
    c = { ...c, fatigue: c.sheet.fatigue, endurance: 0 }
    expect(planAdversaryRoundUtility(c, pcAt(0, 5), cfg)).toEqual([])
  })
})
