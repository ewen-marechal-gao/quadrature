/**
 * Core types for the Quadrature dice simulator.
 */

/** The 7 die types in the Quadrature system */
export type DieType =
  | 'characteristic'  // 🟦 Blue   : faces 0-5, uniform
  | 'skill'           // 🟨 Yellow : faces 0-5, uniform
  | 'advantage'       // 🟩 Green  : faces 0-5, uniform (favorable wild)
  | 'disadvantage'    // 🟥 Red    : faces 0-5, uniform (unfavorable wild)
  | 'wild'            // ⬜ White  : faces 0-5, uniform (always present)
  | 'reinforced'      // 🟫 Gold   : faces 1,2,3,4,5,5  (never flaw; critical x2)
  | 'weakened'        // 🟪 Purple : faces 0,0,1,2,3,4  (flaw x2; never critical)

/** A single die after rolling */
export interface DieResult {
  type: DieType
  value: number
}

/** All dice results after the initial roll (before selection) */
export interface PoolRolls {
  characteristic: DieResult[]
  skill: DieResult[]
  wild: DieResult[]
}

/** Final result of a roll (4 kept dice + score + effects) */
export interface RollResult {
  /** All dice that were rolled */
  rolls: PoolRolls
  /** The 4 dice kept for the final score */
  kept: {
    characteristic: DieResult
    skill: [DieResult, DieResult]
    wild: DieResult
  }
  /** Total score (0–20) */
  total: number
  /** ⚠️ Flaw: at least one of the 2 kept skill dice = 0 */
  flaw: boolean
  /** ✴️ Critical: at least one of the 2 kept skill dice = 5 */
  critical: boolean
  /** For logging purposes: was this roll made with advantage, disadvantage, or neither? */
  wild: 'advantage' | 'disadvantage' | 'none'
}

/** Input parameters for building a dice pool */
export interface RollParams {
  /** Characteristic value used (0–5) */
  characteristic: number
  /** Skill value used (0–5) */
  skill: number
  /** Advantage dice 🟩 added before cancellation */
  advantages?: number
  /** Disadvantage dice 🟥 added before cancellation */
  disadvantages?: number
  /**
   * Sacrifice 🟦 dice to boost 🟪 skill dice (⛞).
   * Requires ≥ 2 characteristic dice per sacrifice.
   */
  sacrifices?: number
  /**
   * Boost skill dice via traits (⬆): 🟨 → 🟫 only.
   * Note: weakened 🟪 dice cannot be upgraded this way —
   * use sacrifices (⛞) to upgrade 🟪 → 🟨.
   */
  skillBoosts?: number
}
