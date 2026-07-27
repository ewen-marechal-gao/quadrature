/**
 * Charge électrique ⚡ (§ électromancie) — entier signé (+ ⊕ / − ⊖). La
 * neutralisation est arithmétique. Le plafond + la dissipation en 🔥 ne concernent
 * QUE l'auto-accumulation du lanceur (⊖ au-delà de son niveau, flag `capped`) —
 * une charge reçue / posée sur autrui s'accumule sans plafond ni brûlure.
 */
import { addCharge, dissipateCharge, chargeCap, applyEffectToState } from '../../src/combat/combatant'
import { initAdversary, addAdversaryCharge, dissipateAdversaryCharge } from '../../src/adversary/combatant'
import { loadAdversary } from '../../src/adversary/io'
import { makeCombatant } from '../helpers/fixtures'

const mage = () => makeCombatant('M', { disciplines: { electromancy: 2 } })

describe('charge ⚡ — neutralisation & réception (non plafonnées)', () => {
  it('le cap est le rang d\'Électromancie (0 pour un non-mage)', () => {
    expect(chargeCap(mage())).toBe(2)
    expect(chargeCap(makeCombatant('P'))).toBe(0)
  })

  it('neutralisation : ⊕ et ⊖ se compensent par arithmétique', () => {
    const s = addCharge({ ...mage(), charge: 2 }, -3)   // ⊕2 puis ⊖3 reçues
    expect(s.charge).toBe(-1)
    expect(s.burn).toBe(0)
  })

  it('une charge REÇUE ne brûle jamais, même en ⊖ profonde', () => {
    const s = addCharge(makeCombatant('P'), -3)          // posée par un tiers, non plafonnée
    expect(s.charge).toBe(-3)
    expect(s.burn).toBe(0)
  })

  it('les ⊕ ne sont pas plafonnées', () => {
    expect(addCharge(makeCombatant('P'), 5).charge).toBe(5)
  })
})

describe('charge ⚡ — AUTO-accumulation du lanceur (plafonnée, `capped`)', () => {
  it('⊖ dans le cap : aucune brûlure', () => {
    const s = addCharge(mage(), -2, true)
    expect(s.charge).toBe(-2)
    expect(s.burn).toBe(0)
  })

  it('⊖ au-delà du cap : écrêtage + 🔥 par charge excédentaire', () => {
    const s = addCharge(mage(), -3, true)                // cap 2 → 1 en trop
    expect(s.charge).toBe(-2)
    expect(s.burn).toBe(1)
  })

  it('un non-mage qui s\'auto-chargerait (cap 0) brûle aussitôt', () => {
    const s = addCharge(makeCombatant('P'), -1, true)
    expect(s.charge).toBe(0)
    expect(s.burn).toBe(1)
  })

  it('auto-charge ⊕ : jamais de brûlure malgré `capped`', () => {
    expect(addCharge(mage(), 3, true).burn).toBe(0)
  })
})

describe('charge ⚡ — dissipation & câblage', () => {
  it('dissipation : réduit la magnitude vers 0, sans changer de pôle', () => {
    expect(dissipateCharge({ ...mage(), charge: -2 }, 1).charge).toBe(-1)
    expect(dissipateCharge({ ...mage(), charge: -2 }, 5).charge).toBe(0)   // pas de dépassement
    expect(dissipateCharge({ ...mage(), charge: 3 }, 2).charge).toBe(1)
  })

  it('applyEffectToState : `capped` seul brûle', () => {
    // Reçue (sans capped) : pas de brûlure même au-delà du cap.
    const recv = applyEffectToState(mage(), { targetId: 'M', kind: 'add-charge', delta: -3 })
    expect(recv.charge).toBe(-3)
    expect(recv.burn).toBe(0)
    // Auto-chargée (capped) : brûle au-delà du cap.
    const self = applyEffectToState(mage(), { targetId: 'M', kind: 'add-charge', delta: -3, capped: true })
    expect(self.charge).toBe(-2)
    expect(self.burn).toBe(1)
  })
})

describe('charge ⚡ — adversaire (jamais d\'auto-charge → jamais de 🔥)', () => {
  it('porte ⊕ comme ⊖ sans brûler', async () => {
    const c = initAdversary(await loadAdversary('faucheur'))
    expect(addAdversaryCharge(c, 2).charge).toBe(2)
    const neg = addAdversaryCharge(c, -3)
    expect(neg.charge).toBe(-3)
    expect(neg.burn).toBe(0)
  })

  it('dissipation vers 0', async () => {
    const c = initAdversary(await loadAdversary('faucheur'))
    expect(dissipateAdversaryCharge({ ...c, charge: 2 }, 1).charge).toBe(1)
  })
})
