/**
 * src/lib/character/types.ts
 *
 * Modèle de données d'un personnage Quadrature — source de vérité UNIQUE,
 * sérialisée telle quelle en localStorage et en JSON (export/import).
 *
 * Conventions :
 *  - Les identifiants (CharId, SkillId, SlotId…) sont en ANGLAIS (clés de code) ;
 *    les libellés affichables sont des `LocalizedString` (cf. ci-dessous).
 *  - Les valeurs *dérivées* (valeur d'une caractéristique, résistance, charge…) ne
 *    sont JAMAIS stockées : elles sont recalculées par `derive.ts`.
 *  - Les définitions de jeu (libellés, structure) vivent dans `constants.ts`.
 */

import type { LocalizedString } from "@/lib/nav";

/**
 * Chaîne localisée, réutilisée depuis la couche navigation (même forme que
 * `books.json`) : `{ fr: "…", en: "…" }`, résolue via `localize(field, locale)`.
 * Re-exportée ici pour donner au module « personnage » une référence locale.
 */
export type { LocalizedString };

/** Les 10 caractéristiques (5 Corps + 5 Esprit). */
export type CharId =
  | "strength" | "agility" | "vigor" | "grace" | "acuity"
  | "will" | "intelligence" | "tenacity" | "charisma" | "lucidity";

/** Les 20 compétences (2 par caractéristique). */
export type SkillId =
  | "power" | "toughness"
  | "precision" | "mobility"
  | "endurance" | "recovery"
  | "presence" | "disguise"
  | "observation" | "vigilance"
  | "authority" | "discipline"
  | "logic" | "reactivity"
  | "conviction" | "resilience"
  | "eloquence" | "manipulation"
  | "clairvoyance" | "intuition";

/** États mentaux exclusifs (piste de la colonne Esprit). */
export type MentalStateId =
  | "enraged" | "furious" | "aggressive" | "focused"
  | "cautious" | "panicked" | "terrified";

/** Type d'un grand emplacement d'inventaire. */
export type SlotType = "" | "weapon" | "armor" | "small" | "pocket" | "packet";

/** Identifiant des 12 grands emplacements (zones corporelles). */
export type SlotId =
  | "head"
  | "leftHand" | "rightHand"
  | "body1" | "body2" | "body3" | "body4"
  | "back1" | "back2" | "back3"
  | "belt"
  | "legs";

/**
 * Objet rangé dans un emplacement. Volontairement minimal pour l'instant
 * (juste le texte affiché sur la fiche) ; servira de base quand on introduira
 * des listes d'équipement (on enrichira `InventoryItem` sans casser le modèle).
 */
export interface InventoryItem {
  /** Texte libre affiché dans l'emplacement sur la feuille. */
  itemText: string;
}

/** Un grand emplacement : nom du slot, type, objet rangé, jauge de poches. */
export interface InventorySlot {
  id: SlotId;
  /** Nom localisé de l'emplacement (ex. « Main gauche »). */
  label: LocalizedString;
  type: SlotType;
  /** Objet rangé, ou null si l'emplacement est vide. */
  item: InventoryItem | null;
  /** Pips actifs pour les contenants (pocket = max 3, packet = max 4) ; 0 sinon. */
  pips: number;
}

/** Trait ou discipline : nom + description libre (saisis par le joueur). */
export interface TraitEntry {
  name: string;
  desc: string;
}

/**
 * Personnage complet. `schemaVersion` permet de migrer les sauvegardes au fil
 * de l'évolution du modèle (cf. storage.ts).
 */
export interface Character {
  schemaVersion: 1;
  id: string;
  name: string;
  /** Portrait encodé en data URL (image), optionnel. */
  portrait?: string;
  bio: string;

  /** Rang 0–5 de chacune des 20 compétences. */
  skills: Record<SkillId, number>;
  /**
   * Nombre de cercles « pleins » par caractéristique = valeur courante
   * (réductible pour figurer les blessures). Clampé à la valeur dérivée.
   */
  charCurrent: Record<CharId, number>;

  /** Cases ♥ Résistance cochées (longueur 10 ; les inactives restent false). */
  resistance: boolean[];
  /** Cases ◇ Stabilité cochées (longueur 10). */
  stability: boolean[];
  /** Jauge de fatigue : 1 (départ) → 20 (K.O.). */
  fatigue: number;
  /** Points de protection 🛡️ (armure). */
  protection: number;
  /** État mental courant (exclusif). */
  mentalState: MentalStateId;

  inventory: {
    /** 12 grands emplacements, indexés par leur SlotId. */
    slots: Record<SlotId, InventorySlot>;
    /** Emplacements rapides 🔸 (libellés). */
    quick: string[];
    /** Petits emplacements ▫️ (libellés). */
    small: string[];
  };

  page2: {
    description: string;
    background: string;
    notes: string;
  };

  /** Liste unique « Traits & Disciplines ». */
  traits: TraitEntry[];
}

/** Forme persistée en localStorage : tous les personnages + l'id du courant. */
export interface CharacterStore {
  characters: Character[];
  currentId: string | null;
}
