/**
 * Unified Actor façade — the single interface the round engine talks to.
 *
 * An Actor is either a player character (CombatantState) or an adversary
 * (AdversaryCombatant), discriminated structurally: only adversaries carry a
 * `sheet`. The façade dispatches every cross-kind operation (defeat check,
 * round lifecycle, effect application, snapshots) to the right domain, keeping
 * `combat/round.ts` free of kind-specific branching.
 *
 * Effect application on an adversary routes through the body-part model:
 * wound effects land on `effect.targetPart` (declared by the attacker at
 * resolution time). Player statuses (add-status) are NOT applied to adversaries
 * — the creature model has parts + a 3-state mental track instead; modelling
 * those interactions is deferred (« les états au second temps »).
 *
 * Everything here is pure: new state out, inputs never mutated.
 */

import type { CombatantState, CombatEffect } from '../combat/types'
import {
  isDefeated, processRoundEnd, applyEffectToState,
} from '../combat/combatant'
import {
  isAdversaryDefeated, damagePart, addAdversaryFatigue, shiftAdversaryMental,
  startRound as adversaryStartRound,
  type AdversaryCombatant,
} from './combatant'
import { selectTargetPart } from './agent'

// ─── Actor union ──────────────────────────────────────────────────────────────

export type Actor = CombatantState | AdversaryCombatant

/** Structural discriminant: only adversaries carry a fiche (`sheet`). */
export function isAdversaryActor(a: Actor): a is AdversaryCombatant {
  return 'sheet' in a
}

// ─── Lifecycle & predicates ───────────────────────────────────────────────────

/** True if this actor can no longer act (statuses for PCs, fatigue clock for adversaries). */
export function actorDefeated(a: Actor): boolean {
  return isAdversaryActor(a) ? isAdversaryDefeated(a) : isDefeated(a)
}

/** Deep clone (snapshot-then-apply resolution). */
export function snapshotActor<A extends Actor>(a: A): A {
  return structuredClone(a)
}

/**
 * Start-of-round processing. Adversaries refill their regenerating resources
 * (◇/🫁/🍀) and action points ⚫. PC token reset stays with the caller
 * (resetRoundTokensWithLog needs the maintenance log) — identity here.
 */
export function actorStartRound(a: Actor): Actor {
  return isAdversaryActor(a) ? adversaryStartRound(a) : a
}

/**
 * End-of-round processing. PCs run wound overflow / status hooks
 * (processRoundEnd); adversaries have NO end-of-round conversion — identity.
 */
export function actorEndRound(a: Actor): Actor {
  return isAdversaryActor(a) ? a : processRoundEnd(a)
}

// ─── Effect application ───────────────────────────────────────────────────────

/**
 * Apply one CombatEffect to an adversary. Wounds land on the declared
 * `targetPart` (falling back to the melee-priority part when absent). Statuses
 * and PC-only effect kinds are intentionally ignored (see file-level note).
 */
function applyEffectToAdversary(a: AdversaryCombatant, fx: CombatEffect): AdversaryCombatant {
  switch (fx.kind) {
    case 'light-wound': {
      const part = fx.targetPart ?? selectTargetPart(a, 'melee')?.type
      return part ? damagePart(a, part, { light: fx.amount }) : a
    }
    case 'heavy-wound': {
      const part = fx.targetPart ?? selectTargetPart(a, 'melee')?.type
      return part ? damagePart(a, part, { heavy: 1 }) : a
    }
    case 'add-fatigue':
      return addAdversaryFatigue(a, fx.amount)
    case 'shift-mental':
      if (fx.direction === 'toward-terror') return shiftAdversaryMental(a, -1)
      if (fx.direction === 'toward-rage')   return shiftAdversaryMental(a, +1)
      return a  // toward-focused: PC-only recovery concept
    case 'add-stability':
      return { ...a, stability: a.stability + fx.amount }
    // add-status & PC-only kinds (heal, reactions, protection…): not modelled.
    default:
      return a
  }
}

/** Apply one CombatEffect to any actor, dispatching on its kind. */
export function applyEffectToActor(a: Actor, fx: CombatEffect): Actor {
  return isAdversaryActor(a) ? applyEffectToAdversary(a, fx) : applyEffectToState(a, fx)
}

/**
 * Apply a list of CombatEffects to a map of actors (mixed kinds).
 * Returns a new map — the original is not modified.
 */
export function applyEffectsToActors(
  states:  ReadonlyMap<string, Actor>,
  effects: CombatEffect[],
): Map<string, Actor> {
  const result = new Map(states)
  for (const fx of effects) {
    const a = result.get(fx.targetId)
    if (!a) continue
    result.set(fx.targetId, applyEffectToActor(a, fx))
  }
  return result
}
