/**
 * Movement planning — turning a *budget* in cases into a concrete *path*.
 *
 * The rules give a budget, never a destination (§ universal_actions.md) :
 *   Posture → 1 case · Marche 🚶 → 3 cases · Course 🏃 → 6 cases (5 en échec,
 *   +3 avec le Sprint ⛞).
 * Choosing where those cases are spent is a decision, so it belongs here rather
 * than in the effect layer: `planApproach` makes the decision and hands back a
 * path; applying it is then a dumb, pure state write.
 *
 * The path is retained in full, not just the destination. It is what the future
 * reach reactions need — a réaction d'allonge fires when a figure *crosses* a
 * weapon's reach, which the endpoints alone cannot tell you (a runner can enter
 * and leave a hast's threat in a single Course).
 *
 * Determinism is a design requirement, not an accident: a contested square must
 * resolve the same way every time (priority 2 in Ewen's brief, « résolution des
 * ambiguités »). BFS explores `neighbours` in a fixed order and ties are broken
 * by first-found, so the same inputs always give the same path.
 */

import {
  type Board, type Position, distance, neighbours, samePosition,
} from './position'

/** True when a square cannot be entered (occupied by another figure, obstacle…). */
export type Blocked = (p: Position) => boolean

export interface ApproachOptions {
  /** Cases the mover may spend (Marche 3, Course 6…). */
  budget: number
  /** How close it wants to get: 1 = adjacent (mêlée), 2 = arme d'allonge. */
  reach?: number
  /** Squares it may not enter. The mover's own square is never blocked. */
  isBlocked?: Blocked
}

export interface MovePlan {
  /** Squares stepped through, in order, start EXCLUDED. Empty ⇒ it stays put. */
  path: Position[]
  /** Where it ends up — the last step, or `from` when it does not move. */
  to: Position
  /** Cases actually spent (= path.length), ≤ budget. */
  spent: number
  /** True when it ends within `reach` of the goal. */
  reached: boolean
}

/** Map key for a square. Comma-separated — plain ASCII, greppable. */
const key = (p: Position): string => `${p.x},${p.y}`

/**
 * How far short of the goal a square falls: 0 once within `reach`.
 * This is what the mover minimises — it wants to be *in reach*, not *on top of*
 * its goal (the goal square is normally occupied by the target anyway).
 */
const gapTo = (p: Position, goal: Position, reach: number): number =>
  Math.max(0, distance(p, goal) - reach)

/**
 * Plan a move from `from` toward `goal`, spending at most `budget` cases.
 *
 * Gets within `reach` of the goal when the budget allows; otherwise gets as
 * close as it can (a Marche that cannot close the distance still closes *some*
 * of it — an approach is never wasted). Never enters a blocked square, so a
 * figure cannot walk through another; when it is boxed in, the plan is empty.
 */
export function planApproach(
  board: Board,
  from:  Position,
  goal:  Position,
  { budget, reach = 1, isBlocked = () => false }: ApproachOptions,
): MovePlan {
  const stay: MovePlan = {
    path: [], to: from, spent: 0, reached: gapTo(from, goal, reach) === 0,
  }
  // Already in reach, or no legs to spend: hold position.
  if (stay.reached || budget <= 0) return stay

  // BFS over free squares, at most `budget` deep. `prev` reconstructs the path.
  const prev    = new Map<string, Position | null>([[key(from), null]])
  const seen    = new Set<string>([key(from)])
  let   frontier: Position[] = [from]

  let best     = from
  let bestGap  = gapTo(from, goal, reach)

  for (let step = 1; step <= budget && frontier.length > 0; step++) {
    const next: Position[] = []
    for (const p of frontier) {
      for (const n of neighbours(board, p)) {
        const k = key(n)
        if (seen.has(k) || isBlocked(n)) continue
        seen.add(k)
        prev.set(k, p)
        next.push(n)

        const gap = gapTo(n, goal, reach)
        // Strict `<` keeps the first square found at this gap — and BFS finds it
        // at the fewest steps, so the mover never wanders to reach the same spot.
        if (gap < bestGap) {
          bestGap = gap
          best    = n
          if (gap === 0) return { ...toPlan(prev, from, best), reached: true }
        }
      }
    }
    frontier = next
  }

  return { ...toPlan(prev, from, best), reached: bestGap === 0 }
}

/** Walk `prev` back from `end` to `from`, yielding the forward path (start excluded). */
function toPlan(
  prev: ReadonlyMap<string, Position | null>,
  from: Position,
  end:  Position,
): Omit<MovePlan, 'reached'> {
  const path: Position[] = []
  let cur: Position | null = end
  while (cur && !samePosition(cur, from)) {
    path.unshift(cur)
    cur = prev.get(key(cur)) ?? null
  }
  return { path, to: end, spent: path.length }
}

/**
 * Blocked-predicate over a set of occupied squares — every figure but the mover.
 * A figure blocks its square: no walking through a body (nothing in the rules
 * lets you, and it keeps the mat unambiguous).
 */
export function occupiedBy(positions: Iterable<Position>): Blocked {
  const taken = new Set<string>()
  for (const p of positions) taken.add(key(p))
  return (p: Position) => taken.has(key(p))
}
