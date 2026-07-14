/**
 * Shared structured-effect grammar — the ONE op vocabulary used by both
 * adversary cards (data/adversary_actions.yaml, via the fiche pipeline) and
 * player action outcomes (ACTION_DEFS.outcomes; YAML migration planned).
 *
 * An op is a tiny plain object; `opsToCombatEffects` interprets a list of them
 * into engine CombatEffects. Ops are target-directed unless noted self-targeted.
 *
 *  - { wound: N }        💢 N light wounds
 *  - { fatigue: N }      💧 N fatigue on the target
 *  - { heavyWound: N }   💔 N heavy wounds
 *  - { status: S }       apply a StatusEffect (🫨/🩸/🕸️/🙏/🧎…)
 *  - { mental: ±N }      shift the target's mental track (−N = 🔻 vers Peur, +N = 🔺 vers Colère)
 *  - { move: N }         Déplacement [N] — no effect yet (spatial model deferred)
 *  - { gainStability: N }  SELF: the acting creature gains N ◇ (adversary resource)
 *  - { selfFatigue: N }    SELF: the actor takes N 💧 (e.g. ⚠️ Maladresse)
 *
 * Self-targeted ops are aimed at `selfId` and silently dropped when the caller
 * does not provide it (e.g. scoring a roll without knowing the attacker).
 */

import type { CombatEffect, StatusEffect } from './types'

export type EffectOp =
  | { wound: number }
  | { fatigue: number }
  | { heavyWound: number }
  | { status: StatusEffect }
  | { mental: number }
  | { move: number }
  | { gainStability: number }
  | { selfFatigue: number }
  | { drainStability: number }   // retire N ◇ à la cible
  | { destabilize: true }        // « Déstabilisé » : la cible ignore son prochain regain de ◇
  | { shiftIfBroken: number }    // décale l'état mental UNIQUEMENT si la cible n'a plus de ◇ (+N Colère / −N Peur)

// ─── Declarative action outcomes ──────────────────────────────────────────────

/** One outcome tier: display text (rendered in notes) + shared effect ops. */
export interface ActionOutcome {
  text?:  string
  effect: EffectOp[]
}

/**
 * Declarative description of a target-directed action's results.
 * onCritical / onFlaw are ADDITIVE to the success/failure base.
 */
export interface ActionOutcomes {
  onSuccess:   ActionOutcome
  onFailure:   ActionOutcome
  onCritical?: ActionOutcome
  onFlaw?:     ActionOutcome
}

/** Result flags of an action check, input to a resolver. */
export interface OutcomeFlags { hit: boolean; critical: boolean; flaw: boolean }

/**
 * Generate a resolve() from declarative outcomes — the single generic
 * interpreter shared by every standard action. Self-targeted ops (selfFatigue…)
 * land on the actor; everything else on the target. Mirrors the legacy
 * hand-written resolvers: no target → no effects (target-directed actions only).
 */
export function makeResolve(outcomes: ActionOutcomes) {
  return (
    { hit, critical, flaw }: OutcomeFlags,
    actor:   { id: string },
    target?: { id: string },
  ): { effects: CombatEffect[]; notes: string[] } => {
    if (!target) return { effects: [], notes: [] }
    const effects: CombatEffect[] = []
    const notes:   string[]       = []
    const apply = (o: ActionOutcome | undefined, prefix: string) => {
      if (!o) return
      effects.push(...opsToCombatEffects(o.effect, target.id, actor.id))
      if (o.text) notes.push(`${prefix} ${o.text}`)
    }
    // Une action n'échoue jamais : total ≥ DC = succès (✅), sinon succès partiel (◐).
    apply(hit ? outcomes.onSuccess : outcomes.onFailure, hit ? '✅' : '◐')
    if (flaw)     apply(outcomes.onFlaw, '⚠️')
    if (critical) apply(outcomes.onCritical, '✴️')
    return { effects, notes }
  }
}

/** Interpret a list of ops into CombatEffects aimed at `targetId` (self ops at `selfId`). */
export function opsToCombatEffects(
  ops:      EffectOp[],
  targetId: string,
  selfId?:  string,
): CombatEffect[] {
  const out: CombatEffect[] = []
  for (const op of ops) {
    if ('wound' in op) {
      out.push({ targetId, kind: 'light-wound', amount: op.wound })
    } else if ('fatigue' in op) {
      out.push({ targetId, kind: 'add-fatigue', amount: op.fatigue })
    } else if ('heavyWound' in op) {
      for (let i = 0; i < op.heavyWound; i++) out.push({ targetId, kind: 'heavy-wound' })
    } else if ('status' in op) {
      out.push({ targetId, kind: 'add-status', status: op.status })
    } else if ('mental' in op) {
      // −N = 🔻 vers Peur (toward-terror) · +N = 🔺 vers Colère (toward-rage)
      const direction = op.mental < 0 ? 'toward-terror' : 'toward-rage'
      for (let i = 0; i < Math.abs(op.mental); i++) {
        out.push({ targetId, kind: 'shift-mental', direction })
      }
    } else if ('gainStability' in op) {
      if (selfId) out.push({ targetId: selfId, kind: 'add-stability', amount: op.gainStability })
    } else if ('selfFatigue' in op) {
      if (selfId) out.push({ targetId: selfId, kind: 'add-fatigue', amount: op.selfFatigue })
    } else if ('drainStability' in op) {
      out.push({ targetId, kind: 'drain-stability', amount: op.drainStability })
    } else if ('destabilize' in op) {
      out.push({ targetId, kind: 'destabilize' })
    } else if ('shiftIfBroken' in op) {
      const direction = op.shiftIfBroken < 0 ? 'toward-terror' : 'toward-rage'
      for (let i = 0; i < Math.abs(op.shiftIfBroken); i++) {
        out.push({ targetId, kind: 'shift-mental-broken', direction })
      }
    }
    // 'move' → no CombatEffect (spatial model deferred)
  }
  return out
}
