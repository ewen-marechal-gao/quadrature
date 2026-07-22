/**
 * Tests for planner/value.ts — generic effect valuation.
 *
 * The point under test is the SHAPE of the pricing, not exact constants:
 * wounds worth more near conversion, fatigue escalating toward the clock,
 * statuses priced from their declared mechanics, sign conventions.
 */

import {
  effectBurden, scoreEffects, PERSONA_WEIGHTS, PRICE, type ScoreContext,
} from '../../src/planner/value'
import { makeCombatant } from '../helpers/fixtures'
import { initAdversary } from '../../src/adversary/combatant'
import { loadAdversary } from '../../src/adversary/io'
import type { CombatantState, CombatEffect } from '../../src/combat/types'
import type { Actor } from '../../src/adversary/actor'

const faucheur = async () => initAdversary(await loadAdversary('faucheur'))

const wound = (n: number): CombatEffect => ({ targetId: 'x', kind: 'light-wound', amount: n })

describe('PC burdens', () => {
  it('light wounds bite harder near the conversion threshold', () => {
    const fresh   = makeCombatant()                                  // Vigueur 3 → seuil 3
    const wounded: CombatantState = { ...fresh, lightWounds: 5 }     // excédent 2, +1💢 → conversion
    expect(effectBurden(wound(1), wounded)).toBeGreaterThan(effectBurden(wound(1), fresh))
  })

  it('a heavy wound absorbed by protection is a cheap armor chip', () => {
    const armored: CombatantState = { ...makeCombatant(), protection: 2 }
    const naked:   CombatantState = { ...makeCombatant(), protection: 0 }
    const hw: CombatEffect = { targetId: 'x', kind: 'heavy-wound' }
    expect(effectBurden(hw, armored)).toBeLessThan(effectBurden(hw, naked))
  })

  it('the last point of physical capacity is decisive (Aux portes de la Mort)', () => {
    const dying = makeCombatant()
    for (const name of ['strength', 'agility', 'vigor', 'grace', 'acuity'] as const) {
      dying.characteristics[name] = { value: 3, wounds: 3 }
    }
    dying.characteristics.strength = { value: 3, wounds: 2 }   // 1 point left in total
    const hw: CombatEffect = { targetId: 'x', kind: 'heavy-wound' }
    expect(effectBurden(hw, { ...dying, protection: 0 })).toBeGreaterThanOrEqual(PRICE.decisive)
  })

  it('fatigue escalates toward the clock and K.O. is decisive', () => {
    const fresh = makeCombatant()                        // fatigue 1
    const tired: CombatantState = { ...fresh, fatigue: 17 }
    const fx: CombatEffect = { targetId: 'x', kind: 'add-fatigue', amount: 2 }
    expect(effectBurden(fx, tired)).toBeGreaterThan(effectBurden(fx, fresh))
    const ko: CombatEffect = { targetId: 'x', kind: 'add-fatigue', amount: 3 }
    expect(effectBurden(ko, { ...fresh, fatigue: 18 })).toBeGreaterThanOrEqual(PRICE.decisive)
  })

  it('statuses are priced from their declared mechanics', () => {
    const s = makeCombatant()
    const stun:  CombatEffect = { targetId: 'x', kind: 'add-status', status: 'stunned' }
    const wind:  CombatEffect = { targetId: 'x', kind: 'add-status', status: 'winded' }
    expect(effectBurden(stun, s)).toBeGreaterThan(0)      // drains ⚡
    expect(effectBurden(wind, s)).toBeGreaterThan(0)      // −1 ⚫ récurrent
    // Already present → no double pricing (statuses do not stack)…
    expect(effectBurden(wind, { ...s, status: ['winded'] })).toBe(0)
    // …and removing it is worth what having it costs.
    const clear: CombatEffect = { targetId: 'x', kind: 'remove-status', status: 'winded' }
    expect(effectBurden(clear, { ...s, status: ['winded'] })).toBeLessThan(0)
    expect(effectBurden(clear, s)).toBe(0)                // nothing to remove
  })

  it('mental shocks: ◇ absorbs first; the extreme threatens a trauma', () => {
    const buffered = makeCombatant()                       // ◇ = Ténacité 2 + Discipline 0 = 2
    const shock: CombatEffect = { targetId: 'x', kind: 'shift-mental', direction: 'toward-terror' }
    const absorbed = effectBurden(shock, buffered)
    const exposed  = effectBurden(shock, { ...buffered, stability: 0, mentalState: 'panicked' })
    const extreme  = effectBurden(shock, { ...buffered, stability: 0, mentalState: 'terrified' })
    expect(absorbed).toBeGreaterThan(0)
    expect(exposed).toBeGreaterThan(absorbed)              // the track actually moves
    expect(extreme).toBeGreaterThanOrEqual(3)              // trauma territory
  })

  it('recovery effects carry negative burden (they help)', () => {
    const hurt: CombatantState = { ...makeCombatant(), lightWounds: 4, fatigue: 12 }
    expect(effectBurden({ targetId: 'x', kind: 'heal-wounds', amount: 2 }, hurt)).toBeLessThan(0)
    expect(effectBurden({ targetId: 'x', kind: 'remove-fatigue', amount: 3 }, hurt)).toBeLessThan(0)
  })
})

describe('adversary burdens', () => {
  it('armor soaks light wounds down to the minimum 1', async () => {
    const c = await faucheur()
    // Une grosse volée vaut plus qu'une piqûre, mais l'armure écrase la différence
    // sur la partie blindée (serpes, armor > 0).
    const armored = c.weapons.find(p => p.armor > 0) ?? c.parts.find(p => p.armor > 0)
    if (armored) {
      const small = effectBurden(wound(1), c, armored.type)
      const big   = effectBurden(wound(1 + armored.armor), c, armored.type)
      expect(big).toBeGreaterThanOrEqual(small)   // au moins 1 passe dans les deux cas
    }
    expect(effectBurden(wound(3), c)).toBeGreaterThan(0)
  })

  it('a heavy wound prices the top block it would destroy', async () => {
    const c = await faucheur()
    const hw: CombatEffect = { targetId: 'x', kind: 'heavy-wound' }
    const part = c.parts.find(p => p.blocks.length > 0 && p.armor === 0)
    if (part) expect(effectBurden(hw, c, part.type)).toBeGreaterThanOrEqual(2)
  })

  it('fatigue marks are progress on the death clock', async () => {
    const c  = await faucheur()
    const fx: CombatEffect = { targetId: 'x', kind: 'add-fatigue', amount: 2 }
    const fresh = effectBurden(fx, c)
    expect(fresh).toBeGreaterThan(0)
    // Filling the clock is decisive.
    const nearlyDone = { ...c, endurance: 0, fatigue: c.sheet.fatigue - 1 }
    expect(effectBurden(fx, nearlyDone)).toBeGreaterThanOrEqual(PRICE.decisive)
  })

  it('mental pressure drains regenerating ◇ cheaply, then moves the track', async () => {
    const c = await faucheur()
    const shock: CombatEffect = { targetId: 'x', kind: 'shift-mental', direction: 'toward-terror' }
    const drained = { ...c, stability: 0 }
    expect(Math.abs(effectBurden(shock, drained)))
      .toBeGreaterThan(effectBurden(shock, { ...c, stability: 3 }))
  })
})

describe('scoreEffects — sign convention and personas', () => {
  function ctx(self: CombatantState, enemy: Actor, weights = PERSONA_WEIGHTS.opportunist): ScoreContext {
    const actors = new Map<string, Actor>([[self.id, self], [enemy.id, enemy]])
    return {
      selfId:   self.id,
      isEnemy:  id => id === enemy.id,
      getActor: id => actors.get(id),
      weights,
    }
  }

  it('harming the enemy is positive; self-cost is negative', () => {
    const self  = makeCombatant('Self')
    const enemy = makeCombatant('Enemy')
    const c = ctx(self, enemy)
    expect(scoreEffects([{ targetId: 'Enemy', kind: 'light-wound', amount: 2 }], c)).toBeGreaterThan(0)
    expect(scoreEffects([{ targetId: 'Self', kind: 'add-fatigue', amount: 1 }], c)).toBeLessThan(0)
    // Self-heal is positive utility (negative burden × −caution).
    const hurtSelf = { ...self, lightWounds: 3 }
    const c2 = ctx(hurtSelf, enemy)
    expect(scoreEffects([{ targetId: 'Self', kind: 'heal-wounds', amount: 2 }], c2)).toBeGreaterThan(0)
  })

  it('aggressive prices enemy harm above cautious; cautious fears self-cost more', () => {
    const self  = makeCombatant('Self')
    const enemy = makeCombatant('Enemy')
    const harm: CombatEffect[] = [{ targetId: 'Enemy', kind: 'light-wound', amount: 2 }]
    const cost: CombatEffect[] = [{ targetId: 'Self',  kind: 'add-fatigue', amount: 2 }]
    expect(scoreEffects(harm, ctx(self, enemy, PERSONA_WEIGHTS.aggressive)))
      .toBeGreaterThan(scoreEffects(harm, ctx(self, enemy, PERSONA_WEIGHTS.cautious)))
    expect(scoreEffects(cost, ctx(self, enemy, PERSONA_WEIGHTS.cautious)))
      .toBeLessThan(scoreEffects(cost, ctx(self, enemy, PERSONA_WEIGHTS.aggressive)))
  })
})
