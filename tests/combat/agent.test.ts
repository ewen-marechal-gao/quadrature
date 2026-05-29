/**
 * Tests for the scripted combat agent (planRound + makeGuardProvider).
 *
 * Only the synchronous, rule-based planRound is tested here.
 * planRoundAI is excluded because it requires a live Claude API key.
 *
 * All tests are pure: no network calls, no randomness in the logic under test.
 */
import { planRound, makeGuardProvider } from '../../src/combat/agent'
import { ACTION_DEFS, availableGuards } from '../../src/combat/actions'
import { addStatus } from '../../src/combat/combatant'
import { makeCharacter, makeCombatant } from '../helpers/fixtures'

// ─── Test fixtures ────────────────────────────────────────────────────────────

const opponent = makeCombatant('Opponent')
const cfgAggressive   = { persona: 'aggressive'   as const, targetId: opponent.id }
const cfgCautious     = { persona: 'cautious'     as const, targetId: opponent.id }
const cfgOpportunist  = { persona: 'opportunist'  as const, targetId: opponent.id }
const cfgInexperienced = { persona: 'inexperienced' as const, targetId: opponent.id }

// ─── Defeated combatant ───────────────────────────────────────────────────────

describe('planRound — defeated combatant', () => {
  it('returns an empty plan when the combatant is incapacitated', () => {
    const s = addStatus(makeCombatant('A'), 'incapacitated')
    expect(planRound(s, opponent, cfgAggressive)).toEqual([])
  })
})

// ─── Self-action triggers ─────────────────────────────────────────────────────

describe('planRound — self-action triggers', () => {
  it('winded → respiration planned as first action (any persona)', () => {
    for (const cfg of [cfgAggressive, cfgCautious, cfgOpportunist]) {
      const s = addStatus(makeCombatant('A'), 'winded')
      const plans = planRound(s, opponent, cfg)
      expect(plans[0]?.action).toBe('respiration')
    }
  })

  it('hemorrhage → stabilize planned as first action (cautious persona)', () => {
    const s = addStatus(makeCombatant('A'), 'hemorrhage')
    const plans = planRound(s, opponent, cfgCautious)
    expect(plans.some(p => p.action === 'stabilize')).toBe(true)
  })

  it('respiration takes priority over stabilize when both conditions are met', () => {
    let s = addStatus(makeCombatant('A'), 'winded')
    s     = addStatus(s, 'hemorrhage')
    const plans = planRound(s, opponent, cfgCautious)
    // respiration must be the first planned action
    expect(plans[0]?.action).toBe('respiration')
  })

  it('no self-care needed → first plan is an offensive action', () => {
    const s = makeCombatant('A')  // fatigue=0, no status
    const plans = planRound(s, opponent, cfgCautious)
    expect(plans.length).toBeGreaterThan(0)
    const def = ACTION_DEFS[plans[0].action]
    expect(def.selfTargeted).toBe(false)
  })
})

// ─── Persona behaviour ────────────────────────────────────────────────────────

describe('planRound — persona behaviour', () => {
  it('aggressive persona plans at least 2 offensive actions with full PA', () => {
    const s = makeCombatant('A')  // 3 PA, all skills unlocked
    const plans = planRound(s, opponent, cfgAggressive)
    const offensive = plans.filter(p => !ACTION_DEFS[p.action].selfTargeted)
    expect(offensive.length).toBeGreaterThanOrEqual(2)
  })

  it('cautious persona never plans brutal-strike (avoids fatigue costs)', () => {
    const s = makeCombatant('A')
    const plans = planRound(s, opponent, cfgCautious)
    expect(plans.every(p => p.action !== 'brutal-strike')).toBe(true)
  })

  it('cautious persona never plans sharp-strike (avoids fatigue costs)', () => {
    const s = makeCombatant('A')
    const plans = planRound(s, opponent, cfgCautious)
    expect(plans.every(p => p.action !== 'sharp-strike')).toBe(true)
  })

  it('inexperienced persona plans exactly 1 action (no Phase C, no self-care)', () => {
    const s = makeCombatant('A')  // fatigue=0, no status
    const plans = planRound(s, opponent, cfgInexperienced)
    expect(plans).toHaveLength(1)
  })

  it('inexperienced persona uses unarmed-attack as first choice', () => {
    const s = makeCombatant('A')
    const plans = planRound(s, opponent, cfgInexperienced)
    expect(plans[0]?.action).toBe('unarmed-attack')
  })
})

// ─── PA budget ────────────────────────────────────────────────────────────────

describe('planRound — PA budget is never exceeded', () => {
  for (const [name, cfg] of [
    ['aggressive',    cfgAggressive],
    ['cautious',      cfgCautious],
    ['opportunist',   cfgOpportunist],
    ['inexperienced', cfgInexperienced],
  ] as const) {
    it(`${name} stays within 3 PA`, () => {
      const s = makeCombatant('A')
      const plans = planRound(s, opponent, cfg)
      const totalPA = plans.reduce((sum, p) => sum + ACTION_DEFS[p.action].cost.actions, 0)
      expect(totalPA).toBeLessThanOrEqual(3)
    })
  }
})

// ─── Offensive actions target the opponent ────────────────────────────────────

describe('planRound — offensive action targeting', () => {
  it('all offensive plans have targetId set to the configured opponent', () => {
    const s = makeCombatant('A')
    const plans = planRound(s, opponent, cfgAggressive)
    for (const p of plans) {
      if (!ACTION_DEFS[p.action].selfTargeted) {
        expect(p.targetId).toBe(opponent.id)
      }
    }
  })

  it('self-targeted plans do NOT have a targetId', () => {
    const s = addStatus(makeCombatant('A'), 'winded')
    const plans = planRound(s, opponent, cfgCautious)
    const selfPlan = plans.find(p => ACTION_DEFS[p.action].selfTargeted)
    expect(selfPlan?.targetId).toBeUndefined()
  })
})

// ─── Respiration not usable without endurance skill ──────────────────────────

describe('planRound — prerequisite enforcement', () => {
  it('respiration is not planned when endurance < 1', () => {
    const s = addStatus(
      makeCombatant('A', { skills: { ...makeCharacter().skills, endurance: 0 } }),
      'winded',
    )
    const plans = planRound(s, opponent, cfgCautious)
    expect(plans.every(p => p.action !== 'respiration')).toBe(true)
  })
})

// ─── makeGuardProvider ────────────────────────────────────────────────────────

describe('makeGuardProvider', () => {
  it('always returns a guard that is in the available list', () => {
    const provider = makeGuardProvider(cfgAggressive)
    const b = makeCombatant('B')
    const available = availableGuards(b)
    const chosen = provider('B', b, available, 'A', 'armed-attack')
    expect(available).toContain(chosen)
  })

  it('aggressive persona prefers dodge (when available)', () => {
    const provider = makeGuardProvider(cfgAggressive)
    const b = makeCombatant('B')  // reactions=3 ≥ 1, not incapacitated → dodge available
    const available = availableGuards(b)
    const chosen = provider('B', b, available, 'A', 'armed-attack')
    expect(chosen).toBe('dodge')
  })

  it('inexperienced persona always returns absorb', () => {
    const provider = makeGuardProvider(cfgInexperienced)
    const b = makeCombatant('B')
    const available = availableGuards(b)
    const chosen = provider('B', b, available, 'A', 'armed-attack')
    expect(chosen).toBe('absorb')
  })

  it('falls back to absorb when the preferred guard is not in the available list', () => {
    // Force an empty available list except absorb (0 reactions → no active guards)
    const provider = makeGuardProvider(cfgAggressive)  // prefers dodge
    const b = makeCombatant('B')
    // Override reactions to 0 so only absorb is available
    const zeroReactions = { ...b, reactions: 0 }
    const available = availableGuards(zeroReactions)
    expect(available).toEqual(['absorb'])
    const chosen = provider('B', zeroReactions, available, 'A', 'armed-attack')
    expect(chosen).toBe('absorb')
  })
})
