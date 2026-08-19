/**
 * src/lib/sig/hydro.ts — les couches vectorielles, et ce qui les distingue du raster.
 *
 * ## Ce qu'une source vectorielle change pour le client
 *
 * Une source `raster-dem` livre des pixels : le style choisit comment les
 * éclairer, mais la donnée est déjà une image. Une source `vector` livre des
 * **géométries et des attributs** — c'est le client qui décide de tout, y
 * compris de ce qui est visible.
 *
 * Trois conséquences, toutes présentes dans ce fichier :
 *
 * 1. ⚠️ **`source-layer` est obligatoire, et son oubli est muet.** Une tuile MVT
 *    contient plusieurs couches nommées ; un calque doit dire laquelle il lit.
 *    Sans ce champ — ou avec un nom qui ne correspond à rien — MapLibre charge
 *    les tuiles, ne dessine rien, et ne signale rien. C'est le premier endroit à
 *    regarder quand une couche vectorielle reste invisible.
 *
 *    Les noms viennent de `vector_layers` du TileJSON, que le producteur écrit :
 *    `fleuves`, `exutoires`, `bassins`.
 *
 * 2. **Le style porte la sémantique.** La largeur d'un trait vient de
 *    `strahler`, le rayon d'un point de `drainage_km2`. C'est ici que l'ordre de
 *    Strahler retrouve son emploi : il ne sélectionne rien — le pipeline a
 *    mesuré qu'il ne le pouvait pas — mais il **hiérarchise le trait**, ce qui
 *    est son usage cartographique d'origine.
 *
 * 3. **Une seule requête rapporte les trois couches.** Là où le relief a une
 *    source par grandeur, une tuile vectorielle les regroupe : le client sait
 *    trier, le raster ne le sait pas.
 *
 * ## Le découpage monde / bande, une seconde fois
 *
 * Même contrainte qu'au relief, même remède (voir `style.ts`) : la pyramide
 * couvre le monde jusqu'à `split_zoom` et le seul terminateur au-delà, ce
 * qu'une `bounds` unique ne sait pas dire. Quatre sources sur les mêmes
 * fichiers, distinguées par leur plage de zoom et leur emprise.
 *
 * ⚠️ La raison du découpage n'est pourtant PAS la même que pour l'ombrage. Deux
 * `hillshade` superposés composent leurs calculs et se dégradent mutuellement ;
 * deux calques `line` opaques dessinent les mêmes pixels et ne se voient pas.
 * Ce qui l'impose ici, ce sont les **404** hors bande au-delà du partage, et le
 * doublement des remplissages semi-transparents des bassins.
 */

import type {
  CircleLayerSpecification,
  DataDrivenPropertyValueSpecification,
  FillLayerSpecification,
  LayerSpecification,
  LineLayerSpecification,
  SourceSpecification,
} from "maplibre-gl";
import {
  MERCATOR_LIMIT_DEG,
  vectorSplitZoom,
  vectorTileZoom,
} from "./mercator";
import type { Bounds } from "./tilejson";

/** Le contrat écrit par `aeonir_gis.mvt`. */
export interface HydroVectorLayer {
  id: string;
  description: string;
  minzoom: number;
  maxzoom: number;
  fields: Record<string, string>;
}

export interface HydroTileJSON {
  tilejson: string;
  name: string;
  format: string;
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  bounds: Bounds;
  center: [number, number, number];
  vector_layers: HydroVectorLayer[];
  "aeonir:epoch_a": number;
  "aeonir:extent": number;
  "aeonir:split_zoom": number;
  "aeonir:band_bounds": Bounds;
  /**
   * Seuil de généralisation appliqué à chaque niveau, par couche.
   *
   * Sans lui, une couche clairsemée au dézoom se lit comme une donnée pauvre au
   * lieu d'une donnée généralisée. Le panneau l'affiche pour cette raison.
   */
  "aeonir:generalisation": Record<string, Record<string, number>>;
}

/** Les trois couches de la tuile, dans l'ordre de dessin — du fond au trait. */
export const SOURCE_LAYERS = {
  basins: "bassins",
  rivers: "fleuves",
  outlets: "exutoires",
} as const;

/**
 * Préfixe commun aux identifiants de calque de l'hydrologie.
 *
 * ⚠️ C'est un **contrat**, pas une commodité de nommage : il est le seul moyen
 * qu'a le composant de retrouver ces calques dans le style monté, sans
 * reconstruire la liste de son côté. Le changer sans changer le filtre du
 * composant éteindrait la bascule en silence.
 */
export const HYDRO_PREFIX = "hydro-";

/** Une portée de source : même fichiers, emprise et plage de zoom distinctes. */
type Scope = "world" | "worldNorth" | "worldSouth" | "band";

export const HYDRO_SOURCES: Record<Scope, string> = {
  world: "hydro",
  worldNorth: "hydro-north",
  worldSouth: "hydro-south",
  band: "hydro-band",
};

/** Bleu d'eau, choisi pour rester lisible sur un ombrage ambre. */
const WATER = "#5ea8d9";
const BASIN_FILL = "#2b4a63";
const BASIN_LINE = "#41708f";

/**
 * Largeur du trait, de l'ordre de Strahler et du zoom.
 *
 * ⚠️ `interpolate` sur le zoom AVEC un `match` à l'intérieur, et non l'inverse :
 * `["zoom"]` n'est admis qu'au premier niveau d'une expression de style, et
 * l'imbriquer dans un `match` fait échouer la validation du style — donc la
 * carte entière, pas seulement ce calque.
 *
 * ⚠️ **Et le type ne le voit pas.** `DataDrivenPropertyValueSpecification`
 * rejette bien un opérateur inconnu, un nom de propriété fautif ou une valeur
 * du mauvais type — vérifié sur les trois — mais la position autorisée de
 * `["zoom"]` est une règle *sémantique*, contrôlée à la validation du style et
 * non par la structure. C'est ce qui fait tenir cet avertissement : il couvre
 * exactement ce que le compilateur laisse passer.
 *
 * Le dernier terme de chaque `match` est le défaut : une entité sans `strahler`
 * reste dessinée, en trait fin, plutôt que de disparaître.
 */
const RIVER_WIDTH: DataDrivenPropertyValueSpecification<number> = [
  "interpolate",
  ["linear"],
  ["zoom"],
  0,
  ["match", ["get", "strahler"], 1, 0.3, 2, 0.5, 3, 0.8, 4, 1.2, 0.3],
  4,
  ["match", ["get", "strahler"], 1, 0.6, 2, 1.1, 3, 1.8, 4, 2.6, 0.6],
  8,
  ["match", ["get", "strahler"], 1, 1.2, 2, 2.2, 3, 3.6, 4, 5.2, 1.2],
];

/**
 * Zoom de carte en deçà duquel les exutoires ne sont pas dessinés.
 *
 * ⚠️ Ce n'est pas un réglage esthétique mais une **généralisation de style**,
 * celle que le pipeline ne peut pas faire : il borne la charge PAR TUILE, à
 * 1 000 entités, et cette borne est tenue. Ce qu'elle ne borne pas, c'est la
 * densité à l'écran, où plusieurs dizaines de tuiles coexistent.
 *
 * Mesuré à z=4,2 : les exutoires touchent 0,5 % du canevas — 10 084 pixels — en
 * mouchetures d'un pixel réparties partout. À cette échelle, un point de
 * drainage ne situe rien ; il se lit comme du bruit de capteur, et il concurrence
 * les fleuves, qui n'en touchent que 1 %.
 *
 * **La généralisation a donc deux étages, et ils ne mesurent pas la même chose.**
 * Le producteur décide ce qu'une tuile peut porter ; le style décide ce qu'un
 * écran peut montrer. Confondre les deux fait chercher au mauvais endroit.
 */
const OUTLET_MIN_ZOOM = 5;

/**
 * Rayon d'un exutoire, de sa surface drainée.
 *
 * `interpolate` sur une grandeur CONTINUE cette fois — c'est la différence avec
 * les fleuves, et elle est instructive : `match` compare des valeurs exactes,
 * `interpolate` échelonne entre des paliers. Un attribut continu comme
 * `drainage_km2` n'a aucune valeur exacte à comparer.
 */
const OUTLET_RADIUS: DataDrivenPropertyValueSpecification<number> = [
  "interpolate",
  ["linear"],
  ["zoom"],
  OUTLET_MIN_ZOOM,
  ["interpolate", ["linear"], ["get", "drainage_km2"], 5000, 1, 300000, 2.5],
  8,
  ["interpolate", ["linear"], ["get", "drainage_km2"], 5000, 2, 300000, 6],
];

type HydroPaint =
  | { type: "fill"; paint: FillLayerSpecification["paint"] }
  | { type: "line"; paint: LineLayerSpecification["paint"] }
  | { type: "circle"; paint: CircleLayerSpecification["paint"] };

function paintFor(kind: keyof typeof SOURCE_LAYERS): HydroPaint {
  switch (kind) {
    case "basins":
      return {
        type: "fill",
        paint: {
          "fill-color": BASIN_FILL,
          // Assez faible pour laisser lire l'ombrage dessous : la couche dit où
          // sont les limites, elle ne repeint pas la carte.
          "fill-opacity": 0.16,
          "fill-outline-color": BASIN_LINE,
        },
      };
    case "rivers":
      return {
        type: "line",
        paint: {
          "line-color": WATER,
          "line-width": RIVER_WIDTH,
          "line-opacity": 0.9,
        },
      };
    case "outlets":
      return {
        type: "circle",
        paint: {
          "circle-color": WATER,
          "circle-radius": OUTLET_RADIUS,
          "circle-opacity": 0.85,
          "circle-stroke-width": 0.4,
          "circle-stroke-color": "#0b1620",
        },
      };
  }
}

/**
 * Les quatre sources, sur le même jeu de fichiers.
 *
 * ⚠️ `maxzoom` d'une source vectorielle ne veut pas dire « ne plus rien
 * afficher au-delà » mais « il n'existe pas de tuile plus fine — **sur-zoome**
 * celle-ci ». C'est l'écart de sens avec le raster qui piège : les couches
 * `world` restent donc lisibles au-delà de leur plafond, mais leur géométrie
 * est celle du niveau 4, et c'est pourquoi les calques les éteignent
 * explicitement au partage.
 */
export function hydroSources(
  contract: HydroTileJSON,
  urlTemplate: string
): Record<string, SourceSpecification> {
  const split = contract["aeonir:split_zoom"];
  const band = contract["aeonir:band_bounds"];
  const shared = {
    type: "vector" as const,
    tiles: [urlTemplate],
    attribution: "Aeonir — Quadrature",
  };
  return {
    [HYDRO_SOURCES.world]: {
      ...shared,
      minzoom: contract.minzoom,
      maxzoom: split,
      bounds: contract.bounds,
    },
    [HYDRO_SOURCES.worldNorth]: {
      ...shared,
      minzoom: contract.minzoom,
      maxzoom: split,
      bounds: [-180, band[3], 180, MERCATOR_LIMIT_DEG] as Bounds,
    },
    [HYDRO_SOURCES.worldSouth]: {
      ...shared,
      minzoom: contract.minzoom,
      maxzoom: split,
      bounds: [-180, -MERCATOR_LIMIT_DEG, 180, band[1]] as Bounds,
    },
    [HYDRO_SOURCES.band]: {
      ...shared,
      minzoom: split + 1,
      maxzoom: contract.maxzoom,
      bounds: band,
    },
  };
}

/**
 * Les douze calques, éteints au départ.
 *
 * L'ordre suit celui de `SOURCE_LAYERS` : remplissages d'abord, traits ensuite,
 * points en dernier. Un calque MapLibre ne se trie pas tout seul — c'est
 * l'ordre du tableau qui fait la superposition, et le mettre à l'envers cache
 * les fleuves sous les bassins.
 */
/** Plancher d'apparition propre à une nature de couche. */
const FLOOR: Record<keyof typeof SOURCE_LAYERS, number> = {
  basins: 0,
  rivers: 0,
  outlets: OUTLET_MIN_ZOOM,
};

export function hydroLayers(splitZoom: number): LayerSpecification[] {
  const kinds = Object.keys(SOURCE_LAYERS) as (keyof typeof SOURCE_LAYERS)[];
  const scopes: Scope[] = ["world", "worldNorth", "worldSouth", "band"];
  // ⚠️ DÉRIVÉ du partage de la pyramide, jamais recopié du relief. Le relais
  // vectoriel tombe un cran et demi plus tard que le sien — voir `mercator.ts`.
  // La première version reprenait 3,5 et ouvrait un trou de 3,5 à 5,0 dans le
  // terminateur : `world` éteint, `band` pas encore servie.
  const split = vectorSplitZoom(splitZoom);

  return kinds.flatMap((kind) =>
    scopes.flatMap((scope): LayerSpecification[] => {
      const minzoom = Math.max(FLOOR[kind], scope === "world" ? 0 : split);
      const maxzoom = scope === "world" ? split : undefined;

      // ⚠️ Un calque dont le plancher dépasse le plafond est REFUSÉ par la
      // validation du style, et c'est le style ENTIER qui tombe — pas ce
      // calque. Les exutoires n'apparaissant qu'au-delà du partage, leur
      // variante « monde » n'a aucune plage : on ne l'émet pas.
      if (maxzoom !== undefined && minzoom >= maxzoom) return [];

      const commun = {
        id: `${HYDRO_PREFIX}${kind}-${scope}`,
        source: HYDRO_SOURCES[scope],
        // ⚠️ Le champ dont l'oubli ne dit rien. Voir l'en-tête du module.
        "source-layer": SOURCE_LAYERS[kind],
        ...(minzoom > 0 ? { minzoom } : {}),
        ...(maxzoom === undefined ? {} : { maxzoom }),
        layout: { visibility: "none" as const },
      };

      // ⚠️ On ÉTALE `paintFor` au lieu de le déstructurer. Déstructurer
      // séparerait `type` de `paint`, et TypeScript perdrait la corrélation
      // entre les deux : il verrait un type parmi trois et une peinture parmi
      // trois, sans lien — d'où la conversion forcée qu'il fallait écrire
      // avant. Étalée, l'union reste discriminée et le calque se type seul.
      return [{ ...commun, ...paintFor(kind) }];
    })
  );
}

/**
 * Charge le contrat de l'hydrologie, ou rend `null`.
 *
 * ⚠️ Contrairement à `fetchTileJSON`, l'absence n'est PAS une erreur ici et ne
 * doit pas remonter : le relief seul est un état de travail ordinaire, et faire
 * échouer la carte entière parce qu'une couche facultative manque serait la
 * transformer en dépendance obligatoire par accident.
 *
 * Le `null` est donc une réponse, pas un échec — et le panneau le dit.
 */
export async function fetchHydroTileJSON(
  url: string
): Promise<HydroTileJSON | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as HydroTileJSON;
  } catch {
    return null;
  }
}

/**
 * Seuil de généralisation appliqué à une couche, au niveau de tuile servi.
 *
 * C'est ce qui permet de lire une couche clairsemée pour ce qu'elle est. Le
 * niveau demandé est borné aux clés existantes : au-delà de `maxzoom`, la tuile
 * servie est celle du plafond, sur-zoomée — donc c'est SON seuil qui s'applique,
 * pas celui d'un niveau qui n'a jamais été produit.
 */
export function generalisationAt(
  contract: HydroTileJSON,
  layer: string,
  /**
   * Zoom de **carte**. La conversion en niveau de tuile est faite ici, avec la
   * règle vectorielle — c'est justement ce qu'on ne peut pas laisser à
   * l'appelant sans qu'il y applique la règle raster par habitude.
   */
  mapZoom: number
): number | null {
  const table = contract["aeonir:generalisation"]?.[layer];
  if (!table) return null;
  const level = Math.max(
    contract.minzoom,
    Math.min(contract.maxzoom, vectorTileZoom(mapZoom))
  );
  const value = table[String(level)];
  return value === undefined ? null : value;
}

/**
 * Les calques d'hydrologie **présents dans le style monté**.
 *
 * ⚠️ On interroge la carte plutôt que de rejouer :func:`hydroLayers`, et ce
 * n'est pas une économie de calcul — onze objets ne coûtent rien. C'est qu'une
 * seconde dérivation de la même liste est une valeur calculée à deux endroits :
 * elle peut diverger de ce que le style contient réellement, et
 * `setLayoutProperty` sur un identifiant absent lève une erreur MapLibre.
 *
 * La liste dépend du partage — la variante « monde » des exutoires n'est émise
 * que si sa plage n'est pas vide — donc le risque n'est pas théorique.
 *
 * `getLayersOrder` ne rend qu'une copie du tableau d'identifiants ; il ne
 * sérialise pas le style, contrairement à `getStyle`.
 */
export function mountedHydroLayers(map: {
  getLayersOrder: () => string[];
}): string[] {
  return map.getLayersOrder().filter((id) => id.startsWith(HYDRO_PREFIX));
}
