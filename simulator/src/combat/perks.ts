/**
 * Atouts de discipline (perks) — face COMBAT du registre (§ disciplines/).
 *
 * Le registre lui-même (données, prose, validation de progression) vit dans
 * character/disciplines.ts : un perk est d'abord un fait de progression. Ce
 * module n'expose que ce que le moteur consomme, organisé PAR FAMILLE d'effet
 * — comme combat/traits.ts.
 *
 * ── Familles implémentées ─────────────────────────────────────────────────────
 *  · `rollSubstitution`   → `rollSubstitutionRank` (armes de prédilection : Escrime
 *    🟨🟨 au lieu de la compétence, sur actions ET gardes). — Lot 1
 *  · `mentalInit`         → `initialMentalState` (les ♾️ Formes : état mental de
 *    début de combat). — Lot 2
 *  · `reactionOnTrigger`  → `reactionGrants` (⚡ sur déclencheur, gaté par l'état
 *    mental — Belliciste, Fine Lame). — Lot 2
 *
 * ── Familles cadrées, pas encore branchées (grants `wired: false`) ────────────
 *  · `rollBonus` (relance Fine Lame) · `costOverride` · `outcomeRider` (Belliciste)
 *  · le déclencheur `guard-weakened` du Duelliste (exige une Garde mutable).
 *
 * Le porteur est lu depuis `state.char` (source unique de la fiche, toujours
 * présente sur un CombatantState) : pas de champ dupliqué sur l'état, donc aucun
 * churn sur les fixtures — les perks ne changent jamais en cours de combat.
 */

import type { Character, DisciplineId } from '../character/types'
import type { CombatEffect, MentalState } from './types'
import { MENTAL_STATES } from './types'
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

// ─── Famille `mentalInit` : l'état mental de départ (les ♾️ Formes) ────────────

/**
 * État mental de DÉBUT de combat imposé par les perks (Duelliste→Prudent, Fine
 * Lame→Concentré, Belliciste→Agressif). `'focused'` par défaut, comme avant.
 *
 * Si plusieurs Formes en imposent un, la PREMIÈRE portée l'emporte : le choix du
 * joueur n'est pas modélisé, mais un combattant de test n'a qu'une Forme.
 */
export function initialMentalState(char: Character): MentalState {
  for (const id of char.perks ?? []) {
    for (const g of PERK_DEFS[id]?.grants ?? []) {
      if (g.kind === 'mentalInit' && g.wired !== false && MENTAL_STATES.includes(g.state as MentalState)) {
        return g.state as MentalState
      }
    }
  }
  return 'focused'
}

// ─── Famille `reactionOnTrigger` : ⚡ sur déclencheur (les ♾️ Formes) ───────────

/** Faits d'une action résolue dont dépendent les déclencheurs ♾️. */
export interface ActionResolution {
  /** Attaque armée = tags `melee` + `physicalDamage` (exclut mains nues, tir). */
  isArmedAttack: boolean
  /** Le jet a substitué la discipline (Escrime 🟨🟨). */
  usedFencing:   boolean
  hit:  boolean
  flaw: boolean
  mentalState: MentalState
}

/** Un déclencheur ♾️ a-t-il feu, au vu des faits de l'action ? */
const TRIGGER_FIRES: Record<string, (r: ActionResolution) => boolean> = {
  'armed-attack-success':    r => r.isArmedAttack && r.hit,
  'fencing-success-no-flaw': r => r.usedFencing && r.hit && !r.flaw,
}

/**
 * ⚡ gagnées via les ♾️ Formes après une action résolue :
 *  · Belliciste — une attaque armée réussie, tant qu'Agressif ;
 *  · Fine Lame — un jet Escrime réussi sans Défaut, tant que Concentré.
 *
 * Gaté par l'état mental (`whileMental`). Le déclencheur `guard-weakened` du
 * Duelliste est `wired: false` → il ne passe jamais ici.
 */
export function reactionGrants(
  carrier: PerkCarrier,
  actorId: string,
  res:     ActionResolution,
): { effects: CombatEffect[]; notes: string[] } {
  const effects: CombatEffect[] = []
  const notes:   string[]       = []
  for (const id of carrier.char.perks ?? []) {
    const def = PERK_DEFS[id]
    if (!def) continue
    for (const g of def.grants) {
      if (g.kind !== 'reactionOnTrigger' || g.wired === false) continue
      if (!TRIGGER_FIRES[g.on]?.(res)) continue
      if (g.whileMental && !g.whileMental.includes(res.mentalState)) continue
      effects.push({ targetId: actorId, kind: 'add-reaction', amount: g.amount })
      notes.push(`♾️ ${def.name} — +${g.amount}⚡`)
    }
  }
  return { effects, notes }
}
