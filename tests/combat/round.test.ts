/**
 * Integration tests for resolveRound.
 *
 * These tests exercise the full round pipeline:
 *  - Initiative grouping and ordering
 *  - Guard persistence across multiple attackers
 *  - Snapshot-then-apply (input map is not mutated)
 *  - End-of-round processing (hemorrhage tick, wound overflow)
 *  - Defeated combatants are skipped
 *
 * Because rolls are random, tests target structural invariants and
 * deterministic game-mechanic outcomes rather than specific totals.
 */
import {
  resolveRound,
  type PlannedAction, type GuardProvider,
} from '../../src/combat/round'
import {
  addStatus, applyLightWounds, resistanceThreshold,
} from '../../src/combat/combatant'
import { makeCombatant } from '../helpers/fixtures'

// ─── Guard provider helpers ───────────────────────────────────────────────────

const alwaysAbsorb: GuardProvider = () => 'absorb'
const alwaysDodge:  GuardProvider = () => 'dodge'

// ─── Log structure ────────────────────────────────────────────────────────────

describe('resolveRound — log structure', () => {
  it('records the correct round number', () => {
    const a = makeCombatant('A')
    const b = makeCombatant('B')
    const { log } = resolveRound(new Map([[a.id, a], [b.id, b]]), [], 5, alwaysAbsorb)
    expect(log.round).toBe(5)
  })

  it('endOfRound snapshots include every combatant in the state map', () => {
    const a = makeCombatant('A')
    const b = makeCombatant('B')
    const { log } = resolveRound(new Map([[a.id, a], [b.id, b]]), [], 1, alwaysAbsorb)
    const ids = log.endOfRound.map(s => s.id)
    expect(ids).toContain('A')
    expect(ids).toContain('B')
  })

  it('does not mutate the original input state map', () => {
    const a = makeCombatant('A')
    const b = makeCombatant('B')
    const inputStates = new Map([[a.id, a], [b.id, b]])
    const originalActions = a.actions

    resolveRound(inputStates,
      [{ actorId: 'A', action: 'armed-attack', targetId: 'B' }],
      1, alwaysAbsorb)

    // A's 2 PA have been spent in the result, but the original object is untouched
    expect(inputStates.get('A')!.actions).toBe(originalActions)
  })

  it('returns a new states map distinct from the input', () => {
    const a = makeCombatant('A')
    const inputStates = new Map([[a.id, a]])
    const { states } = resolveRound(inputStates, [], 1, alwaysAbsorb)
    expect(states).not.toBe(inputStates)
  })
})

// ─── Initiative ordering ──────────────────────────────────────────────────────

describe('resolveRound — initiative ordering', () => {
  it('produces two separate phases for actions with different initiative values', () => {
    const a = makeCombatant('A')
    const b = makeCombatant('B')
    const plans: PlannedAction[] = [
      { actorId: 'A', action: 'respiration'   },              // initiative 1
      { actorId: 'A', action: 'armed-attack', targetId: 'B' }, // initiative 5
    ]
    const { log } = resolveRound(new Map([[a.id, a], [b.id, b]]), plans, 1, alwaysAbsorb)
    expect(log.phases).toHaveLength(2)
    expect(log.phases[0].initiative).toBe(1)
    expect(log.phases[1].initiative).toBe(5)
  })

  it('groups simultaneous actions (same initiative) into one phase', () => {
    const a = makeCombatant('A')
    const b = makeCombatant('B')
    const plans: PlannedAction[] = [
      { actorId: 'A', action: 'unarmed-attack', targetId: 'B' }, // initiative 3
      { actorId: 'B', action: 'unarmed-attack', targetId: 'A' }, // initiative 3
    ]
    const { log } = resolveRound(new Map([[a.id, a], [b.id, b]]), plans, 1, alwaysAbsorb)
    expect(log.phases).toHaveLength(1)
    expect(log.phases[0].initiative).toBe(3)
    expect(log.phases[0].actions).toHaveLength(2)
  })

  it('produces no phases when plans are empty', () => {
    const a = makeCombatant('A')
    const { log } = resolveRound(new Map([[a.id, a]]), [], 1, alwaysAbsorb)
    expect(log.phases).toHaveLength(0)
  })
})

// ─── Guard persistence ────────────────────────────────────────────────────────

describe('resolveRound — guard persistence (§Système de Garde)', () => {
  // Two attackers both target B in the same initiative group (armed-attack, init 5).
  // The guard should be rolled exactly once: the first attacker triggers the roll and
  // spends a reaction; the second reuses the cached result at no additional cost.

  it('spend-reaction effect appears exactly once when two attackers target the same defender', () => {
    const a1 = makeCombatant('A1')
    const a2 = makeCombatant('A2')
    const b  = makeCombatant('B')
    const plans: PlannedAction[] = [
      { actorId: 'A1', action: 'armed-attack', targetId: 'B' },
      { actorId: 'A2', action: 'armed-attack', targetId: 'B' },
    ]
    const { log } = resolveRound(
      new Map([[a1.id, a1], [a2.id, a2], [b.id, b]]),
      plans, 1, alwaysDodge,
    )
    const spendCount = log.phases
      .flatMap(p => p.actions)
      .flatMap(a => a.effects)
      .filter(e => e.targetId === 'B' && e.kind === 'spend-reaction')
      .length
    expect(spendCount).toBe(1)
  })

  it('both attackers use the same guard (same guardId and same DC threshold)', () => {
    const a1 = makeCombatant('A1')
    const a2 = makeCombatant('A2')
    const b  = makeCombatant('B')
    const plans: PlannedAction[] = [
      { actorId: 'A1', action: 'armed-attack', targetId: 'B' },
      { actorId: 'A2', action: 'armed-attack', targetId: 'B' },
    ]
    const { log } = resolveRound(
      new Map([[a1.id, a1], [a2.id, a2], [b.id, b]]),
      plans, 1, alwaysDodge,
    )
    const attacksOnB = log.phases
      .flatMap(p => p.actions)
      .filter(a => a.targetId === 'B')
    expect(attacksOnB).toHaveLength(2)
    expect(attacksOnB[0].guardId).toBe(attacksOnB[1].guardId)
    expect(attacksOnB[0].threshold).toBe(attacksOnB[1].threshold)
  })
})

// ─── End-of-round processing ──────────────────────────────────────────────────

describe('resolveRound — end-of-round processing', () => {
  it('hemorrhage token is consumed when wound conversion occurs at round end', () => {
    // Correct rule: one 🩸 token removed per light→heavy conversion.
    let a = addStatus(makeCombatant('A'), 'hemorrhage')
    const threshold = resistanceThreshold(a)
    a = applyLightWounds(a, threshold + 1)  // enough to trigger conversion
    const { states } = resolveRound(new Map([[a.id, a]]), [], 1, alwaysAbsorb)
    expect(states.get('A')!.heavyWounds).toBe(1)
    expect(states.get('A')!.status).not.toContain('hemorrhage')
  })

  it('hemorrhage persists when light wounds do not trigger conversion', () => {
    const a = addStatus(makeCombatant('A'), 'hemorrhage')  // no wounds → no conversion
    const { states } = resolveRound(new Map([[a.id, a]]), [], 1, alwaysAbsorb)
    expect(states.get('A')!.status).toContain('hemorrhage')
  })

  it('light wounds above the resistance threshold convert to 1 heavy wound', () => {
    let a = makeCombatant('A')
    const threshold = resistanceThreshold(a)
    a = applyLightWounds(a, threshold + 1)  // one above the limit
    const { states } = resolveRound(new Map([[a.id, a]]), [], 1, alwaysAbsorb)
    expect(states.get('A')!.heavyWounds).toBe(1)
    // Only the excess is removed; wounds up to the threshold carry over
    expect(states.get('A')!.lightWounds).toBe(threshold)
  })

  it('light wounds exactly at the resistance threshold do NOT convert', () => {
    let a = makeCombatant('A')
    const threshold = resistanceThreshold(a)
    a = applyLightWounds(a, threshold)
    const { states } = resolveRound(new Map([[a.id, a]]), [], 1, alwaysAbsorb)
    expect(states.get('A')!.heavyWounds).toBe(0)
    expect(states.get('A')!.lightWounds).toBe(threshold)
  })
})

// ─── Defeated combatants ──────────────────────────────────────────────────────

describe('resolveRound — defeated combatants are skipped', () => {
  it('incapacitated actor has no action logged', () => {
    const a = addStatus(makeCombatant('A'), 'incapacitated')
    const b = makeCombatant('B')
    const plans: PlannedAction[] = [
      { actorId: 'A', action: 'armed-attack', targetId: 'B' },
    ]
    const { log } = resolveRound(new Map([[a.id, a], [b.id, b]]), plans, 1, alwaysAbsorb)
    const actorEntries = log.phases.flatMap(p => p.actions).filter(e => e.actorId === 'A')
    expect(actorEntries).toHaveLength(0)
  })

  it('incapacitated target is not attacked', () => {
    const a = makeCombatant('A')
    const b = addStatus(makeCombatant('B'), 'incapacitated')
    const plans: PlannedAction[] = [
      { actorId: 'A', action: 'armed-attack', targetId: 'B' },
    ]
    const { log } = resolveRound(new Map([[a.id, a], [b.id, b]]), plans, 1, alwaysAbsorb)
    const attacksOnB = log.phases.flatMap(p => p.actions).filter(e => e.targetId === 'B')
    expect(attacksOnB).toHaveLength(0)
  })
})

// ─── Damage delivery ──────────────────────────────────────────────────────────

describe('resolveRound — damage delivery', () => {
  it('armed-attack always deals at least 1 wound (miss=1💢, hit=3💢)', () => {
    // Fixture: vigor=3, robustness=2 → resistanceThreshold=5. Max damage=3 < 5, no overflow.
    for (let i = 0; i < 20; i++) {
      const a = makeCombatant('A')
      const b = makeCombatant('B')
      const { states } = resolveRound(
        new Map([[a.id, a], [b.id, b]]),
        [{ actorId: 'A', action: 'armed-attack', targetId: 'B' }],
        1, alwaysAbsorb,
      )
      // lightWounds + heavyWounds accounts for overflow edge cases
      const bFinal = states.get('B')!
      expect(bFinal.lightWounds + bFinal.heavyWounds).toBeGreaterThanOrEqual(1)
    }
  })

  it('self-targeted action (respiration) is applied to the actor, not the opponent', () => {
    const a = addStatus(makeCombatant('A'), 'winded')
    const b = makeCombatant('B')
    const { states } = resolveRound(
      new Map([[a.id, a], [b.id, b]]),
      [{ actorId: 'A', action: 'respiration' }],
      1, alwaysAbsorb,
    )
    // Winded is always removed by respiration
    expect(states.get('A')!.status).not.toContain('winded')
    // B is completely untouched
    expect(states.get('B')).toEqual(expect.objectContaining({ lightWounds: 0, fatigue: 0 }))
  })
})
