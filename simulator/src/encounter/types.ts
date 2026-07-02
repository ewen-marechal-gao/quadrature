/**
 * Types for Quadrature encounter scenarios.
 *
 * An encounter YAML file fully describes a combat scenario:
 *  - Combatant roster per faction (character sheet + persona + agent type)
 *  - Allowed actions per faction (scenario-level rule restriction)
 *  - Maximum round count
 *
 * Two factions is the current constraint; multi-faction is a future extension.
 *
 * Agent types:
 *  - 'scripted'  Pure rule-based heuristics. Synchronous, suitable for batch.
 *  - 'llm'       Claude API via tool_use. Async, 1-run only (cost reasons).
 */

import type { ActionId } from '../combat/types'
import type { AgentPersona } from '../combat/agent'

// ─── Agent type ───────────────────────────────────────────────────────────────

/**
 * Implementation driving a combatant's decision-making.
 * Specified per character in the encounter YAML.
 * Defaults to 'scripted' when absent.
 */
export type AgentType = 'scripted' | 'llm'

// ─── Per-character config ─────────────────────────────────────────────────────

export interface EncounterCharacter {
  /**
   * Path to a character sheet YAML, relative to the simulator root.
   * Exactly one of `sheet` | `adversary` must be set.
   */
  sheet?: string

  /**
   * Adversary id — loads data/bestiary/cards/<id>.card.yaml.
   * Adversaries are scripted (deck heuristic + fixed guard); `persona` and
   * `agent` do not apply to them.
   */
  adversary?: string

  /** Tactical personality driving action choices (required for `sheet` characters) */
  persona?: AgentPersona

  /**
   * Agent implementation (sheet characters only).
   * - 'scripted' (default) — rule-based heuristics, synchronous, batch-safe
   * - 'llm'                — Claude API, async, single-run only
   */
  agent?: AgentType
}

// ─── Faction ──────────────────────────────────────────────────────────────────

export interface EncounterFaction {
  /** Display name of this side (used in console output) */
  name: string

  /**
   * Characters in this faction.
   * Each entry carries its own character sheet path, persona, and agent type.
   * Currently only the first character is used in 1v1 simulations.
   */
  characters: EncounterCharacter[]

  /**
   * Subset of ActionId that combatants in this faction may use.
   * Empty array (or field absent) = no restriction — all valid actions are available.
   *
   * Example: ['unarmed-attack', 'respiration'] for a street-fight scenario.
   */
  allowedActions: ActionId[]
}

// ─── Encounter ────────────────────────────────────────────────────────────────

export interface EncounterConfig {
  /** Short title shown in console output and included in the report filename */
  name: string

  /** Optional narrative flavour text — printed below the header */
  description?: string

  /** Round cap; the fight is a draw if neither side is defeated by this round */
  maxRounds: number

  /** Exactly two opposing factions */
  factions: [EncounterFaction, EncounterFaction]
}
