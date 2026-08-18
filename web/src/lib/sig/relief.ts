/**
 * src/lib/sig/relief.ts — la politique du relief 3D, séparée de son application.
 *
 * Rien ici ne touche MapLibre : ce sont des fonctions du zoom et du réglage
 * utilisateur. Le composant les applique, il ne les décide pas.
 */

/**
 * Zoom en deçà duquel le relief 3D reste éteint, quoi que demande le bouton.
 *
 * **Une seule raison, et il faut être précis sur laquelle.**
 *
 * *C'est là que vit le défaut d'ombrage de MapLibre.* Une copie du monde n'entre
 * dans le champ que si le monde est plus étroit que la fenêtre, `512·2^z <
 * largeur` — donc sous z=3,9 pour un écran de 8 192 px, plus tôt pour tout écran
 * réel. Au-delà du seuil, aucune copie ne peut être visible, et le défaut mesuré
 * à +55 % d'écart entre colonnes de tuiles ne peut pas se produire.
 *
 * ⚠️ **Ce seuil n'a rien à voir avec la lisibilité du relief.** Le terrain est
 * un fBm de persistance 0,5 et lacunarité 2, donc d'exposant de Hurst 1 : il est
 * **invariant d'échelle**. Mesuré sur le MNT de production, sa pente médiane
 * vaut 0,33° à 3,7 km de portée et 0,16° à 938 km, et le relief local visible à
 * l'écran reste entre 6 et 12 px à *tous* les niveaux. Monter dans la pyramide
 * ne rend pas le relief plus escarpé ; seule l'exagération le fait.
 *
 * ⚠️ La mitigation ne tient que parce que le défaut et l'inutilité du relief 3D
 * occupent la même plage de zoom. Cette coïncidence **disparaît** si le Lot 7
 * amène un zoom plus profond dans le terminateur.
 */
export const TERRAIN_MIN_ZOOM = 4;

const MAX_PITCH_DEG = 60;
const PITCH_RAMP_ZOOMS = 2;

/**
 * Inclinaison de la caméra en fonction du zoom, au-delà du seuil.
 *
 * Un relief 3D regardé à la verticale ne se voit pas : la seule chose qui reste
 * est un changement d'éclairage global. Il faut incliner, et le faire
 * **progressivement depuis le seuil** — à `z = TERRAIN_MIN_ZOOM` l'inclinaison
 * vaut exactement 0, donc l'allumage du relief ne produit aucun saut de caméra.
 * Elle atteint son maximum deux niveaux plus haut, où le relief mérite d'être
 * regardé de biais.
 *
 * Interpolation en *smoothstep* `t²(3−2t)` plutôt que linéaire : sa dérivée
 * s'annule aux deux bouts, donc ni départ ni arrivée brusques pendant un zoom
 * continu.
 */
export function pitchForZoom(zoom: number): number {
  const t = Math.min(
    1,
    Math.max(0, (zoom - TERRAIN_MIN_ZOOM) / PITCH_RAMP_ZOOMS)
  );
  return MAX_PITCH_DEG * t * t * (3.0 - 2.0 * t);
}

export const EXAGGERATION_MIN = 1;
export const EXAGGERATION_MAX = 20;
export const EXAGGERATION_DEFAULT = 10;

/**
 * Exagération réellement transmise à MapLibre.
 *
 * Deux facteurs distincts se multiplient, et les mélanger serait une faute :
 *
 *   `terrain_exaggeration` = 1,336 = R⊕ / R_Aeonir
 *       Correction de rayon. MapLibre raisonne en mètres terrestres ; ce facteur
 *       restitue la proportion angulaire **exacte**. C'est la vérité, et le
 *       curseur à 1 la donne telle quelle.
 *
 *   le curseur, de 1 à 20
 *       Choix visuel, et rien d'autre. Il est nécessaire parce que le terrain
 *       d'Aeonir a une pente médiane mesurée de **0,3°** — une plaine alluviale.
 *       À 1× le relief est exact et invisible ; il faut ×11 pour un aspect de
 *       collines, ×36 pour un relief marqué.
 *
 * Le curseur affiche donc le facteur visuel seul, jamais le produit :
 * l'utilisateur choisit une lisibilité, pas une physique.
 *
 * ⚠️ Rustine assumée, et datée. Le vrai remède est un zoom plus profond dans le
 * terminateur — de l'ordre de z=10 — pour que le relief occupe assez de pixels
 * sans qu'on l'étire. C'est le Lot 7.
 */
export function effectiveExaggeration(
  visual: number,
  radiusCorrection: number
): number {
  return visual * radiusCorrection;
}
