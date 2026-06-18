/**
 * src/lib/character/constants.ts
 *
 * Définitions de jeu (libellés localisés, structure) pour la feuille de
 * personnage. Source unique : les composants et `derive.ts` s'y réfèrent —
 * aucun libellé ni nombre magique dupliqué dans le JSX.
 *
 * Les libellés sont des `LocalizedString` (`{ fr: "…" }`, comme `books.json`) ;
 * on les résout à l'affichage via `localize(field, locale)` (cf. lib/nav).
 */

import type {
  CharId,
  LocalizedString,
  MentalStateId,
  SkillId,
  SlotId,
  SlotType,
} from "./types";

export interface SkillDef {
  id: SkillId;
  label: LocalizedString;
}

export interface CharDef {
  id: CharId;
  label: LocalizedString;
  group: "corps" | "esprit";
  /** Les 2 compétences de la caractéristique. */
  skills: [SkillDef, SkillDef];
}

/**
 * Les 10 caractéristiques dans l'ordre d'affichage.
 * Colonne Corps = 5 premières, colonne Esprit = 5 suivantes.
 */
export const CHARACTERISTICS: CharDef[] = [
  { id: "strength", label: { fr: "Force" },   group: "corps", skills: [{ id: "power",       label: { fr: "Puissance" } },   { id: "toughness",   label: { fr: "Robustesse" } }] },
  { id: "agility", label: { fr: "Agilité" }, group: "corps", skills: [{ id: "precision",   label: { fr: "Précision" } },   { id: "mobility",    label: { fr: "Mobilité" } }] },
  { id: "vigor",   label: { fr: "Vigueur" }, group: "corps", skills: [{ id: "endurance",   label: { fr: "Endurance" } },   { id: "recovery",    label: { fr: "Récupération" } }] },
  { id: "grace",   label: { fr: "Grâce" },   group: "corps", skills: [{ id: "presence",    label: { fr: "Prestance" } },   { id: "disguise",    label: { fr: "Mascarade" } }] },
  { id: "acuity",  label: { fr: "Acuité" },  group: "corps", skills: [{ id: "observation", label: { fr: "Observation" } }, { id: "vigilance",   label: { fr: "Vigilance" } }] },

  { id: "will",         label: { fr: "Volonté" },      group: "esprit", skills: [{ id: "authority",    label: { fr: "Autorité" } },     { id: "discipline",   label: { fr: "Discipline" } }] },
  { id: "intelligence", label: { fr: "Intelligence" }, group: "esprit", skills: [{ id: "logic",        label: { fr: "Logique" } },      { id: "reactivity",   label: { fr: "Réactivité" } }] },
  { id: "tenacity",     label: { fr: "Ténacité" },     group: "esprit", skills: [{ id: "conviction",   label: { fr: "Conviction" } },   { id: "resilience",   label: { fr: "Résilience" } }] },
  { id: "charisma",     label: { fr: "Charisme" },     group: "esprit", skills: [{ id: "eloquence",    label: { fr: "Éloquence" } },    { id: "manipulation", label: { fr: "Manipulation" } }] },
  { id: "lucidity",     label: { fr: "Lucidité" },     group: "esprit", skills: [{ id: "clairvoyance", label: { fr: "Clairvoyance" } }, { id: "intuition",    label: { fr: "Intuition" } }] },
];

/** Recherche rapide d'une caractéristique par id (évite les `find`). */
export const CHAR_BY_ID: Record<CharId, CharDef> = Object.fromEntries(
  CHARACTERISTICS.map((c) => [c.id, c]),
) as Record<CharId, CharDef>;

/** Liste plate des 20 ids de compétence (ordre d'affichage). */
export const SKILL_IDS: SkillId[] = CHARACTERISTICS.flatMap((c) =>
  c.skills.map((s) => s.id),
);

export const CHAR_IDS: CharId[] = CHARACTERISTICS.map((c) => c.id);

// ─── Pistes ─────────────────────────────────────────────────────────────────

export const RESISTANCE_BOXES = 10;
export const STABILITY_BOXES = 10;
export const FATIGUE_MAX = 20;
/** Seuils signalés sur la piste de fatigue. */
export const FATIGUE_EXHAUSTION = 10;
export const FATIGUE_KO = 20;
/** Max affiché pour la piste de protection 🛡️. */
export const PROTECTION_BOXES = 5;

// ─── États mentaux ────────────────────────────────────────────────────────────

export interface MentalStateDef {
  id: MentalStateId;
  label: LocalizedString;
  rule: LocalizedString;
  /** Classe CSS de couleur (portée depuis le prototype). */
  className: string;
}

export const MENTAL_STATES: MentalStateDef[] = [
  { id: "enraged",    label: { fr: "Enragé" },   rule: { fr: "+1 fatigue 💧 supplémentaire à chaque action" }, className: "state-enraged" },
  { id: "furious",    label: { fr: "Furieux" },  rule: { fr: "🟥 aux jets sur les actions défensives" },        className: "state-furious" },
  { id: "aggressive", label: { fr: "Agressif" }, rule: { fr: "+1 relance sur les actions offensives" },          className: "state-aggressive" },
  { id: "focused",    label: { fr: "Concentré" }, rule: { fr: "+1 réaction ⚡ au début de chaque manche" },       className: "state-focused" },
  { id: "cautious",   label: { fr: "Prudent" },  rule: { fr: "+1 relance sur les actions défensives" },          className: "state-cautious" },
  { id: "panicked",   label: { fr: "Paniqué" },  rule: { fr: "🟥 aux jets sur les actions offensives" },          className: "state-panicked" },
  { id: "terrified",  label: { fr: "Terrifié" }, rule: { fr: "Vous ne pouvez pas effectuer de réactions ⚡" },    className: "state-terrified" },
];

// ─── Inventaire ───────────────────────────────────────────────────────────────

export interface InventoryZoneDef {
  /** Libellé de la zone (ex. « Mains »). */
  label: LocalizedString;
  /** Emplacements de la zone, dans l'ordre. */
  slots: SlotId[];
}

/**
 * Zones corporelles → 12 grands emplacements au total.
 * Map (clés EN) plutôt qu'array : accès O(1) et itération ordonnée sans `find`.
 */
export const INVENTORY_ZONES: Map<string, InventoryZoneDef> = new Map([
  ["head",  { label: { fr: "Tête" },   slots: ["head"] }],
  ["hands", { label: { fr: "Mains" },  slots: ["leftHand", "rightHand"] }],
  ["torso", { label: { fr: "Torse" },  slots: ["body1", "body2", "body3", "body4"] }],
  ["back",  { label: { fr: "Dos" },    slots: ["back1", "back2", "back3"] }],
  ["belt",  { label: { fr: "Taille" }, slots: ["belt"] }],
  ["legs",  { label: { fr: "Jambes" }, slots: ["legs"] }],
]);

/** Nom localisé de chaque emplacement (porté dans `InventorySlot.label`). */
export const SLOT_LABELS: Record<SlotId, LocalizedString> = {
  head: { fr: "Tête" },
  leftHand: { fr: "Main gauche" },
  rightHand: { fr: "Main droite" },
  body1: { fr: "Torse" },
  body2: { fr: "Torse" },
  body3: { fr: "Torse" },
  body4: { fr: "Torse" },
  back1: { fr: "Dos" },
  back2: { fr: "Dos" },
  back3: { fr: "Dos" },
  belt: { fr: "Taille" },
  legs: { fr: "Jambes" },
};

/** Liste ordonnée des 12 SlotId (dérivée des zones). */
export const SLOT_IDS: SlotId[] = [...INVENTORY_ZONES.values()].flatMap((z) => z.slots);

export const TOTAL_SLOTS = SLOT_IDS.length; // 12
export const QUICK_SLOTS = 6;
export const SMALL_SLOTS = 12;

export interface SlotTypeDef {
  /** Icône affichée dans le sélecteur. */
  icon: string;
  /** Libellé long (title du <select>). */
  title: LocalizedString;
}

/** Types d'emplacement (Map clés EN → icône + libellé), ordre = ordre du sélecteur. */
export const SLOT_TYPES: Map<SlotType, SlotTypeDef> = new Map([
  ["",       { icon: "🔳", title: { fr: "Vide" } }],
  ["weapon", { icon: "⚔️", title: { fr: "Arme" } }],
  ["armor",  { icon: "🛡️", title: { fr: "Armure" } }],
  ["small",  { icon: "▫️", title: { fr: "Petit objet" } }],
  ["pocket", { icon: "🔸", title: { fr: "Poche (3 emplacements rapides)" } }],
  ["packet", { icon: "📦", title: { fr: "Paquet (4 petits emplacements)" } }],
]);

/** Capacité de pips d'un contenant selon son type. */
export const SLOT_PIP_CAPACITY: Partial<Record<SlotType, number>> = {
  pocket: 3,
  packet: 4,
};
export const MAX_PIPS = 4;
