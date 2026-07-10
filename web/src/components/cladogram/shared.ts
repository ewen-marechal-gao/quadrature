/**
 * src/components/cladogram/shared.ts
 *
 * Constantes et petits utilitaires partagés par les sous-composants du
 * cladogramme (libellés de biome, bornes de zoom, placement de carte).
 */

import { BIOME_TO_LETTER, type Biome, type BiomeLetter, type Habitat } from "@/lib/cladogram-eco";

export const BIOME_LETTERS: BiomeLetter[] = ["N", "L", "C", "S"];
export const BIOME_NAMES: Record<BiomeLetter, string> = {
  N: "Nord",
  L: "Levant",
  C: "Couchant",
  S: "Sud",
};
export const HABITAT_NAMES: Record<Habitat, string> = {
  terrestrial: "Terrestre",
  aquatic: "Aquatique",
  aerial: "Aérien",
};

/** Lettres allumées pour un ensemble de biomes DÉRIVÉ. */
export const lettersOf = (biomes: Biome[]): Set<BiomeLetter> =>
  new Set(biomes.map((b) => BIOME_TO_LETTER[b]));

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 2.5;

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Rectangle d'ancrage minimal (sous-ensemble de DOMRect). */
export interface Anchor {
  top: number;
  right: number;
  left: number;
  bottom: number;
}

/**
 * Anti-débordement : position fixe (écran) d'une carte ancrée à un nœud.
 * Préfère la droite de l'ancre, bascule à gauche si ça déborde, puis clampe.
 */
export function placeCard(
  anchor: Anchor,
  card: { w: number; h: number }
): { left: number; top: number } {
  const M = 12;
  let left = anchor.right + M;
  if (left + card.w > window.innerWidth - 8) left = anchor.left - card.w - M;
  if (left < 8) left = 8;
  const top = clamp(anchor.top, 8, Math.max(8, window.innerHeight - card.h - 8));
  return { left, top };
}
