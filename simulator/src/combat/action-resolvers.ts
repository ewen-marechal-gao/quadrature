/**
 * Custom action resolvers — the declared ESCAPE HATCH of the declarative
 * outcomes system (chantier « unification des actions »).
 *
 * An action whose behaviour the shared op grammar cannot express (dynamic
 * amounts, unconditional riders) references one of these by id from
 * data/player_actions.yaml (`resolver: <id>`). The registry entry owns both
 * the dynamic DC formula and the effect resolution.
 */

import type { CombatantState, CombatEffect } from './types'
import type { OutcomeFlags } from './effect-ops'
import { mentalDegree, stepMentalToward } from './combatant'

export type ActionResolverId =
  | 'respiration' | 'stabilize'
  | 'preservation' | 'focalisation' | 'resolution' | 'meditation'

export interface CustomActionResolver {
  /** DC formula (reads live state for dynamic values). */
  getDC:   (actor: CombatantState) => number
  /** Effect resolution — self-targeted: no opponent involved. */
  resolve: (outcome: OutcomeFlags, actor: CombatantState) => { effects: CombatEffect[]; notes: string[] }
}

export const ACTION_RESOLVERS: Record<ActionResolverId, CustomActionResolver> = {

  // ── Respiration — montant dynamique (1 + Endurance), retrait d'Essoufflé
  //    inconditionnel, DD = fatigue actuelle.
  respiration: {
    getDC: (actor) => actor.fatigue,
    resolve({ hit, critical, flaw }, actor) {
      const aId = actor.id
      const fx: CombatEffect[] = []
      const notes: string[]    = []
      // Immediate: remove winded (always fires regardless of roll)
      fx.push({ targetId: aId, kind: 'remove-status', status: 'winded' })
      // Fatigue recovery
      const endurance  = actor.skills.endurance
      const baseAmount = hit ? 1 + endurance : 1
      const bonus      = critical ? 1 : 0
      fx.push({ targetId: aId, kind: 'remove-fatigue', amount: baseAmount + bonus })
      notes.push(hit
        ? `✅ Récupération — retire ${baseAmount + bonus}💧` + (critical ? ' (✴️ +1)' : '')
        : '❌ Partiel — retire 1💧')
      if (flaw) applyFlawPenalty(fx, notes, aId)
      return { effects: fx, notes }
    },
  },

  // ── Stabiliser — soin dynamique (1 + Récupération), retrait d'Hémorragie
  //    inconditionnel, DD = 8 + blessures graves.
  stabilize: {
    getDC: (actor) => 8 + actor.heavyWounds,
    resolve({ hit, critical, flaw }, actor) {
      const aId = actor.id
      const fx: CombatEffect[] = []
      const notes: string[]    = []
      // Immediate: remove hemorrhage (always fires regardless of roll)
      fx.push({ targetId: aId, kind: 'remove-status', status: 'hemorrhage' })
      // Light wound healing
      const recovery   = actor.skills.recovery
      const healAmount = hit ? 1 + recovery : 1
      fx.push({ targetId: aId, kind: 'heal-wounds', amount: healAmount })
      notes.push(hit
        ? `✅ Stabilisation — soigne ${healAmount}💢`
        : '❌ Partiel — soigne 1💢')
      if (critical) {
        fx.push({ targetId: aId, kind: 'add-reaction', amount: 1 })
        notes.push('✴️ Critique — gagne 1⚡')
      }
      if (flaw) applyFlawPenalty(fx, notes, aId)
      return { effects: fx, notes }
    },
  },

  // ── Consolidation mentale (§ attribute_actions.md) ─────────────────────────
  // Tronc commun : DD = 8 + degré d'état mental ; ✅/❌ regagnent du ◇ ;
  // ⚠️ Défaut = −1 PA. Le décalage volontaire (set-mental) ne passe PAS par le ◇.
  // Variantes ⚒️ (Précaution/Incantation/Militant/Tranquillité) différées.

  // Préservation : depuis la colère/concentré, 🔻 vers Prudent (jamais en dessous) + ◇.
  preservation: mentalAction(4, 'Préservation', '🔻'),

  // Focalisation : recentre vers Concentré depuis n'importe où + ◇.
  focalisation: mentalAction(3, 'Focalisation', '↔'),

  // Résolution : depuis la crainte/concentré, 🔺 vers Agressif (jamais au-dessus) + ◇.
  resolution: mentalAction(2, 'Résolution', '🔺'),

  // Méditation : uniquement concentré ; fait le plein de ◇ (1 par Résilience), sans décalage.
  meditation: {
    getDC: (a) => 8 + mentalDegree(a.mentalState),
    resolve({ hit, flaw }, actor) {
      const fx: CombatEffect[] = []
      const notes: string[]    = []
      const gain = hit ? Math.max(1, actor.skills.resilience) : 1
      fx.push({ targetId: actor.id, kind: 'add-stability', amount: gain })
      notes.push(hit ? `✅ Méditation — +${gain} ◇` : '◐ Méditation partielle — +1 ◇')
      if (flaw) applyFlawPenalty(fx, notes, actor.id)
      return { effects: fx, notes }
    },
  },
}

/** ⚠️ Défaut commun aux actions personnelles : perd 1 PA (effet + note de log). */
function applyFlawPenalty(fx: CombatEffect[], notes: string[], actorId: string): void {
  fx.push({ targetId: actorId, kind: 'spend-actions', amount: 1 })
  notes.push('⚠️ Maladresse — perd 1 PA')
}

/**
 * Factory for the three shift-and-recover consolidations (Préservation /
 * Focalisation / Résolution). They share the shape: DD = 8 + degré ; +1 ◇
 * (succès ou échec) ; sur succès, déplacement VOLONTAIRE d'un cran (deux sur
 * critique) vers `targetIdx` (plafonné) ; ⚠️ Défaut = −1 PA.
 */
function mentalAction(targetIdx: number, label: string, arrow: string): CustomActionResolver {
  return {
    getDC: (a) => 8 + mentalDegree(a.mentalState),
    resolve({ hit, critical, flaw }, actor) {
      const fx: CombatEffect[] = []
      const notes: string[]    = []
      fx.push({ targetId: actor.id, kind: 'add-stability', amount: 1 })  // +1 ◇ (plafonné au pool)
      if (hit) {
        const next = stepMentalToward(actor.mentalState, targetIdx, critical ? 2 : 1)
        fx.push({ targetId: actor.id, kind: 'set-mental', state: next })
        notes.push(`✅ ${label} — ${arrow} ${next}${critical ? ' (✴️ +1)' : ''}, +1 ◇`)
      } else {
        notes.push(`◐ ${label} partielle — +1 ◇`)
      }
      if (flaw) applyFlawPenalty(fx, notes, actor.id)
      return { effects: fx, notes }
    },
  }
}
