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
import { makeCombatant } from '../helpers/fixtures'

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
