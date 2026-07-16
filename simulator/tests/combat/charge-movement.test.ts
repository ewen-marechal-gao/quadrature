/**
 * End-to-end: a Charge actually crosses the ground.
 *
 * « Charge : Déplacement [6] puis inflige 💢💢 » — the card grants a BUDGET, and
 * the whole chain has to turn it into a path: card op → move-toward intent →
 * expansion against the live board → the creature's `pos` moves.
 *
 * This also pins the op's direction. `{move: 6}` sits in the card's effect list
 * next to `{wound: 2}`, but the two do not point the same way: the wound lands
 * on the victim, the movement is the CHARGER's. Getting that backwards would
 * teleport the target into its attacker.
 */
import { resolveRoundBands, type Plan, type GuardProvider } from '../../src/combat/round'
import { loadAdversary } from '../../src/adversary/io'
import { initAdversary } from '../../src/adversary/combatant'
import { type Actor } from '../../src/adversary/actor'
import { distance, DEFAULT_BOARD, type Position } from '../../src/combat/position'
import { makeCombatant } from '../helpers/fixtures'

const at = (x: number, y: number): Position => ({ x, y })
const alwaysDodge: GuardProvider = () => 'dodge'

/** PC and Faucheur facing off across the mat, `gap` cases apart. */
async function facingOff(gap: number): Promise<Map<string, Actor>> {
  const pc  = { ...makeCombatant('PC'), pos: at(0, 5) }
  const fau = { ...initAdversary(await loadAdversary('faucheur')), pos: at(gap, 5) }
  return new Map<string, Actor>([['PC', pc], [fau.id, fau]])
}

const charge = (): Plan[] => [{ actorId: 'faucheur', card: 'charge', targetId: 'PC' }]

describe('Charge — the creature closes the ground', () => {
  it('closes the ground it can — a missed Charge still covers 4 cases', async () => {
    const states = await facingOff(8)
    const { states: after } = await resolveRoundBands(states, 1, alwaysDodge, [], charge)

    const fau = after.get('faucheur')!
    const pc  = after.get('PC')!
    // Le jet décide du budget, pas de l'aboutissement : Déplacement [6] en
    // succès, [4] en échec. Depuis 8 cases, il reste donc 2 ou 4 cases d'écart —
    // les deux sont justes, et figer l'une des deux rendrait le test instable.
    expect([2, 4]).toContain(distance(fau.pos!, pc.pos!))
    expect(fau.pos).not.toEqual(at(8, 5))     // dans les deux cas, il a couru
  })

  it('the CHARGER moves, never its victim', async () => {
    const states = await facingOff(8)
    const { states: after } = await resolveRoundBands(states, 1, alwaysDodge, [], charge)

    // Le PJ n'a pas bougé d'un pouce : c'est le Faucheur qui a couru.
    expect(after.get('PC')!.pos).toEqual(at(0, 5))
  })

  it('stops next to its target rather than on it', async () => {
    const states = await facingOff(4)
    const { states: after } = await resolveRoundBands(states, 1, alwaysDodge, [], charge)

    const fau = after.get('faucheur')!
    expect(distance(fau.pos!, at(0, 5))).toBe(1)
    expect(fau.pos).not.toEqual(at(0, 5))
  })

  it('logs the path walked, not the intent declared', async () => {
    const states = await facingOff(8)
    const { log } = await resolveRoundBands(states, 1, alwaysDodge, [], charge)

    const effects = log.phases.flatMap(p => p.actions).flatMap(a => a.effects)
    expect(effects.some(e => e.kind === 'move-toward')).toBe(false)
    const move = effects.find(e => e.kind === 'move')!
    expect(move).toMatchObject({ targetId: 'faucheur' })
    expect((move as Extract<typeof move, { kind: 'move' }>).path.length).toBeGreaterThan(0)
  })

  it('a positionless encounter resolves exactly as before — nothing moves', async () => {
    const pc  = makeCombatant('PC')
    const fau = initAdversary(await loadAdversary('faucheur'))
    const states = new Map<string, Actor>([['PC', pc], [fau.id, fau]])

    const { states: after, log } = await resolveRoundBands(states, 1, alwaysDodge, [], charge)

    expect(after.get('faucheur')!.pos).toBeUndefined()
    expect(after.get('PC')!.pos).toBeUndefined()
    // La carte se résout normalement : seul le déplacement est sans objet.
    expect(log.phases.flatMap(p => p.actions)).toHaveLength(1)
  })

  it('honours a board smaller than the default mat', async () => {
    const pc  = { ...makeCombatant('PC'), pos: at(0, 0) }
    const fau = { ...initAdversary(await loadAdversary('faucheur')), pos: at(5, 0) }
    const states = new Map<string, Actor>([['PC', pc], [fau.id, fau]])

    const { states: after } = await resolveRoundBands(
      states, 1, alwaysDodge, [], charge, undefined, { width: 6, height: 1 },
    )
    // Couloir d'une case de haut : le chemin reste dans les bornes données.
    const pos = after.get('faucheur')!.pos!
    expect(pos.y).toBe(0)
    expect(pos.x).toBeLessThan(6)
    expect(DEFAULT_BOARD.height).toBe(22)   // le défaut n'a pas été utilisé ici
  })
})
