/**
 * Mental-track combat effects (§ Piste des États Mentaux), cumulative by threshold.
 *   Fear side  — Prudent+  : +1 relance défensive ; Paniqué+ : 🟥 offensive ;
 *                Terrifié  : pas de réactions ⚡
 *   Rage side  — Agressif- : +1 relance offensive ; Furieux- : 🟥 défensive ;
 *                Enragé    : +1 fatigue / action
 *   Centre     — Concentré : +1 réaction (traité ailleurs, NON cumulatif)
 */
import {
  mentalRollModifiers, canReact, spendActionCost, addFatigue,
} from '../../src/combat/combatant'
import { canUseGuard, ACTION_DEFS } from '../../src/combat/actions'
import { makeCombatant } from '../helpers/fixtures'
import type { MentalState } from '../../src/combat/types'

const withMental = (m: MentalState) => ({ ...makeCombatant(), mentalState: m })

// ─── Roll modifiers ─────────────────────────────────────────────────────────

describe('mentalRollModifiers — fear side (cumulative)', () => {
  it('Prudent: +1 relance defensive, nothing offensive', () => {
    expect(mentalRollModifiers('cautious', 'defensive')).toEqual({ rerolls: 1, disadvantages: 0 })
    expect(mentalRollModifiers('cautious', 'offensive')).toEqual({ rerolls: 0, disadvantages: 0 })
  })

  it('Paniqué: keeps the defensive relance AND adds 🟥 offensive', () => {
    expect(mentalRollModifiers('panicked', 'defensive')).toEqual({ rerolls: 1, disadvantages: 0 })
    expect(mentalRollModifiers('panicked', 'offensive')).toEqual({ rerolls: 0, disadvantages: 1 })
  })

  it('Terrifié: still the defensive relance + 🟥 offensive (cumulative)', () => {
    expect(mentalRollModifiers('terrified', 'defensive')).toEqual({ rerolls: 1, disadvantages: 0 })
    expect(mentalRollModifiers('terrified', 'offensive')).toEqual({ rerolls: 0, disadvantages: 1 })
  })
})

describe('mentalRollModifiers — rage side (symmetric, cumulative)', () => {
  it('Agressif: +1 relance offensive', () => {
    expect(mentalRollModifiers('aggressive', 'offensive')).toEqual({ rerolls: 1, disadvantages: 0 })
    expect(mentalRollModifiers('aggressive', 'defensive')).toEqual({ rerolls: 0, disadvantages: 0 })
  })

  it('Furieux: keeps offensive relance AND adds 🟥 defensive', () => {
    expect(mentalRollModifiers('furious', 'offensive')).toEqual({ rerolls: 1, disadvantages: 0 })
    expect(mentalRollModifiers('furious', 'defensive')).toEqual({ rerolls: 0, disadvantages: 1 })
  })

  it('Enragé: offensive relance + 🟥 defensive (cumulative)', () => {
    expect(mentalRollModifiers('enraged', 'offensive')).toEqual({ rerolls: 1, disadvantages: 0 })
    expect(mentalRollModifiers('enraged', 'defensive')).toEqual({ rerolls: 0, disadvantages: 1 })
  })
})

describe('mentalRollModifiers — Concentré (centre)', () => {
  it('grants no roll modifier (the +1 reaction is handled at round start)', () => {
    expect(mentalRollModifiers('focused', 'offensive')).toEqual({ rerolls: 0, disadvantages: 0 })
    expect(mentalRollModifiers('focused', 'defensive')).toEqual({ rerolls: 0, disadvantages: 0 })
  })
})

// ─── Terrifié : plus de réactions ───────────────────────────────────────────

describe('canReact / canUseGuard — Terrifié', () => {
  it('canReact is false only when terrified', () => {
    expect(canReact(withMental('focused'))).toBe(true)
    expect(canReact(withMental('panicked'))).toBe(true)
    expect(canReact(withMental('terrified'))).toBe(false)
  })

  it('a terrified combatant can only Encaisser (active guards need ⚡)', () => {
    const terrified = { ...withMental('terrified'), reactions: 3 }
    expect(canUseGuard(terrified, 'absorb')).toBe(true)   // 0⚡ — toujours dispo
    expect(canUseGuard(terrified, 'dodge')).toBe(false)   // 1⚡ — bloqué
    // Non terrifié avec des réactions : l'esquive redevient possible
    expect(canUseGuard({ ...withMental('cautious'), reactions: 3 }, 'dodge')).toBe(true)
  })
})

// ─── Enragé : +1 fatigue par action ─────────────────────────────────────────

describe('spendActionCost — Enragé', () => {
  it('adds +1 fatigue 💧 to every action while enraged', () => {
    const base = withMental('enraged')
    const cost = ACTION_DEFS['armed-attack'].cost          // 2 PA, 0 fatigue
    expect(spendActionCost(base, cost).fatigue).toBe(base.fatigue + 1)
  })

  it('stacks with an action that already costs fatigue', () => {
    const base = withMental('enraged')
    const cost = ACTION_DEFS['sharp-strike'].cost          // 1 PA + 1💧
    expect(spendActionCost(base, cost).fatigue).toBe(base.fatigue + 2)
  })

  it('no extra fatigue when not enraged', () => {
    const base = withMental('focused')
    const cost = ACTION_DEFS['armed-attack'].cost
    expect(spendActionCost(base, cost).fatigue).toBe(base.fatigue)
  })
})
