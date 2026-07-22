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
import type { CombatEffect } from './types'

/** True when a square cannot be entered (occupied by another figure, obstacle…). */
export type Blocked = (p: Position) => boolean

export interface ApproachOptions {
  /** Cases the mover may spend (Marche 3, Course 6…). */
  budget: number
  /** How close it wants to get: 1 = adjacent (mêlée), 2 = arme d'allonge. */
  reach?: number
  /** Squares it may not enter. The mover's own square is never blocked. */
  isBlocked?: Blocked
  /**
   * RETREAT instead of approach: spend the budget to get as FAR from the goal as
   * the board and blocks allow (kiting — a ranged attacker opening distance).
   * `reach` is ignored in this mode.
   */
  away?: boolean
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
 * Squared straight-line distance — the tiebreaker between squares the rules
 * consider identical.
 *
 * Chebyshev makes whole rings equidistant: from (14,2), both (10,2) and (10,0)
 * sit 8 cases from a goal at (2,2). The rules genuinely do not care, but a
 * figure that veers into a wall to cover the same ground reads as a bug to
 * anyone watching the mat. Euclid does care, and picks the straight line.
 *
 * Kept squared: same ordering, no square root, exact in integers.
 */
const straightness = (p: Position, goal: Position): number =>
  (p.x - goal.x) ** 2 + (p.y - goal.y) ** 2

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
  { budget, reach = 1, isBlocked = () => false, away = false }: ApproachOptions,
): MovePlan {
  const stay: MovePlan = {
    path: [], to: from, spent: 0, reached: gapTo(from, goal, reach) === 0,
  }
  // Already in reach (approach) / no legs to spend: hold position. A retreat is
  // never "already done" — it always wants MORE distance if the budget allows.
  if ((!away && stay.reached) || budget <= 0) return stay

  // BFS over free squares, at most `budget` deep. `prev` reconstructs the path.
  const prev    = new Map<string, Position | null>([[key(from), null]])
  const seen    = new Set<string>([key(from)])
  let   frontier: Position[] = [from]

  // Approach minimises the gap to the goal; retreat maximises the raw distance
  // from it. In both, `straightness` breaks ties toward the cleaner line (a
  // straight run in, or straight away). BFS explores in a fixed order so the
  // first square found wins any remaining tie — same inputs, same path, always.
  const scoreOf = (p: Position) => away
    ? { key: -distance(p, goal), line: -straightness(p, goal) }   // want FAR (min of negatives)
    : { key: gapTo(p, goal, reach), line: straightness(p, goal) } // want CLOSE
  let best = { pos: from, steps: 0, ...scoreOf(from) }

  for (let step = 1; step <= budget && frontier.length > 0; step++) {
    const next: Position[] = []
    for (const p of frontier) {
      // Sort neighbours toward the objective first (goal for approach, away from
      // it for retreat). BFS records a square's parent on first sighting, so
      // discovery order IS the walked path — sorting makes it the sensible route.
      const steps = [...neighbours(board, p)].sort((a, b) => away
        ? straightness(b, goal) - straightness(a, goal)
        : straightness(a, goal) - straightness(b, goal))
      for (const n of steps) {
        const k = key(n)
        if (seen.has(k) || isBlocked(n)) continue
        seen.add(k)
        prev.set(k, p)
        next.push(n)

        const s = scoreOf(n)
        if (s.key < best.key || (s.key === best.key && step === best.steps && s.line < best.line)) {
          best = { pos: n, steps: step, ...s }
        }
      }
    }
    frontier = next
  }

  return { ...toPlan(prev, from, best.pos), reached: !away && gapTo(best.pos, goal, reach) === 0 }
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

// ─── Expanding move intents ───────────────────────────────────────────────────

/**
 * Turn every `move-toward` INTENT (a budget) into a concrete `move` (a path).
 *
 * This is the one place movement leaves snapshot simultaneity, and it has to.
 * Everything else in an initiative group is resolved against a frozen snapshot,
 * which is right for blows — two fighters trade hits without either seeing the
 * other's. Movement cannot work that way: two figures closing on the same
 * square would each snapshot it as free and end up stacked.
 *
 * So movers are ORDERED and expanded one at a time, each seeing the squares the
 * previous ones just claimed. The order is « distance puis id » — the figure
 * already closest to its goal claims first (it had the least ground to cover,
 * so it gets there first), and the id breaks the remaining ties so the same
 * inputs always give the same board. Rare in play, but never ambiguous.
 *
 * A mover with no square (positionless encounter) yields an empty path, which
 * applies as a no-op. Non-movement effects pass through untouched, and every
 * effect keeps its position in the list — a Charge's move still precedes its 💢.
 */
export function expandMoves(
  board:     Board,
  positions: ReadonlyMap<string, Position>,
  effects:   readonly CombatEffect[],
): CombatEffect[] {
  const intents = effects.filter(e => e.kind === 'move-toward')
  if (intents.length === 0) return [...effects]

  // Live occupancy, mutated as each mover claims its destination.
  const claimed = new Map(positions)

  const gapOf = (e: Extract<CombatEffect, { kind: 'move-toward' }>): number => {
    const from = claimed.get(e.targetId)
    const goal = claimed.get(e.goalId)
    return from && goal ? distance(from, goal) : Number.MAX_SAFE_INTEGER
  }

  // « Distance puis id » — deterministic, and cheap to reason about at the mat.
  const ordered = [...intents].sort((a, b) =>
    gapOf(a) - gapOf(b) || a.targetId.localeCompare(b.targetId))

  const paths = new Map<CombatEffect, Position[]>()
  for (const intent of ordered) {
    const from = claimed.get(intent.targetId)
    const goal = claimed.get(intent.goalId)
    if (!from || !goal) { paths.set(intent, []); continue }

    const others = [...claimed].filter(([id]) => id !== intent.targetId).map(([, p]) => p)
    const plan = planApproach(board, from, goal, {
      budget:    intent.budget,
      reach:     intent.reach ?? 1,
      isBlocked: occupiedBy(others),
      ...(intent.away && { away: true }),
    })
    paths.set(intent, plan.path)
    claimed.set(intent.targetId, plan.to)
  }

  return effects.map(e =>
    e.kind === 'move-toward'
      ? { targetId: e.targetId, kind: 'move', path: paths.get(e) ?? [] }
      : e)
}
