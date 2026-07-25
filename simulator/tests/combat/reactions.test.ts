/**
 * Déclencheurs ⚡ — le support des RÉACTIONS (§ defense_reactions.md).
 *
 * La question de design derrière : une réaction n'est PAS planifiée. Elle est
 * proposée quand l'événement survient, se résout AVANT que l'action déclenchante
 * ne se poursuive, et son coût borne son usage. On vérifie ici le contrat, pas
 * l'équilibrage.
 */
import { resolveRoundBands, type Plan, type GuardProvider } from '../../src/combat/round'
import type { ReactionSupport } from '../../src/combat/triggers'
import { eligibleReactions } from '../../src/combat/triggers'
import { type Actor } from '../../src/adversary/actor'
import type { Position } from '../../src/combat/position'
import type { Character } from '../../src/character/types'
import { makeCharacter, makeCombatant } from '../helpers/fixtures'

const at = (x: number, y: number): Position => ({ x, y })
const alwaysDodge: GuardProvider = () => 'dodge'
const board = { width: 20, height: 11 }

/** Le marcheur (MOVER) s'en va ; le garde (WATCHER) le guette, adjacent. */
async function facing(gap: number, reactions = 1): Promise<Map<string, Actor>> {
  const mover: Actor = { ...makeCombatant('MOVER'), pos: at(5, 5) }
  const watcher: Actor = {
    ...makeCombatant('WATCHER'), pos: at(5 + gap, 5), reactions, maxReactions: reactions,
  }
  return new Map<string, Actor>([['MOVER', mover], ['WATCHER', watcher]])
}

/** Le MOVER traverse ; c'est ce Déplacement qui doit ouvrir la fenêtre. */
const moverWalks = (): Plan[] => [{ actorId: 'MOVER', action: 'walk', targetId: 'WATCHER' }]

/** Support de réaction : factions opposées, trousse réduite à la seule réaction. */
const support = (choose: ReactionSupport['choose']): ReactionSupport => ({
  isEnemy: (a, b) => a !== b,
  kitOf:   () => ['opportunity-strike'],
  choose,
})
const alwaysReact: ReactionSupport['choose'] = (_e, options) => options[0] ?? null
const neverReact:  ReactionSupport['choose'] = () => null

describe('eligibleReactions', () => {
  it('propose la Frappe opportuniste au voisin qui a des ⚡', async () => {
    const states = await facing(1)
    const options = eligibleReactions(
      { kind: 'movement-initiated', actorId: 'MOVER' }, states, support(alwaysReact))
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ reactorId: 'WATCHER', action: 'opportunity-strike', targetId: 'MOVER' })
  })

  it('ne propose rien hors de portée (le déclencheur est « adjacent »)', async () => {
    const states = await facing(4)
    expect(eligibleReactions(
      { kind: 'movement-initiated', actorId: 'MOVER' }, states, support(alwaysReact))).toHaveLength(0)
  })

  it('ne propose rien sans ⚡ — le coût est la borne du PJ', async () => {
    const states = await facing(1, 0)
    expect(eligibleReactions(
      { kind: 'movement-initiated', actorId: 'MOVER' }, states, support(alwaysReact))).toHaveLength(0)
  })

  it('ne propose rien à un allié (on ne frappe pas les siens)', async () => {
    const states = await facing(1)
    const allies: ReactionSupport = { ...support(alwaysReact), isEnemy: () => false }
    expect(eligibleReactions(
      { kind: 'movement-initiated', actorId: 'MOVER' }, states, allies)).toHaveLength(0)
  })

  it('ignore un déclencheur d\'une autre famille', async () => {
    const states = await facing(1)
    expect(eligibleReactions(
      { kind: 'heavy-wound-taken', actorId: 'MOVER' }, states, support(alwaysReact))).toHaveLength(0)
  })
})

describe('résolution d\'une réaction pendant une bande', () => {
  it('la réaction se résout AVANT le déplacement qui l\'a déclenchée', async () => {
    const states = await facing(1)
    const { log } = await resolveRoundBands(
      states, 1, alwaysDodge, [], moverWalks, undefined, board, support(alwaysReact))

    const actions = log.phases.flatMap(p => p.actions)
    const strike  = actions.findIndex(a => a.action === 'opportunity-strike')
    const walk    = actions.findIndex(a => a.action === 'walk')
    expect(strike).toBeGreaterThanOrEqual(0)
    expect(walk).toBeGreaterThanOrEqual(0)
    expect(strike).toBeLessThan(walk)                       // d'abord la réaction
    expect(actions[strike].reaction).toMatchObject({
      trigger: 'movement-initiated', interrupted: 'walk',
    })
  })

  it('sans support de réaction, rien ne change (compat descendante)', async () => {
    const states = await facing(1)
    const { log } = await resolveRoundBands(
      states, 1, alwaysDodge, [], moverWalks, undefined, board)
    expect(log.phases.flatMap(p => p.actions).every(a => a.reaction === undefined)).toBe(true)
  })

  it('le provider peut refuser : aucune réaction jouée', async () => {
    const states = await facing(1)
    const { log } = await resolveRoundBands(
      states, 1, alwaysDodge, [], moverWalks, undefined, board, support(neverReact))
    expect(log.phases.flatMap(p => p.actions).some(a => a.action === 'opportunity-strike')).toBe(false)
  })

  it('la réaction dépense le ⚡ du réacteur', async () => {
    const states = await facing(1)
    const { states: after } = await resolveRoundBands(
      states, 1, alwaysDodge, [], moverWalks, undefined, board, support(alwaysReact))
    const watcher = after.get('WATCHER') as Extract<Actor, { reactions: number }>
    expect(watcher.reactions).toBe(0)
  })

  it('PROFONDEUR 1 : une seule réaction, la réaction n\'en déclenche pas d\'autre', async () => {
    const states = await facing(1)
    const { log } = await resolveRoundBands(
      states, 1, alwaysDodge, [], moverWalks, undefined, board, support(alwaysReact))
    const strikes = log.phases.flatMap(p => p.actions).filter(a => a.action === 'opportunity-strike')
    expect(strikes).toHaveLength(1)
  })
})

// ─── Réactions ouvertes par un TRAIT ⚒️ (§ traits.md — modes réactifs) ─────────
//
// Même machinerie, mais la réaction ne vient plus d'une action à déclencheur
// natif : c'est une action ORDINAIRE de la trousse qu'un trait rend jouable en
// réaction. Ce que ça doit prouver : l'option est bien proposée, et c'est le
// coût de la VARIANTE qui est débité — pas celui de l'action normale.

describe('modes réactifs conférés par un trait', () => {
  const OPPORTUNIST = { traits: ['opportunisme'], skills: { ...makeCharacter().skills, precision: 3 } }

  /** Le guetteur porte Opportunisme ; sa trousse ne contient QUE la Frappe vive. */
  async function facingWithTrait(gap: number, over: Partial<Character> = OPPORTUNIST) {
    const mover: Actor = { ...makeCombatant('MOVER'), pos: at(5, 5) }
    const watcher: Actor = { ...makeCombatant('WATCHER', over), pos: at(5 + gap, 5) }
    const states = new Map<string, Actor>([['MOVER', mover], ['WATCHER', watcher]])
    const kit: ReactionSupport = {
      isEnemy: (a, b) => a !== b,
      kitOf:   () => ['sharp-strike'],
      choose:  alwaysReact,
    }
    return { states, kit, watcher }
  }

  it('propose la Frappe vive en réaction au porteur du trait', async () => {
    const { states, kit } = await facingWithTrait(1)
    const [option, ...rest] = eligibleReactions(
      { kind: 'movement-initiated', actorId: 'MOVER' }, states, kit)
    expect(rest).toHaveLength(0)
    expect(option).toMatchObject({ reactorId: 'WATCHER', action: 'sharp-strike' })
    // L'option porte la def RÉACTIVE : c'est elle qui sera facturée.
    expect(option.def?.cost).toMatchObject({ actions: 0, reactions: 1, fatigue: 1 })
  })

  it('ne propose rien au même personnage sans le trait', async () => {
    const { states, kit } = await facingWithTrait(1, {})
    expect(eligibleReactions(
      { kind: 'movement-initiated', actorId: 'MOVER' }, states, kit)).toHaveLength(0)
  })

  it('se résout AVANT le déplacement, comme un déclencheur natif', async () => {
    const { states, kit } = await facingWithTrait(1)
    const { log } = await resolveRoundBands(
      states, 1, alwaysDodge, [], moverWalks, undefined, board, kit)
    const actions = log.phases.flatMap(p => p.actions)
    const strike  = actions.findIndex(a => a.action === 'sharp-strike')
    expect(strike).toBeGreaterThanOrEqual(0)
    expect(strike).toBeLessThan(actions.findIndex(a => a.action === 'walk'))
    expect(actions[strike].reaction).toMatchObject({ trigger: 'movement-initiated' })
  })

  it('débite le coût de la VARIANTE : 1⚡ et aucun ⚫ (la Frappe vive coûte 1⚫ en action)', async () => {
    const { states, kit } = await facingWithTrait(1)
    const before = states.get('WATCHER') as Extract<Actor, { reactions: number }>
    const { states: after } = await resolveRoundBands(
      states, 1, alwaysDodge, [], moverWalks, undefined, board, kit)
    const watcher = after.get('WATCHER') as Extract<Actor, { actions: number; reactions: number }>
    expect(watcher.reactions).toBe(before.reactions - 1)
    expect(watcher.actions).toBe(before.actions)          // aucun PA consommé
  })

  it('respecte les conditions d\'emploi de l\'action (prérequis de compétence)', async () => {
    // Précision 0 : la Frappe vive est hors de portée du personnage… mais un
    // rang 3 est requis pour porter le trait. On teste donc le garde-fou moteur.
    const { states, kit } = await facingWithTrait(1)
    const watcher = states.get('WATCHER') as Extract<Actor, { skills: Record<string, number> }>
    states.set('WATCHER', { ...watcher, skills: { ...watcher.skills, precision: 0 } } as Actor)
    expect(eligibleReactions(
      { kind: 'movement-initiated', actorId: 'MOVER' }, states, kit)).toHaveLength(0)
  })

  it('gâte la portée MINIMALE : un arc ne tire pas au contact, même en réaction', async () => {
    const INSTINCT = { traits: ['tir-dinstinct'], skills: { ...makeCharacter().skills, intuition: 3 } }
    const shooter = (gap: number) => {
      const mover: Actor = { ...makeCombatant('MOVER'), pos: at(5, 5) }
      const watcher: Actor = { ...makeCombatant('WATCHER', INSTINCT), pos: at(5 + gap, 5) }
      return new Map<string, Actor>([['MOVER', mover], ['WATCHER', watcher]])
    }
    const kit: ReactionSupport = {
      isEnemy: (a, b) => a !== b, kitOf: () => ['quick-shot'], choose: alwaysReact,
    }
    const at1 = eligibleReactions({ kind: 'movement-initiated', actorId: 'MOVER' }, shooter(1), kit)
    const at6 = eligibleReactions({ kind: 'movement-initiated', actorId: 'MOVER' }, shooter(6), kit)
    expect(at1).toHaveLength(0)          // engagé : pas de tir (minRange 1)
    expect(at6).toHaveLength(1)          // à distance : le tir part
  })
})
