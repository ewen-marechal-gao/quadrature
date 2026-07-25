/**
 * Vocabulaire partagé des GRANTS — le branchement moteur des traits (§ traits.md)
 * ET des atouts de discipline (§ disciplines/).
 *
 * Les deux registres décrivent « ce qu'un trait / perk donne au moteur » avec des
 * familles de grant. Elles vivaient dans chaque fichier (character/traits.ts,
 * character/disciplines.ts) ; réunies ici, la grammaire des grants se lit d'un
 * seul endroit.
 *
 * Ce qui reste chez chaque registre, ce sont les CONTENEURS — car ils diffèrent :
 *  · un trait porte AU PLUS un de chaque famille  → `TraitGrants` (objet nommé) ;
 *  · un perk en porte une LISTE hétérogène        → `PerkGrant` (union discriminée).
 *
 * Aucune dépendance : ces types ne sont que des primitives.
 */

// ─── Familles de trait (§ core/traits.md) ─────────────────────────────────────

/**
 * « L'action X **peut** être utilisée en Réaction ⚡ lorsque … ».
 *
 * ⚠️ AJOUTE une variante réactive : l'action reste jouable normalement dans la
 * manche. Le vault dit « peut », pas « devient » — un trait n'enlève rien.
 */
export interface ReactiveModeGrant {
  /** Famille de déclencheur (TriggerKind côté combat). */
  on:    string
  /** `reach` = portée de l'action (défaut), `adjacent` = 1 case, `self` = soi. */
  scope?: string
  /** Coût de la VARIANTE (remplace celui de l'action de base). */
  cost:  { actions?: number; reactions?: number; fatigue?: number }
}

/** Deltas signés appliqués au coût de `action` (plancher 0). */
export interface CostDeltaGrant {
  actions?:   number
  reactions?: number
  fatigue?:   number
}

/** Conteneur des grants d'un TRAIT : au plus un de chaque famille. */
export interface TraitGrants {
  reactiveMode?: ReactiveModeGrant
  costDelta?:    CostDeltaGrant
}

// ─── Familles de perk (§ disciplines/) ────────────────────────────────────────

/** Cible d'un grant qui modifie une action ou une garde nommée. */
export interface PerkTarget {
  type: 'action' | 'guard'
  id:   string
}

/**
 * « Utilisez Escrime 🟨🟨 à la place de <compétence> pour <action/garde> ».
 *
 * La substitution remplace la VALEUR de compétence du jet par le rang de la
 * discipline (les 🟨🟨 restent 2 dés) ; la caractéristique 🟦 ne bouge pas.
 * Conditionnée à une arme de prédilection via `requiresSkillTag`. SEULE famille
 * branchée au Lot 1.
 */
export interface RollSubstitutionGrant {
  kind: 'rollSubstitution'
  target: PerkTarget
  requiresSkillTag?: string
  wired?: boolean
}

/** Marqueur skillTag conféré automatiquement (les cross-refs `[Style]` le testent). */
export interface SkillTagGrant {
  kind:  'skillTag'
  value: string
}

/** Menu de skillTags dont la fiche retient EXACTEMENT un (arme de prédilection…). */
export interface SkillTagChoiceGrant {
  kind:    'skillTagChoice'
  options: string[]
}

/** État mental de DÉBUT de combat (les ♾️ Formes). Non branché (Lot 2). */
export interface MentalInitGrant {
  kind:  'mentalInit'
  state: string
  wired?: boolean
}

/** ⚡ gagnée sur un déclencheur, gatée par état mental (les ♾️ Formes). Non branché. */
export interface ReactionOnTriggerGrant {
  kind: 'reactionOnTrigger'
  on:   string
  whileMental?: string[]
  amount: number
  wired?: boolean
}

/** Relance(s) 🟨 conditionnelle(s) sur une famille de jet. Non branché. */
export interface RollBonusGrant {
  kind: 'rollBonus'
  on:   string
  whileMental?: string[]
  rerolls?: number
  wired?: boolean
}

/** Coût REMPLACÉ d'une action nommée. Non branché. */
export interface CostOverrideGrant {
  kind:   'costOverride'
  target: PerkTarget
  cost:   { actions?: number; reactions?: number; fatigue?: number }
  requiresSkillTag?: string
  wired?: boolean
}

/** Effet supplémentaire greffé sur l'issue d'une action nommée. Non branché. */
export interface OutcomeRiderGrant {
  kind:   'outcomeRider'
  target: PerkTarget
  requiresSkillTag?: string
  wired?: boolean
}

/** Conteneur des grants d'un PERK : liste hétérogène (union discriminée par `kind`). */
export type PerkGrant =
  | RollSubstitutionGrant | SkillTagGrant | SkillTagChoiceGrant
  | MentalInitGrant | ReactionOnTriggerGrant | RollBonusGrant
  | CostOverrideGrant | OutcomeRiderGrant

/** Familles reconnues — garde-fou du loader contre un `kind` fautif. */
export const GRANT_KINDS: readonly PerkGrant['kind'][] = [
  'rollSubstitution', 'skillTag', 'skillTagChoice', 'mentalInit',
  'reactionOnTrigger', 'rollBonus', 'costOverride', 'outcomeRider',
]
