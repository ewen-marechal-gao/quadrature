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
  it('starts with 1 fatigue (§ Fatigue : débute à 1)', () => expect(s.fatigue).toBe(1))
  it('starts in focused mental state', () => expect(s.mentalState).toBe('focused'))
  it('starts with no status effects',  () => expect(s.status).toHaveLength(0))
  it('starts with 0 protection (no armor on sheet)', () => expect(s.protection).toBe(0))
  it('starts with 0 tempProtection',   () => expect(s.tempProtection).toBe(0))
  it('sets reactions to reactivity skill', () =>
    expect(s.reactions).toBe(char.skills.reactivity))
  it('sets maxReactions to reactivity skill', () =>
    expect(s.maxReactions).toBe(char.skills.reactivity))
  it('reads protection from character sheet when set', () => {
    const armoured = makeCharacter({ protection: 2 })
    expect(initCombatant(armoured).protection).toBe(2)
  })
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

  it('clears stunned at round start — no additional PA penalty', () => {
    // The action cost was already paid immediately when stunned was applied;
    // onTokenReset only clears the status, no extra actionPenalty.
    const s = addStatus(makeCombatant(), 'stunned')
    const r = resetRoundTokens(s)
    expect(r.status).not.toContain('stunned')
    expect(r.actions).toBe(3)
  })

  it('clears knockdown status and deducts 1 PA', () => {
    const s = addStatus(makeCombatant(), 'knockdown')
    const r = resetRoundTokens(s)
    expect(r.status).not.toContain('knockdown')
    expect(r.actions).toBe(2)
  })

  it('stun only drains reactions (not actions); knockdown deducts 1 PA at round start', () => {
    let s = addStatus(makeCombatant(), 'stunned')   // reactions → 0, actions untouched
    s     = addStatus(s, 'knockdown')               // knockdown deferred to round start
    expect(s.actions).toBe(3)                       // Sonné ne touche plus l'action ⚫
    expect(resetRoundTokens(s).actions).toBe(2)     // 3 fresh − 1 knockdown; stun clears free
  })

  it('clears winded at round start when fatigue < 10', () => {
    // fatigue = 0 (default) → winded auto-effacé en début de round
    const s = addStatus(makeCombatant(), 'winded')
    expect(resetRoundTokens(s).status).not.toContain('winded')
  })

  it('keeps winded at round start when fatigue ≥ 10', () => {
    let s = addFatigue(makeCombatant(), 10)
    s = addStatus(s, 'winded')
    expect(resetRoundTokens(s).status).toContain('winded')
  })

  it('winded costs −1 PA at round start (Essoufflé ⇒ action seulement)', () => {
    // Essoufflé conservé (fatigue ≥ 10) → 3 PA − 1 = 2 au début de la manche
    let s = addFatigue(makeCombatant(), 10)
    s = addStatus(s, 'winded')
    const r = resetRoundTokens(s)
    expect(r.status).toContain('winded')
    expect(r.actions).toBe(2)
  })

  it('grants +1 reaction when focused', () => {
    const s = makeCombatant()
    expect(s.mentalState).toBe('focused')
    expect(resetRoundTokens(s).reactions).toBe(s.maxReactions + 1)
  })

  it('does not grant bonus reaction when not focused', () => {
    // Exhaust ◇ so the shift actually moves the track off 'focused'.
    const s = shiftMentalState({ ...makeCombatant(), stability: 0 }, 'toward-rage')  // aggressive
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

// ─── applyHeavyWound — protection ────────────────────────────────────────────

describe('applyHeavyWound — protection', () => {
  it('base protection absorbs the wound instead of applying it', () => {
    const s = { ...makeCombatant(), protection: 2 }
    const r = applyHeavyWound(s)
    expect(r.heavyWounds).toBe(0)   // wound absorbed
    expect(r.protection).toBe(1)    // one protection point consumed
  })

  it('tempProtection is consumed before base protection', () => {
    const s = { ...makeCombatant(), protection: 1, tempProtection: 1 }
    const r = applyHeavyWound(s)
    expect(r.heavyWounds).toBe(0)       // wound absorbed
    expect(r.tempProtection).toBe(0)    // temp consumed first
    expect(r.protection).toBe(1)        // base untouched
  })

  it('third wound lands once both protection pools are exhausted', () => {
    let s = { ...makeCombatant(), protection: 1, tempProtection: 1 }
    s = applyHeavyWound(s)              // consumes tempProtection (0 → heavy wound avoided)
    s = applyHeavyWound(s)              // consumes base protection (0 → heavy wound avoided)
    s = applyHeavyWound(s)              // no protection left → wound lands
    expect(s.heavyWounds).toBe(1)
    expect(s.tempProtection).toBe(0)
    expect(s.protection).toBe(0)
  })

  it('bypassProtection=true ignores all protection and applies the wound', () => {
    const s = { ...makeCombatant(), protection: 2, tempProtection: 3 }
    const r = applyHeavyWound(s, true)
    expect(r.heavyWounds).toBe(1)       // wound lands despite protection
    expect(r.protection).toBe(2)        // base unchanged
    expect(r.tempProtection).toBe(3)    // temp unchanged
  })

  it('no protection → wound always applies normally (regression)', () => {
    const s = makeCombatant()           // protection: 0, tempProtection: 0 by default
    expect(applyHeavyWound(s).heavyWounds).toBe(1)
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
    // Exceed by 1: only the 1 excess wound is removed; threshold wounds remain
    s = applyLightWounds(s, threshold + 1)
    s = processRoundEnd(s)
    expect(s.heavyWounds).toBe(1)
    expect(s.lightWounds).toBe(threshold)  // threshold wounds carry over
  })

  it('does NOT convert when light wounds equal the threshold', () => {
    let s    = makeCombatant()
    const threshold = resistanceThreshold(s)
    s = applyLightWounds(s, threshold)
    s = processRoundEnd(s)
    expect(s.heavyWounds).toBe(0)
    expect(s.lightWounds).toBe(threshold)
  })

  it('carryover — a single extra wound the next round triggers conversion again', () => {
    // After the first conversion, threshold wounds remain. Adding just 1 more
    // brings total to threshold+1 → triggers a second conversion immediately.
    // Note: the heavy wound from round 1 may reduce VIG effective value, lowering
    // the round-2 threshold — so we recapture it between rounds.
    let s        = makeCombatant()
    const thr1   = resistanceThreshold(s)
    s = applyLightWounds(s, thr1 + 1)
    s = processRoundEnd(s)                 // round 1: 1 heavy wound, thr1 wounds remain
    expect(s.heavyWounds).toBe(1)
    expect(s.lightWounds).toBe(thr1)
    const thr2 = resistanceThreshold(s)    // may be ≤ thr1 if VIG was wounded
    s = applyLightWounds(s, 1)             // thr1+1 ≥ thr2+1 > thr2 → conversion guaranteed
    s = processRoundEnd(s)
    expect(s.heavyWounds).toBe(2)          // second conversion triggered
    expect(s.lightWounds).toBe(thr2)       // wounds up to round-2 threshold carry over
  })

  it('hemorrhage token is consumed when a wound conversion occurs', () => {
    // Hemorrhage bypasses protection AND consumes the 🩸 token on conversion.
    let s = addStatus(makeCombatant(), 'hemorrhage')
    const threshold = resistanceThreshold(s)
    s = applyLightWounds(s, threshold + 1)  // trigger conversion
    s = processRoundEnd(s)
    expect(s.heavyWounds).toBe(1)                 // conversion happened
    expect(s.status).not.toContain('hemorrhage')  // token consumed
  })

  it('hemorrhage persists when no wound conversion occurs', () => {
    let s = addStatus(makeCombatant(), 'hemorrhage')
    // No light wounds → no conversion → 🩸 token not removed
    s = processRoundEnd(s)
    expect(s.lightWounds).toBe(0)
    expect(s.status).toContain('hemorrhage')
  })

  it('protection absorbs the conversion wound when protection > 0', () => {
    const base      = makeCombatant()
    const threshold = resistanceThreshold(base)
    const s         = applyLightWounds({ ...base, protection: 1 }, threshold + 1)
    const r         = processRoundEnd(s)
    expect(r.heavyWounds).toBe(0)         // wound absorbed by protection
    expect(r.protection).toBe(0)          // one point consumed
    expect(r.lightWounds).toBe(threshold) // carry-over unchanged
  })

  it('hemorrhage bypasses protection during conversion', () => {
    const base      = addStatus(makeCombatant(), 'hemorrhage')
    const threshold = resistanceThreshold(base)
    const s         = applyLightWounds({ ...base, protection: 2 }, threshold + 1)
    const r         = processRoundEnd(s)
    expect(r.heavyWounds).toBe(1)                 // wound landed despite protection
    expect(r.protection).toBe(2)                  // protection NOT consumed
    expect(r.status).not.toContain('hemorrhage')  // 🩸 token consumed
  })

  it('tempProtection is cleared at round end whether used or not', () => {
    const s = { ...makeCombatant(), tempProtection: 3 }
    const r = processRoundEnd(s)
    expect(r.tempProtection).toBe(0)
  })
})

// ─── Fatigue ──────────────────────────────────────────────────────────────────

// ─── Test d'Endurance (phase d'entretien) ─────────────────────────────────────

describe('resetRoundTokens — endurance test', () => {
  it('no endurance test when fatigue < 10', () => {
    let s = addFatigue(makeCombatant(), 8)  // 1 + 8 = 9, just under the threshold
    s = { ...s, firstActionPlayed: true, lastActionPlayed: true }
    const r = resetRoundTokens(s)
    // No winded, fatigue unchanged (only the PA/flags reset happened)
    expect(r.status).not.toContain('winded')
    expect(r.fatigue).toBe(9)
  })

  it('fatigue exactly 10 triggers the test: outcome is winded OR fatigue decreased', () => {
    const s = addFatigue(makeCombatant(), 9)  // 1 + 9 = 10
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
  it('adds fatigue normally (base 1)', () => {
    const s = addFatigue(makeCombatant(), 5)
    expect(s.fatigue).toBe(6)   // 1 de départ + 5
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
    let s = addFatigue(makeCombatant(), 10)   // 1 + 10 = 11
    s = removeFatigue(s, 4)
    expect(s.fatigue).toBe(7)
  })

  it('never reduces fatigue below 1 (§ Fatigue)', () => {
    let s = addFatigue(makeCombatant(), 3)
    s = removeFatigue(s, 10)
    expect(s.fatigue).toBe(1)
  })
})

// ─── Mental state ─────────────────────────────────────────────────────────────

describe('shiftMentalState', () => {
  // MENTAL_STATES : enraged(0) … focused(3) … terrified(6)
  //   🔻 toward-terror → index +1 (vers terrified)
  //   🔺 toward-rage   → index −1 (vers enraged)
  //   toward-focused   → récupération vers 'focused'
  // Un 🔻/🔺 est d'abord absorbé par un ◇ (Stabilité) ; on met stability: 0
  // pour tester le déplacement de la piste.

  const shaken = () => ({ ...makeCombatant(), stability: 0 })

  it('toward-terror from focused moves one step toward terrified (cautious)', () => {
    const s = shiftMentalState(shaken(), 'toward-terror')
    expect(s.mentalState).toBe('cautious')
  })

  it('toward-rage from focused moves one step toward enraged (aggressive)', () => {
    const s = shiftMentalState(shaken(), 'toward-rage')
    expect(s.mentalState).toBe('aggressive')
  })

  it('caps at terrified after repeated toward-terror', () => {
    let s = shaken()
    for (let i = 0; i < 10; i++) s = shiftMentalState({ ...s, stability: 0 }, 'toward-terror')
    expect(s.mentalState).toBe('terrified')
  })

  it('caps at enraged after repeated toward-rage', () => {
    let s = shaken()
    for (let i = 0; i < 10; i++) s = shiftMentalState({ ...s, stability: 0 }, 'toward-rage')
    expect(s.mentalState).toBe('enraged')
  })

  // ── Stability ◇ buffer (§ Stabilité) ──────────────────────────────────────
  it('absorbs a 🔻 shift by spending one ◇ instead of moving the track', () => {
    const s = shiftMentalState({ ...makeCombatant(), stability: 2 }, 'toward-terror')
    expect(s.stability).toBe(1)
    expect(s.mentalState).toBe('focused')
  })

  it('moves the track only once ◇ is exhausted', () => {
    const s = shiftMentalState({ ...makeCombatant(), stability: 0 }, 'toward-terror')
    expect(s.stability).toBe(0)
    expect(s.mentalState).toBe('cautious')
  })

  it('does not spend ◇ on beneficial recovery (toward-focused)', () => {
    const base = { ...makeCombatant(), mentalState: 'cautious' as const, stability: 2 }
    const s    = shiftMentalState(base, 'toward-focused')
    expect(s.stability).toBe(2)
    expect(s.mentalState).toBe('focused')
  })

  it('is a combat-long pool — round start does NOT refill ◇', () => {
    // ◇ is set at initialisation (TestFighter: tenacity 2 + discipline 0 = 2)
    // and only depletes; a spent pool stays spent across rounds.
    expect(makeCombatant().stability).toBe(2)
    const spent = { ...makeCombatant(), stability: 0 }
    expect(resetRoundTokens(spent).stability).toBe(0)
  })

  it('toward-focused from aggressive returns to focused in one step', () => {
    const base = { ...makeCombatant(), mentalState: 'aggressive' as const }
    const s    = shiftMentalState(base, 'toward-focused')
    expect(s.mentalState).toBe('focused')
  })

  it('toward-focused from cautious returns to focused in one step', () => {
    const base = { ...makeCombatant(), mentalState: 'cautious' as const }
    const s    = shiftMentalState(base, 'toward-focused')
    expect(s.mentalState).toBe('focused')
  })

  it('toward-focused while already focused has no effect', () => {
    const s = shiftMentalState(makeCombatant(), 'toward-focused')
    expect(s.mentalState).toBe('focused')
  })

  it('toward-focused from enraged moves one step toward focused (furious)', () => {
    const base = { ...makeCombatant(), mentalState: 'enraged' as const }
    const s    = shiftMentalState(base, 'toward-focused')
    expect(s.mentalState).toBe('furious')
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

  it('applying stunned drains reactions but NOT actions (Sonné ⇒ défense seulement)', () => {
    const base = makeCombatant()  // starts with 3 actions after resetRoundTokens
    expect(base.actions).toBe(3)
    const s = addStatus(base, 'stunned')
    expect(s.reactions).toBe(0)
    expect(s.actions).toBe(3)
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
    expect(updated.fatigue).toBe(6)   // 1 de départ + 5
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
