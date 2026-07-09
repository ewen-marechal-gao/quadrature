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

  it('hemorrhage (bleed 🩸) → stabilize planned as first action (cautious persona)', () => {
    const s = { ...makeCombatant('A'), bleed: 1 }
    const plans = planRound(s, opponent, cfgCautious)
    expect(plans.some(p => p.action === 'stabilize')).toBe(true)
  })

  it('respiration takes priority over stabilize when both conditions are met', () => {
    const s = { ...addStatus(makeCombatant('A'), 'winded'), bleed: 1 }
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
//
// Guard selection is now stats-optimal + initiative-filtered (no persona bias):
//   1. Only guards with initiative < attack.initiative are eligible.
//   2. Among those, pick the guard with the highest effChar + skill score.
//   3. Ties broken by active-guard preference (dodge > parry > block > absorb).
//
// TestFighter: AGI 3 mobility 2, VIG 3 recovery 2, ACU 2 vigilance 2.
//   vs armed-attack (init 5): dodge(2<5 ✓), parry(4<5 ✓), absorb(0<5 ✓)
//     dodge score = AGI 3 + mob 2 = 5 ; absorb score = VIG 3 + rec 2 = 5
//     → tied, active-guard tiebreak → dodge wins
//   vs sharp-strike (init 3): dodge(2<3 ✓), parry(4<3 ✗), absorb(0<3 ✓)
//     only dodge and absorb eligible → dodge wins
//   vs brutal-strike (init 6): all eligible → dodge wins (tie with absorb, active first)

describe('makeGuardProvider', () => {
  it('always returns a guard that is in the available list', () => {
    const provider = makeGuardProvider(cfgAggressive)
    const b = makeCombatant('B')
    const available = availableGuards(b)
    const chosen = provider('B', b, available, 'A', 'armed-attack')
    expect(available).toContain(chosen)
  })

  it('picks dodge for TestFighter vs armed-attack (best stat profile, initiative ✓)', () => {
    // TestFighter: dodge AGI3+mob2=5, absorb VIG3+rec2=5, parry ACU2+vig2=4
    // dodge and absorb tied → active-guard tiebreak → dodge
    const provider = makeGuardProvider(cfgAggressive)
    const b = makeCombatant('B')
    const available = availableGuards(b)
    const chosen = provider('B', b, available, 'A', 'armed-attack')
    expect(chosen).toBe('dodge')
  })

  it('excludes parry vs sharp-strike (parry initiative 4 ≥ sharp-strike initiative 3)', () => {
    // Only dodge(2) and absorb(0) pass the initiative filter for sharp-strike(3)
    // TestFighter: dodge score=5 > absorb score=5, tiebreak → dodge
    const provider = makeGuardProvider(cfgOpportunist)
    const b = makeCombatant('B')
    const available = availableGuards(b)
    const chosen = provider('B', b, available, 'A', 'sharp-strike')
    expect(chosen).toBe('dodge')
    expect(chosen).not.toBe('parry')  // parry is too slow for sharp-strike
  })

  it('picks absorb when stats favour it (high VIG+recovery, low AGI)', () => {
    // Force a combatant with VIG 5 recovery 2, AGI 0, mobility 0
    const lowAgi = makeCombatant('B', {
      characteristics: {
        ...makeCharacter().characteristics,
        agility: { value: 0, wounds: 0 },
        vigor:   { value: 5, wounds: 0 },
      },
      skills: { ...makeCharacter().skills, mobility: 0, recovery: 2 },
    })
    const provider = makeGuardProvider(cfgAggressive)
    const available = availableGuards(lowAgi)
    const chosen = provider('B', lowAgi, available, 'A', 'armed-attack')
    // absorb: VIG5+rec2=7 ; dodge: AGI0+mob0=0 → absorb wins
    expect(chosen).toBe('absorb')
  })

  it('falls back to absorb when only absorb passes the initiative filter', () => {
    // 0 reactions → only absorb available
    const provider = makeGuardProvider(cfgAggressive)
    const b = makeCombatant('B')
    const zeroReactions = { ...b, reactions: 0 }
    const available = availableGuards(zeroReactions)
    expect(available).toEqual(['absorb'])
    const chosen = provider('B', zeroReactions, available, 'A', 'armed-attack')
    expect(chosen).toBe('absorb')
  })
})
