/**
 * Atouts de discipline (perks) — face COMBAT du registre (§ disciplines/).
 *
 * Le registre lui-même (données, prose, validation de progression) vit dans
 * character/disciplines.ts : un perk est d'abord un fait de progression. Ce
 * module n'expose que ce que le moteur consomme, organisé PAR FAMILLE d'effet
 * — comme combat/traits.ts.
 *
 * ── Familles implémentées ─────────────────────────────────────────────────────
 *  · `rollSubstitution` → `rollSubstitutionRank` (armes de prédilection : Escrime
 *    🟨🟨 au lieu de la compétence, sur actions ET gardes).
 *
 * ── Familles cadrées, pas encore branchées (grants `wired: false`) ────────────
 *  · `mentalInit` / `reactionOnTrigger` → les ♾️ Formes (état mental initial +
 *    ⚡ sur déclencheur gaté). Lot 2.
 *  · `rollBonus` / `costOverride` / `outcomeRider` → passifs restants.
 *
 * Le porteur est lu depuis `state.char` (source unique de la fiche, toujours
 * présente sur un CombatantState) : pas de champ dupliqué sur l'état, donc aucun
 * churn sur les fixtures — les perks ne changent jamais en cours de combat.
 */

import type { Character, DisciplineId } from '../character/types'
import { PERK_DEFS, effectiveSkillTags } from '../character/disciplines'

/** Le porteur, réduit à ce dont ce module a besoin (la fiche). */
export interface PerkCarrier { char: Character }

/**
 * Rang de discipline à SUBSTITUER à la valeur de compétence pour ce jet, ou
 * `null` si aucun perk branché ne s'applique.
 *
 * Un perk s'applique si l'un de ses grants `rollSubstitution` (branché) vise
 * cette action/garde ET que son `requiresSkillTag` figure dans les skillTags
 * effectifs du porteur. Le rang rendu est celui INVESTI dans la discipline du
 * perk (0 si non investi — la substitution reste « active » mais ne rapporte
 * rien, ce qui est correct : un duelliste Escrime 0 pare avec 0 en compétence).
 */
export function rollSubstitutionRank(
  carrier:    PerkCarrier,
  targetType: 'action' | 'guard',
  targetId:   string,
): number | null {
  const perks = carrier.char.perks ?? []
  if (perks.length === 0) return null

  const effTags = effectiveSkillTags(perks, carrier.char.skillTags ?? [])

  for (const id of perks) {
    const def = PERK_DEFS[id]
    if (!def) continue
    for (const g of def.grants) {
      if (g.kind !== 'rollSubstitution' || g.wired === false) continue
      if (g.target.type !== targetType || g.target.id !== targetId) continue
      if (g.requiresSkillTag && !effTags.has(g.requiresSkillTag)) continue
      return carrier.char.disciplines?.[def.discipline as DisciplineId] ?? 0
    }
  }
  return null
}
