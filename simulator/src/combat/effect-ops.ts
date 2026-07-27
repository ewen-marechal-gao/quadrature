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
 *  - { move: N }         SELF: Déplacement [N] — the ACTOR closes on the target,
 *                        spending up to N cases. Emits a `move-toward` intent
 *                        that the resolver turns into a path (see movement.ts).
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
  | { burn: number }             // 🔥 N marqueurs de combustion sur la cible
  | { selfBurn: number }         // SELF: le lanceur subit N 🔥 (⚠️ Défaut d'électromancie)
  | { status: StatusEffect }
  | { mental: number }
  | { move: number }
  | { gainStability: number }
  | { selfFatigue: number }
  | { drainStability: number }   // retire N ◇ à la cible
  | { destabilize: true }        // « Déstabilisé » : la cible ignore son prochain regain de ◇
  | { shiftIfBroken: number }    // décale l'état mental UNIQUEMENT si la cible n'a plus de ◇ (+N Colère / −N Peur)
  | { setInertia: number }       // SELF: pose l'Inertie ➡️ (la Charge la remet à 0 en consommant l'élan)
  | { gainReaction: number }     // SELF: gagne N Réactions ⚡ (critique de Parade)

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
    // ORDRE DE RÉSOLUTION : ⚠️ Défaut, puis ✴️ Critique, puis l'issue.
    // C'est l'ordre IMPRIMÉ sur la carte (cf. le schéma de rules/fr/cartes), et
    // il n'est pas cosmétique : plusieurs effets sont plafonnés ou absorbés, donc
    // leur rang change le résultat. Un 🔻 de défaut appliqué avant le ◇ que
    // l'action accorde tombe sur la piste ; appliqué après, le ◇ tout neuf
    // l'absorbe et le défaut ne coûte plus rien.
    if (flaw)     apply(outcomes.onFlaw, '⚠️')
    if (critical) apply(outcomes.onCritical, '✴️')
    // Une action n'échoue jamais : total ≥ DC = succès (✅), sinon succès partiel (◐).
    apply(hit ? outcomes.onSuccess : outcomes.onFailure, hit ? '✅' : '◐')
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
    } else if ('burn' in op) {
      out.push({ targetId, kind: 'add-burn', amount: op.burn })
    } else if ('selfBurn' in op) {
      if (selfId) out.push({ targetId: selfId, kind: 'add-burn', amount: op.selfBurn })
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
    } else if ('gainReaction' in op) {
      // SELF: une Réaction ⚡ rendue au porteur (critique de Parade), jamais à la cible.
      if (selfId) out.push({ targetId: selfId, kind: 'add-reaction', amount: op.gainReaction })
    } else if ('setInertia' in op) {
      // SELF: l'élan est une propriété du lanceur (la Charge le consomme → 0).
      if (selfId) out.push({ targetId: selfId, kind: 'set-inertia', value: op.setInertia })
    } else if ('move' in op) {
      // SELF-targeted: the mover is the actor, the target is what it closes on
      // (« Charge : Déplacement [6] puis inflige 💢💢 » — the creature crosses
      // the ground, not its victim). An intent, not a path: only the resolver
      // knows the board and who stands where (see expandMoves).
      if (selfId) out.push({ targetId: selfId, kind: 'move-toward', goalId: targetId, budget: op.move })
    }
  }
  return out
}
