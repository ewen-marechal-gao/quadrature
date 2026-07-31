/**
 * src/lib/equipment-labels.ts — vocabulaire d'affichage de l'équipement.
 *
 * Séparé de `lib/equipment.ts` pour une raison de FRONTIÈRE, pas de rangement :
 * le loader lit `node:fs` et ne peut donc vivre que côté serveur, tandis que les
 * cartes sont des composants clients qui ont besoin des libellés à l'exécution.
 * Importer une seule constante depuis le loader suffirait à tirer `fs` dans le
 * bundle du navigateur (les `import type`, eux, s'effacent à la compilation).
 *
 * ── Les types viennent du SIMULATEUR ─────────────────────────────────────────
 * `@sim/*` pointe sur `simulator/src` (cf. tsconfig.json). Le site n'en importe
 * que des TYPES : ils disparaissent à la compilation, donc rien du simulateur
 * n'entre dans le bundle et le site reste autonome à l'exécution. Recopier ces
 * unions ici les aurait laissées diverger en silence — une famille d'armes
 * ajoutée dans `data/*.yaml` et branchée côté moteur n'aurait pas fait bouger le
 * site d'un pixel. Désormais le type-check du site casse, et c'est le but.
 */

import type {
  AttackKind, BladeCategory, BodyZone, ContainerItem, ItemKind, SlotSize,
  WeaponFamily,
} from "@sim/equipment/types";

export type {
  AttackKind, BladeCategory, BodyZone, ItemKind, SlotSize, WeaponFamily,
};

/**
 * Ce qu'un conteneur rend jouable, et ce qu'il fournit. Le simulateur ne nomme
 * pas ces deux types : ils vivent en champs de `ContainerItem`. On les en
 * extrait plutôt que de les redéclarer — même source, même mise à jour.
 */
export type Carries = NonNullable<ContainerItem["carries"]>;
export type Provision = NonNullable<ContainerItem["provides"]>;

// ─── Libellés ─────────────────────────────────────────────────────────────────

/**
 * Zones du corps. ⚠️ Le vocabulaire du registre (`body`, `waist`) n'est pas celui
 * de la feuille de personnage web (`torso`, `belt`, cf. lib/character/constants.ts),
 * qui répartit par ailleurs les 12 emplacements autrement (Dos 3 / Taille 1 contre
 * Dos 2 / Taille 2 au vault). On traduit ici, au point d'entrée, sans toucher à
 * la fiche.
 */
export const ZONE_LABELS: Record<BodyZone, string> = {
  head: "Tête",
  hands: "Mains",
  body: "Torse",
  back: "Dos",
  waist: "Taille",
  legs: "Jambes",
};

/** Ordre anatomique, de la tête aux pieds — celui des tableaux du vault. */
export const ZONE_ORDER: BodyZone[] = [
  "head", "hands", "body", "back", "waist", "legs",
];

export const KIND_LABELS: Record<ItemKind, string> = {
  weapon: "Arme",
  armor: "Armure",
  shield: "Bouclier",
  container: "Conteneur",
  consumable: "Consommable",
  gear: "Équipement",
};

export const FAMILY_LABELS: Record<WeaponFamily, string> = {
  "short-blades": "Lames courtes",
  "long-blades": "Lames longues",
  impact: "Armes d'impact",
  polearms: "Armes d'allonge",
  bows: "Arcs",
  crossbows: "Arbalètes et armes à feu",
};

/** Bandeaux ✔️/❌ des familles, condensés depuis equipement.md. */
export const FAMILY_HINTS: Record<WeaponFamily, string> = {
  "short-blades":
    "Légères et rapides · attaques vives uniquement, au contact · utilisables en main gauche, l'attaque subit 🟥.",
  "long-blades":
    "Polyvalentes · attaques vives ou puissantes, au contact · maîtrise : effets conditionnés au niveau de réussite 🟨.",
  impact:
    "Brisent la défense ou déstabilisent · attaques vives ou puissantes, au contact · brutalité : sacrifier un 🟦 active de puissants effets.",
  polearms:
    "Frappent jusqu'à leur portée · attaques puissantes seulement en Charge · 🟥 pour attaquer un adversaire adjacent.",
  bows: "Attaques à distance rapides ou ciblées · pas de parade · pas de tir si engagé.",
  crossbows:
    "Chargées au début du combat · rechargement ⚙️ obligatoire entre deux tirs · pas de parade.",
};

export const CATEGORY_LABELS: Record<BladeCategory, string> = {
  light: "Lame légère",
  broad: "Lame large",
  heavy: "Lame lourde",
};

export const ATTACK_LABELS: Record<AttackKind, string> = {
  armed: "Attaque armée",
  quick: "Frappe vive",
  powerful: "Frappe brutale",
  "ranged-quick": "Tir rapide",
  "ranged-aimed": "Tir ciblé",
};

/** Phrases entières : « des munitions » et « une arme » ne s'accordent pas pareil. */
export const CARRIES_LABELS: Record<Carries, string> = {
  weapon: "Rend une arme dégainable",
  ammunition: "Rend les munitions accessibles",
  any: "Rend n'importe quel objet accessible",
};

/** 🟩 conféré sur une compétence — vocabulaire du simulateur. */
const SKILL_LABELS: Record<string, string> = {
  disguise: "dissimulation",
  mobility: "course",
  athletics: "athlétisme",
};

export const skillLabel = (id: string): string => SKILL_LABELS[id] ?? id;
