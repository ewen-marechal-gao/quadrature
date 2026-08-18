/**
 * src/lib/sig/palette.ts — les teintes hypsométriques, et rien d'autre.
 *
 * Une palette est une liste de couples (altitude en mètres, couleur). MapLibre
 * l'interpole lui-même, dans la couche `color-relief` : on ne fabrique donc pas
 * d'image, on décrit une fonction de l'altitude.
 *
 * Le module est délibérément séparé du style : c'est la pièce qu'on remplace
 * pour raconter un autre monde, et les données du terrain n'y entrent pas.
 */

import type { ExpressionSpecification } from "maplibre-gl";

/** Un arrêt de la rampe : altitude en mètres, couleur CSS. */
export type ElevationStop = readonly [metres: number, color: string];

export interface Palette {
  id: string;
  /** Libellé du bouton. */
  label: string;
  /**
   * Arrêts par altitude **strictement croissante** — `interpolate` l'exige, et
   * une paire d'arrêts au même mètre ferait échouer la validation du style.
   * D'où le `-1 m` du rivage plutôt qu'un second `0`.
   */
  stops: readonly ElevationStop[];
}

/**
 * Teintes hypsométriques terrestres — le schéma classique des atlas : bleus
 * bathymétriques sous le niveau de la mer, puis vert, ocre, brun, gris et neige
 * en montant.
 *
 * ⚠️ **Cette palette affirme quelque chose sur le monde qu'elle colore.** Elle
 * place une côte à l'altitude 0 et de l'eau en dessous, ce qui n'est vrai de la
 * Terre que parce que son niveau marin coïncide avec son datum. Sur Aeonir, le
 * zéro est le **datum sphérique** : une altitude négative n'y signifie pas
 * « sous l'eau », seulement « sous la sphère de référence ». Appliquée telle
 * quelle, cette palette raconte donc un océan global qui n'existe pas.
 *
 * Elle est ici pour ce qu'elle vaut : un étalon lisible, immédiatement
 * reconnaissable, qui permet de juger la couche `color-relief` sur un terrain
 * dont on connaît déjà les codes. La palette propre à Aeonir viendra ensuite,
 * et devra d'abord trancher ce que ses altitudes veulent dire.
 *
 * Les bornes couvrent l'amplitude terrestre — de la fosse des Mariannes
 * (−10 994 m) à l'Everest (8 849 m) — qui se trouve encadrer celle du MNT
 * d'Aeonir. Voir `calibration.json` pour les extrêmes réels du tirage.
 */
export const EARTH_HYPSOMETRIC: Palette = {
  id: "earth",
  label: "palette — Terre",
  stops: [
    // ── Bathymétrie ────────────────────────────────────────────────
    [-11000, "#08163f"],
    [-6000, "#0d2f6b"],
    [-4000, "#14508f"],
    [-2000, "#1f74b1"],
    [-500, "#4ea3d1"],
    [-100, "#90c8e8"],
    [-1, "#c8e6f5"],
    // ── Terres émergées ────────────────────────────────────────────
    [0, "#3d7a3d"],
    [200, "#6fa34a"],
    [500, "#a8c25e"],
    [1000, "#d9c979"],
    [1500, "#c9a165"],
    [2500, "#a9764f"],
    [3500, "#8a5a44"],
    [4500, "#9c8c85"],
    [5500, "#c9c4c0"],
    [7000, "#ffffff"],
  ],
};

/**
 * Opacité de la couche de teintes, posée AU-DESSUS de l'ombrage — et réglable.
 *
 * L'empilement n'est pas indifférent, et l'arithmétique du compositage décide
 * de tout : il ne survit de l'ombrage que `1 − opacité` de sa propre dynamique.
 * Mesuré sur le MNT de production, l'ombrage seul couvre 51 niveaux sur 255 ;
 * à 80 % d'opacité il n'en reste donc au mieux 10, et 2 en médiane — le modelé
 * qu'on croyait voir venait en réalité du dégradé de couleurs répondant à
 * l'altitude, pas de l'éclairage.
 *
 * D'où un curseur plutôt qu'une constante : le bon équilibre entre « lire une
 * altitude » et « lire une forme » dépend de ce qu'on regarde, et se cherche à
 * l'œil.
 *
 * ⚠️ Le plancher n'est pas 0. À opacité nulle la palette disparaîtrait, ce que
 * son propre bouton fait déjà : une position de curseur qui double une autre
 * commande est une position de trop.
 *
 * ⚠️ Ce n'est PAS le levier qu'on croit d'abord. `hillshade-illumination-
 * altitude` est sans effet mesurable ici — vérifié de 45° à 3°, rendu
 * identique à l'octet près — et `hillshade-exaggeration` plafonne à 1, d'où il
 * ne reste que 18 % de marge depuis 0,85.
 */
export const TINT_OPACITY_MIN = 0.2;
export const TINT_OPACITY_MAX = 1;
export const TINT_OPACITY_DEFAULT = 0.55;

/** Toutes les palettes disponibles, dans l'ordre du sélecteur. */
export const PALETTES: readonly Palette[] = [EARTH_HYPSOMETRIC];

/**
 * Traduit une palette en expression `color-relief-color`.
 *
 * La forme est imposée par la spécification : une interpolation dont l'entrée
 * est `["elevation"]`, en mètres. Aucun autre paramètre n'y est admis.
 */
export function colorReliefExpression(
  palette: Palette
): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["elevation"],
    ...palette.stops.flat(),
  ] as unknown as ExpressionSpecification;
}
