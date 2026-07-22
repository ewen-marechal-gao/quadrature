/**
 * Exact probability distributions for Quadrature checks — the planner's eyes.
 *
 * A utility-based agent needs P(total ≥ DD), P(✴️) and P(⚠️) for any pool it
 * considers. Both roll systems are small enough to compute EXACTLY:
 *
 *  - PC checks (§ jouer.md, Le Jet): the three pool categories are independent
 *    once rolled — keep the best 🟦, the top-2 🟨 (⚠️/✴️ flags live here), and
 *    one wild die (max with 🟩, min with 🟥). Each category's distribution is
 *    enumerated separately (≤ 6⁵ tuples), then the three are convolved.
 *
 *  - Adversary checks (§ Dés d'adversaires): summed dice, keep-4 — a single
 *    enumeration carrying (total, fives) for the ⭐ Repérez X 5 effects.
 *
 * The ONE thing that breaks category independence is the relance ⟳ (mental
 * states, equipment): it rerolls the worst die ACROSS categories. For those
 * pools we fall back to a seeded Monte-Carlo estimate — deterministic (fixed
 * seed per pool signature), memoised, and precise enough to rank actions
 * (±0.5% on probabilities at 40k samples).
 *
 * Everything is memoised by pool signature: in batch the cost is paid once.
 */

import type { DieType, RollParams, PoolRolls } from '../types'
import { FACES } from '../dieSystem/dice'
import { buildPool, type DicePool } from '../dieSystem/pool'
import { worstRerollTarget } from '../dieSystem/roll'
import {
  ADVERSARY_FACES, adjustPoolQuality, type AdversaryDie,
} from '../adversary/dice'

// ─── Public types ─────────────────────────────────────────────────────────────

/** One outcome of a PC check: a score with its ⚠️/✴️ flags and probability. */
export interface RollDistCell {
  total:    number
  flaw:     boolean
  critical: boolean
  p:        number
}

/** Full distribution of a PC check. */
export interface RollDist {
  cells:     RollDistCell[]
  mean:      number
  pFlaw:     number
  pCritical: number
}

/** One outcome of an adversary check: summed total and ⭐ fives count. */
export interface AdvDistCell {
  total: number
  fives: number
  p:     number
}

/** Full distribution of an adversary check. */
export interface AdvRollDist {
  cells: AdvDistCell[]
  mean:  number
}

// ─── PC checks ────────────────────────────────────────────────────────────────

const pcCache = new Map<string, RollDist>()

/**
 * Distribution of a PC check for the given roll parameters.
 * Exact when the pool has no relance ⟳; seeded Monte-Carlo otherwise.
 */
export function checkDistribution(params: RollParams): RollDist {
  const pool = buildPool(params)
  const rerolls = params.rerolls ?? 0
  const key = signature(pool, rerolls)
  const hit = pcCache.get(key)
  if (hit) return hit

  const dist = rerolls > 0
    ? monteCarloDist(pool, rerolls, key)
    : exactDist(pool)
  pcCache.set(key, dist)
  return dist
}

/** P(total ≥ dc). */
export function pAtLeast(dist: RollDist, dc: number): number {
  let p = 0
  for (const c of dist.cells) if (c.total >= dc) p += c.p
  return p
}

/**
 * Expected value of an arbitrary payoff over the distribution — the planner's
 * bridge from probabilities to utility: Σ p(cell) × payoff(cell).
 */
export function evOver(dist: RollDist, payoff: (cell: RollDistCell) => number): number {
  let ev = 0
  for (const c of dist.cells) ev += c.p * payoff(c)
  return ev
}

// ─── Exact computation (no relance) ───────────────────────────────────────────

/** value → probability */
type ValueDist = Map<number, number>

/** Joint (top-2 sum, flaw, crit) → probability, keyed compactly. */
type SkillDist = Map<number, number>
const skillKey  = (sum: number, flaw: boolean, crit: boolean): number =>
  sum * 4 + (flaw ? 1 : 0) + (crit ? 2 : 0)
const skillSum  = (k: number): number  => Math.floor(k / 4)
const skillFlaw = (k: number): boolean => (k & 1) === 1
const skillCrit = (k: number): boolean => (k & 2) === 2

function exactDist(pool: DicePool): RollDist {
  const charDist  = maxDist(pool.characteristic)
  const skill     = topTwoDist(pool.skill)
  const wildDist  = pool.wild.includes('advantage') ? maxDist(pool.wild)
                  : pool.wild.includes('disadvantage') ? minDist(pool.wild)
                  : singleDist(pool.wild[0])

  // Convolve the three independent categories.
  const acc = new Map<number, number>()   // skillKey-style over the FULL total
  for (const [cv, cp] of charDist) {
    for (const [sk, sp] of skill) {
      for (const [wv, wp] of wildDist) {
        const total = cv + skillSum(sk) + wv
        const key   = skillKey(total, skillFlaw(sk), skillCrit(sk))
        acc.set(key, (acc.get(key) ?? 0) + cp * sp * wp)
      }
    }
  }
  return collect(acc)
}

/** Distribution of a single die's face value. */
function singleDist(die: DieType): ValueDist {
  const out: ValueDist = new Map()
  for (const f of FACES[die]) out.set(f, (out.get(f) ?? 0) + 1 / FACES[die].length)
  return out
}

/** P(face ≤ v) for one die type. */
function cdf(die: DieType, v: number): number {
  const faces = FACES[die]
  return faces.filter(f => f <= v).length / faces.length
}

/** Distribution of the MAX over a mixed-type dice list (closed form). */
function maxDist(dice: DieType[]): ValueDist {
  const out: ValueDist = new Map()
  let below = 0   // P(max ≤ v−1)
  for (let v = 0; v <= 5; v++) {
    let atMost = 1
    for (const d of dice) atMost *= cdf(d, v)
    const p = atMost - below
    if (p > 0) out.set(v, p)
    below = atMost
  }
  return out
}

/** Distribution of the MIN over a mixed-type dice list (closed form). */
function minDist(dice: DieType[]): ValueDist {
  const out: ValueDist = new Map()
  let above = 0   // P(min ≥ v+1)
  for (let v = 5; v >= 0; v--) {
    let atLeast = 1
    for (const d of dice) atLeast *= 1 - cdf(d, v - 1)
    const p = atLeast - above
    if (p > 0) out.set(v, p)
    above = atLeast
  }
  return out
}

/**
 * Joint distribution of (sum of the two best skill dice, ⚠️ flag, ✴️ flag).
 * The flags read the KEPT dice only (§ jouer.md step 4), so they must be
 * computed inside the same enumeration — ≤ 6⁵ tuples, done once and memoised
 * upstream.
 */
function topTwoDist(dice: DieType[]): SkillDist {
  const out: SkillDist = new Map()
  const faces = dice.map(d => FACES[d])
  const values = new Array<number>(dice.length)

  const recurse = (i: number, p: number): void => {
    if (i === dice.length) {
      // Two best kept dice (any two when the pool is exactly two).
      let best1 = -1, best2 = -1
      for (const v of values) {
        if (v > best1)      { best2 = best1; best1 = v }
        else if (v > best2) { best2 = v }
      }
      const key = skillKey(best1 + best2, best1 === 0 || best2 === 0, best1 === 5 || best2 === 5)
      out.set(key, (out.get(key) ?? 0) + p)
      return
    }
    for (const f of faces[i]) {
      values[i] = f
      recurse(i + 1, p / faces[i].length)
    }
  }
  recurse(0, 1)
  return out
}

/** Turn the accumulated (total, flaw, crit) → p map into a RollDist. */
function collect(acc: Map<number, number>): RollDist {
  const cells: RollDistCell[] = []
  let mean = 0, pFlaw = 0, pCritical = 0
  for (const [key, p] of acc) {
    const cell: RollDistCell = {
      total: skillSum(key), flaw: skillFlaw(key), critical: skillCrit(key), p,
    }
    cells.push(cell)
    mean += cell.total * p
    if (cell.flaw)     pFlaw     += p
    if (cell.critical) pCritical += p
  }
  cells.sort((a, b) => a.total - b.total)
  return { cells, mean, pFlaw, pCritical }
}

// ─── Monte-Carlo fallback (pools with relances ⟳) ────────────────────────────

/** Samples per estimated distribution — ±0.5% on probabilities, memoised. */
const MC_SAMPLES = 40_000

/**
 * Seeded, deterministic estimate of a pool's distribution under the
 * reroll-the-worst policy (mirrors dieSystem/roll.ts `roll()` exactly, with an
 * injected PRNG so batch runs stay reproducible).
 */
function monteCarloDist(pool: DicePool, rerolls: number, key: string): RollDist {
  const rng = mulberry32(hashString(key))
  const rollDie = (type: DieType): number => {
    const faces = FACES[type]
    return faces[Math.floor(rng() * faces.length)]
  }

  const acc = new Map<number, number>()
  const w = 1 / MC_SAMPLES

  for (let n = 0; n < MC_SAMPLES; n++) {
    const rolls: PoolRolls = {
      characteristic: pool.characteristic.map(type => ({ type, value: rollDie(type) })),
      skill:          pool.skill.map(type => ({ type, value: rollDie(type) })),
      wild:           pool.wild.map(type => ({ type, value: rollDie(type) })),
    }
    const used = new Set<string>()
    for (let i = 0; i < rerolls; i++) {
      const target = worstRerollTarget(rolls, used)
      if (!target) break
      used.add(`${target.category}:${target.index}`)
      const die = rolls[target.category][target.index]
      rolls[target.category][target.index] = { type: die.type, value: rollDie(die.type) }
    }

    // Selection — same rules as computeResult (best 🟦, top-2 🟨, wild max/min).
    let bestChar = 0
    for (const d of rolls.characteristic) if (d.value > bestChar) bestChar = d.value
    let s1 = -1, s2 = -1
    for (const d of rolls.skill) {
      if (d.value > s1)      { s2 = s1; s1 = d.value }
      else if (d.value > s2) { s2 = d.value }
    }
    let wild: number
    if (pool.wild.includes('advantage')) {
      wild = 0
      for (const d of rolls.wild) if (d.value > wild) wild = d.value
    } else if (pool.wild.includes('disadvantage')) {
      wild = 5
      for (const d of rolls.wild) if (d.value < wild) wild = d.value
    } else {
      wild = rolls.wild[0].value
    }

    const k = skillKey(bestChar + s1 + s2 + wild, s1 === 0 || s2 === 0, s1 === 5 || s2 === 5)
    acc.set(k, (acc.get(k) ?? 0) + w)
  }
  return collect(acc)
}

// ─── Adversary checks ─────────────────────────────────────────────────────────

const advCache = new Map<string, AdvRollDist>()

/**
 * Exact distribution of an adversary check: quality-adjusted pool (🟩/🟥 move
 * dice along the Nuisance→Threat→Danger ladder), all dice summed, keep the four
 * highest when the pool exceeds four. Carries the kept-dice ⭐ fives count.
 */
export function adversaryDistribution(
  dice: AdversaryDie[],
  opts: { advantages?: number; disadvantages?: number } = {},
): AdvRollDist {
  const net      = (opts.advantages ?? 0) - (opts.disadvantages ?? 0)
  const adjusted = net === 0 ? dice : adjustPoolQuality(dice, net)
  const key      = adjusted.join(',')
  const hit = advCache.get(key)
  if (hit) return hit

  const faces  = adjusted.map(d => ADVERSARY_FACES[d])
  const acc    = new Map<number, number>()   // total*8 + fives (fives ≤ 4)
  const values = new Array<number>(adjusted.length)

  const recurse = (i: number, p: number): void => {
    if (i === adjusted.length) {
      const kept = values.length <= 4 ? values : [...values].sort((a, b) => b - a).slice(0, 4)
      let total = 0, fives = 0
      for (const v of kept) { total += v; if (v === 5) fives++ }
      const k = total * 8 + fives
      acc.set(k, (acc.get(k) ?? 0) + p)
      return
    }
    for (const f of faces[i]) {
      values[i] = f
      recurse(i + 1, p / faces[i].length)
    }
  }
  recurse(0, 1)

  const cells: AdvDistCell[] = []
  let mean = 0
  for (const [k, p] of acc) {
    const cell = { total: Math.floor(k / 8), fives: k % 8, p }
    cells.push(cell)
    mean += cell.total * p
  }
  cells.sort((a, b) => a.total - b.total)
  const dist = { cells, mean }
  advCache.set(key, dist)
  return dist
}

/** P(total ≥ dc) for an adversary distribution. */
export function advPAtLeast(dist: AdvRollDist, dc: number): number {
  let p = 0
  for (const c of dist.cells) if (c.total >= dc) p += c.p
  return p
}

/** Expected payoff over an adversary distribution. */
export function advEvOver(dist: AdvRollDist, payoff: (cell: AdvDistCell) => number): number {
  let ev = 0
  for (const c of dist.cells) ev += c.p * payoff(c)
  return ev
}

// ─── Internals ────────────────────────────────────────────────────────────────

/** Stable memoisation key for a pool + relance count. */
function signature(pool: DicePool, rerolls: number): string {
  return `${pool.characteristic.join(',')}|${pool.skill.join(',')}|${pool.wild.join(',')}|r${rerolls}`
}

/** FNV-1a — cheap stable string hash for PRNG seeding. */
function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Mulberry32 — tiny deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
