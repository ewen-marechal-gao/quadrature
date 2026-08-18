/**
 * src/lib/sig/mercator.ts — WebMercatorQuad, la part qui ne dépend pas de la
 * planète.
 *
 * Le point qui vaut d'être retenu : dans ce découpage, `x` est linéaire en
 * longitude, `y` est un logarithme de latitude, et **aucun rayon planétaire
 * n'intervient**. C'est exactement ce qui autorise à appliquer WebMercatorQuad à
 * Aeonir sans mentir sur sa taille — la grille est sans échelle, seule
 * l'interprétation en mètres en aurait une.
 *
 * Le pendant Python de ces formules vit dans `aeonir_gis/tiles.py`.
 */

/** Latitude de coupure de Web Mercator — gd(π), la grille étant carrée. */
export const MERCATOR_LIMIT_DEG = 85.0511287798066;

export interface TileIndex {
  x: number;
  y: number;
}

/** Longitude/latitude → indices de tuile XYZ au niveau demandé. */
export function tileIndex(lon: number, lat: number, zoom: number): TileIndex {
  const side = 2 ** zoom;
  const phi = (lat * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2;
  return {
    x: Math.floor(((lon + 180) / 360) * side),
    y: Math.min(side - 1, Math.max(0, Math.floor(y * side))),
  };
}

/**
 * Replie une longitude dans [−180, 180[.
 *
 * ⚠️ Indispensable dès que `renderWorldCopies` est actif : MapLibre rapporte la
 * position dans la COPIE survolée, soit −204,244° pour un point qui est à
 * +155,756°. Sans repli, l'affichage sort de l'intervalle et l'indice de tuile
 * devient négatif — il ne désigne alors aucun fichier.
 */
export function wrapLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
