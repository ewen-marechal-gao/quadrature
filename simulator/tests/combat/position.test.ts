/**
 * Board geometry — the Chebyshev metric the rules fix in universal_actions.md
 * (« 1 case = 1,5 m, diagonales comprises ») and the 34×22 physical mat.
 */
import {
  distance, samePosition, inBounds, isAdjacent, inReach, neighbours,
  DEFAULT_BOARD, type Position,
} from '../../src/combat/position'

const at = (x: number, y: number): Position => ({ x, y })

describe('distance — Chebyshev', () => {
  it('is 0 on the same square', () => {
    expect(distance(at(5, 5), at(5, 5))).toBe(0)
  })

  it('counts a diagonal step exactly like an orthogonal one', () => {
    // La garantie de la règle : « diagonales comprises ». C'est ce qui rend le
    // comptage instantané au tapis — et ce qui distingue Chebyshev du 1-2-1.
    expect(distance(at(0, 0), at(1, 0))).toBe(1)   // orthogonal
    expect(distance(at(0, 0), at(1, 1))).toBe(1)   // diagonal
  })

  it('is the longer of the two axes', () => {
    expect(distance(at(0, 0), at(3, 7))).toBe(7)
    expect(distance(at(0, 0), at(7, 3))).toBe(7)
  })

  it('is symmetric and sign-agnostic', () => {
    expect(distance(at(9, 4), at(2, 8))).toBe(distance(at(2, 8), at(9, 4)))
    expect(distance(at(0, 0), at(-3, -3))).toBe(3)
  })

  it('spans the mat: opposite corners of 34×22 are 33 cases apart', () => {
    // La longueur (33) domine la largeur (21) : une Course de 6 cases traverse
    // le tapis en ~6 manches — le placement a donc un vrai coût en tempo.
    const { width, height } = DEFAULT_BOARD
    expect(distance(at(0, 0), at(width - 1, height - 1))).toBe(33)
  })
})

describe('samePosition', () => {
  it('distinguishes squares', () => {
    expect(samePosition(at(2, 3), at(2, 3))).toBe(true)
    expect(samePosition(at(2, 3), at(3, 2))).toBe(false)
  })
})

describe('inBounds — 34×22 mat', () => {
  it('accepts the four corners', () => {
    for (const p of [at(0, 0), at(33, 0), at(0, 21), at(33, 21)]) {
      expect(inBounds(DEFAULT_BOARD, p)).toBe(true)
    }
  })

  it('rejects anything just outside', () => {
    for (const p of [at(-1, 0), at(0, -1), at(34, 0), at(0, 22)]) {
      expect(inBounds(DEFAULT_BOARD, p)).toBe(false)
    }
  })
})

describe('isAdjacent / inReach', () => {
  it('treats the eight surrounding squares as adjacent', () => {
    const centre = at(5, 5)
    for (const n of neighbours(DEFAULT_BOARD, centre)) {
      expect(isAdjacent(centre, n)).toBe(true)
    }
  })

  it('is not adjacent to itself, nor two squares away', () => {
    expect(isAdjacent(at(5, 5), at(5, 5))).toBe(false)
    expect(isAdjacent(at(5, 5), at(7, 5))).toBe(false)
  })

  it('reach 1 covers adjacency; reach 2 covers an arme d\'allonge', () => {
    const wielder = at(5, 5)
    expect(inReach(wielder, at(6, 6), 1)).toBe(true)    // adjacent en diagonale
    expect(inReach(wielder, at(7, 5), 1)).toBe(false)   // hors de portée d'une arme courte
    expect(inReach(wielder, at(7, 5), 2)).toBe(true)    // la hast atteint
    expect(inReach(wielder, at(7, 7), 2)).toBe(true)    // y compris en diagonale
    expect(inReach(wielder, at(8, 5), 2)).toBe(false)
  })
})

describe('neighbours', () => {
  it('gives 8 steps in the open', () => {
    expect(neighbours(DEFAULT_BOARD, at(5, 5))).toHaveLength(8)
  })

  it('clips at the edges and corners of the mat', () => {
    expect(neighbours(DEFAULT_BOARD, at(0, 0))).toHaveLength(3)     // coin
    expect(neighbours(DEFAULT_BOARD, at(33, 21))).toHaveLength(3)   // coin opposé
    expect(neighbours(DEFAULT_BOARD, at(0, 5))).toHaveLength(5)     // bord
  })

  it('never returns the square itself, and all are one step away', () => {
    const p = at(4, 9)
    for (const n of neighbours(DEFAULT_BOARD, p)) {
      expect(samePosition(n, p)).toBe(false)
      expect(distance(p, n)).toBe(1)
    }
  })
})
