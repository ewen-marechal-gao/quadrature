/**
 * src/lib/sig/style.ts — le style MapLibre, construit à partir du TileJSON.
 *
 * Tout ce qui varie (gabarit d'URL, plage de zoom, emprises, encodage) vient du
 * contrat ; ce fichier n'apporte que la mise en scène.
 */

import type { StyleSpecification } from "maplibre-gl";
import { buildGraticule } from "./graticule";
import type { AeonirTileJSON } from "./tilejson";

/** Identifiants de couches, pour que les bascules ne manipulent pas de chaînes libres. */
export const LAYERS = {
  singleSourceHillshade: "hillshade-single",
  worldHillshade: "hillshade-world",
  bandHillshade: "hillshade-band",
  graticule: "graticule",
  graticuleDashed: "graticule-dashed",
} as const;

/** Source réservée au relief 3D — voir le commentaire de sa déclaration. */
export const TERRAIN_SOURCE = "terrain";

/**
 * Éclairage commun aux trois ombrages.
 *
 * L'étoile est au pôle nord du repère Étoile — par définition, puisque ce pôle
 * EST le point substellaire. La lumière vient donc du nord, et non des 335° par
 * défaut, hérités d'une convention de cartes terrestres.
 */
const LIGHTING = {
  "hillshade-illumination-direction": 0,
  "hillshade-illumination-anchor": "map",
  "hillshade-shadow-color": "#050a12",
  "hillshade-highlight-color": "#cfe0f2",
  "hillshade-accent-color": "#33506e",
} as const;

/**
 * ⚠️ Exagération d'ombrage CONSTANTE d'une couche à l'autre. Une tentative de la
 * faire décroître au profit de la bande — pour éviter que deux ombrages du même
 * relief ne s'additionnent — a donné pire : hors de la bande, où le fond est
 * seul, il ne restait presque rien à voir au-delà de z=5. La frontière se lit
 * maintenant comme un gain de netteté, ce qui est l'information juste : il y a
 * bien plus de détail là.
 */
const HILLSHADE_EXAGGERATION = 0.85;

export function buildStyle(
  tilejson: AeonirTileJSON,
  urlTemplate: string
): StyleSpecification {
  const a = tilejson.aeonir;
  const shared = {
    type: "raster-dem" as const,
    tiles: [urlTemplate],
    // ⚠️ Sans cette ligne, MapLibre décode en terrain-RGB Mapbox et rend des
    // altitudes fausses de plusieurs milliers de mètres.
    encoding: tilejson.encoding,
    tileSize: 256,
    attribution: "Aeonir — Quadrature",
  };

  return {
    version: 8,
    sources: {
      // ── Le montage d'origine : UNE source, tous les niveaux, emprise
      // globale. Au-delà de `split_zoom` elle réclame des tuiles hors bande
      // qui n'existent pas — d'où les 404 et la coupure. Conservée pour
      // pouvoir comparer les deux montages sur la même vue.
      dem: {
        ...shared,
        minzoom: tilejson.minzoom,
        maxzoom: tilejson.maxzoom,
        bounds: tilejson.bounds,
      },

      // ── Le montage à DEUX sources sur le même jeu de fichiers, distinguées
      // par la plage de zoom et l'emprise déclarées. C'est le seul moyen
      // d'exprimer « monde entier jusqu'à split_zoom, ruban au-delà » : une
      // source `raster-dem` n'a qu'un couple bounds/maxzoom.
      //
      // Sous son `minzoom`, MapLibre ne couvre pas une source du tout — donc
      // « band » n'existe qu'au-delà du partage, et hors de son emprise elle
      // n'est jamais demandée. Résultat : plus aucun 404.
      world: {
        ...shared,
        minzoom: tilejson.minzoom,
        maxzoom: a.split_zoom,
        bounds: tilejson.bounds,
      },
      band: {
        ...shared,
        minzoom: a.split_zoom + 1,
        maxzoom: tilejson.maxzoom,
        bounds: a.band_bounds,
      },

      // ── Source dédiée au relief 3D, sur le MÊME jeu de fichiers que « dem ».
      // La duplication est voulue, et MapLibre la réclame explicitement en
      // console :
      //
      //   You are using the same source for a hillshade layer and for 3D
      //   terrain. Please consider using two separate sources to improve
      //   rendering quality.
      //
      // ⚠️ La raison est mesurable, et brutale : activer le relief 3D **mute
      // la source qu'il vise**. Le gestionnaire de terrain fait
      //
      //   this.deltaZoom = 1;
      //   tileManager.tileSize = source.tileSize * 2 ** this.deltaZoom;
      //
      // donc notre `tileSize: 256` devient 512 chez celui qui l'héberge, et le
      // niveau de tuile — `round(zoom + log2(512/tileSize))` — recule d'un cran
      // pour TOUT ce qui consomme cette source. Vérifié : à zoom 1,32 la grille
      // passait de `2/x/y` à `1/x/y` au clic sur le bouton.
      //
      // Tant que l'ombrage partageait cette source, il héritait de la
      // réquisition : moitié moins de résolution, et 2,07 fois plus de
      // contraste, le boost interne de MapLibre étant indexé sur `overscaledZ`.
      // Le coût de la duplication est nul : mêmes URLs, donc le cache HTTP du
      // navigateur sert la seconde demande.
      [TERRAIN_SOURCE]: {
        ...shared,
        minzoom: tilejson.minzoom,
        maxzoom: tilejson.maxzoom,
        bounds: tilejson.bounds,
      },

      graticule: {
        type: "geojson",
        data: buildGraticule(a),
      },
    },

    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#05070a" },
      },
      {
        id: LAYERS.singleSourceHillshade,
        type: "hillshade",
        source: "dem",
        layout: { visibility: "visible" },
        paint: { ...LIGHTING, "hillshade-exaggeration": HILLSHADE_EXAGGERATION },
      },
      {
        // Le fond de relief : présent partout, suragrandi au-delà du partage.
        id: LAYERS.worldHillshade,
        type: "hillshade",
        source: "world",
        layout: { visibility: "none" },
        paint: { ...LIGHTING, "hillshade-exaggeration": HILLSHADE_EXAGGERATION },
      },
      {
        // Le relief net du terminateur, par-dessus.
        id: LAYERS.bandHillshade,
        type: "hillshade",
        source: "band",
        layout: { visibility: "none" },
        paint: { ...LIGHTING, "hillshade-exaggeration": HILLSHADE_EXAGGERATION },
      },

      // Éteintes au départ. Le style n'ayant pas de `glyphs`, aucun calque
      // `symbol` n'est possible — donc pas de libellés : l'information passe
      // par la couleur, expliquée dans la légende du panneau.
      //
      // ⚠️ DEUX calques, et non un seul avec une expression sur les tirets :
      // `line-dasharray` n'est **pas** pilotable par entité. Le motif est rendu
      // via une texture construite par calque, donc un `["get", …]` y est refusé
      // à la validation. `line-color` et `line-width`, eux, le supportent —
      // d'où le filtre plutôt que la duplication complète.
      {
        id: LAYERS.graticule,
        type: "line",
        source: "graticule",
        filter: ["!=", ["get", "dashed"], 1],
        layout: { visibility: "none", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["get", "width"],
          "line-opacity": 0.85,
        },
      },
      {
        id: LAYERS.graticuleDashed,
        type: "line",
        source: "graticule",
        filter: ["==", ["get", "dashed"], 1],
        layout: { visibility: "none" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["get", "width"],
          "line-opacity": 0.9,
          "line-dasharray": [4, 3],
        },
      },
    ],
  };
}
