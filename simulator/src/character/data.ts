import type { CharacteristicName, SkillName, Character } from './types'

/** Maps each skill to its parent characteristic */
export const SKILL_PARENT: Record<SkillName, CharacteristicName> = {
  power:        'strength',
  robustness:   'strength',
  precision:    'agility',
  mobility:     'agility',
  endurance:    'vigor',
  recovery:     'vigor',
  composure:    'grace',
  disguise:     'grace',
  observation:  'acuity',
  vigilance:    'acuity',
  authority:    'willpower',
  discipline:   'willpower',
  logic:        'intelligence',
  reactivity:   'intelligence',
  conviction:   'tenacity',
  resilience:   'tenacity',
  eloquence:    'charisma',
  manipulation: 'charisma',
  foresight:    'lucidity',
  intuition:    'lucidity',
}

/** All characteristic names in display order */
export const ALL_CHARACTERISTICS: CharacteristicName[] = [
  'strength', 'agility', 'vigor', 'grace', 'acuity',
  'willpower', 'intelligence', 'tenacity', 'charisma', 'lucidity',
]

/** All skill names in display order */
export const ALL_SKILLS: SkillName[] = [
  'power', 'robustness',
  'precision', 'mobility',
  'endurance', 'recovery',
  'composure', 'disguise',
  'observation', 'vigilance',
  'authority', 'discipline',
  'logic', 'reactivity',
  'conviction', 'resilience',
  'eloquence', 'manipulation',
  'foresight', 'intuition',
]

/** Maps each characteristic to its two skills (in display order) */
export const CARAC_SKILLS: Record<CharacteristicName, [SkillName, SkillName]> = {
  strength:     ['power',      'robustness'],
  agility:      ['precision',  'mobility'],
  vigor:        ['endurance',  'recovery'],
  grace:        ['composure',  'disguise'],
  acuity:       ['observation','vigilance'],
  willpower:    ['authority',  'discipline'],
  intelligence: ['logic',      'reactivity'],
  tenacity:     ['conviction', 'resilience'],
  charisma:     ['eloquence',  'manipulation'],
  lucidity:     ['foresight',  'intuition'],
}

/** Physical characteristics (can receive blessures graves) */
export const PHYSICAL_CHARACTERISTICS: CharacteristicName[] =
  ['strength', 'agility', 'vigor', 'grace', 'acuity']

/** Mental characteristics (can receive trauma) */
export const MENTAL_CHARACTERISTICS: CharacteristicName[] =
  ['willpower', 'intelligence', 'tenacity', 'charisma', 'lucidity']

/** French display names for characteristics (used in display/UI) */
export const CHARACTERISTIC_LABEL: Record<CharacteristicName, string> = {
  strength:     'Force',
  agility:      'Agilité',
  vigor:        'Vigueur',
  grace:        'Grâce',
  acuity:       'Acuité',
  willpower:    'Volonté',
  intelligence: 'Intelligence',
  tenacity:     'Ténacité',
  charisma:     'Charisme',
  lucidity:     'Lucidité',
}

/** French display names for skills */
export const SKILL_LABEL: Record<SkillName, string> = {
  power:        'Puissance',
  robustness:   'Robustesse',
  precision:    'Précision',
  mobility:     'Mobilité',
  endurance:    'Endurance',
  recovery:     'Récupération',
  composure:    'Prestance',
  disguise:     'Mascarade',
  observation:  'Observation',
  vigilance:    'Vigilance',
  authority:    'Autorité',
  discipline:   'Discipline',
  logic:        'Logique',
  reactivity:   'Réactivité',
  conviction:   'Conviction',
  resilience:   'Résilience',
  eloquence:    'Éloquence',
  manipulation: 'Manipulation',
  foresight:    'Clairvoyance',
  intuition:    'Intuition',
}

/**
 * Valeur d'une caractéristique DÉRIVÉE de ses deux compétences (§ personnages,
 * rules/fr/core/personnages.md). Les caractéristiques ne s'achètent jamais
 * directement : base 1, +1 quand une compétence associée atteint le rang 2, +1
 * de plus au rang 4 — le tout plafonné à 5. La valeur ne peut donc pas diverger
 * des rangs pratiqués (ex. : Vigueur 2 EXIGE une compétence Endurance/Récup ≥ 2).
 */
export function deriveCharacteristicValue(skillA: number, skillB: number): number {
  const milestones = (s: number) => (s >= 2 ? 1 : 0) + (s >= 4 ? 1 : 0)
  return Math.min(5, 1 + milestones(skillA) + milestones(skillB))
}

/** Base character: all characteristics = 1, all skills = 0, no wounds */
export const BASE_CHARACTER: Pick<Character, 'characteristics' | 'skills'> = {
  characteristics: Object.fromEntries(
    ALL_CHARACTERISTICS.map(c => [c, { value: 1, wounds: 0 }])
  ) as Record<CharacteristicName, { value: number; wounds: number }>,
  skills: Object.fromEntries(
    ALL_SKILLS.map(s => [s, 0])
  ) as Record<SkillName, number>,
}
