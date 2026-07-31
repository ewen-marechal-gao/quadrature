/**
 * L'ARME décide — portée, attaques ouvertes, gardes disponibles.
 *
 * C'est le lot qui retire la portée de l'action pour la mettre où elle est :
 * sur l'objet tenu. Trois choses doivent tenir ensemble, et chacune peut casser
 * séparément :
 *  1. la portée EFFECTIVE suit l'arme, et le coup porte réellement à cette
 *     distance sur le plateau (pas seulement dans une fonction pure) ;
 *  2. une arme n'ouvre que les attaques de sa famille — une lame courte ne fait
 *     pas de Frappe brutale ;
 *  3. les Gardes cessent d'être approximées par un rang de compétence.
 *
 * Et par-dessus : une fiche SANS inventaire ne doit rien voir changer. C'est la
 * condition qui rend la migration mesurable une fiche à la fois.
 */

import { resolveRoundBands, type Plan, type GuardProvider } from '../../src/combat/round'
import { loadAdversary } from '../../src/adversary/io'
import { initAdversary } from '../../src/adversary/combatant'
import type { Actor } from '../../src/adversary/actor'
import { ACTION_DEFS, actorReach, canUseAction, availableGuards } from '../../src/combat/actions'
import { initCombatant } from '../../src/combat/combatant'
import type { Position } from '../../src/combat/position'
import type { Inventory } from '../../src/equipment/inventory'
import { makeCharacter, makeCombatant } from '../helpers/fixtures'

const at = (x: number, y: number): Position => ({ x, y })
const alwaysDodge: GuardProvider = () => 'dodge'
const OUT_OF_REACH = /Hors d'atteinte/

/**
 * Combattant équipé. `skills` sert à lever les prérequis PROPRES aux actions
 * (le Tir rapide exige Intuition 1) : sans quoi on croirait tester la porte
 * d'arme alors qu'on teste celle de la compétence.
 */
const armed = (
  worn: Inventory['worn'],
  skills: Partial<Record<string, number>> = {},
) => {
  const base = makeCharacter({ name: 'PC', inventory: { worn } })
  return initCombatant({ ...base, skills: { ...base.skills, ...skills } as typeof base.skills })
}

// ─── 1. La portée suit l'arme ─────────────────────────────────────────────────

describe('portée effective', () => {
  it('la lance porte à 3 là où la dague porte à 1, pour la MÊME action', () => {
    const def = ACTION_DEFS['sharp-strike']
    expect(def.reach).toBe(1)   // le repli écrit sur l'action ne bouge pas

    expect(actorReach(armed({ hands: ['spear'] }), def).reach).toBe(3)
    expect(actorReach(armed({ hands: ['dagger'] }), def).reach).toBe(1)
    expect(actorReach(armed({ hands: ['pike'] }),  def).reach).toBe(4)
  })

  it('sans inventaire, la portée reste celle de l\'action', () => {
    const nu = makeCombatant('Nu')
    expect(actorReach(nu, ACTION_DEFS['sharp-strike']).reach).toBe(1)
    expect(actorReach(nu, ACTION_DEFS['quick-shot']).reach).toBe(24)
    expect(actorReach(nu, ACTION_DEFS['quick-shot']).minRange).toBe(1)
  })

  it('les actions qui ne passent par aucune arme gardent la leur', () => {
    // L'Attaque à mains nues et la Charge n'empruntent rien : c'est leur
    // définition pour l'une, l'élan du corps pour l'autre.
    expect(ACTION_DEFS['unarmed-attack'].attackKind).toBeUndefined()
    expect(ACTION_DEFS['charge'].attackKind).toBeUndefined()
    const piquier = armed({ hands: ['pike'] })
    expect(actorReach(piquier, ACTION_DEFS['unarmed-attack']).reach).toBe(1)
    expect(actorReach(piquier, ACTION_DEFS['charge']).reach).toBe(1)
  })
})

// ─── 2. Sur le plateau, pas seulement dans la fonction ────────────────────────

describe('le coup porte vraiment à la portée de l\'arme', () => {
  /** PC équipé à l'origine, Faucheur `gap` cases à sa droite. */
  async function facingOff(worn: Inventory['worn'], gap: number) {
    const pc  = { ...armed(worn), pos: at(0, 5) }
    const raw = initAdversary(await loadAdversary('faucheur'))
    const fau = { ...raw, pos: at(gap, 5) }
    return new Map<string, Actor>([['PC', pc], [fau.id, fau]])
  }
  const strike = (): Plan[] =>
    [{ actorId: 'PC', action: 'sharp-strike', targetId: 'faucheur', targetPart: 'sickles' }]
  const notes = (log: { phases: Array<{ actions: unknown[] }> }) =>
    (log.phases.flatMap(p => p.actions) as Array<{ notes: string[] }>)[0].notes

  it('une pique atteint une créature à 4 cases', async () => {
    const states = await facingOff({ hands: ['pike'] }, 4)
    const { log } = await resolveRoundBands(states, 1, alwaysDodge, [], strike)
    expect(notes(log).some(n => OUT_OF_REACH.test(n))).toBe(false)
  })

  it('une dague ne l\'atteint pas — même case, même action', async () => {
    const states = await facingOff({ hands: ['dagger'] }, 4)
    const { log } = await resolveRoundBands(states, 1, alwaysDodge, [], strike)
    expect(notes(log).some(n => OUT_OF_REACH.test(n))).toBe(true)
  })

  it('et la pique s\'arrête tout de même à 5 cases', async () => {
    const states = await facingOff({ hands: ['pike'] }, 5)
    const { log } = await resolveRoundBands(states, 1, alwaysDodge, [], strike)
    expect(notes(log).some(n => OUT_OF_REACH.test(n))).toBe(true)
  })
})

// ─── 3. L'arme ouvre — ou n'ouvre pas — l'attaque ─────────────────────────────

describe('attaques ouvertes par l\'armement', () => {
  it('une lame courte ne permet pas la Frappe brutale', () => {
    const dague = armed({ hands: ['dagger'] })
    expect(canUseAction(dague, 'sharp-strike')).toBe(true)
    expect(canUseAction(dague, 'armed-attack')).toBe(true)
    expect(canUseAction(dague, 'brutal-strike')).toBe(false)
  })

  it('le katar la permet — c\'est sa mécanique, et c\'est la seule', () => {
    expect(canUseAction(armed({ hands: ['katar'] }), 'brutal-strike')).toBe(true)
  })

  it('un arc ne frappe pas au corps à corps, et une épée ne tire pas', () => {
    const archer = armed({ hands: ['generic-bow'] }, { intuition: 1, observation: 1 })
    expect(canUseAction(archer, 'quick-shot')).toBe(true)
    expect(canUseAction(archer, 'armed-attack')).toBe(false)
    expect(canUseAction(archer, 'sharp-strike')).toBe(false)

    const epeiste = armed({ hands: ['long-sword'] }, { intuition: 1, observation: 1 })
    expect(canUseAction(epeiste, 'quick-shot')).toBe(false)
    expect(canUseAction(epeiste, 'aimed-shot')).toBe(false)
  })

  it('une arme au Dos sans harnais n\'ouvre rien', () => {
    // L'arc voyage décordé : il est transporté, pas jouable.
    const range = armed({ hands: ['long-sword'], back: ['generic-bow'] }, { intuition: 1 })
    expect(canUseAction(range, 'quick-shot')).toBe(false)
  })

  it('sans inventaire, aucune attaque n\'est interdite', () => {
    const base = makeCharacter({ name: 'Nu' })
    const nu = initCombatant({ ...base, skills: { ...base.skills, intuition: 1 } })
    for (const id of ['armed-attack', 'sharp-strike', 'brutal-strike', 'quick-shot'] as const)
      expect(canUseAction(nu, id)).toBe(true)
  })
})

// ─── 4. Les Gardes ne sont plus approximées ───────────────────────────────────

describe('conditions de Garde', () => {
  const ids = (s: ReturnType<typeof armed>) => availableGuards(s)

  it('on pare avec une arme, pas avec un arc', () => {
    expect(ids(armed({ hands: ['long-sword'] }))).toContain('parry')
    expect(ids(armed({ hands: ['generic-bow'] }))).not.toContain('parry')
  })

  it('on bloque avec un bouclier, et seulement avec un bouclier', () => {
    expect(ids(armed({ hands: ['long-sword'] }))).not.toContain('block')
    expect(ids(armed({ hands: ['long-sword', 'buckler'] }))).toContain('block')
  })

  it('Encaisser reste disponible quoi qu\'il arrive — c\'est le repli', () => {
    expect(ids(armed({ hands: [] }))).toContain('absorb')
    expect(ids(armed({ hands: ['generic-bow'] }))).toContain('absorb')
  })

  it('sans inventaire, le proxy de compétence d\'avant le chantier s\'applique', () => {
    // La fixture a Puissance 2 et Robustesse 2 : les deux proxys passent.
    const nu = makeCombatant('Nu')
    expect(availableGuards(nu)).toEqual(
      expect.arrayContaining(['absorb', 'parry', 'block']))
  })
})
