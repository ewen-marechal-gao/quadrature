/**
 * Combustion 🔥 (§ combustion) — l'état s'aggrave au début de chaque manche :
 * propagation (+1 si ≥ 1 marqueur), puis chaque lot de 5 inflige 1 blessure grave
 * 💔 automatique (perce la Protection / l'armure) et un décalage 🔻. Symétrique
 * PJ ↔ adversaire ; les marqueurs ne sont pas consommés.
 */
import { resetRoundTokens, processCombustion } from '../../src/combat/combatant'
import { initAdversary, combustionTick, isBlockDestroyed } from '../../src/adversary/combatant'
import { loadAdversary } from '../../src/adversary/io'
import { makeCombatant } from '../helpers/fixtures'
import { MENTAL_STATES } from '../../src/combat/types'

describe('combustion 🔥 — personnage', () => {
  it('sans marqueur : aucun effet', () => {
    expect(processCombustion(makeCombatant('A')).state.burn).toBe(0)
  })

  it('propagation : ≥ 1 marqueur gagne +1, sans blessure sous le seuil', () => {
    const { state } = processCombustion({ ...makeCombatant('A'), burn: 3 })
    expect(state.burn).toBe(4)
    expect(state.heavyWounds).toBe(0)
  })

  it('seuil : 5 marqueurs → 1💔 + 🔻', () => {
    const base = makeCombatant('A')                       // démarre Concentré
    const { state } = processCombustion({ ...base, burn: 4, stability: 0 })
    expect(state.burn).toBe(5)
    expect(state.heavyWounds).toBe(1)
    expect(MENTAL_STATES.indexOf(state.mentalState))
      .toBe(MENTAL_STATES.indexOf(base.mentalState) + 1)   // 🔻 = un cran vers la Terreur
  })

  it('deux lots : 10 marqueurs → 2💔', () => {
    const { state } = processCombustion({ ...makeCombatant('A'), burn: 9, stability: 0 })
    expect(state.burn).toBe(10)
    expect(state.heavyWounds).toBe(2)
  })

  it('la 💔 automatique perce la Protection 🛡️', () => {
    const { state } = processCombustion({ ...makeCombatant('A', { protection: 2 }), burn: 4, stability: 0 })
    expect(state.protection).toBe(2)                       // non consommée (contournée)
    expect(state.heavyWounds).toBe(1)
  })

  it('le 🔻 est d\'abord absorbé par un ◇', () => {
    const base = makeCombatant('A')
    const { state } = processCombustion({ ...base, burn: 4, stability: 2 })
    expect(state.stability).toBe(1)                        // un ◇ consommé
    expect(state.mentalState).toBe(base.mentalState)       // piste inchangée
  })

  it('est câblée dans le reset de début de manche', () => {
    expect(resetRoundTokens({ ...makeCombatant('A'), burn: 1 }).burn).toBe(2)
  })
})

describe('combustion 🔥 — adversaire', () => {
  const countIntact = (c: { parts: any[]; weapons: any[] }) =>
    [...c.parts, ...c.weapons].flatMap(p => p.blocks).filter((b: any) => !isBlockDestroyed(b)).length

  it('sans marqueur : aucun effet', async () => {
    const c = initAdversary(await loadAdversary('faucheur'))
    expect(combustionTick(c).burn).toBe(0)
  })

  it('propagation + 💔 automatique (un bloc détruit) au seuil', async () => {
    const c0 = initAdversary(await loadAdversary('faucheur'))
    const before = countIntact(c0)
    const c = combustionTick({ ...c0, burn: 4 })
    expect(c.burn).toBe(5)
    expect(countIntact(c)).toBe(before - 1)
  })
})
