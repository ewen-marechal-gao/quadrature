import {
  ACTION_DEFS, GUARD_DEFS, rollParamsFrom, resolveAction,
  canUseAction, canAffordAction, availableGuards,
  guardConcession, guardAnswers,
} from '../../src/combat/actions'
import type { CombatantState, CardTag } from '../../src/combat/types'
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

  it('hit=true  → 2💧 fatigue on target', () => {
    const { effects } = ACTION_DEFS['unarmed-attack'].resolve(
      { hit: true, critical: false, flaw: false }, actor, target)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'add-fatigue', amount: 2 })
  })

  it('partiel → 1💧 fatigue on target', () => {
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

  // Le défaut ne coûte plus de PA : une mauvaise respiration se paie sur la
  // durée (§ etats.md — 😩 Épuisé pose un plancher à la fatigue, que seule une
  // nuit en Havre lève).
  it('défaut → +1 😩 Épuisé, et AUCUNE perte de PA', () => {
    const { effects } = ACTION_DEFS['respiration'].resolve(
      { hit: false, critical: false, flaw: true }, makeCombatant('A'))
    expect(effects).toContainEqual({ targetId: 'A', kind: 'add-exhaustion', amount: 1 })
    expect(effects.some(e => e.kind === 'spend-actions')).toBe(false)
  })

  it('no shift-mental effect (removed from respiration)', () => {
    const actor = makeCombatant('A')
    const { effects } = ACTION_DEFS['respiration'].resolve(
      { hit: true, critical: false, flaw: false }, actor)
    expect(effects.every(fx => fx.kind !== 'shift-mental')).toBe(true)
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

  // Le défaut résout l'hémorragie SUR-LE-CHAMP au lieu d'attendre la fin de
  // manche — plafonné à une blessure. Sans jeton 🩸, il n'y a rien à rouvrir.
  it('défaut en saignant → 1💢 immédiate, et AUCUNE perte de PA', () => {
    const bleeding = { ...makeCombatant('A'), bleed: 3 }
    const { effects } = ACTION_DEFS['stabilize'].resolve(
      { hit: false, critical: false, flaw: true }, bleeding)
    expect(effects).toContainEqual({ targetId: 'A', kind: 'light-wound', amount: 1 })
    expect(effects.some(e => e.kind === 'spend-actions')).toBe(false)
    // La part garantie tient : le stock est bien vidé.
    expect(effects).toContainEqual({ targetId: 'A', kind: 'remove-status', status: 'hemorrhage' })
  })

  it('défaut sans hémorragie → aucune blessure (rien à rouvrir)', () => {
    const { effects } = ACTION_DEFS['stabilize'].resolve(
      { hit: false, critical: false, flaw: true }, makeCombatant('A'))
    expect(effects.some(e => e.kind === 'light-wound')).toBe(false)
  })
})

// ─── GuardDef.effects ─────────────────────────────────────────────────────────

/**
 * 🟩 Concession (§ defense_reactions.md).
 *
 * Encaisser concède SANS condition — on ne résiste pas activement. Les Gardes
 * actives ne concèdent que contre un type d'action précis : la Parade contre un
 * tir, l'Esquive contre une zone. Lire `attackerAdvantage` seul ne dit donc plus
 * rien : c'est `guardConcession(garde, tags)` qui fait foi.
 */
describe('concession 🟩 — inconditionnelle pour Encaisser, gâtée pour les autres', () => {
  const MELEE:  CardTag[] = ['offensive', 'melee', 'physical']
  const RANGED: CardTag[] = ['offensive', 'ranged', 'physical']
  const ZONE:   CardTag[] = ['offensive', 'melee', 'zone']

  it('Encaisser concède 1🟩 quoi qu\'il arrive', () => {
    expect(guardConcession('absorb', MELEE)).toBe(1)
    expect(guardConcession('absorb', RANGED)).toBe(1)
    expect(guardConcession('absorb', undefined)).toBe(1)
  })

  it('la Parade ne concède rien à une lame, 1🟩 à un projectile', () => {
    expect(guardConcession('parry', MELEE)).toBe(0)
    expect(guardConcession('parry', RANGED)).toBe(1)
  })

  it("l'Esquive ne concède qu'aux attaques de zone", () => {
    expect(guardConcession('dodge', MELEE)).toBe(0)
    expect(guardConcession('dodge', RANGED)).toBe(0)
    expect(guardConcession('dodge', ZONE)).toBe(1)
  })

  it('tags inconnus (carte d\'adversaire) → aucune concession conditionnelle facturée', () => {
    expect(guardConcession('parry', undefined)).toBe(0)
    expect(guardConcession('dodge', undefined)).toBe(0)
  })

  it('le Blocage ne concède jamais — sa faiblesse est sa lenteur', () => {
    expect(guardConcession('block', MELEE)).toBe(0)
    expect(guardConcession('block', RANGED)).toBe(0)
  })
})

/**
 * 🕐 Vitesse de Garde : une Garde répond aux actions d'initiative ≥ à la sienne.
 * Encaisser 1️⃣ · Parade 2️⃣ · Esquive/Dérobade 3️⃣ · Blocage 4️⃣.
 */
describe('vitesse de Garde — qui peut répondre à quoi', () => {
  it('Encaisser répond à tout — c\'est le repli', () => {
    for (const init of [1, 2, 3, 5, 6, 7]) expect(guardAnswers('absorb', init)).toBe(true)
  })

  it('seules Encaisser et Parade répondent à une Frappe opportuniste (2️⃣)', () => {
    expect(guardAnswers('absorb', 2)).toBe(true)
    expect(guardAnswers('parry',  2)).toBe(true)
    expect(guardAnswers('dodge',  2)).toBe(false)
    expect(guardAnswers('block',  2)).toBe(false)
  })

  it('on ne bloque pas une Frappe vive (3️⃣) : le bouclier est trop lent', () => {
    expect(guardAnswers('dodge', 3)).toBe(true)
    expect(guardAnswers('evade', 3)).toBe(true)
    expect(guardAnswers('block', 3)).toBe(false)
  })

  it('une Attaque armée (5️⃣) laisse le choix des cinq', () => {
    for (const g of ['absorb', 'parry', 'dodge', 'evade', 'block'] as const) {
      expect(guardAnswers(g, 5)).toBe(true)
    }
  })
})

describe('GUARD_DEFS[absorb].effects', () => {
  const defender = makeCombatant('B')

  it('first use: does NOT generate a spend-reaction effect', () => {
    const { effects } = GUARD_DEFS['absorb'].effects({ flaw: false }, defender, true)
    expect(effects.some(e => e.kind === 'spend-reaction')).toBe(false)
  })

  // Le défaut d'Encaisser n'est plus la fatigue commune : c'est un 🔻. Encaisser
  // vous coupe les moyens de ne plus encaisser — Concentré et son +1⚡ d'abord.
  it('défaut → 🔻 sur la piste mentale (pas de fatigue)', () => {
    const { effects } = GUARD_DEFS['absorb'].effects({ flaw: true }, defender, true)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'shift-mental', direction: 'toward-terror' })
    expect(effects.some(e => e.kind === 'add-fatigue')).toBe(false)
  })

  it('no flaw → no effect at all', () => {
    const { effects } = GUARD_DEFS['absorb'].effects({ flaw: false }, defender, true)
    expect(effects).toHaveLength(0)
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

describe('GUARD_DEFS[parry].effects — le critique rend la Réaction ⚡', () => {
  const defender = makeCombatant('B')

  it('critique → +1⚡ : la Parade se rembourse elle-même', () => {
    const { effects } = GUARD_DEFS['parry'].effects({ flaw: false, critical: true }, defender, true)
    expect(effects).toContainEqual({ targetId: 'B', kind: 'spend-reaction' })
    expect(effects).toContainEqual({ targetId: 'B', kind: 'add-reaction', amount: 1 })
  })

  it('sans critique → aucune ⚡ rendue', () => {
    const { effects } = GUARD_DEFS['parry'].effects({ flaw: false, critical: false }, defender, true)
    expect(effects.some(e => e.kind === 'add-reaction')).toBe(false)
  })
})

/**
 * Issues portées par la donnée mais PAS ENCORE branchées (`wired: false`) :
 * elles exigent une Garde mutable, réévaluée coup par coup. Le moteur les
 * ignore SILENCIEUSEMENT — pas d'effet, et surtout pas de note qui annoncerait
 * un effet qui n'a pas eu lieu. Ce test verrouille ce contrat.
 */
describe('issues de Garde non branchées — ignorées en silence', () => {
  const defender = makeCombatant('B')

  it('le critique du Blocage (initiative) ne produit ni effet ni note', () => {
    const { effects, notes } = GUARD_DEFS['block'].effects({ flaw: false, critical: true }, defender, true)
    expect(effects).toEqual([{ targetId: 'B', kind: 'spend-reaction' }])
    expect(notes).toHaveLength(0)
  })

  it('le défaut du Blocage (initiative) ne produit ni fatigue ni note', () => {
    const { effects, notes } = GUARD_DEFS['block'].effects({ flaw: true, critical: false }, defender, true)
    expect(effects.some(e => e.kind === 'add-fatigue')).toBe(false)
    expect(notes).toHaveLength(0)
  })

  it("le critique de l'Esquive (déplacement) ne produit rien non plus", () => {
    const { effects } = GUARD_DEFS['dodge'].effects({ flaw: false, critical: true }, defender, true)
    expect(effects).toEqual([{ targetId: 'B', kind: 'spend-reaction' }])
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

  it('guardId=absorb → note mentions avantage Encaisser', () => {
    // The note must be present regardless of the roll outcome
    for (let i = 0; i < 5; i++) {
      const r = resolveAction(actor, 'armed-attack', {
        dc: 0, guardId: 'absorb', guardReaction: noReaction, target,
      })
      expect(r.notes.some(n => n.includes('Encaisser'))).toBe(true)
    }
  })

  it('guardId=dodge → no Encaisser advantage note', () => {
    const r = resolveAction(actor, 'armed-attack', {
      dc: 0, guardId: 'dodge', guardReaction: noReaction, target,
    })
    expect(r.notes.some(n => n.includes('Encaisser'))).toBe(false)
  })

  it('no guardId → no Encaisser advantage note', () => {
    const r = resolveAction(actor, 'armed-attack', { dc: 0, guardReaction: noReaction, target })
    expect(r.notes.some(n => n.includes('Encaisser'))).toBe(false)
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

// ─── Ordre de résolution d'une issue ─────────────────────────────────────────

/**
 * ⚠️ Défaut, puis ✴️ Critique, puis l'issue (✅/◐) — l'ordre IMPRIMÉ sur la carte
 * (cf. le schéma de rules/fr/cartes/README.md, où `defaut` et `critique`
 * précèdent `effet`/`succes`/`echec`).
 *
 * Il n'est pas cosmétique : plusieurs effets sont plafonnés, absorbés ou
 * conditionnés à l'état courant, donc leur rang change le résultat. Le moteur
 * les appliquait dans l'ordre inverse.
 */
describe("ordre de résolution — ⚠️ et ✴️ avant l'issue", () => {
  it('une action déclarative émet son défaut avant son succès', () => {
    const { effects } = ACTION_DEFS['armed-attack'].resolve(
      { hit: true, critical: false, flaw: true }, makeCombatant('A'), makeCombatant('B'))
    const flawIdx    = effects.findIndex(e => e.kind === 'add-fatigue' && e.targetId === 'A')
    const successIdx = effects.findIndex(e => e.kind === 'light-wound' && e.targetId === 'B')
    expect(flawIdx).toBeGreaterThanOrEqual(0)
    expect(flawIdx).toBeLessThan(successIdx)
  })

  it('le critique précède aussi l\'issue', () => {
    const { effects } = ACTION_DEFS['armed-attack'].resolve(
      { hit: true, critical: true, flaw: false }, makeCombatant('A'), makeCombatant('B'))
    const critIdx    = effects.findIndex(e => e.kind === 'add-status')
    const successIdx = effects.findIndex(e => e.kind === 'light-wound')
    expect(critIdx).toBeLessThan(successIdx)
  })

  it('Respiration : le marqueur 😩 tombe avant la récupération qu\'il plafonne', () => {
    const { effects } = ACTION_DEFS['respiration'].resolve(
      { hit: true, critical: false, flaw: true }, makeCombatant('A'))
    const exhaustIdx = effects.findIndex(e => e.kind === 'add-exhaustion')
    const healIdx    = effects.findIndex(e => e.kind === 'remove-fatigue')
    expect(exhaustIdx).toBeLessThan(healIdx)
  })
})
