/**
 * Portée : a blow only lands if the weapon actually reaches.
 *
 * The check runs AFTER movement, on the final squares — what matters is whether
 * the weapon reaches when the blow lands, not where everyone stood when it was
 * declared. That is what makes a Charge coherent: it crosses the ground first,
 * and connects only if it arrived.
 *
 * Gating is opt-in twice over: no square (positionless encounter) or no `reach`
 * on the action (no rule for shouting distance) ⇒ no gate.
 */
import { resolveRoundBands, type Plan, type GuardProvider } from '../../src/combat/round'
import { loadAdversary } from '../../src/adversary/io'
import { initAdversary } from '../../src/adversary/combatant'
import { type Actor } from '../../src/adversary/actor'
import { ACTION_DEFS } from '../../src/combat/actions'
import type { Position } from '../../src/combat/position'
import { makeCombatant } from '../helpers/fixtures'

const at = (x: number, y: number): Position => ({ x, y })
const alwaysDodge: GuardProvider = () => 'dodge'

const OUT_OF_REACH = /Hors d'atteinte/
const ENGAGED      = /Engagé/

/** PC at the origin, Faucheur `gap` cases to its right. */
async function facingOff(gap: number | null): Promise<Map<string, Actor>> {
  const raw = initAdversary(await loadAdversary('faucheur'))
  const pc  = gap === null ? makeCombatant('PC') : { ...makeCombatant('PC'), pos: at(0, 5) }
  const fau = gap === null ? raw                 : { ...raw, pos: at(gap, 5) }
  return new Map<string, Actor>([['PC', pc], [fau.id, fau]])
}

const strike  = (): Plan[] => [{ actorId: 'PC', action: 'armed-attack', targetId: 'faucheur', targetPart: 'sickles' }]
const bite    = (): Plan[] => [{ actorId: 'faucheur', card: 'bite', targetId: 'PC' }]
const charge  = (): Plan[] => [{ actorId: 'faucheur', card: 'charge', targetId: 'PC' }]

const entries = (log: { phases: Array<{ actions: unknown[] }> }) =>
  log.phases.flatMap(p => p.actions) as Array<{ hit: boolean; notes: string[]; effects: unknown[] }>

describe('reach data', () => {
  it('melee actions carry a reach; social ones deliberately do not', () => {
    expect(ACTION_DEFS['armed-attack'].reach).toBe(1)
    expect(ACTION_DEFS['sharp-strike'].reach).toBe(1)
    // Les règles ne donnent pas de portée de voix : on ne l'invente pas.
    expect(ACTION_DEFS['intimidation'].reach).toBeUndefined()
  })

  it('the Faucheur\'s melee cards carry a reach', async () => {
    const fau = initAdversary(await loadAdversary('faucheur'))
    expect(fau.sheet.cards.find(c => c.id === 'bite')!.reach).toBe(1)
    expect(fau.sheet.cards.find(c => c.id === 'charge')!.reach).toBe(1)
  })
})

describe('a blow out of reach lands nothing', () => {
  it('a PC cannot strike a creature 20 cases away', async () => {
    const states = await facingOff(20)
    const { states: after, log } = await resolveRoundBands(states, 1, alwaysDodge, [], strike)

    const entry = entries(log)[0]
    expect(entry.hit).toBe(false)
    expect(entry.notes.some(n => OUT_OF_REACH.test(n))).toBe(true)

    // Les serpes sont intactes : rien ne les a touchées.
    const sickles = (after.get('faucheur') as never as { parts: Array<{ type: string; blocks: Array<{ damage: number }> }> })
      .parts.find(p => p.type === 'sickles')!
    expect(sickles.blocks.every(b => b.damage === 0)).toBe(true)
  })

  it('a creature cannot bite across the mat', async () => {
    const states = await facingOff(20)
    const { states: after, log } = await resolveRoundBands(states, 1, alwaysDodge, [], bite)

    expect(entries(log)[0].hit).toBe(false)
    const pc = after.get('PC') as Extract<Actor, { lightWounds: number }>
    expect(pc.lightWounds + pc.heavyWounds).toBe(0)
  })

  it('the same blow lands when adjacent', async () => {
    const states = await facingOff(1)
    const { log } = await resolveRoundBands(states, 1, alwaysDodge, [], bite)

    const entry = entries(log)[0]
    expect(entry.notes.some(n => OUT_OF_REACH.test(n))).toBe(false)
    expect(entry.effects.length).toBeGreaterThan(0)
  })

  it('keeps what the attacker did to itself — it still swung and tired', async () => {
    const states = await facingOff(20)
    const { states: after } = await resolveRoundBands(states, 1, alwaysDodge, [], strike)

    // 2 PA payés pour un coup dans le vide : l'action a bien eu lieu.
    const pc = after.get('PC') as Extract<Actor, { actions: number }>
    expect(pc.actions).toBe(1)
  })
})

describe('reach and movement resolve in the right order', () => {
  it('a Charge that closes the ground connects', async () => {
    // 4 cases : même avec le budget d'échec [4], il arrive au contact.
    const states = await facingOff(4)
    const { log } = await resolveRoundBands(states, 1, alwaysDodge, [], charge)
    expect(entries(log)[0].notes.some(n => OUT_OF_REACH.test(n))).toBe(false)
  })

  it('a Charge that falls short crosses the ground but hits nothing', async () => {
    // 8 cases pour un Déplacement [6] au mieux : il court, il n'arrive pas.
    const states = await facingOff(8)
    const { states: after, log } = await resolveRoundBands(states, 1, alwaysDodge, [], charge)

    expect(entries(log)[0].notes.some(n => OUT_OF_REACH.test(n))).toBe(true)
    const pc = after.get('PC') as Extract<Actor, { lightWounds: number }>
    expect(pc.lightWounds + pc.heavyWounds).toBe(0)
    // …mais le terrain est bel et bien parcouru : le déplacement, lui, tient.
    expect(after.get('faucheur')!.pos).not.toEqual(at(8, 5))
  })
})

describe('ranged range band — minRange (engagement) and effectiveRange', () => {
  // Un archer (Intuition/Observation 2, Mobilité 3) débloque les tirs.
  const archer = () => ({
    ...makeCombatant('Archer', { skills: {
      ...makeCombatant('Archer').char.skills, intuition: 2, observation: 2,
    } }),
    pos: at(0, 5),
  })
  const shoot = (action: 'quick-shot' | 'aimed-shot' = 'aimed-shot') =>
    (): Plan[] => [{ actorId: 'Archer', action, targetId: 'faucheur', targetPart: 'sickles' }]

  const facingArcher = async (gap: number): Promise<Map<string, Actor>> => {
    const fau = initAdversary(await loadAdversary('faucheur'))
    return new Map<string, Actor>([['Archer', archer()], [fau.id, { ...fau, pos: at(gap, 5) }]])
  }

  it('the shots carry a range band: minRange 1, effectiveRange 24 (→ reach 24)', () => {
    for (const id of ['quick-shot', 'aimed-shot'] as const) {
      expect(ACTION_DEFS[id].reach).toBe(24)
      expect(ACTION_DEFS[id].minRange).toBe(1)
    }
  })

  it('a shot lands at range (10 cases)', async () => {
    const { log } = await resolveRoundBands(await facingArcher(10), 1, alwaysDodge, [], shoot())
    const entry = entries(log)[0]
    expect(entry.notes.some(n => OUT_OF_REACH.test(n) || ENGAGED.test(n))).toBe(false)
    expect(entry.effects.length).toBeGreaterThan(0)
  })

  it('a shot at an ENGAGED (adjacent) target is blocked — no bow point-blank', async () => {
    const { states: after, log } = await resolveRoundBands(await facingArcher(1), 1, alwaysDodge, [], shoot())
    const entry = entries(log)[0]
    expect(entry.hit).toBe(false)
    expect(entry.notes.some(n => ENGAGED.test(n))).toBe(true)
    // La créature n'a rien pris : le tir au contact ne part pas.
    const sickles = (after.get('faucheur') as never as { parts: Array<{ type: string; blocks: Array<{ damage: number }> }> })
      .parts.find(p => p.type === 'sickles')!
    expect(sickles.blocks.every(b => b.damage === 0)).toBe(true)
  })

  it('a shot beyond effectiveRange (25 cases) is out of reach', async () => {
    const { log } = await resolveRoundBands(await facingArcher(25), 1, alwaysDodge, [], shoot())
    expect(entries(log)[0].notes.some(n => OUT_OF_REACH.test(n))).toBe(true)
  })
})

describe('gating is opt-in', () => {
  it('a positionless encounter is never gated — nothing changes', async () => {
    const states = await facingOff(null)
    const { log } = await resolveRoundBands(states, 1, alwaysDodge, [], bite)

    const entry = entries(log)[0]
    expect(entry.notes.some(n => OUT_OF_REACH.test(n))).toBe(false)
    expect(entry.effects.length).toBeGreaterThan(0)
  })

  it('an action without a reach is never gated, however far', async () => {
    const states = await facingOff(20)
    const intimidate = (): Plan[] => [{ actorId: 'PC', action: 'intimidation', targetId: 'faucheur' }]
    const { log } = await resolveRoundBands(states, 1, alwaysDodge, [], intimidate)

    expect(entries(log)[0].notes.some(n => OUT_OF_REACH.test(n))).toBe(false)
  })
})
