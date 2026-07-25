/**
 * Traits de personnage — face COMBAT du registre (§ rules/fr/core/traits.md).
 *
 * Le registre lui-même (données, prose, validation de progression) vit dans
 * character/traits.ts : un trait est d'abord un fait de progression. Ce module
 * n'expose que ce que le moteur consomme, organisé **par famille d'effet** — et
 * non en cascade de `if`, l'écueil signalé sur `attackAdvantages` côté adversaire.
 * Ajouter un trait qui tombe dans une famille connue devient alors une entrée
 * YAML, sans une ligne de code.
 *
 * ── Familles implémentées ────────────────────────────────────────────────────
 *  · `reactiveMode` → `reactionDefs`        (Opportunisme, Tir d'instinct)
 *  · `costDelta`    → `applyTraitOverlays`  (Momentum)
 *
 * ── Familles cadrées, pas encore implémentées ────────────────────────────────
 *  · `rollBonus` → `traitRollMods(state, ctx) → { advantages, rerolls, skillBoosts }`
 *    Les quatre primitives existent DÉJÀ dans le dé (`RollParams`), dont
 *    `skillBoosts` ⬆ dont le commentaire dit « via traits ». À brancher dans
 *    `checkRollParams` / `makeGuardRoll`. (Tir ajusté, Esquives chorégraphiées…)
 *  · `guardMod` → `traitGuardMods(state, guardId) → { cost, grantsStatus }`
 *    Coût et contrecoup d'une garde. (Esquive plongeante, Garde écrasante.)
 *
 * Ce module est PUR : il ne connaît ni ACTION_DEFS ni l'état du combat, il
 * transforme une def qu'on lui donne. C'est ce qui le garde acyclique.
 */

import type { ActionDef } from './actions'
import type { ActionCost, ActionTrigger, TriggerKind } from './types'
import { TRAIT_DEFS, type TraitDef } from '../character/traits'

/** Le porteur, réduit à ce dont ce module a besoin. */
export interface TraitCarrier { traits: readonly string[] }

const TRIGGER_KINDS: readonly TriggerKind[] =
  ['movement-initiated', 'heavy-wound-taken', 'phase-start', 'targeted-vs-guard']

/** True si le porteur a le trait structuré `id`. Miroir de `adversary/traits.ts`. */
export function hasTrait(carrier: TraitCarrier, id: string): boolean {
  return carrier.traits.includes(id)
}

/** Les défs de traits portées qui modifient l'action `actionId`. */
function traitsForAction(traits: readonly string[], actionId: string): TraitDef[] {
  const out: TraitDef[] = []
  for (const id of traits) {
    const def = TRAIT_DEFS[id]
    if (def?.grants && def.action === actionId) out.push(def)
  }
  return out
}

// ─── Famille `costDelta` : l'action de base, à un autre prix ──────────────────

/**
 * La def de `base` telle que ce porteur la joue : coût ajusté par ses traits.
 *
 * Ce qui NE change pas ici : les issues, le jet, l'initiative. Un `costDelta`
 * ne touche que le prix — Momentum rend la Frappe brutale moins chère, il n'en
 * fait pas une autre action.
 *
 * Mémoïsé par (def de base × combinaison de traits) : le planificateur appelle
 * ça dans sa boucle chaude.
 */
export function applyTraitOverlays(carrier: TraitCarrier, base: ActionDef): ActionDef {
  if (carrier.traits.length === 0) return base

  const key = carrier.traits.join(',')
  let perDef = overlayCache.get(base)
  if (!perDef) { perDef = new Map(); overlayCache.set(base, perDef) }
  const cached = perDef.get(key)
  if (cached) return cached

  let cost: ActionCost | null = null
  for (const trait of traitsForAction(carrier.traits, base.id)) {
    const delta = trait.grants?.costDelta
    if (!delta) continue
    const from: ActionCost = cost ?? base.cost
    cost = {
      ...from,
      actions:   Math.max(0, from.actions   + (delta.actions   ?? 0)),
      reactions: Math.max(0, from.reactions + (delta.reactions ?? 0)),
      ...(from.fatigue != null || delta.fatigue != null
        ? { fatigue: Math.max(0, (from.fatigue ?? 0) + (delta.fatigue ?? 0)) }
        : {}),
    }
  }

  const result = cost ? { ...base, cost } : base
  perDef.set(key, result)
  return result
}

const overlayCache = new WeakMap<ActionDef, Map<string, ActionDef>>()

// ─── Famille `reactiveMode` : la même action, jouée sur un déclencheur ────────

/**
 * Les défs sous lesquelles `base` peut être jouée **en réaction** par ce porteur :
 *  · la def elle-même si elle porte un `trigger` NATIF (Frappe opportuniste) ;
 *  · une VARIANTE par trait `reactiveMode` visant cette action (Opportunisme).
 *
 * ⚠️ La variante s'AJOUTE : la Frappe vive reste planifiable normalement dans la
 * manche. Le vault dit « peut être utilisée en Réaction », pas « devient une
 * réaction » — poser le `trigger` sur la def de base l'exclurait du plan de
 * manche (cf. planner.ts) et retirerait au personnage ce que le trait lui donne.
 *
 * Liste vide = cette action n'est pas jouable en réaction par ce porteur.
 */
export function reactionDefs(carrier: TraitCarrier, base: ActionDef): ActionDef[] {
  const defs: ActionDef[] = base.trigger ? [base] : []

  for (const trait of traitsForAction(carrier.traits, base.id)) {
    const mode = trait.grants?.reactiveMode
    if (!mode) continue
    defs.push({ ...base, cost: reactiveCost(base, mode.cost), trigger: reactiveTrigger(trait, mode) })
  }
  return defs
}

/** Le coût de la variante REMPLACE celui de l'action (« ⚡💧 au lieu de ⚫ »). */
function reactiveCost(base: ActionDef, cost: ReactiveCost): ActionCost {
  return {
    actions:        cost.actions   ?? 0,
    reactions:      cost.reactions ?? 0,
    endPlayerRound: false,
    ...(cost.fatigue != null && { fatigue: cost.fatigue }),
    ...(cost.fatigue == null && base.cost.fatigue != null && { fatigue: base.cost.fatigue }),
  }
}

interface ReactiveCost { actions?: number; reactions?: number; fatigue?: number }

function reactiveTrigger(trait: TraitDef, mode: { on: string; scope?: string }): ActionTrigger {
  if (!TRIGGER_KINDS.includes(mode.on as TriggerKind)) {
    throw new Error(`traits.yaml: déclencheur inconnu "${mode.on}" (trait ${trait.id})`)
  }
  // `self` (réagir à ce qu'on subit soi-même, cf. Coagulation rapide) n'est pas
  // supporté : eligibleReactions filtre sur les factions OPPOSÉES. Lot à part.
  if (mode.scope != null && mode.scope !== 'reach' && mode.scope !== 'adjacent') {
    throw new Error(`traits.yaml: portée de déclencheur non supportée "${mode.scope}" (trait ${trait.id})`)
  }
  return {
    on: mode.on as TriggerKind,
    ...(mode.scope && { scope: mode.scope as 'reach' | 'adjacent' }),
  }
}
