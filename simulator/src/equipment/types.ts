/**
 * Équipement — vocabulaire partagé (§ core/equipement.md).
 *
 * Un objet est décrit par un socle commun `ItemBase` et une variante par nature
 * (`kind`). L'union est DISCRIMINÉE : une armure n'a pas de portée, un carquois
 * n'a pas de protection, et le compilateur le sait. Ajouter une nature (outil,
 * focus magique, monture…) se fait en étendant `ItemBase` et l'union, sans
 * toucher aux natures existantes.
 *
 * Ce fichier ne contient que des PRIMITIVES : aucune dépendance au moteur de
 * combat, pour que la fiche, le simulateur et le site puissent le partager.
 */

import type { LocalizedString } from '../locale'
import type { PerkGrant } from '../character/grants'
import type { SkillName } from '../character/types'

// ─── Emplacements ─────────────────────────────────────────────────────────────

/**
 * Taille d'un emplacement — et rien d'autre.
 *
 *  · `small`  ▫️ / 🔸 — petit objet (munition, ration, potion) ;
 *  · `normal` 🔳     — grand emplacement, la maille du corps ;
 *  · `large`         — RÉSERVÉ : bâts, attelages, véhicules. Aucun objet ne le
 *                      porte encore ; la valeur existe pour que le jour où un
 *                      chariot entre dans le jeu, ce soit une donnée et non une
 *                      refonte du type.
 *
 * ⚠️ La taille ne dit RIEN de l'accessibilité. ▫️ (paquet, rangé) et 🔸 (poche,
 * jouable en combat) sont tous deux `small` : ce qui les sépare est le CONTENEUR
 * qui les fournit, pas l'objet qui s'y range (cf. `ContainerItem.provides`).
 */
export type SlotSize = 'small' | 'normal' | 'large'

/** Zones du corps où un objet se porte (§ equipement — Les Emplacements 🔳). */
export type BodyZone = 'head' | 'hands' | 'body' | 'back' | 'waist' | 'legs'

export const ALL_BODY_ZONES: readonly BodyZone[] =
  ['head', 'hands', 'body', 'back', 'waist', 'legs']

/**
 * Capacité en 🔳 de chaque zone — 12 au total, plafond anatomique absolu.
 * C'est un maximum de PLACE, distinct de la Charge Maximale (2 + Force +
 * Robustesse), qui est un maximum de POIDS : on peut avoir la place et pas les
 * épaules, auquel cas on est en surcharge.
 */
export const ZONE_CAPACITY: Record<BodyZone, number> = {
  head: 1, hands: 2, body: 4, back: 2, waist: 2, legs: 1,
}

// ─── Armes ────────────────────────────────────────────────────────────────────

/** Familles d'armes (§ equipement — « Famille d'armes : … »). */
export type WeaponFamily =
  | 'short-blades'   // Lames courtes
  | 'long-blades'    // Lames longues — le domaine de l'Escrime
  | 'impact'         // Armes d'impact
  | 'polearms'       // Allonge / Hast
  | 'bows'           // Arcs
  | 'crossbows'      // Arbalètes et armes à feu

/**
 * Catégorie de lame (§ martial_escrime — « La Lame et la Forme »). Ne concerne
 * que `long-blades` : c'est elle qui résout les `favweapon-*` de l'Escrime.
 */
export type BladeCategory = 'light' | 'broad' | 'heavy'

/**
 * Attaques qu'une arme AUTORISE (§ equipement, bandeau des familles : « une arme
 * permettant les attaques vives donne accès à la Frappe vive »). Toute arme
 * tenue en main permet l'Attaque armée — d'où `armed` sur chacune.
 */
export type AttackKind =
  | 'armed'         // Attaque armée   → armed-attack
  | 'quick'         // Frappe vive     → sharp-strike
  | 'powerful'      // Frappe brutale  → brutal-strike
  | 'ranged-quick'  // Tir rapide      → quick-shot
  | 'ranged-aimed'  // Tir ciblé       → aimed-shot

// ─── Socle commun ─────────────────────────────────────────────────────────────

export type ItemKind = 'weapon' | 'armor' | 'shield' | 'container' | 'consumable' | 'gear'

/** Ce que TOUT objet porte, quelle que soit sa nature. */
export interface ItemBase {
  /** Identifiant machine, en anglais (clé du registre). */
  id:    string
  name:  LocalizedString
  description?: LocalizedString
  kind:  ItemKind
  /** Taille des emplacements consommés. */
  size:  SlotSize
  /** Combien d'emplacements de cette taille (🤲 pour une arme, 🔳 pour une armure). */
  slots: number
  /** Zones où l'objet peut être porté. Une arme au Dos exige un porteur — cf. `ContainerItem`. */
  zones: BodyZone[]
  /** Ligne du tableau de `rules/fr/core/equipement.md` dont ceci est la projection. */
  vaultRow?: string
  /**
   * Colonne « Mécanique » du vault, VERBATIM.
   *
   * Le texte de règle vit ici tant que la grammaire de `grants` ne sait pas
   * l'exprimer (les ⛞, les riders d'issue…). Ce n'est pas de la décoration :
   * c'est ce qui permet au test de cohérence de comparer le YAML au tableau du
   * vault, et ce qui rend visible ce qui reste à brancher. Une entrée qui porte
   * un `mechanic` sans `grants` est une mécanique DÉCLARÉE, pas appliquée.
   */
  mechanic?: LocalizedString
  /** Mot d'identité du vault (« Offensive », « Anti-armure »…) — lisibilité seule. */
  identity?: LocalizedString
}

// ─── Natures ──────────────────────────────────────────────────────────────────

export interface WeaponItem extends ItemBase {
  kind:   'weapon'
  family: WeaponFamily
  /** Uniquement pour `long-blades` — résout les armes de prédilection d'Escrime. */
  category?: BladeCategory
  /**
   * Portée du coup en cases, ABSOLUE (1 = au contact).
   *
   * Le vault note les armes d'Hast en « Allonge N » ; on stocke la portée, pas
   * le bonus — Allonge 1 devient portée 2. Une seule échelle, aucune addition
   * silencieuse à faire ailleurs.
   */
  reach:  number
  /** Distance MINIMALE : un arc ne tire pas au contact (minRange 1 → distance > 1). */
  minRange?: number
  /** Attaques que l'arme ouvre à son porteur. */
  attacks: AttackKind[]
  /** Peut servir à parer ⚡ (faux pour les arcs et les arbalètes). */
  canParry: boolean
  /** DD de l'action de rechargement ⚙️ (arbalètes et armes à feu). */
  reloadDC?: number
  /** Effets mécaniques conférés au porteur — même grammaire que les perks. */
  grants?: PerkGrant[]
}

export interface ArmorItem extends ItemBase {
  kind: 'armor'
  /**
   * Protection 🛡️ conférée. C'est un STOCK qui se vide : chaque point absorbe
   * une 💔 et ne revient pas (§ ressources — « ignorer les PREMIÈRES blessures
   * graves »). À distinguer du bouclier, qui se recharge à chaque manche.
   */
  protection: number
  /** 🔸 fournies par l'armure elle-même (le vêtement technique en donne deux). */
  pockets?: number
}

export interface ShieldItem extends ItemBase {
  kind: 'shield'
  /**
   * 🛡️ regagnée à CHAQUE manche (l'écu : une blessure grave évitée par manche).
   * Se branche sur `tempProtection`, qui expire déjà en fin de manche.
   */
  protectionPerRound: number
  /** Un bouclier ouvre le Blocage ⚡ — ce que `guards.yaml` approximait par Robustesse ≥ 2. */
  canBlock: true
}

export interface ContainerItem extends ItemBase {
  kind: 'container'
  /**
   * Emplacements fournis en échange de celui qu'il occupe.
   * `accessible: true` = 🔸 poche, utilisable en combat ; `false` = ▫️ paquet,
   * réservé à l'exploration. C'est ICI que vit la distinction 🔸/▫️.
   */
  provides?: { size: SlotSize; count: number; accessible: boolean }
  /**
   * Ce que le conteneur rend JOUABLE dans sa zone. Un fourreau ou un harnais
   * porte des armes : sans lui, une arme rangée au Dos est transportée, pas
   * dégainable (l'arc voyage décordé). `ammunition` = carquois.
   */
  carries?: 'weapon' | 'ammunition' | 'any'
}

/**
 * Consommable (§ equipement — Jauge de Stock).
 *
 * ⚠️ Pas de champ `stock` : le Stock du vault n'est pas une propriété de l'objet,
 * c'est le NOMBRE d'exemplaires identiques rangés dans l'inventaire. « Rations,
 * Stock 3 » = trois rations occupant trois ▫️ — ce qui est exactement pourquoi
 * le vault écrit « 1 Point de Stock actuel = 🔸 ou ▫️ ». La jauge est émergente ;
 * la stocker en double serait la première désynchronisation à venir.
 */
export interface ConsumableItem extends ItemBase {
  kind: 'consumable'
  /** Cadence du Jet d'Usage, texte libre (« 1 / jour », « 1 / combat »). */
  usage?: LocalizedString
  grants?: PerkGrant[]
}

/** Tout le reste : cape, baudrier, bottes, heaume — un porteur de grants. */
export interface GearItem extends ItemBase {
  kind: 'gear'
  /** 🛡️ additionnelle d'une pièce isolée (heaume, jambières renforcées). */
  protection?: number
  /** 🟩 conféré sur une compétence donnée (cape → dissimulation, bottes → course). */
  advantageOn?: SkillName[]
  grants?: PerkGrant[]
}

export type Item =
  | WeaponItem | ArmorItem | ShieldItem | ContainerItem | ConsumableItem | GearItem

// ─── Prédicats ────────────────────────────────────────────────────────────────

export const isWeapon    = (i: Item): i is WeaponItem    => i.kind === 'weapon'
export const isArmor     = (i: Item): i is ArmorItem     => i.kind === 'armor'
export const isShield    = (i: Item): i is ShieldItem    => i.kind === 'shield'
export const isContainer = (i: Item): i is ContainerItem => i.kind === 'container'
