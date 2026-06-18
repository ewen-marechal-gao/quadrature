/**
 * src/lib/character/mutators.ts
 *
 * Mutations « in place » d'un brouillon de personnage (draft cloné par le hook).
 * Centralise la logique délicate (réconciliation des cercles, normalisation des
 * invariants) reprise du prototype pour que les composants restent fins.
 */

import {
  MAX_PIPS,
  PROTECTION_BOXES,
  SLOT_PIP_CAPACITY,
} from "./constants";
import {
  characteristicValue,
  resistanceMax,
  stabilityMax,
} from "./derive";
import { CHAR_BY_ID } from "./constants";
import type { CharId, Character, SkillId, SlotId, SlotType } from "./types";

/**
 * Règle un rang de compétence puis réconcilie les cercles « pleins » de la
 * caractéristique : on monte les cercles au maximum si la valeur augmente,
 * on les rabote si elle diminue (comportement du prototype).
 */
export function setSkillRank(
  c: Character,
  charId: CharId,
  skillId: SkillId,
  rank: number,
): void {
  const oldValue = characteristicValue(c, charId);
  c.skills[skillId] = Math.max(0, Math.min(5, rank));
  const newValue = characteristicValue(c, charId);

  let fill = c.charCurrent[charId];
  if (fill > newValue) fill = newValue;
  if (newValue > oldValue) fill = newValue;
  c.charCurrent[charId] = fill;
}

/**
 * Clic sur le cercle d'index `clicked` d'une caractéristique : si on clique en
 * dessous du niveau courant on rabaisse à cet index, sinon on monte à index+1
 * (jauge « tap-to-level » avec bascule basse). Clampé à la valeur dérivée.
 */
export function clickCharCircle(c: Character, charId: CharId, clicked: number): void {
  const value = characteristicValue(c, charId);
  const fill = c.charCurrent[charId];
  const next = clicked < fill ? clicked : clicked + 1;
  c.charCurrent[charId] = Math.min(next, value);
}

/** Change le type d'un grand emplacement et clampe ses pips à la capacité. */
export function setSlotType(c: Character, slotId: SlotId, type: SlotType): void {
  const slot = c.inventory.slots[slotId];
  if (!slot) return;
  slot.type = type;
  const cap = SLOT_PIP_CAPACITY[type] ?? 0;
  slot.pips = Math.min(slot.pips, cap);
}

/** Clic sur le pip d'index `clicked` d'un contenant (bascule à 0 si déjà au niveau). */
export function clickSlotPip(c: Character, slotId: SlotId, clicked: number): void {
  const slot = c.inventory.slots[slotId];
  if (!slot) return;
  const cap = SLOT_PIP_CAPACITY[slot.type] ?? 0;
  const next = slot.pips === clicked + 1 ? 0 : clicked + 1;
  slot.pips = Math.min(next, cap, MAX_PIPS);
}

/**
 * Rétablit tous les invariants après une mutation : cercles clampés à la valeur,
 * cases hors-portée décochées, fatigue/protection/pips bornés.
 * À appeler systématiquement en fin d'`update()`.
 */
export function normalizeCharacter(c: Character): void {
  // Cercles courants ∈ [0, valeur]
  for (const id of Object.keys(CHAR_BY_ID) as CharId[]) {
    const v = characteristicValue(c, id);
    c.charCurrent[id] = Math.max(0, Math.min(c.charCurrent[id] ?? v, v));
  }
  // Cases au-delà du maximum dérivé → décochées
  const rMax = resistanceMax(c);
  c.resistance = c.resistance.map((on, i) => (i < rMax ? on : false));
  const sMax = stabilityMax(c);
  c.stability = c.stability.map((on, i) => (i < sMax ? on : false));
  // Bornes simples
  c.fatigue = Math.max(1, Math.min(20, c.fatigue));
  c.protection = Math.max(0, Math.min(PROTECTION_BOXES, c.protection));
  // Pips bornés à la capacité du type
  for (const slot of Object.values(c.inventory.slots)) {
    const cap = SLOT_PIP_CAPACITY[slot.type] ?? 0;
    slot.pips = Math.max(0, Math.min(slot.pips, cap));
  }
}
