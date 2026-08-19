/**
 * src/lib/sig/sun.ts — le modèle d'éclairage de l'ombrage.
 *
 * Deux termes indépendants, qui se composent :
 *
 *   la lumière directe   d'où vient l'étoile, et à quelle hauteur
 *   la lumière diffuse   ce qui éclaire ce que l'étoile n'atteint pas
 *
 * Le second n'est pas un réglage esthétique : c'est **l'atmosphère**. Sans lui,
 * une face non éclairée est noire — ce qui est juste pour un monde sans air, et
 * faux pour Aeonir.
 *
 * ── Ce que MapLibre permet, et ce qu'il interdit ───────────────────────
 *
 * ⚠️ **L'éclairage est un uniforme, pas un champ.** La spécification donne à
 * `hillshade-illumination-direction` comme à `-altitude` le `property-type`
 * `data-constant`, avec `zoom` pour seul paramètre d'expression. Une couche
 * `hillshade` porte donc un seul soleil pour toute la carte, et il est
 * impossible de faire varier l'élévation avec la latitude à l'intérieur d'une
 * couche.
 *
 * C'est gênant, parce que dans le repère Étoile **la latitude EST l'élévation
 * de l'étoile** — par définition, le pôle nord étant le point substellaire.
 *
 * La sortie retenue : recalculer l'élévation sur la latitude du **centre de la
 * vue**, à chaque déplacement. Ce n'est pas exact au pixel, c'est exact là où
 * l'on regarde — et remonter vers le nord fait réellement lever l'étoile, ce
 * qu'aucun réglage fixe ne montrerait. La contrainte est assumée plutôt que
 * maquillée.
 *
 * ── Le piège de la méthode ─────────────────────────────────────────────
 *
 * ⚠️ **`hillshade-method: "standard"` ignore l'altitude du soleil.** Mesuré sur
 * le MNT de production : de 80° à 5°, rendu identique à l'octet près (moyenne
 * 20,5, amplitude 51). `igor` l'ignore aussi. Seules `basic`,
 * `multidirectional` et `combined` la consomment.
 *
 * Activer l'éclairage réaliste change donc aussi de méthode. Sans quoi le
 * réglage n'existerait pas.
 *
 * `multidirectional` plutôt que `basic` — les deux rendent identiquement avec
 * un seul astre, mais les propriétés d'illumination sont des **tableaux**
 * (`numberArray`, `colorArray`) : la lune viendra s'y ajouter en second terme
 * sans rien réécrire.
 *
 * ── Pourquoi l'atmosphère n'est pas un détail ──────────────────────────
 *
 * Mesuré à 11° d'élévation — la valeur réelle au Mur des Tempêtes — en ne
 * changeant que la couleur de l'ombre :
 *
 *   #050a12 (quasi noire)   moyenne  9,5   amplitude   6,7
 *   #26333f                 moyenne 32,5   amplitude  43
 *   #3a4654                 moyenne 44,1   amplitude  62,3
 *
 * Sans terme diffus, l'angle physiquement juste rend la carte illisible ; avec,
 * il passe devant la méthode `standard` (51) à n'importe quel angle. Ce n'est
 * donc pas la platitude du terrain qui interdisait l'angle réel, c'était
 * l'absence d'air.
 */

/** Méthode sans notion d'angle — l'ombrage neutre, celui d'origine. */
export const NEUTRAL_METHOD = "standard" as const;

/** Méthode qui lit l'élévation, et accepte plusieurs astres. */
export const REALISTIC_METHOD = "multidirectional" as const;

/**
 * L'étoile est au pôle nord du repère Étoile — par définition, ce pôle EST le
 * point substellaire. Sa lumière vient donc du nord, quoi qu'on regarde.
 */
export const STAR_AZIMUTH_DEG = 0;

/** Ambre de l'étoile, d'après `rules/fr/univers/climat.md`. */
export const STAR_HIGHLIGHT = "#ffd9a0";

/** Ombre sans atmosphère : ce que l'étoile n'atteint pas ne reçoit rien. */
export const VACUUM_SHADOW = "#050a12";

/**
 * Ombre avec atmosphère : la couleur que prend une face privée de lumière
 * directe — c'est-à-dire, physiquement, la couleur du ciel.
 *
 * Réglable au panneau : un air plus dense, plus poussiéreux ou d'une autre
 * composition ne diffuse pas la même teinte.
 */
export const ATMOSPHERE_SHADOW = "#26333f";

/**
 * Densité de l'atmosphère, de 0 (vide) à 1 (l'air de référence ci-dessus).
 *
 * ⚠️ Ce facteur multiplie l'atténuation par la latitude, il ne la remplace pas :
 * l'utilisateur règle l'air qu'il y a **en plein jour**, et le modèle
 * l'assombrit ensuite à mesure que l'étoile se couche.
 */
export const ATMOSPHERE_DENSITY_MIN = 0.1;
export const ATMOSPHERE_DENSITY_MAX = 1;
export const ATMOSPHERE_DENSITY_DEFAULT = 1;

/**
 * Élévation de l'étoile pour une latitude Étoile, en degrés.
 *
 * L'identité est exacte et c'est la définition du repère. Le bornage à 0 n'est
 * pas une approximation mais une contrainte de MapLibre, dont la propriété
 * n'admet que [0, 90] : une étoile couchée s'exprime par son intensité, pas par
 * une élévation négative. Voir `starIntensity`.
 */
export function starElevationDeg(latDeg: number): number {
  return Math.max(0, Math.min(90, latDeg));
}

/**
 * Part de la lumière directe encore reçue, de 1 en plein jour à 0 en pleine
 * nuit.
 *
 * Sous l'équateur — le milieu du terminateur — l'étoile est couchée, et il ne
 * reste qu'un crépuscule qui s'éteint en descendant. Le plancher est le
 * **Linceul** du lore, lu dans le TileJSON plutôt qu'écrit ici : la carte
 * s'assombrit donc exactement là où le monde dit qu'il fait nuit.
 */
export function starIntensity(latDeg: number, twilightFloorDeg: number): number {
  if (latDeg >= 0) return 1;
  if (latDeg <= twilightFloorDeg) return 0;
  return 1 - latDeg / twilightFloorDeg;
}

/**
 * Part de lumière diffuse encore disponible, de 1 en plein jour à
 * `NIGHT_AMBIENT` en pleine nuit.
 *
 * ⚠️ L'atmosphère ne fabrique pas de lumière, **elle en diffuse**. Éteindre
 * l'étoile sans réduire le terme diffus donne une nuit aussi claire que le
 * jour — mesuré à 46 de moyenne de l'équateur à −40°, ce qui était le défaut de
 * la première version de ce modèle.
 *
 * Le plancher n'est pas nul pour autant : un air épais transporte de la lumière
 * **au-delà du terminateur**, et c'est précisément ce qui fait un crépuscule
 * plutôt qu'une frontière nette. Sa valeur est un choix, pas une mesure — c'est
 * aussi la place qu'occupera la lune, seul astre mobile d'Aeonir, quand elle
 * viendra éclairer la face froide.
 */
export const NIGHT_AMBIENT = 0.25;

export function ambientIntensity(
  latDeg: number,
  twilightFloorDeg: number
): number {
  return (
    NIGHT_AMBIENT +
    (1 - NIGHT_AMBIENT) * starIntensity(latDeg, twilightFloorDeg)
  );
}

/** Mélange deux couleurs `#rrggbb`. `t = 0` rend `a`, `t = 1` rend `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const lire = (h: string) =>
    [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ra, ga, ba] = lire(a);
  const [rb, gb, bb] = lire(b);
  const k = Math.max(0, Math.min(1, t));
  const c = (x: number, y: number) =>
    Math.round(x + (y - x) * k)
      .toString(16)
      .padStart(2, "0");
  return `#${c(ra, rb)}${c(ga, gb)}${c(ba, bb)}`;
}

/**
 * Haute lumière effective : l'ambre de l'étoile, fondu vers l'ombre à mesure
 * qu'elle se couche.
 *
 * MapLibre n'offre pas d'intensité par astre — seulement une couleur. Éteindre
 * une source revient donc à la ramener sur la couleur d'ombre, ce qui annule sa
 * contribution directionnelle.
 */
export function starHighlight(
  latDeg: number,
  twilightFloorDeg: number,
  shadow: string
): string {
  return mixHex(shadow, STAR_HIGHLIGHT, starIntensity(latDeg, twilightFloorDeg));
}

/**
 * Ombre effective : la couleur de l'air, assombrie à mesure que l'étoile se
 * couche.
 *
 * Sans atmosphère il n'y a rien à diffuser, et la couleur ne dépend donc pas de
 * la latitude — un monde sans air a la même nuit partout.
 */
export interface AtmosphereSettings {
  /** Éteinte, l'air disparaît et la nuit devient la même partout. */
  enabled: boolean;
  /** Couleur du ciel, `#rrggbb`. */
  color: string;
  /** Densité, de `ATMOSPHERE_DENSITY_MIN` à `ATMOSPHERE_DENSITY_MAX`. */
  density: number;
}

export function ambientShadow(
  latDeg: number,
  twilightFloorDeg: number,
  atmosphere: AtmosphereSettings
): string {
  if (!atmosphere.enabled) return VACUUM_SHADOW;
  return mixHex(
    "#000000",
    atmosphere.color,
    atmosphere.density * ambientIntensity(latDeg, twilightFloorDeg)
  );
}
