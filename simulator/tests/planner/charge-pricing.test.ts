/**
 * Phase D — pricing de la charge ⚡ par potentiel de conversion.
 *
 * On teste la FORME : porter des ⊖ est bénéfique (burden négatif) TANT QU'un
 * exutoire existe dans le kit (`hasChargeSink`) ; le débordement du plafond
 * facture son 🔥 ; dissiper coûte le stock perdu ; la valeur est propre au
 * LANCEUR (une charge sur autrui = 0 pour l'instant).
 */
import {
  effectBurden, scoreEffects, chargeStockBurdenPc, PERSONA_WEIGHTS,
  type ScoreContext,
} from '../../src/planner/value'
import { makeCombatant } from '../helpers/fixtures'
import type { CombatEffect } from '../../src/combat/types'

// cap = rang d'Électromancie
const mage = (elec = 3, charge = 0) =>
  ({ ...makeCombatant('M', { disciplines: { electromancy: elec } }), charge })

const addCharge = (delta: number, capped = true): CombatEffect =>
  ({ targetId: 'M', kind: 'add-charge', delta, capped })

/** effectBurden avec les drapeaux charge (exutoire présent, effet sur le lanceur). */
const selfBurden = (e: CombatEffect, s = mage(), sink = true) =>
  effectBurden(e, s, undefined, undefined, sink, true)

describe('chargeStockBurdenPc — stock de ⊖ du lanceur', () => {
  it('sans exutoire, une ⊖ est inerte (0)', () => {
    expect(chargeStockBurdenPc(mage(3, -3), false)).toBe(0)
  })

  it('avec exutoire, porter des ⊖ est bénéfique (burden négatif)', () => {
    expect(chargeStockBurdenPc(mage(3, -1), true)).toBeLessThan(0)
  })

  it('rendements décroissants : la 3ᵉ ⊖ ajoute moins que la 1ʳᵉ', () => {
    const v1 = -chargeStockBurdenPc(mage(3, -1), true)
    const v2 = -chargeStockBurdenPc(mage(3, -2), true)
    const v3 = -chargeStockBurdenPc(mage(3, -3), true)
    expect(v2 - v1).toBeLessThan(v1)        // 2ᵉ < 1ʳᵉ
    expect(v3 - v2).toBeLessThan(v2 - v1)   // 3ᵉ < 2ᵉ
  })

  it('les ⊕ sur soi ne sont pas un stock exploitable (0)', () => {
    expect(chargeStockBurdenPc(mage(3, 4), true)).toBe(0)
  })
})

describe('effectBurden — marginal add/dissipate sur le lanceur', () => {
  it('gagner une ⊖ dans le plafond est bénéfique', () => {
    expect(selfBurden(addCharge(-1), mage(3, 0))).toBeLessThan(0)
  })

  it('gagner une ⊖ AU-DELÀ du plafond facture le 🔥 (burden positif)', () => {
    // cap 1, déjà -1 → l'ajout déborde, écrête, et brûle.
    expect(selfBurden(addCharge(-1), mage(1, -1))).toBeGreaterThan(0)
  })

  it('sans exutoire : pas de bénéfice, mais le débordement brûle quand même', () => {
    expect(selfBurden(addCharge(-1), mage(3, 0), false)).toBe(0)          // inerte
    expect(selfBurden(addCharge(-1), mage(1, -1), false)).toBeGreaterThan(0) // 🔥 subsiste
  })

  it('dissiper une ⊖ coûte le stock perdu (burden positif)', () => {
    const e: CombatEffect = { targetId: 'M', kind: 'dissipate-charge', amount: 1 }
    expect(selfBurden(e, mage(3, -2))).toBeGreaterThan(0)
  })

  // ── Charge posée sur AUTRUI : un PÔLE, pas une réserve ────────────────────
  //
  // Elle profite au LANCEUR et non au porteur, donc elle se code en fardeau
  // POSITIF sur la cible — c'est ainsi que scoreEffects (offense × fardeau) lit
  // un bénéfice pour le mage. Décote de 25 % : un pôle distant bouge, meurt ou
  // se décharge (§ REMOTE_CHARGE_RATIO).
  const remote = (e: CombatEffect, target: ReturnType<typeof mage>, sink = true) =>
    effectBurden(e, target, undefined, undefined, sink, /* isSelf = */ false)

  it('une charge posée sur autrui vaut pour le lanceur (fardeau positif)', () => {
    expect(remote(addCharge(-1), mage(3, 0))).toBeGreaterThan(0)
  })

  it('elle vaut 75 % de ce qu\'elle vaudrait sur le mage', () => {
    const onSelf   = -selfBurden(addCharge(-1), mage(3, 0))   // utilité (positive)
    const onOther  =  remote(addCharge(-1), mage(3, 0))
    expect(onOther).toBeCloseTo(0.75 * onSelf, 6)
  })

  it('le SIGNE est indifférent : une ⊕ est un pôle comme une ⊖', () => {
    expect(remote(addCharge(1), mage(3, 0))).toBeCloseTo(remote(addCharge(-1), mage(3, 0)), 6)
  })

  it('sans exutoire dans le kit, un pôle distant reste inerte', () => {
    expect(remote(addCharge(-1), mage(3, 0), /* sink = */ false)).toBe(0)
  })

  it('dissiper le pôle d\'autrui rend le stock perdu (fardeau négatif)', () => {
    const e: CombatEffect = { targetId: 'X', kind: 'dissipate-charge', amount: 1 }
    expect(remote(e, mage(3, -2))).toBeLessThan(0)
  })
})

describe('scoreEffects — le gate décide si se charger a de la valeur', () => {
  const ctx = (hasChargeSink: boolean): ScoreContext => ({
    selfId:  'M',
    isEnemy: id => id !== 'M',
    getActor: id => (id === 'M' ? mage(3, 0) : undefined),
    weights: PERSONA_WEIGHTS.aggressive,
    hasChargeSink,
  })

  it('avec exutoire, se charger score positif ; sans exutoire, nul', () => {
    expect(scoreEffects([addCharge(-1)], ctx(true))).toBeGreaterThan(0)
    expect(scoreEffects([addCharge(-1)], ctx(false))).toBe(0)
  })
})
