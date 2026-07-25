import { readFile, writeFile } from 'fs/promises'
import { stringify, parse } from 'yaml'
import type {
  Character, CharacteristicName, SkillName,
  PeopleChoice, OriginChoice, TrainingChoice,
} from './types'
import { ALL_CHARACTERISTICS, ALL_SKILLS, CARAC_SKILLS, deriveCharacteristicValue } from './data'
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
  /** Ids de traits portés (§ traits.md) — voir character/traits.ts. */
  traits?:    string[]
  /** Rangs de discipline investis (§ disciplines/) — voir character/disciplines.ts. */
  disciplines?: Record<string, number>
  /** Ids d'atouts de discipline portés (les « perks »). */
  perks?:     string[]
  /** Choix de build enregistrés (arme de prédilection, style…). */
  skillTags?: string[]
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
      // La valeur affichée est TOUJOURS dérivée des rangs (source unique).
      value:  deriveCharacteristicValue(char.skills[s1], char.skills[s2]),
      wounds: state.wounds,
      [s1]: char.skills[s1],
      [s2]: char.skills[s2],
    }
  }

  const inventoryBlock: YamlInventory = {}
  if ((char.protection ?? 0) > 0) inventoryBlock.protection = char.protection

  const yamlObj: YamlShape = {
    name: char.name,
    ...(char.traits && char.traits.length > 0 && { traits: char.traits }),
    ...(char.disciplines && Object.keys(char.disciplines).length > 0 && { disciplines: char.disciplines as Record<string, number> }),
    ...(char.perks && char.perks.length > 0 && { perks: char.perks }),
    ...(char.skillTags && char.skillTags.length > 0 && { skillTags: char.skillTags }),
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

    const [s1, s2] = CARAC_SKILLS[c]
    skills[s1] = Number(block[s1] ?? 0)
    skills[s2] = Number(block[s2] ?? 0)

    // La valeur de caractéristique est DÉRIVÉE des compétences (jamais lue de la
    // fiche : le champ `value` n'est qu'un aide-lecture). Une fiche ne peut donc
    // plus être incohérente (§ personnages : les caracs ne s'achètent pas).
    characteristics[c] = {
      value:  deriveCharacteristicValue(skills[s1], skills[s2]),
      wounds: Number(block.wounds ?? 0),
    }
  }

  const protection = raw.inventory?.protection
    ? Number(raw.inventory.protection)
    : undefined

  const char: Character = {
    name: raw.name,
    ...(Array.isArray(raw.traits) && raw.traits.length > 0 && { traits: raw.traits.map(String) }),
    ...(raw.disciplines && Object.keys(raw.disciplines).length > 0 && {
      disciplines: Object.fromEntries(
        Object.entries(raw.disciplines).map(([d, n]) => [d, Number(n)]),
      ) as Character['disciplines'],
    }),
    ...(Array.isArray(raw.perks) && raw.perks.length > 0 && { perks: raw.perks.map(String) }),
    ...(Array.isArray(raw.skillTags) && raw.skillTags.length > 0 && { skillTags: raw.skillTags.map(String) }),
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
