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

export type ActionResolverId = 'respiration' | 'stabilize'

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
      if (flaw) {
        fx.push({ targetId: aId, kind: 'spend-actions', amount: 1 })
        notes.push('⚠️ Maladresse — perd 1 PA')
      }
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
      if (flaw) {
        fx.push({ targetId: aId, kind: 'spend-actions', amount: 1 })
        notes.push('⚠️ Maladresse — perd 1 PA')
      }
      return { effects: fx, notes }
    },
  },
}
