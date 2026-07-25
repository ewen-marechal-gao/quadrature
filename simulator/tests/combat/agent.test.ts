/**
 * Tests for the scripted combat agent (planRoundActions + makeGuardProvider).
 *
 * Only the synchronous, rule-based planRoundActions is tested here.
 * planRoundAI is excluded because it requires a live Claude API key.
 *
 * All tests are pure: no network calls, no randomness in the logic under test.
 */
import { planRoundActions, makeGuardProvider } from '../../src/combat/agent'
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

describe('planRoundActions — defeated combatant', () => {
  it('returns an empty plan when the combatant is incapacitated', () => {
    const s = addStatus(makeCombatant('A'), 'incapacitated')
    expect(planRoundActions(s, opponent, cfgAggressive)).toEqual([])
  })
})

// ─── Self-care emerges from the pricing (no thresholds) ──────────────────────
//
// The utility planner has no per-persona trigger tables: Respiration and
// Stabiliser are picked when the recovery they buy is WORTH the Bande I slot
// they occupy. The tests assert the pricing's shape, not hand-set thresholds.

describe('planRoundActions — self-care emerges from the pricing', () => {
  it('winded at high fatigue → respiration opens the round (every persona)', () => {
    for (const cfg of [cfgAggressive, cfgCautious, cfgOpportunist]) {
      const s = { ...addStatus(makeCombatant('A'), 'winded'), fatigue: 12 }
      const plans = planRoundActions(s, opponent, cfg)
      expect(plans[0]?.action).toBe('respiration')
    }
  })

  it('a heavy bleed 🩸 stock (beyond Récupération) → stabilize is planned', () => {
    // recovery 2 : un stock de 6 déposera 4+2 💢 — le vider vaut la Bande I.
    const s = { ...makeCombatant('A'), bleed: 6 }
    const plans = planRoundActions(s, opponent, cfgCautious)
    expect(plans.some(p => p.action === 'stabilize')).toBe(true)
  })

  it('a trivial bleed (below Récupération) is NOT worth a Bande I slot', () => {
    // recovery 2 ≥ stock 1 : la plaie se referme seule, Stabiliser ne rapporte rien.
    const s = { ...makeCombatant('A'), bleed: 1 }
    const plans = planRoundActions(s, opponent, cfgCautious)
    expect(plans.every(p => p.action !== 'stabilize')).toBe(true)
  })

  it('respiration outweighs stabilize when both are on the table', () => {
    const s = { ...addStatus(makeCombatant('A'), 'winded'), fatigue: 12, bleed: 3 }
    const plans = planRoundActions(s, opponent, cfgCautious)
    expect(plans[0]?.action).toBe('respiration')
  })

  it('no self-care needed → the round does not open on healing', () => {
    const s = makeCombatant('A')  // fatigue=1, no status
    const plans = planRoundActions(s, opponent, cfgCautious)
    expect(plans.length).toBeGreaterThan(0)
    // Rien à soigner → Respiration/Stabiliser ne valent pas la Bande I. On n'exige
    // plus l'offensive : un ouvreur proactif comme Préparation (banque des ⚡ pour
    // un prudent) est légitime. La garantie testée est l'absence de SOIN gâché.
    expect(['respiration', 'stabilize']).not.toContain(plans[0].action)
  })
})

// ─── Persona behaviour: weights, not candidate lists ──────────────────────────

describe('planRoundActions — persona behaviour', () => {
  it('aggressive persona plans at least 2 offensive actions with full PA', () => {
    const s = makeCombatant('A')  // 3 PA, all skills unlocked
    const plans = planRoundActions(s, opponent, cfgAggressive)
    const offensive = plans.filter(p => !ACTION_DEFS[p.action].selfTargeted)
    expect(offensive.length).toBeGreaterThanOrEqual(2)
  })

  it('cautious cares for itself sooner than aggressive (weight crossover)', () => {
    // Même état — fatigue montante : le prudent bascule sur la Respiration
    // avant l'agressif, parce que caution × récupération croise plus tôt la
    // valeur d'une attaque. On cherche la fatigue de bascule de chacun.
    const crossover = (cfg: { persona: 'aggressive' | 'cautious'; targetId: string }): number => {
      for (let f = 1; f <= 19; f++) {
        const s = { ...makeCombatant('A'), fatigue: f }
        const plans = planRoundActions(s, opponent, cfg)
        if (plans.some(p => p.action === 'respiration')) return f
      }
      return 20
    }
    expect(crossover(cfgCautious)).toBeLessThanOrEqual(crossover(cfgAggressive))
  })

  it('deterministic personas (noise 0) produce stable plans', () => {
    const s = makeCombatant('A')
    const a = planRoundActions(s, opponent, cfgOpportunist).map(p => p.action)
    const b = planRoundActions(s, opponent, cfgOpportunist).map(p => p.action)
    expect(a).toEqual(b)
  })

  it('inexperienced (noisy softmax) still yields only legal, affordable plans', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const s = makeCombatant('A')
      const plans = planRoundActions(s, opponent, cfgInexperienced)
      seen.add(plans.map(p => p.action).join('+'))
      const totalPA = plans.reduce((sum, p) => sum + ACTION_DEFS[p.action].cost.actions, 0)
      expect(totalPA).toBeLessThanOrEqual(3)
      // one card per band, at most
      const bands = plans.map(p => ACTION_DEFS[p.action].initiative)
      expect(new Set(bands.map(i => i <= 3 ? 'I' : i <= 6 ? 'II' : 'III')).size).toBe(plans.length)
    }
    // Le bruit se voit : plusieurs ouvertures distinctes sur 40 tirages.
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })
})

// ─── PA budget ────────────────────────────────────────────────────────────────

describe('planRoundActions — PA budget is never exceeded', () => {
  for (const [name, cfg] of [
    ['aggressive',    cfgAggressive],
    ['cautious',      cfgCautious],
    ['opportunist',   cfgOpportunist],
    ['inexperienced', cfgInexperienced],
  ] as const) {
    it(`${name} stays within 3 PA`, () => {
      const s = makeCombatant('A')
      const plans = planRoundActions(s, opponent, cfg)
      const totalPA = plans.reduce((sum, p) => sum + ACTION_DEFS[p.action].cost.actions, 0)
      expect(totalPA).toBeLessThanOrEqual(3)
    })
  }
})

// ─── Offensive actions target the opponent ────────────────────────────────────

describe('planRoundActions — offensive action targeting', () => {
  it('all offensive plans have targetId set to the configured opponent', () => {
    const s = makeCombatant('A')
    const plans = planRoundActions(s, opponent, cfgAggressive)
    for (const p of plans) {
      if (!ACTION_DEFS[p.action].selfTargeted) {
        expect(p.targetId).toBe(opponent.id)
      }
    }
  })

  it('self-targeted plans do NOT have a targetId', () => {
    const s = addStatus(makeCombatant('A'), 'winded')
    const plans = planRoundActions(s, opponent, cfgCautious)
    const selfPlan = plans.find(p => ACTION_DEFS[p.action].selfTargeted)
    expect(selfPlan?.targetId).toBeUndefined()
  })
})

// ─── Respiration not usable without endurance skill ──────────────────────────

describe('planRoundActions — prerequisite enforcement', () => {
  it('respiration is not planned when endurance < 1', () => {
    const s = addStatus(
      makeCombatant('A', { skills: { ...makeCharacter().skills, endurance: 0 } }),
      'winded',
    )
    const plans = planRoundActions(s, opponent, cfgCautious)
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

  it('exclut le Blocage face à une Frappe vive (4️⃣ contre 3️⃣ : trop lent)', () => {
    // 🕐 Vitesse de Garde : la Frappe vive (3️⃣) laisse Encaisser 1️⃣, Parade 2️⃣
    // et Esquive 3️⃣ ; le Blocage 4️⃣ arrive après le coup.
    const provider = makeGuardProvider(cfgOpportunist)
    const b = makeCombatant('B')
    const chosen = provider('B', b, availableGuards(b), 'A', 'sharp-strike')
    expect(chosen).not.toBe('block')
  })

  it('picks absorb when stats favour it (Encaisser roule Robustesse + Force)', () => {
    // Force 5 / Robustesse 1, Agilité 0 / Mobilité 0, Puissance 0.
    // Puissance 0 ferme la Parade (« arme en main »), Robustesse 1 ferme le
    // Blocage (« bouclier ») : il ne reste qu'Encaisser et une Esquive à zéro.
    const brawler = makeCombatant('B', {
      characteristics: {
        ...makeCharacter().characteristics,
        agility:  { value: 0, wounds: 0 },
        strength: { value: 5, wounds: 0 },
      },
      skills: { ...makeCharacter().skills, mobility: 0, power: 0, robustness: 1 },
    })
    const provider  = makeGuardProvider(cfgAggressive)
    const available = availableGuards(brawler)
    expect(available).toEqual(['absorb', 'dodge'])
    // absorb: FOR5 + rob1 ; dodge: AGI0 + mob0 → Encaisser gagne même en
    // concédant son 🟩.
    expect(provider('B', brawler, available, 'A', 'armed-attack')).toBe('absorb')
  })

  it("la Dérobade est déclarée mais jamais disponible (aucune case occultée 🌑)", () => {
    expect(availableGuards(makeCombatant('B'))).not.toContain('evade')
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
