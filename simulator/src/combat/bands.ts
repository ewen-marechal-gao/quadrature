/**
 * Initiative bands (cf. rules/fr/core/combat.md § b) Phase d'actions).
 *
 * A round is swept band by band — I, then II, then III — mirroring the moon of
 * Aeonir as it waxes, fills, then wanes. Each band is revealed only once the
 * previous one has resolved, so a slow card commits knowing the outcome of the
 * fast ones, but blind to the rest of its own band.
 *
 * A card's printed initiative (1-10) decides its band; 0 and 10 are deliberately
 * out-of-band, reserved for special cases (a reaction resolving before band I,
 * an exceptionally late effect after band III).
 *
 * The band only paces *commitment*. Resolution order stays the fine 1-10
 * initiative, handled by the initiative groups inside each band.
 */

/** One of the three bands a card can belong to. */
export type Band = 'I' | 'II' | 'III'

/** The bands in reveal order — the sweep of a round. */
export const BANDS: readonly Band[] = ['I', 'II', 'III'] as const

/**
 * The moon each band is written with on the cards — waxing, full, waning
 * (§ glossaire : 🌓 = 1 PA Bande I, 🌕 = Bande II, 🌗 = Bande III).
 * Mirrors web/src/lib/bands.ts, which draws them as SVG rather than emoji.
 */
export const BAND_MOON: Record<Band, string> = { I: '🌓', II: '🌕', III: '🌗' }

/** Band of an initiative, or null when it is out-of-band (0 and 10). */
export function bandOf(initiative: number): Band | null {
  if (initiative >= 1 && initiative <= 3) return 'I'
  if (initiative >= 4 && initiative <= 6) return 'II'
  if (initiative >= 7 && initiative <= 9) return 'III'
  return null
}
