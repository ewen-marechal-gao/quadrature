/**
 * Position on the unified Actor seam: a PC and a creature carry the same `pos`
 * field, and the `move` effect writes it through the same path for both.
 *
 * The load-bearing property here is the OPT-IN: every encounter that predates
 * positions has no `pos`, and must keep resolving exactly as before. A move
 * effect on a positionless actor is a no-op, never an invented (0,0).
 */
import { applyEffectToActor, applyEffectsToActors, actorSpeed, actorPos, type Actor } from '../../src/adversary/actor'
import { loadAdversary } from '../../src/adversary/io'
import { initAdversary } from '../../src/adversary/combatant'
import { PC_SPEED, type Position } from '../../src/combat/position'
import { makeCombatant } from '../helpers/fixtures'

const at = (x: number, y: number): Position => ({ x, y })

describe('actorPos / actorSpeed', () => {
  it('a PC walks 3 and runs 6 (§ Marche / Course)', () => {
    expect(actorSpeed(makeCombatant('PC'))).toEqual({ walk: 3, run: 6 })
    expect(PC_SPEED).toEqual({ walk: 3, run: 6 })
  })

  it('a creature takes its speeds from its fiche, not from the PC constant', async () => {
    const fau = initAdversary(await loadAdversary('faucheur'))
    const speed = actorSpeed(fau)
    expect(speed).toEqual(fau.sheet.speed)
    expect(speed.run).toBeGreaterThan(speed.walk)
  })

  it('reports no square in a positionless encounter — it does not invent one', () => {
    expect(actorPos(makeCombatant('PC'))).toBeUndefined()
  })
})

describe('move effect', () => {
  it('lands a PC on the last square of the path', () => {
    const pc: Actor = { ...makeCombatant('PC'), pos: at(2, 2) }
    const moved = applyEffectToActor(pc, { targetId: 'PC', kind: 'move', path: [at(3, 3), at(4, 4), at(5, 4)] })
    expect(moved.pos).toEqual(at(5, 4))
  })

  it('lands a creature the same way — one field, one write', async () => {
    const fau: Actor = { ...initAdversary(await loadAdversary('faucheur')), pos: at(10, 10) }
    const moved = applyEffectToActor(fau, { targetId: fau.id, kind: 'move', path: [at(9, 10), at(8, 10)] })
    expect(moved.pos).toEqual(at(8, 10))
  })

  it('is a no-op on a positionless actor (encounter without a board)', () => {
    const pc = makeCombatant('PC')
    const after = applyEffectToActor(pc, { targetId: 'PC', kind: 'move', path: [at(5, 5)] })
    expect(after.pos).toBeUndefined()
    expect(after).toEqual(pc)
  })

  it('is a no-op on an empty path — a figure that holds position stays put', () => {
    const pc: Actor = { ...makeCombatant('PC'), pos: at(7, 1) }
    expect(applyEffectToActor(pc, { targetId: 'PC', kind: 'move', path: [] }).pos).toEqual(at(7, 1))
  })

  it('never mutates the input state', () => {
    const pc: Actor = { ...makeCombatant('PC'), pos: at(2, 2) }
    applyEffectToActor(pc, { targetId: 'PC', kind: 'move', path: [at(3, 3)] })
    expect(pc.pos).toEqual(at(2, 2))
  })

  it('moves the right actor through the map, leaving the others where they stand', () => {
    const a: Actor = { ...makeCombatant('A'), pos: at(0, 0) }
    const b: Actor = { ...makeCombatant('B'), pos: at(9, 9) }
    const after = applyEffectsToActors(new Map([['A', a], ['B', b]]), [
      { targetId: 'A', kind: 'move', path: [at(1, 1), at(2, 2)] },
    ])
    expect(after.get('A')!.pos).toEqual(at(2, 2))
    expect(after.get('B')!.pos).toEqual(at(9, 9))
  })
})
