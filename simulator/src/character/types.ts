/** All 10 characteristic names */
export type CharacteristicName =
  // Corps (Body)
  | 'strength'      // Force
  | 'agility'       // Agilité
  | 'vigor'         // Vigueur
  | 'grace'         // Grâce
  | 'acuity'        // Acuité
  // Esprit (Mind)
  | 'willpower'     // Volonté
  | 'intelligence'  // Intelligence
  | 'tenacity'      // Ténacité
  | 'charisma'      // Charisme
  | 'lucidity'      // Lucidité

/** All 20 skill names */
export type SkillName =
  | 'power'         | 'robustness'    // strength
  | 'precision'     | 'mobility'      // agility
  | 'endurance'     | 'recovery'      // vigor
  | 'composure'     | 'disguise'      // grace
  | 'observation'   | 'vigilance'     // acuity
  | 'authority'     | 'discipline'    // willpower
  | 'logic'         | 'reactivity'    // intelligence
  | 'conviction'    | 'resilience'    // tenacity
  | 'eloquence'     | 'manipulation'  // charisma
  | 'foresight'     | 'intuition'     // lucidity

/** Current state of a single characteristic */
export interface CharacteristicState {
  /** Current value (0–5), includes creation bonuses + progression auto-increases */
  value: number
  /**
   * Temporary wounds to this characteristic's vital reserve.
   * Physical: caused by blessures graves once health = 0.
   * Mental: caused by trauma.
   * Effective value = value - wounds.
   */
  wounds: number
}

/** Choices made during character creation (stored for reconstruction) */
export interface PeopleChoice {
  name: string
  caracs: CharacteristicName[]  // always 2 (or 1 for sang-mêlé)
  skills: SkillName[]           // always 1 (or 2 for sang-mêlé)
}

export interface OriginChoice {
  caracs: CharacteristicName[]  // always 1
  skills: SkillName[]           // always 2
}

export interface TrainingChoice {
  skills: SkillName[]           // always 2
}

/** Full character sheet */
export interface Character {
  name: string
  people?:   PeopleChoice
  origin?:   OriginChoice
  training?: TrainingChoice
  characteristics: Record<CharacteristicName, CharacteristicState>
  skills:          Record<SkillName, number>
  /**
   * Traits portés, par id (§ traits.md — débloqués aux rangs 3 et 5 d'une
   * compétence). Les défs vivent dans data/traits.yaml (character/traits.ts) ;
   * `validateCharacter` vérifie que la progression les autorise.
   */
  traits?: string[]
  /**
   * Base protection 🛡️ from armor / equipment.
   * Each point absorbs one incoming heavy wound 💔; defaults to 0 if absent.
   * Hemorrhage bypasses this protection entirely.
   */
  protection?: number
}

/** Stats computed from the character sheet — never stored, always derived */
export interface DerivedStats {
  /** Sum of all physical characteristic values (wounds do not reduce this) */
  maxHealth: number
  /** Sum of effective (post-wounds) physical characteristic values */
  currentHealth: number
  /** Effective vigor + robustness skill — light-wound threshold before overflow to heavy wounds */
  resistanceThreshold: number
  /** Effective tenacity (post-wounds) + discipline skill */
  maxStability: number
  /** 2 + strength (effective) + robustness skill */
  carryCapacity: number
}

/** Result of character validation */
export interface ValidationResult {
  valid: boolean
  errors: string[]
}
