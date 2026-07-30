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

/**
 * Disciplines — compétences HORS socle (§ disciplines/). Contrairement aux 20
 * compétences, elles ne s'itèrent pas partout et ne se rangent pas sous une
 * caractéristique : leur rang est débloqué par des atouts (perks), plafonné à 4
 * (le rang 5 relève d'une quête + trait signature, hors modèle). Seule l'Escrime
 * est branchée pour l'instant ; le type est prévu extensible aux 6 autres
 * disciplines martiales et aux 7 disciplines magiques.
 */
export type DisciplineId = 'fencing' | 'electromancy'

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
   * Rang INVESTI dans chaque discipline (§ disciplines/) — distinct du *cap*,
   * qui se reconstruit depuis les perks (`max(disciplineCap)`, plafonné à 4). On
   * stocke le rang car cap 3 ≠ rang 3 ; `validatePerks` vérifie `rang ≤ cap`.
   */
  disciplines?: Partial<Record<DisciplineId, number>>
  /**
   * Atouts de discipline portés, par id (§ disciplines/ — les « perks »). Vont
   * plus loin que les traits : ils confèrent actions, modifs d'actions, bonus
   * passifs. Les défs vivent dans data/disciplines/*.yaml (character/disciplines.ts).
   */
  perks?: string[]
  /**
   * Choix de build enregistrés qu'un perk propose (arme de prédilection, style…).
   * Primitive générique : `favweapon-broad`, `style-duelist`… Un perk *confère*
   * des tags (marqueurs auto) et *offre* des `skillTagChoice` que la fiche résout
   * en en listant l'option retenue ici.
   */
  skillTags?: string[]
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
  /**
   * Effective vigor — light-wound threshold before overflow to heavy wounds.
   * La Robustesse n'y entre PAS (retirée du seuil) : elle ne pèse plus que sur
   * `carryCapacity` et l'armure.
   */
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
