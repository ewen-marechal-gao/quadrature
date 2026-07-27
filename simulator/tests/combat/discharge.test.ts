/**
 * Cartes d'Électromancie — brique moteur : makeResolve AUTO-CIBLÉ (Focalisation
 * pose ses ops sur le lanceur sans cible) et le resolver DYNAMIQUE de la Décharge
 * (dégâts proportionnels aux ⊖ portées, charges toujours dépensées).
 */
import { makeResolve } from '../../src/combat/effect-ops'
import { ACTION_RESOLVERS } from '../../src/combat/action-resolvers'
import { makeCombatant } from '../helpers/fixtures'
import type { CombatEffect } from '../../src/combat/types'

const flags = (hit: boolean, critical = false, flaw = false) => ({ hit, critical, flaw })
const find  = (fx: CombatEffect[], kind: CombatEffect['kind'], targetId?: string) =>
  fx.find(e => e.kind === kind && (targetId === undefined || e.targetId === targetId))

describe('makeResolve — action AUTO-CIBLÉE (Focalisation)', () => {
  it('applique ses ops sur le LANCEUR même sans cible ennemie', () => {
    const resolve = makeResolve(
      { onSuccess: { effect: [{ gainStability: 1 }] }, onFailure: { effect: [] },
        onPlay: { effect: [{ selfCharge: -1 }] } },
      true,   // selfTargeted
    )
    const { effects } = resolve(flags(true), { id: 'M' }, undefined)
    const charge = find(effects, 'add-charge', 'M')
    expect(charge).toBeDefined()
    expect((charge as { delta: number }).delta).toBe(-1)
    expect(find(effects, 'add-stability', 'M')).toBeDefined()
  })

  it('une action CIBLÉE sans cible ne produit toujours rien', () => {
    const resolve = makeResolve({ onSuccess: { effect: [{ wound: 2 }] }, onFailure: { effect: [] } })
    expect(resolve(flags(true), { id: 'M' }, undefined).effects).toEqual([])
  })
})

describe('resolver Décharge — conversion dynamique des ⊖', () => {
  const discharge = ACTION_RESOLVERS.discharge
  const mage = (charge: number) => ({ ...makeCombatant('M', { disciplines: { electromancy: 3 } }), charge })
  const T = { id: 'E' }

  it('à vide (0 ⊖) sur un succès : petite étincelle, aucune dissipation', () => {
    const { effects } = discharge.resolve(flags(true), mage(0), T)
    expect(find(effects, 'add-burn', 'E')).toBeDefined()
    expect(find(effects, 'dissipate-charge')).toBeUndefined()
  })

  it('2 ⊖ sur un succès : 2💢 par charge (Intensité) + dissipation de tout', () => {
    const { effects } = discharge.resolve(flags(true), mage(-2), T)
    const wound = find(effects, 'light-wound', 'E') as { amount: number } | undefined
    expect(wound?.amount).toBe(4)                       // 2💢 × 2⊖
    const diss = find(effects, 'dissipate-charge', 'M') as { amount: number } | undefined
    expect(diss?.amount).toBe(2)                        // toutes libérées
  })

  it('critique : +1 ⊖ fictive pour le calcul des effets', () => {
    const { effects } = discharge.resolve(flags(true, true), mage(-2), T)
    expect((find(effects, 'light-wound', 'E') as { amount: number }).amount).toBe(6)  // (2+1)×2
  })

  it('succès partiel : brûle 1🔥 par ⊖ (au moins 1), charges dépensées', () => {
    const { effects } = discharge.resolve(flags(false), mage(-2), T)
    expect((find(effects, 'add-burn', 'E') as { amount: number }).amount).toBe(2)
    expect(find(effects, 'dissipate-charge', 'M')).toBeDefined()
  })

  it('défaut : le lanceur se brûle', () => {
    const { effects } = discharge.resolve(flags(true, false, true), mage(-1), T)
    expect(find(effects, 'add-burn', 'M')).toBeDefined()
  })
})
