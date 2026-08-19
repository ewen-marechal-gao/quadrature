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

/**
 * Le zoom de CARTE auquel les couches monde et bande se passent la main.
 *
 * ⚠️ Ce n'est pas `split_zoom`, qui est un niveau de TUILE — et le passage de
 * l'un à l'autre **n'est pas le même selon le type de source**. Lu dans
 * `coveringZoomLevel` de MapLibre :
 *
 *     niveau = (roundZoom ? round : floor)(zoom + log2(512 / tileSize))
 *
 * Une source raster pose `roundZoom = true` et déclare ici `tileSize: 256`,
 * d'où `round(zoom + 1)`. Une source vectorielle ne pose pas `roundZoom` — donc
 * `floor` — et n'a pas de `tileSize` du tout, la valeur valant 512 par
 * convention, d'où `floor(zoom)`.
 *
 * La bande n'existant qu'à partir du niveau `split_zoom + 1`, on résout :
 *
 *     raster    round(z + 1) ≥ s + 1   ⟺   z ≥ s − 0,5
 *     vectoriel floor(z)     ≥ s + 1   ⟺   z ≥ s + 1
 *
 * Soit **un cran et demi d'écart** entre les deux, pour la même pyramide et le
 * même partage. Les deux valeurs ont été mesurées avant d'être dérivées : la
 * bande raster ne rend rien jusqu'à 3,4 et sert du z=5 dès 3,6 ; la bande
 * vectorielle ne rend rien jusqu'à 4,6 et sert dès 5,0.
 */
export function rasterSplitZoom(splitZoom: number): number {
  return splitZoom - 0.5;
}

export function vectorSplitZoom(splitZoom: number): number {
  return splitZoom + 1;
}

/**
 * Niveau de tuile réellement servi par une source **vectorielle**.
 *
 * ⚠️ `floor`, jamais `round(zoom + 1)`. La seconde est la règle raster, et
 * l'appliquer à une couche vectorielle donne un niveau faux d'un à deux crans —
 * ce qui, pour lire un seuil de généralisation, annonce une valeur qui n'est
 * pas celle appliquée. Les deux formules coïncident par endroits, ce qui rend
 * l'erreur difficile à voir : à z=4,2 elles s'accordent, à z=2,6 elles donnent
 * 4 et 2.
 */
export function vectorTileZoom(mapZoom: number): number {
  return Math.floor(mapZoom);
}


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
