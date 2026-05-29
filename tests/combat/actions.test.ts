import {
  ACTION_DEFS, GUARD_DEFS, rollParamsFrom, resolveAction,
  canUseAction, canAffordAction, availableGuards,
} from '../../src/combat/actions'
import type { CombatantState } from '../../src/combat/types'
import { addStatus, addFatigue } from '../../src/combat/combatant'
import { makeCharacter, makeCombatant } from '../helpers/fixtures'

// ─── ActionDef.resolve — armed-attack ─────────────────────────────────────────

describe('armed-attack resolve', () => {
  const actor  = makeCombatant('A')
  const target = makeCombatant('B')

  it('hit=true  → 3💢 on target', () => {
    const { effects } = ACTION_DEFS['armed-attack'].resolve(
      { hit: true, critical: false, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'light-wound', amount: 3 })
  })

  it('hit=false → 1💢 on target (graze always lands)', () => {
    const { effects } = ACTION_DEFS['armed-attack'].resolve(
      { hit: false, critical: false, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'light-wound', amount: 1 })
  })

  it('critical → knockdown status on target', () => {
    const { effects } = ACTION_DEFS['armed-attack'].resolve(
      { hit: true, critical: true, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'add-status', status: 'knockdown' })
  })

  it('flaw → +1💧 fatigue on actor', () => {
    const { effects } = ACTION_DEFS['armed-attack'].resolve(
      { hit: true, critical: false, flaw: true }, actor, target)
    expect(effects).toContainEqual({ targetId: 'A', kind: 'add-fatigue', amount: 1 })
  })

  it('no target → empty effects', () => {
    const { effects } = ACTION_DEFS['armed-attack'].resolve(
      { hit: true, critical: false, flaw: false }, actor, undefined)
    expect(effects).toHaveLength(0)
  })
})

// ─── ActionDef.resolve — unarmed-attack ───────────────────────────────────────

describe('unarmed-attack resolve', () => {
  const actor  = makeCombatant('A')
  const target = makeCombatant('B')

  it('hit=true  → 3💧 fatigue on target', () => {
    const { effects } = ACTION_DEFS['unarmed-attack'].resolve(
      { hit: true, critical: false, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'add-fatigue', amount: 3 })
  })

  it('hit=false → 1💧 fatigue on target', () => {
    const { effects } = ACTION_DEFS['unarmed-attack'].resolve(
      { hit: false, critical: false, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'add-fatigue', amount: 1 })
  })

  it('critical → stunned status on target', () => {
    const { effects } = ACTION_DEFS['unarmed-attack'].resolve(
      { hit: true, critical: true, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'add-status', status: 'stunned' })
  })

  it('flaw → +1💧 fatigue on actor', () => {
    const { effects } = ACTION_DEFS['unarmed-attack'].resolve(
      { hit: true, critical: false, flaw: true }, actor, target)
    expect(effects).toContainEqual({ targetId: 'A', kind: 'add-fatigue', amount: 1 })
  })
})

// ─── ActionDef.resolve — brutal-strike ────────────────────────────────────────

describe('brutal-strike resolve', () => {
  const actor  = makeCombatant('A')
  const target = makeCombatant('B')

  it('hit=true  → heavy-wound on target', () => {
    const { effects } = ACTION_DEFS['brutal-strike'].resolve(
      { hit: true, critical: false, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'heavy-wound' })
  })

  it('hit=false → 2💢 on target', () => {
    const { effects } = ACTION_DEFS['brutal-strike'].resolve(
      { hit: false, critical: false, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'light-wound', amount: 2 })
  })

  it('critical → stunned status on target', () => {
    const { effects } = ACTION_DEFS['brutal-strike'].resolve(
      { hit: true, critical: true, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'add-status', status: 'stunned' })
  })
})

// ─── ActionDef.resolve — sharp-strike ────────────────────────────────────────

describe('sharp-strike resolve', () => {
  const actor  = makeCombatant('A')
  const target = makeCombatant('B')

  it('hit=true  → 2💢 on target', () => {
    const { effects } = ACTION_DEFS['sharp-strike'].resolve(
      { hit: true, critical: false, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'light-wound', amount: 2 })
  })

  it('hit=false → 1💢 on target', () => {
    const { effects } = ACTION_DEFS['sharp-strike'].resolve(
      { hit: false, critical: false, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'light-wound', amount: 1 })
  })

  it('critical → hemorrhage on target', () => {
    const { effects } = ACTION_DEFS['sharp-strike'].resolve(
      { hit: true, critical: true, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'add-status', status: 'hemorrhage' })
  })

  it('flaw → +1💧 fatigue on actor', () => {
    const { effects } = ACTION_DEFS['sharp-strike'].resolve(
      { hit: true, critical: false, flaw: true }, actor, target)
    expect(effects).toContainEqual({ targetId: 'A', kind: 'add-fatigue', amount: 1 })
  })
})

// ─── ActionDef.resolve — respiration ─────────────────────────────────────────

describe('respiration resolve', () => {
  it('always removes winded regardless of roll', () => {
    const actor = addStatus(makeCombatant('A'), 'winded')
    const { effects } = ACTION_DEFS['respiration'].resolve(
      { hit: false, critical: false, flaw: false }, actor)
    expect(effects).toContainEqual({ targetId: 'A', kind: 'remove-status', status: 'winded' })
  })

  it('hit=true  → recovers 1 + endurance fatigue', () => {
    const actor = makeCombatant('A')
    const endurance = actor.skills.endurance  // 2 in fixture
    const { effects } = ACTION_DEFS['respiration'].resolve(
      { hit: true, critical: false, flaw: false }, actor)
    expect(effects).toContainEqual({ targetId: 'A', kind: 'remove-fatigue', amount: 1 + endurance })
  })

  it('hit=false → recovers exactly 1 fatigue', () => {
    const actor = makeCombatant('A')
    const { effects } = ACTION_DEFS['respiration'].resolve(
      { hit: false, critical: false, flaw: false }, actor)
    expect(effects).toContainEqual({ targetId: 'A', kind: 'remove-fatigue', amount: 1 })
  })

  it('critical → +1 bonus on top of the hit recovery', () => {
    const actor = makeCombatant('A')
    const endurance = actor.skills.endurance  // 2
    const { effects } = ACTION_DEFS['respiration'].resolve(
      { hit: true, critical: true, flaw: false }, actor)
    expect(effects).toContainEqual({ targetId: 'A', kind: 'remove-fatigue', amount: 1 + endurance + 1 })
  })

  it('flaw → spend 1 PA', () => {
    const { effects } = ACTION_DEFS['respiration'].resolve(
      { hit: false, critical: false, flaw: true }, makeCombatant('A'))
    expect(effects).toContainEqual({ targetId: 'A', kind: 'spend-actions', amount: 1 })
  })

  it('endurance ≥ 1 on hit → shifts mental state toward-calm', () => {
    const actor = makeCombatant('A')
    expect(actor.skills.endurance).toBeGreaterThanOrEqual(1)
    const { effects } = ACTION_DEFS['respiration'].resolve(
      { hit: true, critical: false, flaw: false }, actor)
    expect(effects).toContainEqual({ targetId: 'A', kind: 'shift-mental', direction: 'toward-calm' })
  })
})

// ─── ActionDef.resolve — stabilize ───────────────────────────────────────────

describe('stabilize resolve', () => {
  it('always removes hemorrhage regardless of roll', () => {
    const actor = addStatus(makeCombatant('A'), 'hemorrhage')
    const { effects } = ACTION_DEFS['stabilize'].resolve(
      { hit: false, critical: false, flaw: false }, actor)
    expect(effects).toContainEqual({ targetId: 'A', kind: 'remove-status', status: 'hemorrhage' })
  })

  it('hit=true  → heals 1 + recovery light wounds', () => {
    const actor = makeCombatant('A')
    const recovery = actor.skills.recovery  // 2 in fixture
    const { effects } = ACTION_DEFS['stabilize'].resolve(
      { hit: true, critical: false, flaw: false }, actor)
    expect(effects).toContainEqual({ targetId: 'A', kind: 'heal-wounds', amount: 1 + recovery })
  })

  it('hit=false → heals exactly 1 light wound', () => {
    const { effects } = ACTION_DEFS['stabilize'].resolve(
      { hit: false, critical: false, flaw: false }, makeCombatant('A'))
    expect(effects).toContainEqual({ targetId: 'A', kind: 'heal-wounds', amount: 1 })
  })

  it('critical → gain 1 reaction token', () => {
    const { effects } = ACTION_DEFS['stabilize'].resolve(
      { hit: true, critical: true, flaw: false }, makeCombatant('A'))
    expect(effects).toContainEqual({ targetId: 'A', kind: 'add-reaction', amount: 1 })
  })

  it('flaw → spend 1 PA', () => {
    const { effects } = ACTION_DEFS['stabilize'].resolve(
      { hit: false, critical: false, flaw: true }, makeCombatant('A'))
    expect(effects).toContainEqual({ targetId: 'A', kind: 'spend-actions', amount: 1 })
  })
})

// ─── GuardDef.effects ─────────────────────────────────────────────────────────

describe('GUARD_DEFS[absorb].effects', () => {
  const defender = makeCombatant('B')

  it('first use: does NOT generate a spend-reaction effect', () => {
    const { effects } = GUARD_DEFS['absorb'].effects({ flaw: false }, defender, true)
    expect(effects.some(e => e.kind === 'spend-reaction')).toBe(false)
  })

  it('flaw → +1💧 fatigue on defender', () => {
    const { effects } = GUARD_DEFS['absorb'].effects({ flaw: true }, defender, true)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'add-fatigue', amount: 1 })
  })

  it('no flaw → no fatigue effect', () => {
    const { effects } = GUARD_DEFS['absorb'].effects({ flaw: false }, defender, true)
    expect(effects.some(e => e.kind === 'add-fatigue')).toBe(false)
  })
})

describe('GUARD_DEFS[dodge].effects', () => {
  const defender = makeCombatant('B')

  it('first use: spends 1 reaction', () => {
    const { effects } = GUARD_DEFS['dodge'].effects({ flaw: false }, defender, true)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'spend-reaction' })
  })

  it('subsequent use (isFirstUse=false): no spend-reaction effect', () => {
    const { effects } = GUARD_DEFS['dodge'].effects({ flaw: false }, defender, false)
    expect(effects.some(e => e.kind === 'spend-reaction')).toBe(false)
  })

  it('first use with flaw: both spends reaction AND adds fatigue', () => {
    const { effects } = GUARD_DEFS['dodge'].effects({ flaw: true }, defender, true)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'spend-reaction' })
    expect(effects).toContainEqual({ targetId: 'B', kind: 'add-fatigue', amount: 1 })
  })
})

describe('GUARD_DEFS[parry].effects — same reaction cost as dodge', () => {
  it('first use: spends 1 reaction', () => {
    const { effects } = GUARD_DEFS['parry'].effects({ flaw: false }, makeCombatant('B'), true)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'spend-reaction' })
  })
})

// ─── rollParamsFrom ───────────────────────────────────────────────────────────

describe('rollParamsFrom', () => {
  it('characteristic maps to effChar, skill maps to skills record', () => {
    const s = makeCombatant('A')
    const p = rollParamsFrom(s, 'vigor', 'endurance')
    expect(p.characteristic).toBe(s.characteristics.vigor.value - s.characteristics.vigor.wounds)
    expect(p.skill).toBe(s.skills.endurance)
  })

  it('characteristic is reduced by wounds', () => {
    const base = makeCombatant('A')
    const s: CombatantState = {
      ...base,
      characteristics: {
        ...base.characteristics,
        strength: { value: 3, wounds: 2 },
      },
    }
    expect(rollParamsFrom(s, 'strength', 'power').characteristic).toBe(1)
  })

  it('characteristic is floored at 0 when wounds exceed value', () => {
    const base = makeCombatant('A')
    const s: CombatantState = {
      ...base,
      characteristics: {
        ...base.characteristics,
        strength: { value: 2, wounds: 5 },
      },
    }
    expect(rollParamsFrom(s, 'strength', 'power').characteristic).toBe(0)
  })
})

// ─── resolveAction — structural invariants ────────────────────────────────────

describe('resolveAction', () => {
  const actor  = makeCombatant('A')
  const target = makeCombatant('B')
  const noReaction = { effects: [] as never[], notes: [] as string[] }

  it('result has all required fields', () => {
    const r = resolveAction(actor, 'armed-attack', { dc: 0, guardReaction: noReaction, target })
    expect(r).toHaveProperty('checkRoll')
    expect(r).toHaveProperty('hit')
    expect(r).toHaveProperty('critical')
    expect(r).toHaveProperty('flaw')
    expect(r.effects).toBeDefined()
    expect(r.notes).toBeDefined()
  })

  it('dc=0 → always hits (total ≥ 0)', () => {
    for (let i = 0; i < 20; i++) {
      expect(resolveAction(actor, 'armed-attack', { dc: 0, guardReaction: noReaction, target }).hit)
        .toBe(true)
    }
  })

  it('dc=21 → never hits (max total = 20)', () => {
    for (let i = 0; i < 20; i++) {
      expect(resolveAction(actor, 'armed-attack', { dc: 21, guardReaction: noReaction, target }).hit)
        .toBe(false)
    }
  })

  it('guardReaction effects are prepended to the result effects list', () => {
    const guardEff = { targetId: 'B', kind: 'spend-reaction' as const }
    const r = resolveAction(actor, 'armed-attack', {
      dc: 0,
      guardReaction: { effects: [guardEff], notes: [] },
      target,
    })
    expect(r.effects[0]).toEqual(guardEff)
  })

  it('self-targeted action (respiration) has no targetId in result', () => {
    const r = resolveAction(actor, 'respiration', { dc: 0, guardReaction: noReaction })
    expect(r.targetId).toBeUndefined()
  })

  it('records actor and action ids correctly', () => {
    const r = resolveAction(actor, 'armed-attack', { dc: 0, guardReaction: noReaction, target })
    expect(r.actorId).toBe('A')
    expect(r.action).toBe('armed-attack')
    expect(r.targetId).toBe('B')
  })
})

// ─── canUseAction ─────────────────────────────────────────────────────────────

describe('canUseAction', () => {
  it('incapacitated combatant cannot use any action', () => {
    const s = addStatus(makeCombatant(), 'incapacitated')
    for (const id of ['armed-attack', 'unarmed-attack', 'respiration'] as const) {
      expect(canUseAction(s, id)).toBe(false)
    }
  })

  it('missing prerequisite skill → false (brutal-strike needs power ≥ 1)', () => {
    const s = makeCombatant('A', { skills: { ...makeCharacter().skills, power: 0 } })
    expect(canUseAction(s, 'brutal-strike')).toBe(false)
  })

  it('prerequisite met → true', () => {
    const s = makeCombatant()  // power = 2
    expect(canUseAction(s, 'brutal-strike')).toBe(true)
  })

  it('requiresFirstAction blocked after first action is played', () => {
    const s: CombatantState = { ...makeCombatant(), firstActionPlayed: true }
    expect(canUseAction(s, 'respiration')).toBe(false)
    expect(canUseAction(s, 'stabilize')).toBe(false)
  })

  it('requiresFirstAction allowed before first action', () => {
    const s: CombatantState = { ...makeCombatant(), firstActionPlayed: false }
    expect(canUseAction(s, 'respiration')).toBe(true)
    expect(canUseAction(s, 'stabilize')).toBe(true)
  })
})

// ─── canAffordAction ──────────────────────────────────────────────────────────

describe('canAffordAction', () => {
  it('lastActionPlayed → cannot afford any action', () => {
    const s: CombatantState = { ...makeCombatant(), lastActionPlayed: true }
    expect(canAffordAction(s, 'armed-attack')).toBe(false)
    expect(canAffordAction(s, 'unarmed-attack')).toBe(false)
  })

  it('insufficient PA → false', () => {
    const s: CombatantState = { ...makeCombatant(), actions: 1 }
    expect(canAffordAction(s, 'armed-attack')).toBe(false)  // costs 2 PA
  })

  it('exactly enough PA → true', () => {
    const s: CombatantState = { ...makeCombatant(), actions: 2 }
    expect(canAffordAction(s, 'armed-attack')).toBe(true)
  })

  it('fatigue cost would reach 20 → false', () => {
    // brutal-strike costs 1 fatigue; 19 + 1 = 20 → blocked
    const s = addFatigue(makeCombatant(), 19)
    expect(canAffordAction(s, 'brutal-strike')).toBe(false)
  })

  it('fatigue cost within budget → true', () => {
    const s = addFatigue(makeCombatant(), 10)
    expect(canAffordAction(s, 'brutal-strike')).toBe(true)  // 10 + 1 = 11 < 20
  })
})

// ─── availableGuards ──────────────────────────────────────────────────────────

describe('availableGuards', () => {
  it('always includes absorb', () => {
    expect(availableGuards(makeCombatant())).toContain('absorb')
  })

  it('includes dodge when reactions ≥ 1 and not incapacitated', () => {
    const s = makeCombatant()
    expect(s.reactions).toBeGreaterThanOrEqual(1)
    expect(availableGuards(s)).toContain('dodge')
  })

  it('excludes dodge when incapacitated', () => {
    const s = addStatus(makeCombatant(), 'incapacitated')
    expect(availableGuards(s)).not.toContain('dodge')
  })

  it('excludes parry when power < 1', () => {
    const s = makeCombatant('A', { skills: { ...makeCharacter().skills, power: 0 } })
    expect(availableGuards(s)).not.toContain('parry')
  })

  it('includes parry when power ≥ 1', () => {
    const s = makeCombatant()  // power = 2
    expect(availableGuards(s)).toContain('parry')
  })

  it('includes block when robustness ≥ 2', () => {
    const s = makeCombatant()  // robustness = 2
    expect(availableGuards(s)).toContain('block')
  })

  it('excludes block when robustness < 2', () => {
    const s = makeCombatant('A', { skills: { ...makeCharacter().skills, robustness: 1 } })
    expect(availableGuards(s)).not.toContain('block')
  })
})
