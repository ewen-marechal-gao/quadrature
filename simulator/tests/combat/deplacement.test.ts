/**
 * Déplacement des PJ : Marche / Course / Charge, et l'élan (Inertie ➡️).
 *
 * La question de design derrière : la Charge exige l'Inertie 3, que seule la
 * Course donne. Les deux tombent dans des bandes différentes (Course II, Charge
 * III), donc l'enchaînement se joue dans UNE manche — c'est la « Frappe brutale
 * du mobile », pour un personnage à Puissance 0.
 */
import { resolveRoundBands, type Plan, type GuardProvider } from '../../src/combat/round'
import { canUseAction, ACTION_DEFS, resolveMovementAction } from '../../src/combat/actions'
import { loadAdversary } from '../../src/adversary/io'
import { initAdversary } from '../../src/adversary/combatant'
import { type Actor } from '../../src/adversary/actor'
import type { Position } from '../../src/combat/position'
import { makeCombatant } from '../helpers/fixtures'

const at = (x: number, y: number): Position => ({ x, y })
const alwaysDodge: GuardProvider = () => 'dodge'
const board = { width: 20, height: 11 }

/**
 * Seed Math.random deterministically (mulberry32) for tests whose ASSERTION is a
 * dice outcome (e.g. a Charge landing). The suite otherwise leaves Math.random
 * unseeded, so such assertions are order-fragile across files sharing a worker.
 */
function seedRandom(seed: number): () => void {
  let a = seed >>> 0
  const spy = jest.spyOn(Math, 'random').mockImplementation(() => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  })
  return () => spy.mockRestore()
}

describe('élan — la Charge exige d\'avoir couru', () => {
  it('la Charge est injouable sans Inertie 3', () => {
    const pc = makeCombatant('PC')                         // inertia 0 à l'init
    expect(pc.inertia).toBe(0)
    expect(canUseAction(pc, 'charge')).toBe(false)
    expect(canUseAction({ ...pc, inertia: 3 }, 'charge')).toBe(true)
  })

  it('la Course est bloquée quand on est déjà essoufflé', () => {
    const pc = makeCombatant('PC')
    expect(canUseAction(pc, 'course')).toBe(true)
    expect(canUseAction({ ...pc, status: ['winded'] }, 'course')).toBe(false)
    // la Marche, elle, reste possible essoufflé
    expect(canUseAction({ ...pc, status: ['winded'] }, 'walk')).toBe(true)
  })
})

describe('resolveMovementAction', () => {
  it('la Course avance de 5 + Mobilité et pose Inertie 3 (sans essouffler)', () => {
    const pc = makeCombatant('PC')                         // mobilité 2 → budget 7
    const { effects } = resolveMovementAction('course', pc, 'foe')
    const move = effects.find(e => e.kind === 'move-toward')!
    expect(move).toMatchObject({ goalId: 'foe', budget: 5 + pc.skills.mobility })
    expect(effects).toContainEqual({ targetId: 'PC', kind: 'set-inertia', value: 3 })
    // Essoufflement retiré de la Course (équilibrage) : plus de statut auto-infligé.
    expect(effects.some(e => e.kind === 'add-status')).toBe(false)
  })

  it('la Marche avance de 3 et pose Inertie 2, sans essouffler', () => {
    const pc = makeCombatant('PC')
    const { effects } = resolveMovementAction('walk', pc, 'foe')
    expect(effects.find(e => e.kind === 'move-toward')).toMatchObject({ budget: 3 })
    expect(effects).toContainEqual({ targetId: 'PC', kind: 'set-inertia', value: 2 })
    expect(effects.some(e => e.kind === 'add-status')).toBe(false)
  })
})

/** Un PJ mobile face à un Faucheur, `gap` cases à l'est. */
async function facingOff(gap: number): Promise<Map<string, Actor>> {
  const pc: Actor  = { ...makeCombatant('PC'), pos: at(0, 5) }
  const fau: Actor = { ...initAdversary(await loadAdversary('faucheur')), pos: at(gap, 5) }
  return new Map<string, Actor>([['PC', pc], [fau.id, fau]])
}

const courseThenCharge = (): Plan[] => [
  { actorId: 'PC', action: 'course', targetId: 'faucheur' },
  { actorId: 'PC', action: 'charge', targetId: 'faucheur', targetPart: 'sickles' },
]

describe('Course → Charge dans une manche', () => {
  // La Charge doit CONNECTER puis GRAVER : on fige les dés pour que l'assertion
  // porte sur la portée/l'enchaînement, pas sur la chance du jet.
  let restore: () => void
  beforeEach(() => { restore = seedRandom(1) })
  afterEach(() => restore())

  it('la Course (Bande II) donne l\'élan que la Charge (Bande III) consomme', async () => {
    const states = await facingOff(9)
    const { states: after, log } = await resolveRoundBands(
      states, 1, alwaysDodge, [], courseThenCharge, undefined, board)

    // Deux phases : Course en Bande II, Charge en Bande III.
    expect(log.phases.map(p => p.band)).toEqual(['II', 'III'])

    const pc = after.get('PC') as Extract<Actor, { inertia: number }>
    expect(pc.inertia).toBe(0)                 // la Charge a consommé l'élan
    expect(pc.status).not.toContain('winded')  // la Course n'essouffle plus (équilibrage)
    // Parti de 0, la Course l'amène à 6, la Charge finit au contact du Faucheur (9).
    expect(pc.pos).toEqual(at(8, 5))
  })

  it('la Charge connecte et grave le Faucheur', async () => {
    const states = await facingOff(9)
    const { log } = await resolveRoundBands(
      states, 1, alwaysDodge, [], courseThenCharge, undefined, board)
    const charge = log.phases.flatMap(p => p.actions).find(a => a.action === 'charge')!
    expect(charge.hit).toBe(true)
    expect(charge.notes.some(n => /Hors d'atteinte/.test(n))).toBe(false)
  })

  it('trop loin, la Charge court mais ne touche rien', async () => {
    const states = await facingOff(19)           // 19 cases : Course 6 + Charge 6 ne suffisent pas
    const { states: after, log } = await resolveRoundBands(
      states, 1, alwaysDodge, [], courseThenCharge, undefined, board)
    const charge = log.phases.flatMap(p => p.actions).find(a => a.action === 'charge')!
    expect(charge.notes.some(n => /Hors d'atteinte/.test(n))).toBe(true)
    // Le Faucheur est intact ; mais le Précis a bel et bien parcouru du terrain.
    expect(after.get('PC')!.pos).not.toEqual(at(0, 5))
  })
})

describe('données', () => {
  it('les trois actions sont câblées avec leurs bandes', () => {
    expect(ACTION_DEFS['walk'].initiative).toBe(4)      // Bande II
    expect(ACTION_DEFS['course'].initiative).toBe(6)    // Bande II
    expect(ACTION_DEFS['charge'].initiative).toBe(7)    // Bande III
    expect(ACTION_DEFS['charge'].requiresInertia).toBe(3)
    expect(ACTION_DEFS['charge'].selfAdvantage).toBe(1)
    expect(ACTION_DEFS['charge'].reach).toBe(1)
  })
})

// ─── Agent : s'approcher et charger (§ heuristique focalisée #17f) ────────────

import { planRoundActions, type AgentConfig } from '../../src/combat/agent'

const cfg = (extra: Partial<AgentConfig> = {}): AgentConfig => ({
  persona: 'opportunist', targetId: 'foe',
  allowedActions: ['sharp-strike', 'course', 'charge', 'respiration'],
  ...extra,
})

/** Un adversaire minimal réduit à sa position (l'agent n'en lit que pos + défaite). */
const foeAt = (x: number, y: number) => ({ ...makeCombatant('foe'), pos: at(x, y) })

describe('planRoundActions — approche', () => {
  it('hors de portée, court (Bande II) puis charge (Bande III)', () => {
    const self = { ...makeCombatant('PC'), pos: at(0, 5) }
    const plans = planRoundActions(self, foeAt(9, 5), cfg())
    expect(plans.map(p => p.action)).toEqual(['course', 'charge'])
  })

  it('au contact, ne court pas — il frappe (comportement d\'avant les positions)', () => {
    const self = { ...makeCombatant('PC'), pos: at(8, 5) }
    const plans = planRoundActions(self, foeAt(9, 5), cfg())
    expect(plans.some(p => p.action === 'course')).toBe(false)
    expect(plans.some(p => p.action === 'sharp-strike')).toBe(true)
  })

  it('trop loin pour percuter, il court sans gâcher la Charge', () => {
    const self = { ...makeCombatant('PC'), pos: at(0, 5) }
    const plans = planRoundActions(self, foeAt(19, 5), cfg())
    expect(plans.map(p => p.action)).toEqual(['course'])   // course seule, pas de charge
  })

  it('sans position (pas de plateau), retombe sur le comportement d\'avant', () => {
    const plans = planRoundActions(makeCombatant('PC'), makeCombatant('foe'), cfg())
    expect(plans.some(p => p.action === 'course')).toBe(false)
  })
})

// ─── Agent : kiting — un tirailleur qui OUTPORTE l'ennemi recule (§ étape 4) ───

describe('planRoundActions — kiting', () => {
  // Un tirailleur : Intuition 2 débloque le Tir rapide (portée 24). Il outporte
  // largement un ennemi de mêlée (portée 1 + Course ~7).
  const archer = (x: number) => ({
    ...makeCombatant('Archer', { skills: {
      ...makeCombatant('Archer').char.skills, intuition: 2,
    } }),
    pos: at(x, 5),
  })
  const rangedCfg: AgentConfig = {
    persona: 'cautious', targetId: 'foe',
    allowedActions: ['quick-shot', 'aimed-shot', 'course', 'walk', 'respiration'],
  }

  it('ennemi au contact (dans sa menace) → il recule (Course away)', () => {
    const plans = planRoundActions(archer(4), foeAt(5, 5), rangedCfg)   // gap 1 : engagé
    const move = plans.find(p => p.action === 'course' || p.action === 'walk')
    expect(move).toBeDefined()
    expect(move!.retreat).toBe(true)
  })

  it('ennemi à bonne distance (dans sa portée, hors menace) → il tient et tire', () => {
    // gap 15 : hors de la menace du foe (~8), dans la portée du tir (24).
    const plans = planRoundActions(archer(0), foeAt(15, 5), rangedCfg)
    expect(plans.every(p => p.action !== 'course' && p.action !== 'walk')).toBe(true)
    expect(plans.some(p => p.action === 'aimed-shot' || p.action === 'quick-shot')).toBe(true)
  })

  it('un combattant de mêlée ne kite jamais (il n\'outporte personne)', () => {
    // Même gap 1, mais trousse de mêlée : il frappe, il ne recule pas.
    const meleeCfg: AgentConfig = { persona: 'cautious', targetId: 'foe',
      allowedActions: ['sharp-strike', 'course', 'charge'] }
    const plans = planRoundActions({ ...makeCombatant('PC'), pos: at(4, 5) }, foeAt(5, 5), meleeCfg)
    expect(plans.every(p => !p.retreat)).toBe(true)
  })
})
