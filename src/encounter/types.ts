/**
 * Types for Quadrature encounter scenarios.
 *
 * An encounter YAML file fully describes a combat scenario:
 *  - Combatant roster per faction (references to character sheet files)
 *  - Tactical persona per faction
 *  - Allowed actions per faction (scenario-level rule restriction)
 *  - Maximum round count
 *
 * Two factions is the current constraint; multi-faction is a future extension.
 */

import type { ActionId } from '../combat/types'
import type { AgentPersona } from '../combat/agent'

// ─── Faction ──────────────────────────────────────────────────────────────────

export interface EncounterFaction {
  /** Display name of this side (used in console output) */
  name: string

  /** Tactical personality driving action choices */
  persona: AgentPersona

  /**
   * Paths to character sheet YAML files, relative to the simulator root.
   * Currently only the first character is used in 1v1 simulations.
   */
  characters: string[]

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
