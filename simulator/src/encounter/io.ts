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
      const hasSheet     = typeof char.sheet === 'string' && char.sheet.length > 0
      const hasAdversary = typeof char.adversary === 'string' && char.adversary.length > 0

      if (hasSheet === hasAdversary)
        throw new Error(
          `A character in faction "${faction.name}" must set exactly one of "sheet" | "adversary" in: ${filePath}`
        )

      if (hasAdversary) {
        // Adversaries are scripted: persona/agent do not apply.
        if (char.persona !== undefined || char.agent !== undefined)
          throw new Error(
            `Adversary "${char.adversary}" in faction "${faction.name}" must not set "persona" or "agent" (scripted deck heuristic) in: ${filePath}`
          )
        continue
      }

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

  validateBoard(raw, filePath)

  return raw
}

/**
 * Enforce the all-or-nothing rule on positions (§ EncounterConfig.board), plus
 * the two invariants the mat cannot express: every figure stands ON the board,
 * and no two share a square.
 *
 * Strict on purpose. A silently half-placed encounter would be worse than a
 * loud failure: the unplaced fighters would be both unreachable and un-gated,
 * and the numbers would look plausible.
 */
function validateBoard(raw: EncounterConfig, filePath: string): void {
  const chars = raw.factions.flatMap(f => f.characters as EncounterCharacter[])
  const named = (c: EncounterCharacter) => c.sheet ?? c.adversary ?? '?'

  if (!raw.board) {
    const placed = chars.find(c => c.pos)
    if (placed)
      throw new Error(
        `"${named(placed)}" declares a starting "pos" but the encounter has no "board" — ` +
        `add a board, or drop the positions, in: ${filePath}`
      )
    return
  }

  const { width, height } = raw.board
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error(`Encounter "board" must have integer width/height ≥ 1 in: ${filePath}`)

  const taken = new Map<string, string>()
  for (const c of chars) {
    const p = c.pos
    if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y))
      throw new Error(
        `"${named(c)}" needs an integer starting "pos: { x, y }" — the encounter declares a board, ` +
        `so every combatant must be placed, in: ${filePath}`
      )
    if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height)
      throw new Error(
        `"${named(c)}" starts at (${p.x}, ${p.y}), off the ${width}×${height} board in: ${filePath}`
      )
    const key = `${p.x},${p.y}`
    const other = taken.get(key)
    if (other)
      throw new Error(
        `"${named(c)}" and "${other}" both start on (${p.x}, ${p.y}) — two figures cannot share a square, in: ${filePath}`
      )
    taken.set(key, named(c))
  }
}
