/**
 * src/lib/sig/graticule.ts — parallèles et méridiens, en GeoJSON.
 *
 * MapLibre n'en fournit aucune : une graticule y est une couche `line` comme
 * une autre, et c'est au client de la fabriquer.
 *
 * Les latitudes remarquables ne sont pas décoratives. Dans le repère Étoile, la
 * latitude EST l'élévation de l'étoile au-dessus de l'horizon — l'équateur est
 * donc le milieu du terminateur, +6° le Mur des Tempêtes, −21° le Linceul. La
 * graticule dit ici quelque chose du monde, pas seulement de la grille.
 */

import type { FeatureCollection, LineString } from "geojson";
import { MERCATOR_LIMIT_DEG } from "./mercator";
import type { AeonirMeta } from "./tilejson";

export interface LineProperties {
  color: string;
  width: number;
  /** 1 = tiretée. Un booléen ne passerait pas les filtres d'expression. */
  dashed: 0 | 1;
}

export type Graticule = FeatureCollection<LineString, LineProperties>;

/**
 * @param stepDeg  Écart en degrés entre deux lignes de la trame de fond.
 * @param vertices Densification de chaque tronçon.
 *
 * ⚠️ Chaque ligne est **densifiée** alors qu'en Mercator plan deux sommets
 * suffiraient — un méridien y est vertical, un parallèle horizontal. La
 * densification ne sert pas à la projection mais au **drapé sur le relief 3D** :
 * sans elle, une ligne tendue traverserait les montagnes au lieu d'en épouser la
 * surface.
 */
export function buildGraticule(
  aeonir: AeonirMeta,
  stepDeg = 15,
  vertices = 8
): Graticule {
  const features: Graticule["features"] = [];

  const push = (
    points: number[][],
    color: string,
    width: number,
    dashed: 0 | 1
  ) =>
    features.push({
      type: "Feature",
      properties: { color, width, dashed },
      geometry: { type: "LineString", coordinates: points },
    });

  const interpolate = (a: number, b: number) =>
    Array.from({ length: vertices + 1 }, (_, i) => a + (b - a) * (i / vertices));

  /**
   * ⚠️ Un parallèle se trace PAR TRONÇONS, jamais d'un bord du monde à l'autre.
   * Une polyligne unique de −180° à +180° est un cas dégénéré pour le retuilage
   * côté client d'une source GeoJSON : elle ne survit que dans la tuile qui
   * contient son point de départ. Symptôme observé — les parallèles
   * n'apparaissaient que dans les tuiles `x = 0`, quand les méridiens,
   * naturellement courts, s'affichaient partout.
   */
  const parallel = (
    lat: number,
    color: string,
    width: number,
    dashed: 0 | 1
  ) => {
    for (let lon = -180; lon < 180; lon += stepDeg) {
      push(
        interpolate(lon, lon + stepDeg).map((l) => [l, lat]),
        color,
        width,
        dashed
      );
    }
  };

  for (let lon = -180; lon < 180; lon += stepDeg) {
    push(
      interpolate(-MERCATOR_LIMIT_DEG, MERCATOR_LIMIT_DEG).map((lat) => [
        lon,
        lat,
      ]),
      "#3a4c63",
      0.6,
      0
    );
  }
  for (let lat = -75; lat <= 75; lat += stepDeg) {
    if (lat === 0) continue;
    parallel(lat, "#3a4c63", 0.6, 0);
  }

  // ── Les lignes qui portent du sens ──────────────────────────────────
  parallel(0, "#e8eef7", 1.4, 0); //                    équateur Étoile
  parallel(aeonir.band.north_deg, "#e09a5a", 1.2, 0); // Mur des Tempêtes
  parallel(aeonir.band.south_deg, "#7fb6e0", 1.2, 0); // Linceul

  // L'emprise réellement tuilée, qui déborde les seuils du lore : c'est elle
  // qui explique la transition de netteté visible sur la carte.
  parallel(aeonir.band_bounds[3], "#6b7f99", 1.0, 1);
  parallel(aeonir.band_bounds[1], "#6b7f99", 1.0, 1);

  return { type: "FeatureCollection", features };
}
