/**
 * Integration: a mixed round (PC vs Faucheur) through resolveRoundWaves.
 *
 * Exercises the unified-Actor seam end to end:
 *  - PC attacks the creature vs its FIXED guard (Esquive 10), damage on the
 *    declared part (Serpes) through the body-part model.
 *  - The creature plays deck cards: summed dice vs the PC's rolled guard score,
 *    reusing the once-per-round guard cache (one ⚡ spent total).
 *  - Initiative interleaves card plays (bite init 3) with PC actions
 *    (armed-attack init 5).
 *  - Round end: PC wound overflow runs; adversary snapshot lands in the log.
 */
import {
  resolveRoundWaves, type Plan, type GuardProvider,
} from '../../src/combat/round'
import { makeCombatant } from '../helpers/fixtures'
import { loadAdversary } from '../../src/adversary/io'
import { initAdversary, type AdversaryCombatant } from '../../src/adversary/combatant'
import { type Actor, isAdversaryActor } from '../../src/adversary/actor'

const alwaysDodge: GuardProvider = () => 'dodge'

async function setup(): Promise<{ states: Map<string, Actor>; fau: AdversaryCombatant }> {
  const pc  = makeCombatant('PC')
  const fau = initAdversary(await loadAdversary('faucheur'))
  return { states: new Map<string, Actor>([['PC', pc], [fau.id, fau]]), fau }
}

/** One round: PC strikes the Serpes; the Faucheur bites twice (2⚫ → 2×1⚫ ; sickleStrike coûte désormais 2⚫). */
async function runMixedRound(states: Map<string, Actor>) {
  let wave = 0
  return resolveRoundWaves(states, 1, alwaysDodge, [], () => {
    wave++
    if (wave === 1) {
      return [
        { actorId: 'PC', action: 'armed-attack', targetId: 'faucheur', targetPart: 'sickles' },
        { actorId: 'faucheur', card: 'bite', targetId: 'PC' },
      ] as Plan[]
    }
    if (wave === 2) {
      return [{ actorId: 'faucheur', card: 'bite', targetId: 'PC' }] as Plan[]
    }
    return []
  })
}

describe('mixed round — PC vs Faucheur', () => {
  it('interleaves card plays and PC actions by initiative', async () => {
    const { states } = await setup()
    const { log } = await runMixedRound(states)
    // Wave 1: bite (3) resolves before armed-attack (5); wave 2: bite again.
    expect(log.phases.map(p => p.initiative)).toEqual([3, 5, 3])
  })

  it('adversary entries log the summed roll; PC entries face the fixed guard', async () => {
    const { states } = await setup()
    const { log } = await runMixedRound(states)
    const entries = log.phases.flatMap(p => p.actions)

    const bite = entries.find(e => e.action === 'bite')!
    expect(bite.adversaryRoll).toBeDefined()
    expect(bite.checkRoll).toBeUndefined()
    expect(bite.guardRoll).toBeDefined()
    expect(bite.threshold).toBe(bite.guardRoll!.total)

    const attack = entries.find(e => e.action === 'armed-attack')!
    expect(attack.threshold).toBe(10)          // Esquive 10, no roll
    expect(attack.guardId).toBeUndefined()
    expect(attack.targetPart).toBe('sickles')
  })

  it('spends the PC guard reaction exactly once across both card plays (cache)', async () => {
    const { states } = await setup()
    const { log } = await runMixedRound(states)
    const spends = log.phases
      .flatMap(p => p.actions)
      .flatMap(a => a.effects)
      .filter(e => e.targetId === 'PC' && e.kind === 'spend-reaction')
    expect(spends).toHaveLength(1)
  })

  it('damages the declared part and wounds the PC', async () => {
    const { states } = await setup()
    const { states: after } = await runMixedRound(states)

    const fau = after.get('faucheur')!
    expect(isAdversaryActor(fau)).toBe(true)
    const sickles = (fau as AdversaryCombatant).parts.find(p => p.type === 'sickles')!
    // armed-attack lands ≥1💢, sickles armor 1 → au moins une case cochée (minimum 1)
    expect(sickles.blocks[0].damage).toBeGreaterThanOrEqual(1)

    const pc = after.get('PC')!
    expect(isAdversaryActor(pc)).toBe(false)
    // bite wounds on hit (2💢) and miss (1💢): two plays → ≥1, minus round-end carry rules
    const pcState = pc as Exclude<Actor, AdversaryCombatant>
    expect(pcState.lightWounds + pcState.heavyWounds).toBeGreaterThanOrEqual(1)
  })

  it('the adversary spends ⚫ per card and appears in the round-end snapshot', async () => {
    const { states } = await setup()
    const { states: after, log } = await runMixedRound(states)

    const fau = after.get('faucheur') as AdversaryCombatant
    expect(fau.actions).toBe(0)  // 2⚫ − 2 × bite (coût 1⚫ chacune)

    expect(log.endOfRound.map(s => s.id)).toEqual(['PC'])
    expect(log.adversariesEndOfRound).toHaveLength(1)
    expect(log.adversariesEndOfRound![0].id).toBe('faucheur')
    const snapSickles = log.adversariesEndOfRound![0].parts.find(p => p.type === 'sickles')!
    expect(snapSickles.marked).toBeGreaterThanOrEqual(1)
  })
})
