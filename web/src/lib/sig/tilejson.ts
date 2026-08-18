/**
 * src/lib/sig/tilejson.ts — le contrat que le client lit AVANT toute tuile.
 *
 * C'est tout l'objet de TileJSON : `minzoom`, `maxzoom`, `bounds` et l'encodage
 * sortent du fichier, jamais du code. Le producteur (`aeonir_gis.pyramid`) et le
 * consommateur ne partagent donc qu'un document, pas des constantes jumelles.
 *
 * Le bloc `aeonir` est une extension maison — TileJSON 3.0 autorise les membres
 * supplémentaires. Il porte ce qu'aucun champ standard ne saurait dire : la
 * taille réelle de la planète, l'époque du tirage, et la latitude où la pyramide
 * cesse de couvrir le monde entier pour ne garder que le terminateur.
 */

/** Emprise géographique, dans l'ordre TileJSON : ouest, sud, est, nord. */
export type Bounds = [number, number, number, number];

/** Extension maison du TileJSON — tout ce qui est propre à Aeonir. */
export interface AeonirMeta {
  /** Époque du tirage, en années depuis l'origine du calendrier. */
  epoch_a: number;
  /** Repère de la grille. « star » = repère Étoile, pôle nord substellaire. */
  frame: string;
  radius_m: number;
  /**
   * R⊕ / R_Aeonir. MapLibre raisonne en rayon terrestre : ce facteur restitue
   * la proportion angulaire exacte du relief. Ce n'est PAS un réglage
   * esthétique — voir `EXAGERATION_*` côté composant.
   */
  terrain_exaggeration: number;
  max_relief_m: number;
  /** Dernier niveau couvrant le monde entier ; au-delà, seule la bande existe. */
  split_zoom: number;
  /** Seuils climatiques du lore, en latitude Étoile. */
  band: { north_deg: number; south_deg: number };
  /**
   * Emprise RÉELLEMENT tuilée au-delà de `split_zoom` — elle déborde les seuils
   * du lore, parce qu'une ligne de tuiles entamée est produite en entier.
   */
  band_bounds: Bounds;
}

export interface AeonirTileJSON {
  tilejson: string;
  name: string;
  description: string;
  scheme: string;
  format: string;
  /** « terrarium » ici. Sans le transmettre, MapLibre décode en Mapbox RGB. */
  encoding: "terrarium" | "mapbox";
  /** Gabarits d'URL, RELATIFS au document — voir `resolveTileTemplate`. */
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  bounds: Bounds;
  center: [number, number, number];
  aeonir: AeonirMeta;
}

/**
 * Résout le gabarit `{z}/{x}/{y}.png` contre l'URL du TileJSON.
 *
 * ⚠️ Surtout pas `new URL(gabarit, base)` : les accolades en ressortiraient
 * encodées en `%7B…%7D` et MapLibre ne reconnaîtrait plus ses substitutions. On
 * résout le RÉPERTOIRE — qui, lui, n'a pas d'accolades — puis on concatène.
 *
 * Le détour vaut mieux qu'un chemin en dur : le même fichier sert alors depuis
 * `public/`, depuis un CDN ou depuis le tuileur dynamique du Lot 6.
 */
export function resolveTileTemplate(
  tilejsonUrl: string,
  tilejson: AeonirTileJSON,
  base: string
): string {
  const directory = new URL(".", new URL(tilejsonUrl, base)).href;
  return directory + tilejson.tiles[0];
}

/**
 * Charge le contrat, ou échoue avec un message qui dit quoi faire.
 *
 * L'absence de tuiles est un état NORMAL du dépôt : elles sont produites par le
 * pipeline Python et gitignorées. Le site doit donc se construire sans elles, et
 * la page doit l'expliquer plutôt que rester noire.
 */
export async function fetchTileJSON(url: string): Promise<AeonirTileJSON> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(`${url} — injoignable.`);
  }
  if (!response.ok) {
    throw new Error(
      `${url} → HTTP ${response.status}. La pyramide n'est pas en place : ` +
        `produire geo/out/tiles (aeonir_gis.dem puis aeonir_gis.pyramid), ` +
        `puis relancer le build — scripts/copy-aeonir-tiles.mjs s'en charge.`
    );
  }
  return (await response.json()) as AeonirTileJSON;
}
