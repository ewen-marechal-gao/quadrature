/**
 * Phase C — propagation des ressources ▶️ onPlay dans l'état de planification.
 *
 * `projectOnPlaySelf` replie dans l'état du LANCEUR les ops SELF d'un tier onPlay
 * (⊖ auto-chargée, dissipation, Inertie…) et écarte les ops ciblant l'adversaire.
 * C'est ce qui rend visibles au DFS les combos multi-bandes de l'Électromancie :
 * une action de bande I génère une charge que le pricing d'une bande III verra
 * (le pricing lui-même = Phase D).
 */
import { projectOnPlaySelf } from '../../src/planner/planner'
import { makeCombatant } from '../helpers/fixtures'

const mage = () => makeCombatant('M', { disciplines: { electromancy: 3 } })

describe('projectOnPlaySelf — ressources garanties du tier onPlay', () => {
  it('sans onPlay : état inchangé', () => {
    const s0 = mage()
    expect(projectOnPlaySelf(s0, undefined)).toBe(s0)
    expect(projectOnPlaySelf(s0, { effect: [] }).charge).toBe(0)
  })

  it('une ⊖ auto-chargée (selfCharge) atterrit sur le lanceur', () => {
    const s = projectOnPlaySelf(mage(), { effect: [{ selfCharge: -2 }] })
    expect(s.charge).toBe(-2)
    expect(s.burn).toBe(0)          // dans le cap (rang 3)
  })

  it('l\'auto-charge ⊖ au-delà du cap propage aussi la brûlure 🔥', () => {
    const s = projectOnPlaySelf(makeCombatant('P'), { effect: [{ selfCharge: -1 }] })
    expect(s.charge).toBe(0)        // cap 0 (non-mage)
    expect(s.burn).toBe(1)
  })

  it('les ops ciblant l\'adversaire (charge) sont écartées de l\'état du lanceur', () => {
    const s = projectOnPlaySelf(mage(), { effect: [{ charge: -3 }] })
    expect(s.charge).toBe(0)        // `charge` vise la CIBLE, pas le lanceur
  })

  it('effets combinés : self appliqué, cible ignorée, dans l\'ordre', () => {
    const s = projectOnPlaySelf(mage(), {
      effect: [{ selfCharge: -1 }, { charge: 5 }, { setInertia: 3 }],
    })
    expect(s.charge).toBe(-1)       // seul le selfCharge
    expect(s.inertia).toBe(3)       // setInertia est SELF
  })
})
