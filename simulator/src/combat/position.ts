/**
 * Board geometry for the Quadrature combat module.
 *
 * The play surface is a square grid — Ewen's physical mat is 34×22 cases. The
 * rules already fix the metric (§ universal_actions.md, Déplacement):
 *
 *   « 1 case = 1,5 m, diagonales comprises. »
 *
 * A diagonal step therefore costs exactly as much as an orthogonal one, which
 * is the **Chebyshev** distance — max(|dx|, |dy|), the king's move of chess.
 * It is the fastest metric to count by hand on the mat, which is why the rules
 * chose it; this module simply honours that choice rather than inventing one.
 *
 * Distances are in cases throughout — never metres. Speeds are budgets in cases
 * (a PC walks 3, runs 6).
 */

/** A square on the board. Origin is the top-left corner; x runs right, y runs down. */
export interface Position {
  x: number
  y: number
}

/** The play surface. Ewen's physical mat is 34×22. */
export interface Board {
  width:  number
  height: number
}

/** The physical mat this project is designed around. */
export const DEFAULT_BOARD: Board = { width: 34, height: 22 }

/** A figure's movement budgets, in cases. */
export interface Speed {
  walk: number
  run:  number
}

/**
 * Player-character speeds (§ universal_actions.md) : Marche 🚶 → 3 cases,
 * Course 🏃 → 6 cases. Fixed for every PC — unlike creatures, whose speeds come
 * from their fiche (`sheet.speed`, set by the mutations that shaped their legs).
 *
 * Two riders the engine does not model yet: a failed Course covers 5 cases, and
 * a Sprint ⛞🟦 adds 3.
 */
export const PC_SPEED: Speed = { walk: 3, run: 6 }

/**
 * Move anything that carries a `pos` along a path (start excluded — it ends on
 * the last square). Generic because a PC and a creature model position
 * identically; living here keeps both domains free of a mutual import.
 *
 * A figure with no `pos` does not move: in a positionless encounter there is no
 * square to move it from, and inventing one would put two figures on top of
 * each other. Movement there is a no-op, which is the pre-positions behaviour.
 */
export function applyMove<T extends { pos?: Position }>(o: T, path: readonly Position[]): T {
  if (o.pos === undefined || path.length === 0) return o
  return { ...o, pos: path[path.length - 1] }
}

/**
 * Distance between two squares, in cases (§ « 1 case = 1,5 m, diagonales
 * comprises » → Chebyshev). Adjacency is distance 1, diagonals included.
 */
export function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

/** True when both squares are the same. */
export function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y
}

/** True when the square lies on the board. */
export function inBounds(board: Board, p: Position): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < board.width && p.y < board.height
}

/**
 * True when the two squares are adjacent — i.e. in **Engagement Serré** range
 * for a plain melee weapon (reach 1). Note the glossary reserves the ≬ symbol
 * for a *stricter* notion that excludes diagonals; this is the general
 * adjacency used by reach, not that state.
 */
export function isAdjacent(a: Position, b: Position): boolean {
  return distance(a, b) === 1
}

/**
 * True when `target` sits in the weapon's effective range band from `from`:
 * beyond `minRange` (a ranged weapon can't fire when engaged, minRange 1 →
 * distance > 1) and within `reach` (its maximum). Melee keeps minRange 0, so
 * `distance ≤ reach` alone — adjacent connects exactly as before.
 */
export function inReach(from: Position, target: Position, reach: number, minRange = 0): boolean {
  const d = distance(from, target)
  return d > minRange && d <= reach
}

/**
 * The 8 squares around `p` that lie on the board — the steps a figure may take,
 * diagonals included (they cost the same as orthogonals).
 */
export function neighbours(board: Board, p: Position): Position[] {
  const out: Position[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const n = { x: p.x + dx, y: p.y + dy }
      if (inBounds(board, n)) out.push(n)
    }
  }
  return out
}
