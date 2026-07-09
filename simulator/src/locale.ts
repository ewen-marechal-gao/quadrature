/**
 * Locale strings — the { fr, en? } shape used by every data file of the
 * project (data/*.yaml, data/bestiary/cards/*.card.yaml).
 *
 * Single source of the fallback rule (requested locale → fr → en → ''),
 * shared by the player-action loader and the adversary fiche loader.
 */

export type LocalizedString = { fr: string; en?: string }

/** Resolve a Locale string to the requested locale, falling back to fr then en. */
export function localize(s: LocalizedString, locale: string): string {
  return (s as Record<string, string>)[locale] ?? s.fr ?? s.en ?? ''
}
