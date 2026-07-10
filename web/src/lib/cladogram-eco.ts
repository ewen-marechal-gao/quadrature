/**
 * src/lib/cladogram-eco.ts
 *
 * Vocabulaire d'écologie du cladogramme — *pur* (aucun `fs`), donc importable
 * depuis un composant client.
 *
 * ⚠️ Ne PAS remonter ces constantes dans `lib/cladogram.ts` : ce module-là lit le
 * YAML via `fs`, et un import de VALEUR depuis un composant client y tirerait `fs`
 * dans le bundle (les `import type` sont effacés, pas les constantes).
 *
 * Biome et habitat sont DÉRIVÉS de l'ascendance : graine `rootBiome`/`rootHabitat`
 * (data/cladogram.yaml) + transitions `addBiome`/`removeBiome`/`addHabitat`/
 * `removeHabitat` portées par les mutations, repliées racine→feuille.
 */

/** Lettre de biome affichée : N Nord · L Levant · C Couchant · S Sud. */
export type BiomeLetter = "N" | "L" | "C" | "S";

/** Zone géographique. `dawn` = Levant, `dusk` = Couchant. */
export type Biome = "north" | "dawn" | "dusk" | "south";

/** Milieu de vie. Une créature amphibie est `terrestrial` ET `aquatic`. */
export type Habitat = "terrestrial" | "aquatic" | "aerial";

/** Ordre canonique d'affichage (du Nord au Sud, en passant par le terminateur). */
export const BIOME_ORDER: Biome[] = ["north", "dawn", "dusk", "south"];

export const BIOME_TO_LETTER: Record<Biome, BiomeLetter> = {
  north: "N",
  dawn: "L",
  dusk: "C",
  south: "S",
};

/** Applique les transitions d'une mutation à un ensemble : remove d'abord, puis add. */
export function applyEco<T>(set: ReadonlySet<T>, add?: T[], remove?: T[]): Set<T> {
  const next = new Set(set);
  for (const v of remove ?? []) next.delete(v);
  for (const v of add ?? []) next.add(v);
  return next;
}
