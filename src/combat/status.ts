/**
 * Status effect definitions for the Quadrature combat module.
 *
 * Design principles (mirrors ActionDef / GuardDef):
 *  - Each StatusDef owns its effect logic via lifecycle hooks.
 *  - Behaviour previously scattered across combatant.ts and actions.ts
 *    is co-located here next to the data that describes the status.
 *  - The `description` field drives automatic AI prompt generation.
 *
 * Hook contract:
 *
 *  onTokenReset(state)
 *    → Called once per active status inside resetRoundTokens.
 *    → Returns { actionPenalty, clear }:
 *        actionPenalty  PA to subtract from the 3 granted at round start.
 *        clear          true → remove this status immediately after applying the penalty.
 *
 *  onRoundEnd(state)
 *    → Called once per active status inside processRoundEnd (after wound overflow).
 *    → Returns { effects, notes } to apply to the combatant.
 *
 *  drainReactions
 *    → true → set reactions to 0 immediately when status is applied (addStatus).
 *
 *  rollDisadvantage
 *    → Number of 🟥 dice added to every roll made by this combatant.
 *    → Applied in rollParamsFrom (actions.ts) and therefore also to guard rolls.
 *
 *  attackerAdvantage
 *    → Number of 🟩 dice added to attackers' check rolls when targeting this combatant.
 *    → Applied in resolveAction (actions.ts).
 *
 *  preventsEndRound
 *    → true → actions with cost.endPlayerRound = true are blocked.
 *
 *  incapacitates
 *    → true → the combatant cannot perform any action (isDefeated = true).
 */

import type { CombatantState, CombatEffect, StatusEffect } from './types'

// ─── StatusDef ────────────────────────────────────────────────────────────────

export interface StatusDef {
  id:          StatusEffect
  label:       string
  icon:        string
  /**
   * One-sentence tactical summary used in AI system prompt generation.
   * Should cover: how the status is gained, what it does, and how to remove it.
   */
  description: string

  /**
   * Called during resetRoundTokens for each active status.
   * actionPenalty: PA subtracted from the 3 restored at round start.
   * clear: if true, the status is removed from the combatant before play resumes.
   */
  onTokenReset?: (state: CombatantState) => { actionPenalty: number; clear: boolean }

  /**
   * Called during processRoundEnd (after wound overflow) for each active status.
   * Returns effects applied to this combatant and log notes for the report.
   */
  onRoundEnd?: (state: CombatantState) => { effects: CombatEffect[]; notes: string[] }

  /**
   * If true: drain all reaction tokens (reactions → 0) immediately when the status
   * is applied via addStatus. Used by Sonné 🫨.
   */
  drainReactions?: boolean

  /**
   * Number of disadvantage dice 🟥 added to every roll made by this combatant
   * (offensive, self-targeted, and guard rolls). Applied via rollParamsFrom.
   * Used by Essoufflé 😮‍💨.
   */
  rollDisadvantage?: number

  /**
   * Number of advantage dice 🟩 added to attackers' check rolls when targeting
   * a combatant with this status. Applied in resolveAction.
   * Used by À terre 🙏 and Inconscient 😵‍💫.
   */
  attackerAdvantage?: number

  /**
   * If true, actions with cost.endPlayerRound = true cannot be afforded
   * while this status is active.
   */
  preventsEndRound?: boolean

  /**
   * If true, the combatant is considered defeated and cannot act at all.
   */
  incapacitates?: boolean
}

// ─── Status definitions ───────────────────────────────────────────────────────

export const STATUS_DEFS: Record<StatusEffect, StatusDef> = {

  // ── Hémorragie 🩸 ──────────────────────────────────────────────────────────
  //
  // Real rule: tant que le personnage possède au moins un jeton 🩸, les blessures
  // graves 💔 issues de la conversion de blessures légères ne peuvent pas être
  // prévenues par la Protection 🛡️. Un jeton 🩸 est retiré à chaque conversion.
  // → No onRoundEnd (+1💢 per round would be wrong).
  // → Decrement on conversion is handled in processRoundEnd (combatant.ts).
  hemorrhage: {
    id: 'hemorrhage', label: 'Hémorragie', icon: '🩸',
    description:
      'État cumulable (jetons 🩸). ' +
      'Tant que le personnage possède au moins un jeton 🩸, les blessures graves 💔 ' +
      'issues de la conversion de blessures légères ne peuvent pas être prévenues par ' +
      'la Protection 🛡️. Un jeton 🩸 est retiré à chaque conversion. ' +
      'Retiré (entièrement) par l\'action Stabiliser.',
  },

  // ── Sonné 🫨 ───────────────────────────────────────────────────────────────
  //
  // Real rule: le personnage perd toutes ses réactions (immédiat) et dispose
  // d'une ⚫ de moins lors de son prochain tour.
  stunned: {
    id: 'stunned', label: 'Sonné', icon: '🫨',
    description:
      'Le personnage perd immédiatement toutes ses réactions ⚡. ' +
      'Il dispose d\'une ⚫ de moins lors de son prochain tour, puis le statut est retiré. ' +
      'Infligé par un Critique d\'Attaque à mains nues, Frappe brutale ou Bousculade.',
    drainReactions: true,
    onTokenReset: () => ({ actionPenalty: 1, clear: true }),
  },

  // ── À terre 🙏 ─────────────────────────────────────────────────────────────
  //
  // Real rule: ne peut pas effectuer Marche ni Course. Les attaques en mêlée
  // bénéficient de 🟩 ; les attaques à distance subissent 🟥.
  // Retiré en dépensant un ⚫ (simulé : déduit automatiquement en début de tour).
  knockdown: {
    id: 'knockdown', label: 'À terre', icon: '🙏',
    description:
      'Ne peut pas effectuer les actions Marche ni Course. ' +
      'Les attaques en mêlée contre lui bénéficient de 🟩 (avantage). ' +
      'Les attaques à distance subissent 🟥 (désavantage). ' +
      'Retiré en dépensant un ⚫ (simulateur : ⚫ déduit automatiquement au début du prochain tour). ' +
      'Infligé par un Critique d\'Attaque armée.',
    attackerAdvantage: 1,
    onTokenReset: () => ({ actionPenalty: 1, clear: true }),
  },

  // ── Essoufflé 😮‍💨 ──────────────────────────────────────────────────────────
  //
  // Real rule: +🟥 à tous ses jets. Ne peut pas effectuer Course.
  // Retiré par l'action Respiration ou si la fatigue redescend en dessous de 10.
  winded: {
    id: 'winded', label: 'Essoufflé', icon: '😮‍💨',
    description:
      'Le personnage subit 🟥 (désavantage) à tous ses jets. ' +
      'Il ne peut pas effectuer l\'action Course. ' +
      'Retiré immédiatement par l\'action Respiration (indépendamment du résultat du jet).',
    rollDisadvantage: 1,
    onTokenReset: (state) => {
      const actionPenalty = 0
      const clear = state.fatigue < 10
      return { actionPenalty, clear }
    },
  },

  // ── Inconscient 😵‍💫 ─────────────────────────────────────────────────────────
  //
  // Real rule: déclenché à fatigue 20. Tombe à terre. Peut uniquement faire
  // Reprendre Conscience. Échoue automatiquement à tous les jets de garde.
  // Attaques en mêlée +🟩 contre lui.
  incapacitated: {
    id: 'incapacitated', label: 'Inconscient', icon: '😵‍💫',
    description:
      'Déclenché automatiquement quand la fatigue atteint 20💧. ' +
      'Tombe immédiatement à terre. ' +
      'Ne peut effectuer que l\'action Reprendre Conscience (simulateur : aucune action). ' +
      'Échoue automatiquement à tous les jets de garde. ' +
      'Les attaques en mêlée contre lui bénéficient de 🟩.',
    incapacitates: true,
    attackerAdvantage: 1,
  },
}
