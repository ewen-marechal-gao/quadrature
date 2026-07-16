/**
 * Expanding move INTENTS (a budget) into concrete moves (a path).
 *
 * The case that justifies the whole mechanism: two figures closing on the same
 * square. Snapshot simultaneity — right for blows — would stack them, because
 * each would see the square free. Expansion orders the movers instead.
 */
import { expandMoves } from '../../src/combat/movement'
import { DEFAULT_BOARD, type Position } from '../../src/combat/position'
import type { CombatEffect } from '../../src/combat/types'

const at = (x: number, y: number): Position => ({ x, y })
const B  = DEFAULT_BOARD

const toward = (mover: string, goal: string, budget: number, reach?: number): CombatEffect =>
  ({ targetId: mover, kind: 'move-toward', goalId: goal, budget, ...(reach !== undefined && { reach }) })

/** The `move` an intent expanded into. */
const moveOf = (out: CombatEffect[], id: string) =>
  out.find(e => e.kind === 'move' && e.targetId === id) as Extract<CombatEffect, { kind: 'move' }>

describe('expandMoves — intent → path', () => {
  it('turns a budget into a path that stops in reach of the goal', () => {
    const pos = new Map([['A', at(0, 0)], ['B', at(6, 0)]])
    const out = expandMoves(B, pos, [toward('A', 'B', 6)])

    const move = moveOf(out, 'A')
    expect(move.path[move.path.length - 1]).toEqual(at(5, 0))   // adjacent à B, pas sur B
    expect(move.path).toHaveLength(5)
  })

  it('leaves other effects untouched and in place — a Charge moves THEN wounds', () => {
    const pos = new Map([['fau', at(0, 0)], ['PC', at(4, 0)]])
    const wound: CombatEffect = { targetId: 'PC', kind: 'light-wound', amount: 2 }
    const out = expandMoves(B, pos, [toward('fau', 'PC', 6), wound])

    expect(out).toHaveLength(2)
    expect(out[0].kind).toBe('move')
    expect(out[1]).toBe(wound)          // identité préservée : même objet
  })

  it('passes a list with no movement straight through', () => {
    const fx: CombatEffect[] = [{ targetId: 'PC', kind: 'light-wound', amount: 1 }]
    expect(expandMoves(B, new Map(), fx)).toEqual(fx)
  })

  it('an arme d\'allonge (reach 2) stops a case short', () => {
    const pos = new Map([['A', at(0, 0)], ['B', at(6, 0)]])
    const out = expandMoves(B, pos, [toward('A', 'B', 6, 2)])
    expect(moveOf(out, 'A').path).toHaveLength(4)
  })
})

describe('expandMoves — the contested square', () => {
  it('never stacks two figures on the same square', () => {
    // A et B équidistants d'une case libre entre eux et la cible C.
    const pos = new Map([['A', at(0, 4)], ['B', at(0, 6)], ['C', at(4, 5)]])
    const out = expandMoves(B_(), pos, [toward('A', 'C', 3), toward('B', 'C', 3)])

    const a = moveOf(out, 'A'), b = moveOf(out, 'B')
    expect(a.path.at(-1)).not.toEqual(b.path.at(-1))
  })

  it('the closer figure claims the only free square — « distance puis id »', () => {
    // Cible acculée dans le coin (0,0) : deux badauds en bouchent les abords,
    // il ne reste qu'UNE case adjacente, (1,0). L'ordre décide donc vraiment.
    const pos = new Map([
      ['goal', at(0, 0)], ['w1', at(0, 1)], ['w2', at(1, 1)],
      ['near', at(3, 0)], ['far', at(6, 0)],
    ])
    // Déclarés far-en-premier : c'est bien la distance, non l'ordre de la liste,
    // qui départage.
    const out = expandMoves(B_(), pos, [toward('far', 'goal', 6), toward('near', 'goal', 6)])

    expect(moveOf(out, 'near').path.at(-1)).toEqual(at(1, 0))
    expect(moveOf(out, 'far').path.at(-1)).not.toEqual(at(1, 0))
  })

  it('breaks a perfect tie by id, deterministically', () => {
    // Mise en scène strictement symétrique : seul l'id peut départager.
    const run = () => {
      const pos = new Map([['aaa', at(0, 4)], ['zzz', at(0, 6)], ['goal', at(4, 5)]])
      return expandMoves(B_(), pos, [toward('zzz', 'goal', 4), toward('aaa', 'goal', 4)])
    }
    const first = run()
    for (let i = 0; i < 20; i++) expect(run()).toEqual(first)
  })

  it('a mover never walks through a bystander', () => {
    const pos = new Map([['A', at(0, 0)], ['wall', at(1, 0)], ['B', at(4, 0)]])
    const out = expandMoves(B_(), pos, [toward('A', 'B', 6)])
    expect(moveOf(out, 'A').path).not.toContainEqual(at(1, 0))
  })
})

describe('expandMoves — positionless encounters', () => {
  it('yields an empty path when the mover has no square', () => {
    const out = expandMoves(B_(), new Map([['B', at(4, 0)]]), [toward('A', 'B', 6)])
    expect(moveOf(out, 'A').path).toEqual([])
  })

  it('yields an empty path when the goal has no square', () => {
    const out = expandMoves(B_(), new Map([['A', at(0, 0)]]), [toward('A', 'B', 6)])
    expect(moveOf(out, 'A').path).toEqual([])
  })

  it('expands every intent — none survives as an unresolved intent', () => {
    const out = expandMoves(B_(), new Map(), [toward('A', 'B', 6), toward('C', 'D', 3)])
    expect(out.every(e => e.kind === 'move')).toBe(true)
  })
})

/** Local alias — `B` is shadowed by the actor id in these blocks. */
function B_() { return DEFAULT_BOARD }
