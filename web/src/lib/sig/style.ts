/**
 * src/lib/sig/style.ts — le style MapLibre, construit à partir du TileJSON.
 *
 * Tout ce qui varie (gabarit d'URL, plage de zoom, emprises, encodage) vient du
 * contrat ; ce fichier n'apporte que la mise en scène.
 */

import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { buildGraticule } from "./graticule";
import { MERCATOR_LIMIT_DEG } from "./mercator";
import {
  EARTH_HYPSOMETRIC,
  TINT_OPACITY_DEFAULT,
  colorReliefExpression,
} from "./palette";
import { NEUTRAL_METHOD, VACUUM_SHADOW } from "./sun";
import type { AeonirTileJSON, Bounds } from "./tilejson";

/**
 * Le partage entre les deux montages, en zoom de CARTE.
 *
 * ⚠️ Ce n'est pas `split_zoom`, qui est un niveau de TUILE. Avec des tuiles de
 * 256 px, MapLibre sert le niveau `round(zoom + 1)` : mesuré, la source `band`
 * ne rend rien jusqu'à 3,4 et sert du z=5 dès 3,6. Le relais se fait donc à
 * **3,5**, et c'est là que les couches doivent se passer la main.
 */
const LAYER_SPLIT_ZOOM = 3.5;

/**
 * Les couches de relief, et la portée de chacune.
 *
 * ── Pourquoi quatre couches pour le montage à sources multiples ────────
 *
 * ⚠️ **Deux couches `hillshade` qui se recouvrent calculent chacune leur
 * ombrage, et les deux se composent.** Ce n'est pas une source qui coûte, c'est
 * une couche : une source que plus aucune couche visible ne vise tombe à zéro
 * tuile (mesuré), mais chaque couche visible fait sa propre passe hors écran.
 *
 * La version précédente laissait `world` peindre PARTOUT, y compris sous
 * `band` là où la donnée nette existe déjà. Le modelé grossier du z=4 étiré
 * concurrençait alors le détail du z=6 : dans la bande, le montage à sources
 * multiples rendait moins bien que celui à source unique — moyenne 27,1 contre
 * 14,5, le fin dilué dans le grossier.
 *
 * D'où le découpage : au-delà du partage, `world` s'efface et laisse la place à
 * deux couches qui ne couvrent QUE le hors-bande. Plus aucun recouvrement.
 *
 * ⚠️ Il faut deux emprises, nord et sud, parce que `bounds` est une **boîte** :
 * « partout sauf cette bande » ne s'écrit pas d'un seul rectangle. Mais c'est
 * bien `minzoom`/`maxzoom` **de couche** qui réalise l'exclusion en zoom — les
 * bornes de source ne découpent qu'en latitude.
 */
interface ReliefLayer {
  /** Identifiant interne, sert à distinguer le montage à source unique. */
  key: "single" | "world" | "worldNorth" | "worldSouth" | "band";
  source: string;
  hillshade: string;
  color: string;
  /** Portées de COUCHE, en zoom de carte. C'est elles qui excluent en zoom. */
  minzoom?: number;
  maxzoom?: number;
}

const RELIEF_LAYERS: readonly ReliefLayer[] = [
  {
    key: "single",
    source: "dem",
    hillshade: "hillshade-single",
    color: "color-relief-single",
  },
  {
    key: "world",
    source: "world",
    hillshade: "hillshade-world",
    color: "color-relief-world",
    // Le fond global, jusqu'au partage seulement : au-delà, les trois suivantes
    // se partagent le monde sans se marcher dessus.
    maxzoom: LAYER_SPLIT_ZOOM,
  },
  {
    key: "worldNorth",
    source: "world-north",
    hillshade: "hillshade-world-north",
    color: "color-relief-world-north",
    minzoom: LAYER_SPLIT_ZOOM,
  },
  {
    key: "worldSouth",
    source: "world-south",
    hillshade: "hillshade-world-south",
    color: "color-relief-world-south",
    minzoom: LAYER_SPLIT_ZOOM,
  },
  {
    key: "band",
    source: "band",
    hillshade: "hillshade-band",
    color: "color-relief-band",
  },
];

const par = (key: ReliefLayer["key"]) =>
  RELIEF_LAYERS.find((l) => l.key === key)!;

/**
 * Les couches de chaque montage, prêtes à être allumées ou éteintes en bloc.
 *
 * Le composant n'a ainsi jamais à connaître le détail du découpage : il bascule
 * entre deux ensembles.
 */
export const MONTAGES = {
  single: {
    hillshade: [par("single").hillshade],
    color: [par("single").color],
  },
  multi: {
    hillshade: RELIEF_LAYERS.filter((l) => l.key !== "single").map(
      (l) => l.hillshade
    ),
    color: RELIEF_LAYERS.filter((l) => l.key !== "single").map((l) => l.color),
  },
} as const;

/** Toutes les couches d'ombrage, tous montages confondus — pour l'éclairage. */
export const ALL_HILLSHADE_LAYERS = RELIEF_LAYERS.map((l) => l.hillshade);

/** Toutes les couches de teintes — pour l'opacité. */
export const ALL_COLOR_LAYERS = RELIEF_LAYERS.map((l) => l.color);

export const LAYERS = {
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
  // Le régime de départ : ombrage neutre, sans notion d'angle, et sans air.
  // Les deux bascules le remplacent sur les trois ombrages — voir sun.ts, qui
  // porte les mesures et la limite : l'éclairage est un uniforme, il ne peut
  // PAS varier avec la latitude à l'intérieur d'une couche.
  "hillshade-method": NEUTRAL_METHOD,
  "hillshade-shadow-color": VACUUM_SHADOW,
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

      // ── Le monde HORS bande, en deux moitiés ──────────────────────
      //
      // Mêmes fichiers et même plafond que `world` : ces sources ne servent
      // qu'à découper en latitude ce qu'une seule boîte `bounds` ne sait pas
      // exprimer. Voir RELIEF_LAYERS pour le pourquoi.
      //
      // Les bornes sont celles de l'emprise RÉELLEMENT tuilée, pas les seuils
      // climatiques : le raccord doit tomber exactement là où `band` s'arrête,
      // sinon on rouvre un recouvrement d'un côté ou un trou de l'autre.
      "world-north": {
        ...shared,
        minzoom: tilejson.minzoom,
        maxzoom: a.split_zoom,
        bounds: [-180, a.band_bounds[3], 180, MERCATOR_LIMIT_DEG] as Bounds,
      },
      "world-south": {
        ...shared,
        minzoom: tilejson.minzoom,
        maxzoom: a.split_zoom,
        bounds: [-180, -MERCATOR_LIMIT_DEG, 180, a.band_bounds[1]] as Bounds,
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
      // ── Les ombrages, un par couche de la table ───────────────────
      //
      // `single` est allumée au départ : le montage à source unique est le
      // défaut, et c'est celui qui rend le mieux dans la bande.
      ...RELIEF_LAYERS.map(
        ({ key, source, hillshade, minzoom, maxzoom }): LayerSpecification => ({
          id: hillshade,
          type: "hillshade",
          source,
          ...(minzoom === undefined ? {} : { minzoom }),
          ...(maxzoom === undefined ? {} : { maxzoom }),
          layout: { visibility: key === "single" ? "visible" : "none" },
          paint: {
            ...LIGHTING,
            "hillshade-exaggeration": HILLSHADE_EXAGGERATION,
          },
        })
      ),

      // ── Les teintes hypsométriques, PAR-DESSUS l'ombrage ──────────
      //
      // Éteintes au départ : le visualiseur reste un instrument de mesure du
      // relief, la couleur est une lecture qu'on demande.
      //
      // Même découpage que les ombrages, et pour la même raison : deux couches
      // de teintes superposées se composeraient au lieu de se relayer.
      ...RELIEF_LAYERS.map(
        ({ source, color, minzoom, maxzoom }): LayerSpecification => ({
          id: color,
          type: "color-relief",
          source,
          ...(minzoom === undefined ? {} : { minzoom }),
          ...(maxzoom === undefined ? {} : { maxzoom }),
          layout: { visibility: "none" },
          paint: {
            "color-relief-color": colorReliefExpression(EARTH_HYPSOMETRIC),
            "color-relief-opacity": TINT_OPACITY_DEFAULT,
          },
        })
      ),

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
