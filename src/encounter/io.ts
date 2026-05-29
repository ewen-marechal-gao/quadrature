/**
 * File I/O for Quadrature encounter YAML files.
 */

import path            from 'path'
import { readFile }    from 'fs/promises'
import { parse }       from 'yaml'
import type { EncounterConfig, EncounterFaction, EncounterCharacter, AgentType } from './types'

/** Absolute path to the simulator root (directory containing package.json) */
export const SIMULATOR_ROOT = path.resolve(__dirname, '..', '..')

/**
 * Resolve a character sheet path written in an encounter YAML.
 * Paths are relative to the simulator root.
 *
 * Example: "characterSheets/Brawler_powerful.yaml"
 *   → "<simulator-root>/characterSheets/Brawler_powerful.yaml"
 */
export function resolveCharacterPath(relativePath: string): string {
  return path.resolve(SIMULATOR_ROOT, relativePath)
}

/**
 * Load and validate an encounter YAML file.
 *
 * Minimal structural validation only — character sheet validity is checked
 * separately when each sheet is loaded via `loadCharacter`.
 *
 * @throws if required fields are missing or faction count ≠ 2
 */
export async function loadEncounter(filePath: string): Promise<EncounterConfig> {
  const content = await readFile(filePath, 'utf-8')
  const raw = parse(content) as EncounterConfig

  // ── Required top-level fields ──────────────────────────────────────────────
  if (!raw?.name || typeof raw.name !== 'string')
    throw new Error(`Encounter YAML missing required field "name" in: ${filePath}`)
  if (!raw.maxRounds || typeof raw.maxRounds !== 'number')
    throw new Error(`Encounter YAML missing required field "maxRounds" in: ${filePath}`)
  if (!Array.isArray(raw.factions) || raw.factions.length !== 2)
    throw new Error(`Encounter YAML must define exactly 2 factions in: ${filePath}`)

  // ── Per-faction validation ─────────────────────────────────────────────────
  const VALID_AGENT_TYPES: AgentType[] = ['scripted', 'llm']

  for (const faction of raw.factions as EncounterFaction[]) {
    if (!faction.name || typeof faction.name !== 'string')
      throw new Error(`Encounter faction missing required field "name" in: ${filePath}`)
    if (!Array.isArray(faction.characters) || faction.characters.length === 0)
      throw new Error(`Faction "${faction.name}" must list at least one character in: ${filePath}`)

    // ── Per-character validation ─────────────────────────────────────────────
    for (const char of faction.characters as EncounterCharacter[]) {
      if (!char.sheet || typeof char.sheet !== 'string')
        throw new Error(
          `A character in faction "${faction.name}" is missing required field "sheet" in: ${filePath}`
        )
      if (!char.persona)
        throw new Error(
          `Character "${char.sheet}" in faction "${faction.name}" is missing required field "persona" in: ${filePath}`
        )
      if (char.agent !== undefined && !VALID_AGENT_TYPES.includes(char.agent))
        throw new Error(
          `Character "${char.sheet}" has invalid agent type "${char.agent}" — expected one of: ${VALID_AGENT_TYPES.join(', ')} in: ${filePath}`
        )
    }

    // allowedActions is optional; default to empty (= no restriction)
    if (!Array.isArray(faction.allowedActions)) {
      faction.allowedActions = []
    }
  }

  return raw
}
