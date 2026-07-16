/**
 * Movement planning — budget (Marche 3 / Course 6) → concrete path.
 *
 * Two properties matter beyond "it gets there": the plan must be DETERMINISTIC
 * (an ambiguous contested square is the failure mode Ewen ranked #2), and it
 * must never path through a body.
 */
import { planApproach, occupiedBy } from '../../src/combat/movement'
import { distance, DEFAULT_BOARD, type Position } from '../../src/combat/position'

const at = (x: number, y: number): Position => ({ x, y })
const B  = DEFAULT_BOARD

describe('planApproach — reaching the goal', () => {
  it('does not move when already in reach', () => {
    const plan = planApproach(B, at(5, 5), at(6, 5), { budget: 6 })
    expect(plan.path).toEqual([])
    expect(plan.spent).toBe(0)
    expect(plan.reached).toBe(true)
  })

  it('stops adjacent to the goal rather than on it', () => {
    const plan = planApproach(B, at(0, 0), at(4, 0), { budget: 6 })
    expect(plan.reached).toBe(true)
    expect(distance(plan.to, at(4, 0))).toBe(1)
    expect(plan.spent).toBe(3)       // 3 cases pour être à 1 case d'une cible à 4
  })

  it('spends only what it needs, never the whole budget', () => {
    // Course = 6 cases, mais la cible est à 3 : on n'en dépense que 2.
    const plan = planApproach(B, at(0, 0), at(3, 0), { budget: 6 })
    expect(plan.spent).toBe(2)
  })

  it('an arme d\'allonge (reach 2) stops one case earlier', () => {
    const short = planApproach(B, at(0, 0), at(6, 0), { budget: 6, reach: 1 })
    const long  = planApproach(B, at(0, 0), at(6, 0), { budget: 6, reach: 2 })
    expect(short.spent).toBe(5)
    expect(long.spent).toBe(4)
    expect(long.reached).toBe(true)
  })

  it('closes diagonally in one move — the Chebyshev metric, end to end', () => {
    // (0,0) → cible (4,4) : 4 en diagonale, pas 8. La Marche (3) arrive à 1 case.
    const plan = planApproach(B, at(0, 0), at(4, 4), { budget: 3 })
    expect(plan.spent).toBe(3)
    expect(plan.reached).toBe(true)
  })
})

describe('planApproach — it walks in a straight line', () => {
  it('does not veer off the axis when the rules see no difference', () => {
    // Chebyshev rend toute une couronne equidistante : depuis (14,2) vers une
    // cible en (2,2), (10,2) et (10,0) sont tous deux a 8 cases. Les regles s'en
    // moquent ; l'oeil, non — une creature qui part se coller au mur pour couvrir
    // le meme terrain se lit comme un bug. On garde la ligne droite.
    const plan = planApproach({ width: 20, height: 5 }, at(14, 2), at(2, 2), { budget: 4 })
    expect(plan.to).toEqual(at(10, 2))
    for (const p of plan.path) expect(p.y).toBe(2)
  })

  it('holds the axis on a diagonal approach too', () => {
    const plan = planApproach(B, at(0, 0), at(10, 10), { budget: 3 })
    expect(plan.to).toEqual(at(3, 3))
  })

  it('still leaves the axis when a body is in the way', () => {
    const plan = planApproach(B, at(6, 2), at(0, 2), { budget: 3, isBlocked: occupiedBy([at(5, 2)]) })
    expect(plan.path).not.toContainEqual(at(5, 2))
    expect(distance(plan.to, at(0, 2))).toBe(3)   // il contourne sans perdre de terrain
  })
})

describe('planApproach — when it cannot close', () => {
  it('closes as much as it can: an approach is never wasted', () => {
    // Marche 3 cases vers une cible à 10 → il reste 6 cases d'écart.
    const plan = planApproach(B, at(0, 0), at(10, 0), { budget: 3 })
    expect(plan.reached).toBe(false)
    expect(plan.spent).toBe(3)
    expect(distance(plan.to, at(10, 0))).toBe(7)
  })

  it('holds position with no budget', () => {
    const plan = planApproach(B, at(0, 0), at(10, 0), { budget: 0 })
    expect(plan).toMatchObject({ path: [], spent: 0, reached: false })
  })

  it('stays on the mat', () => {
    // Dos au coin, cible hors plateau : chaque case du chemin reste bornée.
    const plan = planApproach(B, at(1, 1), at(40, 30), { budget: 6 })
    for (const p of plan.path) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThan(B.width)
      expect(p.y).toBeLessThan(B.height)
    }
  })
})

describe('planApproach — bodies block', () => {
  it('never steps onto an occupied square', () => {
    const wall = occupiedBy([at(2, 4), at(2, 5), at(2, 6)])
    const plan = planApproach(B, at(0, 5), at(9, 5), { budget: 6, isBlocked: wall })
    for (const p of plan.path) expect(wall(p)).toBe(false)
  })

  it('goes around a body instead of through it', () => {
    // Un corps en (1,0) sur la ligne directe : le chemin passe par une diagonale.
    const plan = planApproach(B, at(0, 0), at(4, 0), { budget: 6, isBlocked: occupiedBy([at(1, 0)]) })
    expect(plan.reached).toBe(true)
    expect(plan.path).not.toContainEqual(at(1, 0))
  })

  it('yields an empty plan when boxed in', () => {
    // Coin (0,0) : les 3 seules cases voisines sont prises.
    const boxed = occupiedBy([at(1, 0), at(0, 1), at(1, 1)])
    const plan  = planApproach(B, at(0, 0), at(9, 9), { budget: 6, isBlocked: boxed })
    expect(plan.path).toEqual([])
    expect(plan.to).toEqual(at(0, 0))
    expect(plan.reached).toBe(false)
  })

  it('a blocked goal is still reachable — you stop next to it, not on it', () => {
    // Le cas normal : la cible OCCUPE sa case, donc elle est « bloquée ».
    const plan = planApproach(B, at(0, 0), at(5, 0), { budget: 6, isBlocked: occupiedBy([at(5, 0)]) })
    expect(plan.reached).toBe(true)
    expect(plan.to).not.toEqual(at(5, 0))
  })
})

describe('planApproach — determinism', () => {
  it('gives byte-identical plans for identical inputs', () => {
    const run = () => planApproach(B, at(3, 7), at(20, 14), { budget: 6, isBlocked: occupiedBy([at(4, 8), at(5, 9)]) })
    const a = run()
    for (let i = 0; i < 20; i++) expect(run()).toEqual(a)
  })

  it('every step of a path is a legal one-case move', () => {
    const plan = planApproach(B, at(2, 2), at(25, 18), { budget: 6 })
    const steps = [at(2, 2), ...plan.path]
    for (let i = 1; i < steps.length; i++) {
      expect(distance(steps[i - 1], steps[i])).toBe(1)
    }
    expect(plan.path).toHaveLength(6)   // Course : le budget entier, la cible est loin
  })
})
