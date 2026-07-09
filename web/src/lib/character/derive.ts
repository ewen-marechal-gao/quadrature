/**
 * src/lib/character/derive.ts
 *
 * Sélecteurs PURS : toutes les valeurs dérivées du personnage. Aucune n'est
 * stockée dans `Character` — on les recalcule à partir des compétences/inventaire
 * pour garantir la cohérence. Reproduit la logique du prototype `sheet/sheet.html`.
 */

import {
  CHAR_BY_ID,
  CHAR_IDS,
  QUICK_SLOTS,
  RESISTANCE_BOXES,
  SKILL_IDS,
  SLOT_IDS,
  SLOT_LABELS,
  SLOT_PIP_CAPACITY,
  SMALL_SLOTS,
  STABILITY_BOXES,
  TOTAL_SLOTS,
} from "./constants";
import type {
  CharId,
  Character,
  InventorySlot,
  SkillId,
  SlotId,
  SlotType,
} from "./types";

/** Rang 0–5 d'une compétence (0 si absente). */
export function skillRank(c: Character, id: SkillId): number {
  return c.skills[id] ?? 0;
}

/**
 * Valeur d'une caractéristique : base 1 + 1 par compétence de rang ≥ 2
 * + 1 par compétence de rang ≥ 4 (max 5). Cf. règle « base 1 + rangs pairs ».
 */
export function characteristicValue(c: Character, charId: CharId): number {
  const def = CHAR_BY_ID[charId];
  let bonus = 0;
  for (const s of def.skills) {
    const r = skillRank(c, s.id);
    if (r >= 2) bonus++;
    if (r >= 4) bonus++;
  }
  return 1 + bonus;
}

/** Toutes les valeurs de caractéristiques en une passe. */
export function allCharacteristicValues(c: Character): Record<CharId, number> {
  const out = {} as Record<CharId, number>;
  for (const id of CHAR_IDS) out[id] = characteristicValue(c, id);
  return out;
}

/** Résistance active = Vigueur (Robustesse retirée du seuil ; elle ne pèse plus que la charge/armure). */
export function resistanceMax(c: Character): number {
  return Math.min(RESISTANCE_BOXES, characteristicValue(c, "vigor"));
}

/** Stabilité active = Ténacité + ✫ Discipline (max 10). */
export function stabilityMax(c: Character): number {
  return Math.min(STABILITY_BOXES, characteristicValue(c, "tenacity") + skillRank(c, "discipline"));
}

/** Charge maximale = 2 + Force + ✫ Robustesse (max 12). */
export function chargeMax(c: Character): number {
  return Math.min(TOTAL_SLOTS, 2 + characteristicValue(c, "strength") + skillRank(c, "toughness"));
}

/** Charge utilisée = grands emplacements dont le type est posé (hors « petit »). */
export function usedSlots(c: Character): number {
  return Object.values(c.inventory.slots).filter((s) => s.type !== "" && s.type !== "small").length;
}

/** Capacité totale de pips actifs des contenants d'un type donné. */
function pipCapacityByType(c: Character, type: SlotType): number {
  return Object.values(c.inventory.slots)
    .filter((s) => s.type === type)
    .reduce((n, s) => n + s.pips, 0);
}

/** Total des emplacements rapides offerts par les poches 🔸. */
export function quickCapacity(c: Character): number {
  return pipCapacityByType(c, "pocket");
}

/** Total des petits emplacements offerts par les paquets 📦. */
export function smallCapacity(c: Character): number {
  return pipCapacityByType(c, "packet");
}

/** Emplacements rapides remplis. */
export function quickUsed(c: Character): number {
  return c.inventory.quick.filter((v) => v.trim() !== "").length;
}

/** Petits emplacements remplis. */
export function smallUsed(c: Character): number {
  return c.inventory.small.filter((v) => v.trim() !== "").length;
}

// ─── Fabrique ─────────────────────────────────────────────────────────────────

/** Identifiant unique (navigateur ; fallback si crypto.randomUUID indisponible). */
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 12 grands emplacements vides, indexés par SlotId, avec leur nom localisé. */
function createEmptySlots(): Record<SlotId, InventorySlot> {
  return Object.fromEntries(
    SLOT_IDS.map((id): [SlotId, InventorySlot] => [
      id,
      { id, label: SLOT_LABELS[id], type: "", item: null, pips: 0 },
    ]),
  ) as Record<SlotId, InventorySlot>;
}

/** Personnage vierge : compétences à 0, fatigue 1, état Concentré, inventaire vide. */
export function createEmptyCharacter(name = ""): Character {
  const skills = Object.fromEntries(SKILL_IDS.map((id) => [id, 0])) as Record<SkillId, number>;
  // Valeur de base avec 0 compétence = 1 → cercles courants pleins à 1.
  const charCurrent = Object.fromEntries(CHAR_IDS.map((id) => [id, 1])) as Record<CharId, number>;

  return {
    schemaVersion: 1,
    id: newId(),
    name,
    bio: "",
    skills,
    charCurrent,
    resistance: Array(RESISTANCE_BOXES).fill(false),
    stability: Array(STABILITY_BOXES).fill(false),
    fatigue: 1,
    protection: 0,
    mentalState: "focused",
    inventory: {
      slots: createEmptySlots(),
      quick: Array(QUICK_SLOTS).fill(""),
      small: Array(SMALL_SLOTS).fill(""),
    },
    page2: { description: "", background: "", notes: "" },
    traits: [],
  };
}

/** Copie profonde d'un personnage avec un nouvel id (duplication). */
export function cloneCharacter(c: Character, name?: string): Character {
  const copy: Character = JSON.parse(JSON.stringify(c));
  copy.id = newId();
  if (name !== undefined) copy.name = name;
  return copy;
}
