/**
 * Charge électrique ⚡ (§ électromancie) — entier signé (+ ⊕ / − ⊖). La
 * neutralisation est arithmétique ; les ⊖ au-delà du cap (rang d'Électromancie)
 * se dissipent en 🔥 ; la dissipation réduit la magnitude vers 0 sans changer de
 * pôle. Cap 0 pour les non-mages et les créatures.
 */
import { addCharge, dissipateCharge, chargeCap, applyEffectToState } from '../../src/combat/combatant'
import { initAdversary, addAdversaryCharge, dissipateAdversaryCharge } from '../../src/adversary/combatant'
import { loadAdversary } from '../../src/adversary/io'
import { makeCombatant } from '../helpers/fixtures'

const mage = () => makeCombatant('M', { disciplines: { electromancy: 2 } })

describe('charge ⚡ — personnage', () => {
  it('le cap est le rang d\'Électromancie (0 pour un non-mage)', () => {
    expect(chargeCap(mage())).toBe(2)
    expect(chargeCap(makeCombatant('P'))).toBe(0)
  })

  it('neutralisation : ⊕ et ⊖ se compensent par arithmétique', () => {
    const s = addCharge({ ...mage(), charge: 2 }, -3)   // ⊕2 puis ⊖3
    expect(s.charge).toBe(-1)                            // ⊖1 net
    expect(s.burn).toBe(0)
  })

  it('⊖ dans le cap : aucune brûlure', () => {
    const s = addCharge(mage(), -2)
    expect(s.charge).toBe(-2)
    expect(s.burn).toBe(0)
  })

  it('⊖ au-delà du cap : écrêtage + 🔥 par charge excédentaire', () => {
    const s = addCharge(mage(), -3)                      // cap 2 → 1 en trop
    expect(s.charge).toBe(-2)
    expect(s.burn).toBe(1)
  })

  it('un non-mage brûle à la moindre ⊖ (cap 0)', () => {
    const s = addCharge(makeCombatant('P'), -1)
    expect(s.charge).toBe(0)
    expect(s.burn).toBe(1)
  })

  it('les ⊕ ne sont pas plafonnées', () => {
    const s = addCharge(makeCombatant('P'), 5)
    expect(s.charge).toBe(5)
    expect(s.burn).toBe(0)
  })

  it('dissipation : réduit la magnitude vers 0, sans changer de pôle', () => {
    expect(dissipateCharge({ ...mage(), charge: -2 }, 1).charge).toBe(-1)
    expect(dissipateCharge({ ...mage(), charge: -2 }, 5).charge).toBe(0)   // pas de dépassement
    expect(dissipateCharge({ ...mage(), charge: 3 }, 2).charge).toBe(1)
  })

  it('câblé dans applyEffectToState', () => {
    const s = applyEffectToState(mage(), { targetId: 'M', kind: 'add-charge', delta: -1 })
    expect(s.charge).toBe(-1)
    expect(applyEffectToState(s, { targetId: 'M', kind: 'dissipate-charge', amount: 1 }).charge).toBe(0)
  })
})

describe('charge ⚡ — adversaire (cap 0)', () => {
  it('porte des ⊕, brûle sur ⊖', async () => {
    const c = initAdversary(await loadAdversary('faucheur'))
    expect(addAdversaryCharge(c, 2).charge).toBe(2)
    const neg = addAdversaryCharge(c, -1)
    expect(neg.charge).toBe(0)
    expect(neg.burn).toBe(1)
  })

  it('dissipation vers 0', async () => {
    const c = initAdversary(await loadAdversary('faucheur'))
    expect(dissipateAdversaryCharge({ ...c, charge: 2 }, 1).charge).toBe(1)
  })
})
