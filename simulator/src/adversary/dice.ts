/**
 * Adversary dice for the Quadrature combat module.
 *
 * Adversaries do NOT use the player "keep-best" system (1 best 🟦 + 2 best 🟨 +
 * 1 wild). Instead they roll a fixed number of dice — typically four — and
 * **sum** them (0–20). The quality of the dice, not their count, encodes the
 * creature's power tier (§ Dés d'adversaires).
 *
 * Three die qualities exist (their faces differ from the player dice — in
 * particular 🟫 danger here is 2,3,3,4,4,5, not the player reinforced 1,2,3,4,5,5):
 *
 *  - 🟧 Nuisance — 0,1,1,2,2,3  (feeble / wounded / panicked; low mean, many 0)
 *  - ⬜ Threat   — 0,1,2,3,4,5  (the standard baseline)
 *  - 🟫 Danger   — 2,3,3,4,4,5  (massive / veteran; no 0 possible, high floor)
 *
 * Resolution has NO flaw ⚠️. The only special readout is ⭐ "Repérez X 5":
 * the number of kept dice showing a 5, which triggers a card's onFives effect
 * when it reaches the required count.
 */

// ─── Die qualities ──────────────────────────────────────────────────────────

/** Quality of an adversary die (§ Dés d'adversaires). */
export type AdversaryDie = 'nuisance' | 'threat' | 'danger'

/** Faces for each adversary die quality. Distinct from the player FACES. */
export const ADVERSARY_FACES: Record<AdversaryDie, number[]> = {
  nuisance: [0, 1, 1, 2, 2, 3],
  threat:   [0, 1, 2, 3, 4, 5],
  danger:   [2, 3, 3, 4, 4, 5],
}

/** Emoji symbol for each adversary die quality (used in logs). */
export const ADVERSARY_EMOJI: Record<AdversaryDie, string> = {
  nuisance: '🟧',
  threat:   '⬜',
  danger:   '🟫',
}

/**
 * Quality ladder, worst → best. One step is worth exactly ±1 in expectation,
 * so 🟩/🟥 adjustments (which shift quality by one rung) are mathematically
 * neutral (§ Avantage et désavantage).
 */
const QUALITY_LADDER: AdversaryDie[] = ['nuisance', 'threat', 'danger']

// ─── Power tiers ────────────────────────────────────────────────────────────

/** Power tier (Insignifiant → Élite), mirrors the fiche schema. */
export type PowerTier =
  | 'insignificant' | 'harmful' | 'weak' | 'novice' | 'initiate'
  | 'competent' | 'veteran' | 'expert' | 'elite'

/**
 * Base 4-die pool for each power tier (§ table Puissance).
 * A fiche carries its `dice` explicitly; this table lets the simulator derive
 * or validate a pool from a tier alone.
 */
export const DICE_BY_POWER: Record<PowerTier, AdversaryDie[]> = {
  insignificant: ['nuisance', 'nuisance', 'nuisance', 'nuisance'],
  harmful:       ['threat',   'nuisance', 'nuisance', 'nuisance'],
  weak:          ['threat',   'threat',   'nuisance', 'nuisance'],
  novice:        ['threat',   'threat',   'threat',   'nuisance'],
  initiate:      ['threat',   'threat',   'threat',   'threat'],
  competent:     ['danger',   'threat',   'threat',   'threat'],
  veteran:       ['danger',   'danger',   'threat',   'threat'],
  expert:        ['danger',   'danger',   'danger',   'threat'],
  elite:         ['danger',   'danger',   'danger',   'danger'],
}

// ─── Quality adjustment (🟩 / 🟥) ───────────────────────────────────────────

/** Upgrade (steps > 0) or downgrade (steps < 0) a single die's quality, clamped. */
export function adjustDie(die: AdversaryDie, steps: number): AdversaryDie {
  const i = QUALITY_LADDER.indexOf(die)
  const j = Math.max(0, Math.min(QUALITY_LADDER.length - 1, i + steps))
  return QUALITY_LADDER[j]
}

/**
 * Apply a net quality adjustment to a pool: `net` upgrade steps if positive,
 * downgrade steps if negative. Each step improves the lowest-quality die by one
 * rung (advantage) or worsens the highest-quality die by one rung (disadvantage),
 * so the adjustment lands where it changes the outcome (never wasted on a die
 * already at the ceiling / floor while another could still move).
 */
export function adjustPoolQuality(dice: AdversaryDie[], net: number): AdversaryDie[] {
  const pool = [...dice]
  const upgrading = net > 0
  for (let n = Math.abs(net); n > 0; n--) {
    // Index of the die most eligible to move in the chosen direction.
    let bestIdx = -1
    for (let i = 0; i < pool.length; i++) {
      const rung = QUALITY_LADDER.indexOf(pool[i])
      if (upgrading && rung >= QUALITY_LADDER.length - 1) continue
      if (!upgrading && rung <= 0) continue
      if (bestIdx === -1) { bestIdx = i; continue }
      const bestRung = QUALITY_LADDER.indexOf(pool[bestIdx])
      if (upgrading ? rung < bestRung : rung > bestRung) bestIdx = i
    }
    if (bestIdx === -1) break  // every die already at the ceiling / floor
    pool[bestIdx] = adjustDie(pool[bestIdx], upgrading ? 1 : -1)
  }
  return pool
}

// ─── Rolling ────────────────────────────────────────────────────────────────

/** One die after rolling. */
export interface RolledAdversaryDie { die: AdversaryDie; value: number }

/** Result of an adversary check. No flaw ⚠️; `fives` drives ⭐ Repérez X 5. */
export interface AdversaryRollResult {
  /** The kept dice (their quality), post-adjustment. */
  dice:   AdversaryDie[]
  /** Face value of each kept die, aligned with `dice`. */
  values: number[]
  /** Sum of the kept dice (0–20). */
  total:  number
  /** Number of kept dice showing a 5 (⭐ Repérez X 5). */
  fives:  number
}

/** Roll a single adversary die, returning a random face value. */
export function rollAdversaryDie(die: AdversaryDie): number {
  const faces = ADVERSARY_FACES[die]
  return faces[Math.floor(Math.random() * faces.length)]
}

/**
 * Score a set of already-rolled dice (pure — no RNG).
 *
 * Keep-4 rule: pools of 4 or fewer keep every die; larger pools (power tiers
 * beyond Élite add dice) keep the four highest values. The total is the sum of
 * the kept dice; `fives` counts the 5s among the kept dice only.
 */
export function scoreAdversaryRoll(rolled: RolledAdversaryDie[]): AdversaryRollResult {
  const kept = rolled.length <= 4
    ? rolled
    : [...rolled].sort((a, b) => b.value - a.value).slice(0, 4)
  return {
    dice:   kept.map(r => r.die),
    values: kept.map(r => r.value),
    total:  kept.reduce((sum, r) => sum + r.value, 0),
    fives:  kept.filter(r => r.value === 5).length,
  }
}

/**
 * Roll an adversary pool and score it.
 *
 * @param dice  The creature's dice (from its fiche, or DICE_BY_POWER[tier]).
 * @param opts  Advantage / disadvantage from the guard-type matchup: each 🟩
 *              upgrades one die's quality by a rung, each 🟥 downgrades one.
 */
export function rollAdversary(
  dice: AdversaryDie[],
  opts: { advantages?: number; disadvantages?: number } = {},
): AdversaryRollResult {
  const net      = (opts.advantages ?? 0) - (opts.disadvantages ?? 0)
  const adjusted = net === 0 ? dice : adjustPoolQuality(dice, net)
  const rolled   = adjusted.map(die => ({ die, value: rollAdversaryDie(die) }))
  return scoreAdversaryRoll(rolled)
}
