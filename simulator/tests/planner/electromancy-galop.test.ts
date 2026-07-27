/**
 * Galop d'essai de l'Électromancie (Phase E) — valide la chaîne B→C→D de bout en
 * bout sur des cartes RÉELLES (data/disciplines/electromancy.yaml) :
 *
 *   · onPlay (B)       — spark auto-charge une ⊖ à coup sûr ;
 *   · propagation (C)  — le planificateur porte cette ⊖ d'une bande à l'autre ;
 *   · pricing/gate (D) — la ⊖ ne vaut son potentiel que si un exutoire (discharge)
 *                        est dans le kit ; sinon elle est inerte.
 *
 * Cible du test : le planificateur, seul avec le kit électromantique, SÉQUENCE la
 * charge (bande I) puis la décharge (bande III) dans une même manche.
 */
import {
  planRoundUtility, scorePlayerAction, hasChargeSinkFor, type PlannerConfig,
} from '../../src/planner/planner'
import { PERSONA_WEIGHTS, type ScoreContext } from '../../src/planner/value'
import { ACTION_DEFS } from '../../src/combat/actions'
import { makeCombatant } from '../helpers/fixtures'

/** Mage : rang d'Électromancie (débloque les cartes) + un jet correct (proxy Volonté+Discipline). */
const mage = () => {
  const s = makeCombatant('M', { disciplines: { electromancy: 3 } })
  s.skills.discipline = 3
  return s
}
const foe = () => makeCombatant('E')

const cfg = (allowedActions?: PlannerConfig['allowedActions']): PlannerConfig =>
  ({ persona: 'aggressive', targetId: 'E', ...(allowedActions && { allowedActions }) })

describe('cartes d\'Électromancie chargées dans ACTION_DEFS', () => {
  it('spark & discharge existent et sont tagguées de leur discipline', () => {
    expect(ACTION_DEFS.spark?.discipline).toBe('electromancy')
    expect(ACTION_DEFS.discharge?.discipline).toBe('electromancy')
    expect(ACTION_DEFS.spark.outcomes?.onPlay).toBeDefined()   // socle B présent
  })
})

describe('gate hasChargeSink — un exutoire dans le kit', () => {
  it('faux sans décharge, vrai avec', () => {
    expect(hasChargeSinkFor(cfg(['spark']))).toBe(false)
    expect(hasChargeSinkFor(cfg(['spark', 'discharge']))).toBe(true)
  })
})

describe('pricing D en contexte — la ⊖ de spark ne vaut que gatée', () => {
  // Le payoff est mémoïsé par ref d'acteur (payoffCache) — sans lien avec
  // hasChargeSink, stable au sein d'une manche mais pas entre deux ctx. On force
  // le recalcul avec des instances DISTINCTES (m1/e1 vs m2/e2).
  const ctx = (m: ReturnType<typeof mage>, e: ReturnType<typeof foe>, hasChargeSink: boolean): ScoreContext => ({
    selfId:  'M',
    isEnemy: id => id === 'E',
    getActor: id => (id === 'M' ? m : id === 'E' ? e : undefined),
    weights: PERSONA_WEIGHTS.aggressive,
    pushDirections: { rage: true, terror: true },
    hasChargeSink,
  })

  it('spark score PLUS haut quand une décharge existe (charge valorisée)', () => {
    const m1 = mage(), e1 = foe()
    const m2 = mage(), e2 = foe()
    const withSink = scorePlayerAction('spark', m1, e1, ctx(m1, e1, true))
    const without  = scorePlayerAction('spark', m2, e2, ctx(m2, e2, false))
    expect(withSink).toBeGreaterThan(without)
  })
})

describe('séquencement — charger en bande I, décharger en bande III', () => {
  it('le plan de manche enchaîne spark puis discharge', () => {
    const plan = planRoundUtility(mage(), foe(), cfg(['spark', 'discharge']))
    const ids = plan.map(p => p.action)
    expect(ids).toContain('spark')
    expect(ids).toContain('discharge')
    // spark (init 2, bande I) est planifié AVANT discharge (init 7, bande III).
    expect(ids.indexOf('spark')).toBeLessThan(ids.indexOf('discharge'))
  })
})
