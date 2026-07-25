import type {
  Character, CharacteristicName, SkillName,
  PeopleChoice, OriginChoice, TrainingChoice,
  DerivedStats, ValidationResult,
} from './types'
import type { RollParams } from '../types'
import { SKILL_PARENT, ALL_CHARACTERISTICS, ALL_SKILLS, BASE_CHARACTER, PHYSICAL_CHARACTERISTICS } from './data'
import { validateTraits } from './traits'
import { validatePerks } from './disciplines'

// ─── Construction ────────────────────────────────────────────────────────────

/**
 * Creates a base character: all characteristics = 1, all skills = 0.
 * This is the starting point before applying people/origin/training bonuses.
 */
export function createCharacter(name: string): Character {
  return {
    name,
    characteristics: structuredClone(BASE_CHARACTER.characteristics),
    skills:          structuredClone(BASE_CHARACTER.skills),
  }
}

/**
 * Applies a people bonus (+caracs, +skills).
 * Creation bonus — does NOT trigger the rank-2/4 characteristic auto-increase.
 */
export function applyPeople(char: Character, people: PeopleChoice): Character {
  let result: Character = { ...char, people }
  result = applyCharacteristicBonus(result, people.caracs)
  result = applySkillBonus(result, people.skills)
  return result
}

/**
 * Applies an origin bonus (+caracs, +skills).
 * Creation bonus — does NOT trigger the rank-2/4 characteristic auto-increase.
 */
export function applyOrigin(char: Character, origin: OriginChoice): Character {
  let result: Character = { ...char, origin }
  result = applyCharacteristicBonus(result, origin.caracs)
  result = applySkillBonus(result, origin.skills)
  return result
}

/**
 * Applies a training bonus (+skills only).
 * Creation bonus — does NOT trigger the rank-2/4 characteristic auto-increase.
 */
export function applyTraining(char: Character, training: TrainingChoice): Character {
  let result: Character = { ...char, training }
  result = applySkillBonus(result, training.skills)
  return result
}

// ─── Internal helpers (creation bonuses, no progression side-effects) ────────

function applyCharacteristicBonus(
  char: Character,
  caracs: CharacteristicName[],
): Character {
  const characteristics = structuredClone(char.characteristics)
  for (const c of caracs) {
    characteristics[c] = {
      ...characteristics[c],
      value: Math.min(5, characteristics[c].value + 1),
    }
  }
  return { ...char, characteristics }
}

function applySkillBonus(
  char: Character,
  skills: SkillName[],
): Character {
  const newSkills = { ...char.skills }
  for (const s of skills) {
    newSkills[s] = Math.min(5, newSkills[s] + 1)
  }
  return { ...char, skills: newSkills }
}

// ─── Progression ─────────────────────────────────────────────────────────────

/**
 * Adds 1 progression point to a skill.
 *
 * Per the rules (section "Progression"):
 *   - When a skill reaches rank 2 or 4, its parent characteristic gains +1 (capped at 5).
 *
 * This is distinct from creation bonuses (applySkillBonus), which do not trigger
 * the characteristic auto-increase.
 */
export function addSkillPoint(char: Character, skill: SkillName): Character {
  const current = char.skills[skill]
  if (current >= 5) return char  // already at max

  const newRank = current + 1
  const newSkills = { ...char.skills, [skill]: newRank }

  // Auto-increase parent characteristic at rank 2 and 4
  const parent = SKILL_PARENT[skill]
  const shouldIncrease = newRank === 2 || newRank === 4
  const characteristics = shouldIncrease
    ? {
        ...char.characteristics,
        [parent]: {
          ...char.characteristics[parent],
          value: Math.min(5, char.characteristics[parent].value + 1),
        },
      }
    : char.characteristics

  return { ...char, skills: newSkills, characteristics }
}

// ─── Derived stats ────────────────────────────────────────────────────────────

/**
 * Computes derived stats from the current character sheet.
 * Uses effective characteristic values (value - wounds) where relevant.
 */
export function computeDerived(char: Character): DerivedStats {
  const eff = (c: CharacteristicName) =>
    Math.max(0, char.characteristics[c].value - char.characteristics[c].wounds)

  return {
    maxHealth:           PHYSICAL_CHARACTERISTICS.reduce((sum, c) => sum + char.characteristics[c].value, 0),
    currentHealth:       PHYSICAL_CHARACTERISTICS.reduce((sum, c) => sum + eff(c), 0),
    resistanceThreshold: eff('vigor') + char.skills.robustness,
    maxStability:        eff('tenacity') + char.skills.discipline,
    carryCapacity:       2 + eff('strength') + char.skills.robustness,
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates all characteristic and skill values are within [0, 5], and that the
 * traits carried are ones the progression actually opens (§ traits.md — rangs 3
 * et 5). Même exigence que le reste du loader : une fiche ne peut pas être
 * incohérente.
 */
export function validateCharacter(char: Character): ValidationResult {
  const errors: string[] = []

  for (const c of ALL_CHARACTERISTICS) {
    const { value, wounds } = char.characteristics[c]
    if (!Number.isInteger(value) || value < 0 || value > 5)
      errors.push(`Characteristic "${c}" value ${value} is out of range [0, 5]`)
    if (!Number.isInteger(wounds) || wounds < 0 || wounds > value)
      errors.push(`Characteristic "${c}" wounds ${wounds} is invalid (must be 0–${value})`)
  }

  for (const s of ALL_SKILLS) {
    const v = char.skills[s]
    if (!Number.isInteger(v) || v < 0 || v > 5)
      errors.push(`Skill "${s}" value ${v} is out of range [0, 5]`)
  }

  errors.push(...validateTraits(char.traits ?? [], char.skills))

  // Atouts de discipline : prérequis, résolution des choix de skillTag, et rang
  // investi ≤ cap débloqué. Les prérequis carac lisent la valeur de BUILD.
  const caracValues = {} as Record<CharacteristicName, number>
  for (const c of ALL_CHARACTERISTICS) caracValues[c] = char.characteristics[c].value
  errors.push(...validatePerks(
    char.perks ?? [], char.skillTags ?? [], char.disciplines ?? {}, caracValues,
  ))

  return { valid: errors.length === 0, errors }
}

// ─── Roll integration bridge ──────────────────────────────────────────────────

/**
 * Extracts RollParams from a character's current sheet.
 * Uses the effective characteristic value (value - wounds).
 *
 * @example
 * const params = getRollParams(lena, 'strength', 'power')
 * const result = makeRoll(params)
 */
export function getRollParams(
  char: Character,
  characteristic: CharacteristicName,
  skill: SkillName,
  opts: Pick<RollParams, 'advantages' | 'disadvantages' | 'sacrifices' | 'skillBoosts'> = {},
): RollParams {
  const effectiveChar = Math.max(
    0,
    char.characteristics[characteristic].value - char.characteristics[characteristic].wounds,
  )
  return {
    characteristic: effectiveChar,
    skill: char.skills[skill],
    ...opts,
  }
}
