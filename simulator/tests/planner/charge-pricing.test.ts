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

  it('une charge posée sur AUTRUI ne vaut rien (valeur propre au mage)', () => {
    // même effet, mais isSelf=false → 0
    expect(effectBurden(addCharge(-1), mage(3, 0), undefined, undefined, true, false)).toBe(0)
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
