/**
 * Bridge between adversary cards and the player combat engine.
 *
 * The adversary → PC direction interprets the fiche's structured `effect` ops
 * through the SHARED grammar (combat/effect-ops.ts) — re-exported here under
 * its historical name. The PC → adversary direction routes CombatEffects into
 * the body-part model (below).
 */

import type { CombatEffect } from '../combat/types'
import {
  damagePart, addAdversaryFatigue, shiftAdversaryMental, addBleed,
  type AdversaryCombatant,
} from './combatant'

export { opsToCombatEffects as adversaryEffectToCombatEffects } from '../combat/effect-ops'

/** Result of applying a player's attack effects to an adversary. */
export interface PcToAdversaryResult {
  state: AdversaryCombatant
  /**
   * Statuses a player action would inflict that the adversary model does not
   * yet represent (the creature uses parts + a 3-state mental track, not the PC
   * status system). Surfaced for the log; NOT applied. Modelling adversary
   * statuses (e.g. À terre respecting tail immunity) is a pending rules decision.
   */
  unhandledStatuses: string[]
}

/**
 * Apply a player attack's CombatEffects to an adversary (PC → adversary half of
 * the seam). Wounds land on the player-declared `targetPart` via the body-part
 * model; fatigue feeds the death clock (buffered by 🫁); mental shifts move the
 * 3-state track. Statuses are collected as `unhandledStatuses` (see above).
 */
export function applyPcEffectsToAdversary(
  adv:        AdversaryCombatant,
  effects:    CombatEffect[],
  targetPart: string,
): PcToAdversaryResult {
  let c = adv
  const unhandledStatuses: string[] = []
  for (const fx of effects) {
    switch (fx.kind) {
      case 'light-wound': c = damagePart(c, targetPart, { light: fx.amount }); break
      case 'heavy-wound': c = damagePart(c, targetPart, { heavy: 1 });         break
      case 'add-fatigue': c = addAdversaryFatigue(c, fx.amount);               break
      case 'shift-mental':
        c = shiftAdversaryMental(c, fx.direction === 'toward-terror' ? -1 : fx.direction === 'toward-rage' ? 1 : 0)
        break
      case 'drain-stability':
        c = { ...c, stability: Math.max(0, c.stability - fx.amount) }
        break
      case 'destabilize':
        c = { ...c, destabilized: true }
        break
      case 'shift-mental-broken':
        if (c.stability === 0) c = shiftAdversaryMental(c, fx.direction === 'toward-rage' ? 1 : -1)
        break
      case 'add-status':
        // Sonné 🫨 désactive l'Évasion 🍀 ; Hémorragie 🩸 ajoute un jeton de
        // saignée (coché en fin de manche) ; les autres restent non modélisés.
        if (fx.status === 'stunned')         c = { ...c, stunned: true }
        else if (fx.status === 'hemorrhage') c = addBleed(c, 1)
        else unhandledStatuses.push(fx.status)
        break
      default: break  // heal/remove-fatigue/reactions/protection: not produced by attacks on adversaries
    }
  }
  return { state: c, unhandledStatuses }
}
