/**
 * All types for the Quadrature combat simulation module.
 *
 * Design principles:
 *  - Effects are pure data (CombatEffect[]), never applied in-place
 *  - Resolution always reads from snapshots, never live state
 *  - CombatLog is self-contained and serialisable to JSON for /combatReports
 */

import type { Character, CharacteristicName, SkillName, CharacteristicState } from '../character/types'
import type { RollResult } from '../types'

// ─── Mental state track ───────────────────────────────────────────────────────

/**
 * 7-state mental track ordered from most aggressive (index 0) to most fearful (index 6).
 * Default starting state: 'focused' (index 3).
 * 'focused' grants +1 reaction token per round.
 */
export type MentalState =
  | 'enraged'     // +3 — Enragé
  | 'furious'     // +2 — Furieux
  | 'aggressive'  // +1 — Agressif
  | 'focused'     // 0 — Concentré  ← default
  | 'cautious'    // -1 — Prudent
  | 'panicked'    // -2 — Paniqué
  | 'terrified'   // -3 — Terrorisé

/** Ordered track — use the index for shifting */
export const MENTAL_STATES: MentalState[] = [
  'enraged', 'furious', 'aggressive', 'focused', 'cautious', 'panicked', 'terrified',
]

// ─── Status effects ───────────────────────────────────────────────────────────

export type StatusEffect =
  | 'hemorrhage'    // 🩸 Hémorragie  : stacking (n tokens); prevents Protection on wound overflow
  | 'stunned'       // 💫 Sonné       : −1 PA next round
  | 'knockdown'     // 🔻 À terre     : −1 PA next round (must spend action to stand)
  | 'winded'        // 💨 Essoufflé   : cannot use 🔴 token (endPlayerRound actions blocked)
  | 'incapacitated' // ❌ Incapacité  : out of combat (fatigue ≥ 20)
  | 'near-death'    // 😵 Aux portes de la Mort : out of combat (all physical characteristics at 0)

// ─── Action economy ───────────────────────────────────────────────────────────

/**
 * Cost of a single action.
 *
 * Each round a combatant receives 3 Points d'Action: 🟢⚫🔴.
 * All three count as PA (actions) and can pay any ⚫ cost,
 * but 🟢 may only be spent on the FIRST action and 🔴 only on the LAST.
 *
 * - actions       : total PA spent (from the 3-PA pool)
 * - reactions     : ⚡ reactions spent (for guards and reaction-mode actions)
 * - endPlayerRound: action requires and consumes the 🔴 token → ends this combatant's round
 * - fatigue       : 💧 fatigue points spent as part of the cost (not damage)
 */
export interface ActionCost {
  actions:        number   // PA spent (1 or 2 for most actions)
  reactions:      number   // ⚡ spent
  endPlayerRound: boolean  // requires 🔴 → no further actions after this
  fatigue?:       number   // 💧 optional fatigue cost
}

// ─── Action and guard identifiers ─────────────────────────────────────────────

export type ActionId =
  | 'armed-attack'   // Attaque armée    — initiative 5, 2 PA
  | 'unarmed-attack' // Attaque à mains nues — initiative 3, 1 PA
  | 'brutal-strike'  // Frappe brutale   — initiative 6, 2 PA + 1💧
  | 'sharp-strike'   // Frappe vive      — initiative 3, 1 PA + 1💧
  | 'respiration'    // Respiration      — initiative 1, 1 PA (🟢 — must be first action)
  | 'stabilize'      // Stabiliser       — initiative 1, 1 PA (🟢 — must be first action)

export type GuardId =
  | 'absorb' // Encaisser — Récupération + Vigueur    (always available)
  | 'dodge'  // Esquive   — Mobilité + Agilité         (blocked if entrapped)
  | 'parry'  // Parade    — Vigilance + Acuité          (needs weapon)
  | 'block'  // Blocage   — Robustesse + Force          (needs shield)

// ─── Combatant in-combat state ─────────────────────────────────────────────────

/** Full mutable state of a combatant during a fight */
export interface CombatantState {
  /** Unique identifier (typically the character's name) */
  id: string
  /** Immutable original character sheet — never modified during combat */
  char: Character
  /** Working copy of characteristic states; heavy wounds accumulate here */
  characteristics: Record<CharacteristicName, CharacteristicState>
  /** Working copy of skill values */
  skills: Record<SkillName, number>
  /** Light wounds accumulated this round 💢 */
  lightWounds: number
  /** Running total of heavy wounds received 💔 (for log + DC calculations) */
  heavyWounds: number
  /** Current fatigue level 💧 (0–20; ≥ 20 = incapacitated) */
  fatigue: number
  /** Current position on the mental state track */
  mentalState: MentalState
  /** Active status effects */
  status: StatusEffect[]

  // ── Protection ──────────────────────────────────────────────────────────────
  /**
   * Remaining base protection points 🛡️ (from armor/equipment).
   * Each point absorbs one incoming heavy wound 💔 (consumed on use).
   * Hemorrhage bypasses this pool entirely (§Hémorragie).
   */
  protection:     number
  /**
   * Remaining temporary protection points 🛡️ — consumed before base protection.
   * Granted by Block critical; cleared at round-end cleanup whether used or not.
   */
  tempProtection: number

  // ── Action economy ──────────────────────────────────────────────────────────
  /** Remaining Points d'Action this round (starts at 3: one 🟢 + one ⚫ + one 🔴) */
  actions:           number
  /** True once any action has been played — 🟢-requiring actions no longer available */
  firstActionPlayed: boolean
  /** True once a 🔴-requiring action is played — no further actions this round */
  lastActionPlayed:  boolean
  /** Remaining reaction tokens this round ⚡ */
  reactions:         number
  /** Maximum reactions per round (reactivity skill + bonuses, fixed at combat start) */
  maxReactions:      number
}

// ─── Effects ──────────────────────────────────────────────────────────────────

/**
 * A single discrete combat effect — pure data, applied by `applyEffects()`.
 * All effects carry a `targetId` so they can be batch-applied to any state map.
 */
export type CombatEffect = { targetId: string } & (
  | { kind: 'light-wound';    amount: number }
  | { kind: 'heavy-wound' }
  | { kind: 'heal-wounds';    amount: number }  // reduce lightWounds (floor 0)
  | { kind: 'add-fatigue';    amount: number }
  | { kind: 'remove-fatigue'; amount: number }
  | { kind: 'add-status';     status: StatusEffect }
  | { kind: 'remove-status';  status: StatusEffect }
  | { kind: 'spend-actions';  amount: number }  // lose PA (flaw penalty etc.)
  | { kind: 'add-reaction';   amount: number }
  | { kind: 'spend-reaction' }                  // defender uses a guard (costs 1 ⚡)
  | { kind: 'shift-mental';        direction: 'toward-terror' | 'toward-rage' | 'toward-focused' }
  | { kind: 'add-temp-protection'; amount: number }
)

// ─── Resolution records ───────────────────────────────────────────────────────

/** Complete record of one resolved action (all fields set, effects not yet applied) */
export interface ResolvedAction {
  actorId:     string
  action:      ActionId
  targetId?:   string
  /** Full roll result for the actor's check (undefined for immediate effects only) */
  checkRoll?: RollResult
  /** Guard used by the defender */
  guardId?:    GuardId
  /** Full roll result for the defender's guard */
  guardRoll?:  RollResult
  /** Score the attacker needed to beat (guard total, or fixed DC for self-actions) */
  threshold:   number
  /** Whether the actor's roll met or beat the threshold (≥) */
  hit:         boolean
  /** Critical ✴️ on the attack roll */
  critical:    boolean
  /** Flaw ⚠️ on the attack roll */
  flaw:        boolean
  /** All effects to apply, in order, once every action in the group is resolved */
  effects:     CombatEffect[]
  /** Human-readable annotations for the log */
  notes:       string[]
}

/**
 * Log entry for the phase d'entretien (maintenance phase).
 * One entry per combatant whose fatigue ≥ 10 at the start of the round.
 */
export interface MaintenanceEntry {
  actorId:   string
  /** Endurance + Vigor roll total and flags */
  roll:      RollResult
  /** Fatigue level at the time of the test (= difficulty class) */
  threshold: number
  success:   boolean
  notes:     string[]
}

/** Snapshot of a combatant's vitals at a single point in time */
export interface CombatantSnapshot {
  id:             string
  lightWounds:    number
  heavyWounds:    number
  fatigue:        number
  mentalState:    MentalState
  status:         StatusEffect[]
  /** Only characteristics that have at least 1 wound (saves space) */
  charWounds:     Partial<Record<CharacteristicName, number>>
  /** Remaining base protection points at this moment */
  protection:     number
  /** Remaining temporary protection points at this moment */
  tempProtection: number
}

/** Log entry for a single action within a phase */
export interface ActionLogEntry {
  actorId:        string
  action:         ActionId
  targetId?:      string
  checkRoll?:     RollResult
  guardId?:       GuardId
  guardRoll?:     RollResult
  threshold:      number
  hit:            boolean
  effects:        CombatEffect[]
  notes:          string[]
  /** PA (⚫) available to the actor at the start of this wave, before cost was spent */
  actorActions:   number
  /** Reactions (⚡) available to the actor at the start of this wave */
  actorReactions: number
  /** Cri de guerre, provocation ou réaction émotionnelle — visible de tous (agent LLM) */
  battleCry?:     string
  /** Raisonnement interne de l'agent — invisible à l'adversaire, affiché en grisé dans les logs */
  reasoning?:     string
}

/** All simultaneous actions sharing the same initiative value */
export interface PhaseLog {
  initiative: number
  actions:    ActionLogEntry[]
}

/** Complete log of one round */
export interface RoundLog {
  round:       number
  /** Phase d'entretien: endurance test entries (one per combatant who triggered it) */
  maintenance: MaintenanceEntry[]
  phases:      PhaseLog[]
  /** Combatant vitals after wound overflow + hemorrhage tick */
  endOfRound:  CombatantSnapshot[]
}

// ─── Combat log (top-level, written to /combatReports) ───────────────────────

export interface CombatantSummary {
  id:       string
  charName: string
  people?:  string
  origin?:  string
  /** Characteristic values at combat start */
  stats:    Record<CharacteristicName, number>
  /** Skill values at combat start */
  skills:   Record<SkillName, number>
}

export type CombatOutcome =
  | { kind: 'victor';               victorId: string; rounds: number }
  | { kind: 'mutual-incapacitation';                  rounds: number }
  | { kind: 'max-rounds-reached';                     rounds: number }

/**
 * Complete, self-contained combat log.
 * Written as JSON to combatReports/<id>.json after each simulation run.
 */
export interface CombatLog {
  /** e.g. "20260529-143022-lena-vs-kevin" */
  id:         string
  /** ISO 8601 timestamp */
  timestamp:  string
  combatants: CombatantSummary[]
  rounds:     RoundLog[]
  outcome:    CombatOutcome
  durationMs: number
}
