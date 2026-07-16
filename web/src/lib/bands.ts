/**
 * src/lib/bands.ts
 *
 * Bandes d'initiative (cf. rules/fr/core/combat.md § b) Phase d'actions).
 * La manche se joue en trois bandes révélées successivement — à l'image du
 * Reflet Argenté qui croît, s'emplit, puis décroît. L'initiative imprimée sur la
 * carte (1-10) détermine sa bande, et donc la phase de lune qui figure sur son
 * coût : chaque lune vaut 1 point d'action.
 *
 * Module SANS dépendance `fs` (contrairement à lib/cards.ts et lib/bestiary.ts) :
 * il peut donc être importé par les composants client.
 */

/** Bande d'initiative. Les initiatives 0 et 10 sont hors-bande (cas particuliers). */
export type Band = "I" | "II" | "III";

/** Bande d'une initiative, ou `null` si elle est hors-bande (0 et 10). */
export function bandOf(initiative: number): Band | null {
  if (initiative >= 1 && initiative <= 3) return "I";
  if (initiative >= 4 && initiative <= 6) return "II";
  if (initiative >= 7 && initiative <= 9) return "III";
  return null;
}

/** Phase de lune figurant une bande : croissante · pleine · décroissante. */
export const BAND_MOON: Record<Band, string> = {
  I: "🌓",
  II: "🌕",
  III: "🌗",
};

/** Bande portée par un glyphe de lune, ou `null` si le caractère n'en est pas une. */
export function bandOfMoon(ch: string): Band | null {
  if (ch === BAND_MOON.I) return "I";
  if (ch === BAND_MOON.II) return "II";
  if (ch === BAND_MOON.III) return "III";
  return null;
}
