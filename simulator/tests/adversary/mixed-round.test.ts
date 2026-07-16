/**
 * Integration: a mixed round (PC vs Faucheur) through resolveRoundBands.
 *
 * Exercises the unified-Actor seam end to end:
 *  - PC attacks the creature vs its FIXED guard (Esquive 10), damage on the
 *    declared part (Serpes) through the body-part model.
 *  - The creature plays deck cards: summed dice vs the PC's rolled guard score,
 *    reusing the once-per-round guard cache (one ⚡ spent total).
 *  - The band sweep orders the round: bite (init 3) in band I, then charge and
 *    the PC's armed-attack (both init 5) simultaneously in band II. A combatant
 *    lays down a single card per band, so acting twice takes two bands.
 *  - Round end: PC wound overflow runs; adversary snapshot lands in the log.
 */
import {
  resolveRoundBands, type Plan, type GuardProvider,
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

/** One round: PC strikes the Serpes; the Faucheur spends its 2⚫ on bite (I) + charge (II). */
async function runMixedRound(states: Map<string, Actor>) {
  const roundPlan: Plan[] = [
    { actorId: 'PC', action: 'armed-attack', targetId: 'faucheur', targetPart: 'sickles' },
    { actorId: 'faucheur', card: 'bite', targetId: 'PC' },
    { actorId: 'faucheur', card: 'charge', targetId: 'PC' },
  ]
  // Chacun engage sa manche entière ; le résolveur n'en retient que la bande courante.
  return resolveRoundBands(states, 1, alwaysDodge, [], () => roundPlan)
}

describe('mixed round — PC vs Faucheur', () => {
  it('sweeps the bands: bite (3) in band I, then charge + armed-attack (5) in band II', async () => {
    const { states } = await setup()
    const { log } = await runMixedRound(states)
    // Band II holds charge and armed-attack at the same initiative → one group.
    expect(log.phases.map(p => p.initiative)).toEqual([3, 5])
    expect(log.phases[1].actions).toHaveLength(2)
  })

  it('drops a second card committed to the same band', async () => {
    const { states } = await setup()
    // cry (init 2) et bite (init 3) sont toutes deux en Bande I : une seule passe.
    const twoInBandI: Plan[] = [
      { actorId: 'faucheur', card: 'cry', targetId: 'PC' },
      { actorId: 'faucheur', card: 'bite', targetId: 'PC' },
    ]
    const { log } = await resolveRoundBands(states, 1, alwaysDodge, [], () => twoInBandI)
    expect(log.phases.flatMap(p => p.actions)).toHaveLength(1)
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
