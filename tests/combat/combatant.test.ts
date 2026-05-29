import {
  initCombatant, resetRoundTokens, effChar, resistanceThreshold,
  applyLightWounds, applyHeavyWound, processRoundEnd, healLightWounds,
  addFatigue, removeFatigue, shiftMentalState,
  addStatus, removeStatus, addReaction, spendReaction,
  isDefeated, applyEffects,
} from '../../src/combat/combatant'
import type { CombatantState } from '../../src/combat/types'
import { makeCharacter, makeCombatant } from '../helpers/fixtures'

// ─── initCombatant ────────────────────────────────────────────────────────────

describe('initCombatant', () => {
  const char = makeCharacter({ name: 'Hero' })
  const s    = initCombatant(char)

  it('sets id to the character name', () => expect(s.id).toBe('Hero'))
  it('starts with 0 light wounds',     () => expect(s.lightWounds).toBe(0))
  it('starts with 0 heavy wounds',     () => expect(s.heavyWounds).toBe(0))
  it('starts with 0 fatigue',          () => expect(s.fatigue).toBe(0))
  it('starts in focused mental state', () => expect(s.mentalState).toBe('focused'))
  it('starts with no status effects',  () => expect(s.status).toHaveLength(0))
  it('sets reactions to reactivity skill', () =>
    expect(s.reactions).toBe(char.skills.reactivity))
  it('sets maxReactions to reactivity skill', () =>
    expect(s.maxReactions).toBe(char.skills.reactivity))
})

// ─── resetRoundTokens ─────────────────────────────────────────────────────────

describe('resetRoundTokens', () => {
  it('restores actions to 3', () => {
    const s = { ...makeCombatant(), actions: 0 }
    expect(resetRoundTokens(s).actions).toBe(3)
  })

  it('resets firstActionPlayed and lastActionPlayed to false', () => {
    const s = { ...makeCombatant(), firstActionPlayed: true, lastActionPlayed: true }
    const r = resetRoundTokens(s)
    expect(r.firstActionPlayed).toBe(false)
    expect(r.lastActionPlayed).toBe(false)
  })

  it('clears stunned status and deducts 1 PA', () => {
    const s = addStatus(makeCombatant(), 'stunned')
    const r = resetRoundTokens(s)
    expect(r.status).not.toContain('stunned')
    expect(r.actions).toBe(2)
  })

  it('clears knockdown status and deducts 1 PA', () => {
    const s = addStatus(makeCombatant(), 'knockdown')
    const r = resetRoundTokens(s)
    expect(r.status).not.toContain('knockdown')
    expect(r.actions).toBe(2)
  })

  it('stun + knockdown together deduct 2 PA (minimum 1)', () => {
    let s = addStatus(makeCombatant(), 'stunned')
    s     = addStatus(s, 'knockdown')
    expect(resetRoundTokens(s).actions).toBe(1)
  })

  it('does not clear winded status (persists until Respiration)', () => {
    const s = addStatus(makeCombatant(), 'winded')
    expect(resetRoundTokens(s).status).toContain('winded')
  })

  it('grants +1 reaction when focused', () => {
    const s = makeCombatant()
    expect(s.mentalState).toBe('focused')
    expect(resetRoundTokens(s).reactions).toBe(s.maxReactions + 1)
  })

  it('does not grant bonus reaction when not focused', () => {
    const s = shiftMentalState(makeCombatant(), 'toward-rage')  // aggressive
    const r = resetRoundTokens(s)
    expect(r.reactions).toBe(r.maxReactions)
  })
})

// ─── effChar ──────────────────────────────────────────────────────────────────

describe('effChar', () => {
  it('returns value − wounds when wounds < value', () => {
    const s = makeCombatant()
    const base = s.characteristics.strength.value
    const wounded: CombatantState = {
      ...s,
      characteristics: {
        ...s.characteristics,
        strength: { value: base, wounds: 1 },
      },
    }
    expect(effChar(wounded, 'strength')).toBe(base - 1)
  })

  it('never returns a negative value', () => {
    const s = makeCombatant()
    const base = s.characteristics.strength.value
    const maxWounded: CombatantState = {
      ...s,
      characteristics: {
        ...s.characteristics,
        strength: { value: base, wounds: base + 5 },
      },
    }
    expect(effChar(maxWounded, 'strength')).toBe(0)
  })
})

// ─── resistanceThreshold ──────────────────────────────────────────────────────

describe('resistanceThreshold', () => {
  it('equals effChar(vigor) + robustness skill', () => {
    const s = makeCombatant()
    const expected = effChar(s, 'vigor') + s.skills.robustness
    expect(resistanceThreshold(s)).toBe(expected)
  })
})

// ─── Wound application ────────────────────────────────────────────────────────

describe('applyLightWounds', () => {
  it('accumulates correctly over multiple calls', () => {
    let s = makeCombatant()
    s = applyLightWounds(s, 2)
    s = applyLightWounds(s, 3)
    expect(s.lightWounds).toBe(5)
  })
})

describe('applyHeavyWound', () => {
  it('increments the heavyWounds counter', () => {
    const s = applyHeavyWound(makeCombatant())
    expect(s.heavyWounds).toBe(1)
  })

  it('applies the wound to a physical characteristic (wounds field +1)', () => {
    const s = applyHeavyWound(makeCombatant())
    const physicals = ['strength', 'agility', 'vigor', 'grace', 'acuity'] as const
    const totalWounds = physicals.reduce((sum, c) => sum + s.characteristics[c].wounds, 0)
    expect(totalWounds).toBe(1)
  })

  it('does not reduce effective value below 0', () => {
    // Apply many heavy wounds; effChar should stay ≥ 0
    let s = makeCombatant()
    for (let i = 0; i < 20; i++) s = applyHeavyWound(s)
    const physicals = ['strength', 'agility', 'vigor', 'grace', 'acuity'] as const
    for (const c of physicals) {
      expect(effChar(s, c)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('healLightWounds', () => {
  it('reduces lightWounds by the given amount', () => {
    let s = applyLightWounds(makeCombatant(), 5)
    s = healLightWounds(s, 3)
    expect(s.lightWounds).toBe(2)
  })

  it('never reduces lightWounds below 0', () => {
    let s = applyLightWounds(makeCombatant(), 2)
    s = healLightWounds(s, 10)
    expect(s.lightWounds).toBe(0)
  })
})

// ─── processRoundEnd ──────────────────────────────────────────────────────────

describe('processRoundEnd', () => {
  it('converts light wounds to a heavy wound when over the threshold', () => {
    let s    = makeCombatant()
    const threshold = resistanceThreshold(s)
    // Exceed by 1
    s = applyLightWounds(s, threshold + 1)
    s = processRoundEnd(s)
    expect(s.heavyWounds).toBe(1)
    expect(s.lightWounds).toBe(0)
  })

  it('does NOT convert when light wounds equal the threshold', () => {
    let s    = makeCombatant()
    const threshold = resistanceThreshold(s)
    s = applyLightWounds(s, threshold)
    s = processRoundEnd(s)
    expect(s.heavyWounds).toBe(0)
    expect(s.lightWounds).toBe(threshold)
  })

  it('hemorrhage token is consumed when a wound conversion occurs', () => {
    // Correct rule: hemorrhage prevents Protection from blocking conversion,
    // and one 🩸 token is removed per conversion.
    let s = addStatus(makeCombatant(), 'hemorrhage')
    const threshold = resistanceThreshold(s)
    s = applyLightWounds(s, threshold + 1)  // trigger conversion
    s = processRoundEnd(s)
    expect(s.heavyWounds).toBe(1)           // conversion happened
    expect(s.status).not.toContain('hemorrhage')  // token consumed
  })

  it('hemorrhage persists when no wound conversion occurs', () => {
    let s = addStatus(makeCombatant(), 'hemorrhage')
    // No light wounds → no conversion → 🩸 token not removed
    s = processRoundEnd(s)
    expect(s.lightWounds).toBe(0)
    expect(s.status).toContain('hemorrhage')
  })
})

// ─── Fatigue ──────────────────────────────────────────────────────────────────

// ─── Test d'Endurance (phase d'entretien) ─────────────────────────────────────

describe('resetRoundTokens — endurance test', () => {
  it('no endurance test when fatigue < 10', () => {
    let s = addFatigue(makeCombatant(), 9)  // just under the threshold
    s = { ...s, firstActionPlayed: true, lastActionPlayed: true }
    const r = resetRoundTokens(s)
    // No winded, fatigue unchanged (only the PA/flags reset happened)
    expect(r.status).not.toContain('winded')
    expect(r.fatigue).toBe(9)
  })

  it('fatigue exactly 10 triggers the test: outcome is winded OR fatigue decreased', () => {
    const s = addFatigue(makeCombatant(), 10)
    const r = resetRoundTokens(s)
    const windedAdded     = r.status.includes('winded')
    const fatigueRecovered = r.fatigue < 10
    expect(windedAdded || fatigueRecovered).toBe(true)
  })

  it('no endurance test when incapacitated (fatigue = 20)', () => {
    // Reaching fatigue 20 sets incapacitated; test should be skipped
    const s = addFatigue(makeCombatant(), 20)
    expect(isDefeated(s)).toBe(true)
    const r = resetRoundTokens(s)
    // Fatigue stays at 20 — no recovery roll attempted
    expect(r.fatigue).toBe(20)
  })
})

describe('addFatigue', () => {
  it('adds fatigue normally', () => {
    const s = addFatigue(makeCombatant(), 5)
    expect(s.fatigue).toBe(5)
  })

  it('caps fatigue at 20', () => {
    const s = addFatigue(makeCombatant(), 25)
    expect(s.fatigue).toBe(20)
  })

  it('sets incapacitated when fatigue reaches 20', () => {
    const s = addFatigue(makeCombatant(), 20)
    expect(s.status).toContain('incapacitated')
  })

  it('does not add a second incapacitated if already present', () => {
    let s = addFatigue(makeCombatant(), 20)
    s = addFatigue(s, 1)
    expect(s.status.filter(x => x === 'incapacitated')).toHaveLength(1)
  })
})

describe('removeFatigue', () => {
  it('reduces fatigue by the given amount', () => {
    let s = addFatigue(makeCombatant(), 10)
    s = removeFatigue(s, 4)
    expect(s.fatigue).toBe(6)
  })

  it('never reduces fatigue below 0', () => {
    let s = addFatigue(makeCombatant(), 3)
    s = removeFatigue(s, 10)
    expect(s.fatigue).toBe(0)
  })
})

// ─── Mental state ─────────────────────────────────────────────────────────────

describe('shiftMentalState', () => {
  it('shifts toward-rage from focused to aggressive', () => {
    const s = shiftMentalState(makeCombatant(), 'toward-rage')
    expect(s.mentalState).toBe('aggressive')
  })

  it('shifts toward-calm from focused to cautious', () => {
    const s = shiftMentalState(makeCombatant(), 'toward-calm')
    expect(s.mentalState).toBe('cautious')
  })

  it('does not go below enraged (index 0)', () => {
    let s = makeCombatant()
    for (let i = 0; i < 10; i++) s = shiftMentalState(s, 'toward-rage')
    expect(s.mentalState).toBe('enraged')
  })

  it('does not go above terrified (index 6)', () => {
    let s = makeCombatant()
    for (let i = 0; i < 10; i++) s = shiftMentalState(s, 'toward-calm')
    expect(s.mentalState).toBe('terrified')
  })
})

// ─── Status effects ───────────────────────────────────────────────────────────

describe('addStatus / removeStatus', () => {
  it('adds a status effect', () => {
    const s = addStatus(makeCombatant(), 'stunned')
    expect(s.status).toContain('stunned')
  })

  it('does not duplicate an existing status', () => {
    let s = addStatus(makeCombatant(), 'stunned')
    s     = addStatus(s, 'stunned')
    expect(s.status.filter(x => x === 'stunned')).toHaveLength(1)
  })

  it('applying stunned immediately drains all reactions to 0', () => {
    const base = makeCombatant()
    expect(base.reactions).toBeGreaterThan(0)  // fixture has reactions > 0
    const s = addStatus(base, 'stunned')
    expect(s.reactions).toBe(0)
  })

  it('second addStatus(stunned) call does not drain reactions again', () => {
    let s = addStatus(makeCombatant(), 'stunned')
    s = addReaction(s, 3)  // restore some reactions manually
    s = addStatus(s, 'stunned')  // noop — already present, no drain
    expect(s.reactions).toBe(3)
  })

  it('removes a status effect', () => {
    let s = addStatus(makeCombatant(), 'stunned')
    s     = removeStatus(s, 'stunned')
    expect(s.status).not.toContain('stunned')
  })
})

// ─── Reactions ────────────────────────────────────────────────────────────────

describe('addReaction / spendReaction', () => {
  it('adds reaction tokens', () => {
    const s = addReaction(makeCombatant(), 2)
    expect(s.reactions).toBe(makeCombatant().reactions + 2)
  })

  it('spends one reaction token', () => {
    const base = makeCombatant()
    const s    = spendReaction(base)
    expect(s.reactions).toBe(base.reactions - 1)
  })

  it('spending never goes below 0', () => {
    let s = makeCombatant()
    for (let i = 0; i < 20; i++) s = spendReaction(s)
    expect(s.reactions).toBe(0)
  })
})

// ─── isDefeated ───────────────────────────────────────────────────────────────

describe('isDefeated', () => {
  it('returns false for a healthy combatant', () => {
    expect(isDefeated(makeCombatant())).toBe(false)
  })

  it('returns true when incapacitated', () => {
    const s = addStatus(makeCombatant(), 'incapacitated')
    expect(isDefeated(s)).toBe(true)
  })
})

// ─── applyEffects ─────────────────────────────────────────────────────────────

describe('applyEffects', () => {
  it('applies light-wound effects to the correct target', () => {
    const a = makeCombatant('A')
    const b = makeCombatant('B')
    const states = new Map([[a.id, a], [b.id, b]])
    const result = applyEffects(states, [
      { targetId: 'B', kind: 'light-wound', amount: 3 },
    ])
    expect(result.get('B')!.lightWounds).toBe(3)
    expect(result.get('A')!.lightWounds).toBe(0)
  })

  it('applies multiple effects of different kinds', () => {
    const a = makeCombatant('A')
    const states = new Map([[a.id, a]])
    const result = applyEffects(states, [
      { targetId: 'A', kind: 'add-fatigue',  amount: 5 },
      { targetId: 'A', kind: 'add-status',   status: 'stunned' },
    ])
    const updated = result.get('A')!
    expect(updated.fatigue).toBe(5)
    expect(updated.status).toContain('stunned')
  })

  it('does not mutate the original map', () => {
    const a      = makeCombatant('A')
    const states = new Map([[a.id, a]])
    applyEffects(states, [{ targetId: 'A', kind: 'light-wound', amount: 2 }])
    expect(states.get('A')!.lightWounds).toBe(0)
  })

  it('silently ignores effects targeting unknown IDs', () => {
    const a      = makeCombatant('A')
    const states = new Map([[a.id, a]])
    expect(() =>
      applyEffects(states, [{ targetId: 'GHOST', kind: 'heavy-wound' }])
    ).not.toThrow()
  })
})
