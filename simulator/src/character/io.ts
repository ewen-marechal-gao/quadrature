import { readFile, writeFile } from 'fs/promises'
import { stringify, parse } from 'yaml'
import type {
  Character, CharacteristicName, SkillName,
  PeopleChoice, OriginChoice, TrainingChoice,
} from './types'
import { ALL_CHARACTERISTICS, ALL_SKILLS, CARAC_SKILLS } from './data'
import { validateCharacter } from './character'

// ─── YAML shape (matches the human-readable format) ──────────────────────────

interface YamlCharacteristicBlock {
  value:  number
  wounds: number
  [skill: string]: number   // the 2 skills belonging to this characteristic
}

interface YamlInventory {
  /** Base protection points 🛡️ from armor/equipment */
  protection?: number
}

interface YamlShape {
  name:       string
  inventory?: YamlInventory
  people?:    { name: string; caracs: string[]; skills: string[] }
  origin?:    { caracs: string[]; skills: string[] }
  training?:  { skills: string[] }
  characteristics: Record<string, YamlCharacteristicBlock>
}

// ─── Serialisation ────────────────────────────────────────────────────────────

/**
 * Converts a Character to its YAML string representation.
 * Skills are nested under their parent characteristic for readability.
 */
export function serializeToYaml(char: Character): string {
  const characteristicsBlock: Record<string, YamlCharacteristicBlock> = {}

  for (const c of ALL_CHARACTERISTICS) {
    const state  = char.characteristics[c]
    const [s1, s2] = CARAC_SKILLS[c]
    characteristicsBlock[c] = {
      value:  state.value,
      wounds: state.wounds,
      [s1]: char.skills[s1],
      [s2]: char.skills[s2],
    }
  }

  const inventoryBlock: YamlInventory = {}
  if ((char.protection ?? 0) > 0) inventoryBlock.protection = char.protection

  const yamlObj: YamlShape = {
    name: char.name,
    ...(Object.keys(inventoryBlock).length > 0 && { inventory: inventoryBlock }),
    ...(char.people   && { people:   char.people }),
    ...(char.origin   && { origin:   char.origin }),
    ...(char.training && { training: char.training }),
    characteristics: characteristicsBlock,
  }

  return stringify(yamlObj, { lineWidth: 0 })
}

// ─── Deserialisation ──────────────────────────────────────────────────────────

/**
 * Parses a YAML string into a Character.
 * Throws if required fields are missing or values are invalid.
 */
export function deserializeFromYaml(yamlStr: string): Character {
  const raw = parse(yamlStr) as YamlShape

  if (!raw?.name || typeof raw.name !== 'string')
    throw new Error('Character YAML is missing required field "name"')
  if (!raw.characteristics)
    throw new Error('Character YAML is missing required field "characteristics"')

  // Characteristics & skills
  const characteristics = {} as Record<CharacteristicName, { value: number; wounds: number }>
  const skills          = {} as Record<SkillName, number>

  for (const c of ALL_CHARACTERISTICS) {
    const block = raw.characteristics[c]
    if (!block) throw new Error(`Missing characteristic block "${c}" in YAML`)

    characteristics[c] = {
      value:  Number(block.value  ?? 0),
      wounds: Number(block.wounds ?? 0),
    }

    for (const s of CARAC_SKILLS[c]) {
      skills[s] = Number(block[s] ?? 0)
    }
  }

  const protection = raw.inventory?.protection
    ? Number(raw.inventory.protection)
    : undefined

  const char: Character = {
    name: raw.name,
    ...(raw.people    && { people:     raw.people   as PeopleChoice }),
    ...(raw.origin    && { origin:     raw.origin   as OriginChoice }),
    ...(raw.training  && { training:   raw.training as TrainingChoice }),
    ...(protection != null && protection > 0 && { protection }),
    characteristics,
    skills,
  }

  const validation = validateCharacter(char)
  if (!validation.valid)
    throw new Error(`Invalid character data:\n  ${validation.errors.join('\n  ')}`)

  return char
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

/** Saves a character sheet to a YAML file */
export async function saveCharacter(char: Character, filePath: string): Promise<void> {
  await writeFile(filePath, serializeToYaml(char), 'utf-8')
}

/** Loads a character sheet from a YAML file */
export async function loadCharacter(filePath: string): Promise<Character> {
  const content = await readFile(filePath, 'utf-8')
  return deserializeFromYaml(content)
}
