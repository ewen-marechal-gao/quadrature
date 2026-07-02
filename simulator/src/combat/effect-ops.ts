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
    }
    // 'move' → no CombatEffect (spatial model deferred)
  }
  return out
}
