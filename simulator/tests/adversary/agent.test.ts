/**
 * Target-part selection heuristic, against the real Faucheur.
 * Faucheur part tags: head/body support · sickles offensive · rearLeg mobility · tail defensive.
 */
import { loadAdversary } from '../../src/adversary/io'
import { initAdversary, damagePart, type AdversaryCombatant } from '../../src/adversary/combatant'
import {
  targetPriority, selectTargetPart, planAdversaryCard, cardRank, cardMoveBudget,
} from '../../src/adversary/agent'

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

// ─── Card selection ───────────────────────────────────────────────────────────

describe('cardRank', () => {
  it('ranks wound-dealers ahead of other offensive cards', async () => {
    const c = await faucheur()
    // physicalDamage → tier 0
    expect(cardRank(card(c, 'sickleStrike'))).toBe(0)
    expect(cardRank(card(c, 'bite'))).toBe(0)
    expect(cardRank(card(c, 'charge'))).toBe(0)
    // offensive but not physicalDamage → tier 1
    expect(cardRank(card(c, 'cry'))).toBe(1)        // mentalDamage
    expect(cardRank(card(c, 'tailSweep'))).toBe(1)  // fatigueDamage
  })
})

describe('planAdversaryCard', () => {
  it('prefers a wound-dealer over other offensive cards', async () => {
    const c = await faucheur()
    // sickleStrike (base cost 2, physicalDamage) beats the cheaper Cri and Sweep.
    expect(planAdversaryCard(c, 'pc')!.card).toBe('sickleStrike')
  })

  it('falls back to a wound-dealer (bite) once the Serpes are gone, not the Cri', async () => {
    let c = bare(await faucheur())
    // Bloc unique des Serpes détruit → sickleStrike quitte le deck.
    c = damagePart(c, 'sickles', { heavy: 1 })
    // Remaining physicalDamage cards: bite (init 3) and charge (init 5) → bite by deck order.
    expect(planAdversaryCard(c, 'pc')!.card).toBe('bite')
  })

  it('plays the Cri only when no wound-dealer is playable', async () => {
    let c = bare(await faucheur())
    // Destroy every physicalDamage source: Serpes (2 → sickleStrike), the Pattes
    // top block (→ charge) and the head's Mâchoires block (→ bite). Cri est conféré
    // par le Corps (Poumons), laissé intact. Le SNC a migré vers le Corps : la Tête
    // = bite (Mâchoires) · ◇ (cerveau) → 1 seul coup atteint bite. Serpes = 1 bloc.
    c = damagePart(c, 'sickles', { heavy: 1 })
    c = damagePart(c, 'rearLeg', { heavy: 1 })
    c = damagePart(c, 'head', { heavy: 1 })   // bite (Mâchoires) → hors deck
    // Remaining offensive cards: cry (mental, init 2) and tailSweep (fatigue, init 4)
    // → deck order picks the Cri.
    expect(planAdversaryCard(c, 'pc')!.card).toBe('cry')
  })

  it('returns null when the creature is defeated', async () => {
    let c = await faucheur()
    c = { ...c, fatigue: c.sheet.fatigue, endurance: 0 }
    expect(planAdversaryCard(c, 'pc')).toBeNull()
  })
})

// ─── Distance-aware card choice (§ approche) ─────────────────────────────────

describe('cardMoveBudget', () => {
  it('reads the ground a card covers from its ops', async () => {
    const c = await faucheur()
    expect(cardMoveBudget(card(c, 'charge'))).toBe(6)   // 6 en succès, 4 en échec → le meilleur
    expect(cardMoveBudget(card(c, 'bite'))).toBe(0)     // une morsure n'avance pas
  })
})

describe('planAdversaryCard — with a gap to close', () => {
  it('fights when it can reach: its best card, unchanged', async () => {
    const c = await faucheur()
    // Au contact, la distance ne doit RIEN changer au choix historique.
    expect(planAdversaryCard(c, 'pc', new Set(), 1)?.card)
      .toBe(planAdversaryCard(c, 'pc')?.card)
  })

  it('stops raking the air at twelve cases', async () => {
    const c = await faucheur()
    // Sans la distance, Frappe faucheuse (portée 1) l'emporte et le Faucheur
    // frappe le vide manche après manche : c'est le bug que ça corrige.
    expect(planAdversaryCard(c, 'pc')?.card).toBe('sickleStrike')
    expect(planAdversaryCard(c, 'pc', new Set(), 12)?.card).not.toBe('sickleStrike')
  })

  it('howls, then runs: the Cri carries at any range, the Charge buys the ground', async () => {
    const c = await faucheur()
    // Le Cri n'a PAS de portée — les règles n'en donnent pas pour la voix (trou
    // assumé), donc il « atteint » de partout et part en Bande I. La Bande II
    // revient alors à la Charge. Un prédateur qui hurle puis fond : c'est juste.
    expect(planAdversaryCard(c, 'pc', new Set(), 12)?.card).toBe('cry')
    expect(planAdversaryCard(c, 'pc', new Set(['I']), 12)?.card).toBe('charge')
  })

  it('picks the card covering the most ground when nothing can connect', async () => {
    const c = await faucheur()
    // Bande I consommée : il ne reste que des cartes de contact et la Charge. À
    // 12 cases même la Charge (portée 1 + 6) ne connecte pas — et c'est pourtant
    // la bonne : elle achète le terrain de la suivante.
    const plan = planAdversaryCard(c, 'pc', new Set(['I']), 12)
    expect(cardMoveBudget(card(c, plan!.card))).toBeGreaterThan(0)
  })

  it('a positionless fight passes no gap and behaves exactly as before', async () => {
    const c = await faucheur()
    expect(planAdversaryCard(c, 'pc', new Set(), undefined)?.card)
      .toBe(planAdversaryCard(c, 'pc')?.card)
  })
})
