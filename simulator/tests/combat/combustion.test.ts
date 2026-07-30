/**
 * Combustion 🔥 / Embrasement ❤️‍🔥 (§ combustion).
 *
 * Deux marqueurs, deux temps :
 *  · les brûlures 🔥 s'accumulent ; à 5 elles sont CONSOMMÉES et deviennent un
 *    embrasement ❤️‍🔥, qui coûte 1💔 perçant l'armure + 🔻 — au moment de la POSE,
 *    pas en fin de manche ;
 *  · chaque ❤️‍🔥 rallume 1🔥 à la FIN de chaque manche, ce qui peut en déclencher
 *    un nouveau : c'est là toute l'accélération de l'incendie.
 *
 * Sans ❤️‍🔥, quelques 🔥 isolées stagnent et ne font jamais rien — le danger n'est
 * pas de brûler, il est d'atteindre le seuil. Symétrique PJ ↔ adversaire.
 */
import {
  addBurn, removeBurn, removeBlaze, rekindleBlaze, processRoundEnd, resetRoundTokens,
  applyEffectToState, BLAZE_THRESHOLD,
} from '../../src/combat/combatant'
import { ACTION_RESOLVERS } from '../../src/combat/action-resolvers'
import type { CombatEffect } from '../../src/combat/types'
import {
  initAdversary, addAdversaryBurn, rekindleAdversaryBlaze, isBlockDestroyed,
} from '../../src/adversary/combatant'
import { loadAdversary } from '../../src/adversary/io'
import { makeCombatant } from '../helpers/fixtures'
import { MENTAL_STATES } from '../../src/combat/types'

describe('combustion 🔥 — personnage', () => {
  it('sous le seuil : les brûlures s\'empilent sans rien faire', () => {
    const s = addBurn(makeCombatant('A'), 4)
    expect(s.burn).toBe(4)
    expect(s.blaze).toBe(0)
    expect(s.heavyWounds).toBe(0)
  })

  it('au seuil : les 5🔥 sont consommées et deviennent un ❤️‍🔥 (1💔 + 🔻)', () => {
    const base = makeCombatant('A')                        // démarre Concentré
    const s = addBurn({ ...base, burn: 4, stability: 0 }, 1)
    expect(s.burn).toBe(0)                                 // le lot est CONSOMMÉ
    expect(s.blaze).toBe(1)
    expect(s.heavyWounds).toBe(1)
    expect(MENTAL_STATES.indexOf(s.mentalState))
      .toBe(MENTAL_STATES.indexOf(base.mentalState) + 1)   // 🔻 = un cran vers la Terreur
  })

  it('une salve peut franchir plusieurs seuils, et l\'excédent repart', () => {
    const s = addBurn({ ...makeCombatant('A'), stability: 0 }, 12)
    expect(s.blaze).toBe(2)
    expect(s.burn).toBe(2)                                 // 12 − 2×5, rien de perdu
    expect(s.heavyWounds).toBe(2)
  })

  it('la 💔 de l\'embrasement perce la Protection 🛡️', () => {
    const s = addBurn({ ...makeCombatant('A', { protection: 2 }), burn: 4, stability: 0 }, 1)
    expect(s.protection).toBe(2)                           // non consommée (contournée)
    expect(s.heavyWounds).toBe(1)
  })

  it('le 🔻 est d\'abord absorbé par un ◇', () => {
    const base = makeCombatant('A')
    const s = addBurn({ ...base, burn: 4, stability: 2 }, 1)
    expect(s.stability).toBe(1)                            // un ◇ consommé
    expect(s.mentalState).toBe(base.mentalState)           // piste inchangée
  })

  describe('rallumage ❤️‍🔥', () => {
    it('sans embrasement : rien ne progresse, même avec des 🔥 en réserve', () => {
      const { state } = rekindleBlaze({ ...makeCombatant('A'), burn: 4, blaze: 0 })
      expect(state.burn).toBe(4)
      expect(state.blaze).toBe(0)
    })

    it('ajoute 1🔥 par embrasement', () => {
      const { state } = rekindleBlaze({ ...makeCombatant('A'), burn: 0, blaze: 3 })
      expect(state.burn).toBe(3)
      expect(state.blaze).toBe(3)
    })

    it('peut lui-même déclencher un embrasement (l\'accélération)', () => {
      const { state } = rekindleBlaze({ ...makeCombatant('A'), burn: 3, blaze: 2, stability: 0 })
      expect(state.blaze).toBe(3)                          // 3 + 2 = 5 → nouveau ❤️‍🔥
      expect(state.burn).toBe(0)
      expect(state.heavyWounds).toBe(1)
    })

    it('est câblé en FIN de manche, pas au début', () => {
      const before = { ...makeCombatant('A'), burn: 0, blaze: 2, stability: 0 }
      expect(resetRoundTokens(before).burn).toBe(0)        // le début de manche n'y touche pas
      expect(processRoundEnd(before).burn).toBe(2)
    })
  })

  describe('extinction', () => {
    it('retire des brûlures sans jamais passer sous zéro', () => {
      expect(removeBurn({ ...makeCombatant('A'), burn: 3 }, 1).burn).toBe(2)
      expect(removeBurn({ ...makeCombatant('A'), burn: 1 }, 5).burn).toBe(0)
    })

    it('retire un embrasement sans rendre la 💔 déjà encaissée', () => {
      const s = removeBlaze({ ...makeCombatant('A'), blaze: 2, heavyWounds: 2 }, 1)
      expect(s.blaze).toBe(1)
      expect(s.heavyWounds).toBe(2)                        // le feu s'éteint, la plaie reste
    })
  })

  it('le seuil est de 5', () => {
    expect(BLAZE_THRESHOLD).toBe(5)
  })
})

/**
 * Éteindre les flammes (§ universal_actions.md) — l'unique parade des PJ.
 * Deux modes sur un seul jet : préventif tant qu'aucun ❤️‍🔥 n'est déclaré (DD 8),
 * curatif ensuite (DD +2 par embrasement). L'échec ne retire qu'UNE brûlure : il
 * temporise sans annuler — c'est là que vit la tension de la carte.
 */
describe('Éteindre les flammes', () => {
  const R = ACTION_RESOLVERS.extinguish
  const flags = (hit: boolean, critical = false) => ({ hit, critical, flaw: false })
  const amountOf = (fx: CombatEffect[], kind: CombatEffect['kind']) =>
    (fx.find(e => e.kind === kind) as { amount: number } | undefined)?.amount

  it('DD = 8 + 2 par embrasement — le feu qui a pris est plus dur à maîtriser', () => {
    expect(R.getDC({ ...makeCombatant('A'), blaze: 0 })).toBe(8)
    expect(R.getDC({ ...makeCombatant('A'), blaze: 1 })).toBe(10)
    expect(R.getDC({ ...makeCombatant('A'), blaze: 3 })).toBe(14)
  })

  it('réussite : vide la pile ET maîtrise un embrasement', () => {
    const actor = { ...makeCombatant('A'), burn: 4, blaze: 2 }
    const { effects } = R.resolve(flags(true), actor)
    expect(amountOf(effects, 'remove-burn')).toBe(4)
    expect(amountOf(effects, 'remove-blaze')).toBe(1)
  })

  it('échec : 1🔥 seulement — assez pour temporiser, pas pour annuler', () => {
    const actor = { ...makeCombatant('A'), burn: 4, blaze: 2 }
    const { effects } = R.resolve(flags(false), actor)
    expect(amountOf(effects, 'remove-burn')).toBe(1)
    expect(amountOf(effects, 'remove-blaze')).toBeUndefined()   // l'embrasement tient
  })

  it('n\'émet rien à retirer quand il n\'y a rien qui brûle', () => {
    const actor = { ...makeCombatant('A'), burn: 0, blaze: 0 }
    expect(R.resolve(flags(false), actor).effects).toEqual([])
    expect(R.resolve(flags(true), actor).effects).toEqual([])
  })

  it('critique : un ◇ en prime', () => {
    const { effects } = R.resolve(flags(true, true), { ...makeCombatant('A'), burn: 2 })
    expect(effects.some(e => e.kind === 'add-stability')).toBe(true)
  })

  it('bout en bout : une réussite ramène sous le seuil, un échec laisse le feu prendre', () => {
    const burning = { ...makeCombatant('A'), burn: 4, blaze: 0, stability: 0 }

    // Réussite → pile vidée : les 2🔥 de la prochaine Étincelle ne suffisent plus.
    let saved = burning
    for (const fx of R.resolve(flags(true), burning).effects) saved = applyEffectToState(saved, fx)
    expect(addBurn(saved, 2).blaze).toBe(0)

    // Échec → il reste 3🔥 : la même Étincelle fait basculer.
    let held = burning
    for (const fx of R.resolve(flags(false), burning).effects) held = applyEffectToState(held, fx)
    expect(addBurn(held, 2).blaze).toBe(1)
  })
})

describe('combustion 🔥 — adversaire (miroir)', () => {
  const countIntact = (c: { parts: any[]; weapons: any[] }) =>
    [...c.parts, ...c.weapons].flatMap(p => p.blocks).filter((b: any) => !isBlockDestroyed(b)).length

  it('sous le seuil : aucun bloc détruit', async () => {
    const c0 = initAdversary(await loadAdversary('faucheur'))
    const c = addAdversaryBurn(c0, 4)
    expect(c.burn).toBe(4)
    expect(c.blaze).toBe(0)
    expect(countIntact(c)).toBe(countIntact(c0))
  })

  it('au seuil : le lot est consommé et un bloc tombe', async () => {
    const c0 = initAdversary(await loadAdversary('faucheur'))
    const before = countIntact(c0)
    const c = addAdversaryBurn({ ...c0, burn: 4 }, 1)
    expect(c.burn).toBe(0)
    expect(c.blaze).toBe(1)
    expect(countIntact(c)).toBe(before - 1)
  })

  it('le rallumage suit la même boucle que côté PJ', async () => {
    const c0 = initAdversary(await loadAdversary('faucheur'))
    const before = countIntact(c0)
    const c = rekindleAdversaryBlaze({ ...c0, burn: 3, blaze: 2 })
    expect(c.blaze).toBe(3)                                // 3 + 2 = 5 → nouvel embrasement
    expect(countIntact(c)).toBe(before - 1)
  })
})
