/**
 * Public API for the Quadrature dice simulator.
 *
 * Quick start — rolls:
 *   import { makeRoll, formatResult } from './index'
 *   const result = makeRoll({ characteristic: 3, skill: 2 })
 *   console.log(formatResult(result))
 *
 * Quick start — characters:
 *   import { createCharacter, applyPeople, getRollParams, makeRoll } from './index'
 *   const char = applyPeople(createCharacter('Lena'), { name: 'Peuple des arbres', caracs: ['strength', 'grace'], skills: ['power'] })
 *   const result = makeRoll(getRollParams(char, 'strength', 'power'))
 */

export type { DieType, DieResult, PoolRolls, RollResult, RollParams } from './types'
export { FACES, EMOJI, rollDie } from './dieSystem'
export type { DicePool } from './dieSystem'
export { buildPool } from './dieSystem'
export { rollPool, rerollDice, computeResult, roll } from './dieSystem'
export { formatPool, formatRolls, formatResult, interpretScore } from './dieSystem'

import type { RollParams, RollResult } from './types'
import { buildPool, roll } from './dieSystem'

/** Shorthand: complete roll from raw parameters, no intermediate steps */
export function makeRoll(params: RollParams): RollResult {
  return roll(buildPool(params))
}

// ─── Character module ─────────────────────────────────────────────────────────
export type {
  CharacteristicName, SkillName,
  CharacteristicState,
  PeopleChoice, OriginChoice, TrainingChoice,
  Character, DerivedStats, ValidationResult,
} from './character/index'

export {
  SKILL_PARENT, ALL_CHARACTERISTICS, ALL_SKILLS,
  PHYSICAL_CHARACTERISTICS, MENTAL_CHARACTERISTICS,
  CHARACTERISTIC_LABEL, SKILL_LABEL,
  CARAC_SKILLS,
  createCharacter,
  applyPeople, applyOrigin, applyTraining,
  addSkillPoint,
  computeDerived,
  validateCharacter,
  getRollParams,
  formatCharacter,
  serializeToYaml, deserializeFromYaml,
  saveCharacter, loadCharacter,
} from './character/index'
