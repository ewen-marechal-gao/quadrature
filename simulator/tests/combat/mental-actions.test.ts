/**
 * Actions de consolidation mentale (§ attribute_actions.md) — Préservation /
 * Focalisation / Résolution / Méditation. Tronc commun : DD = 8 + degré ;
 * ✅/❌ regagnent du ◇ (plafonné au pool) ; ✅ déplacement volontaire plafonné ;
 * ⚠️ Défaut = −1 PA. Garde de condition mentale.
 */
import { ACTION_DEFS, canUseAction } from '../../src/combat/actions'
import type { OutcomeFlags } from '../../src/combat/actions'
import { applyEffectToState, stabilityPool } from '../../src/combat/combatant'
import { planNextAction } from '../../src/combat/agent'
import { scorePlayerAction } from '../../src/planner/planner'
import { PERSONA_WEIGHTS } from '../../src/planner/value'
import { makeCombatant } from '../helpers/fixtures'
import type { CombatantState, MentalState } from '../../src/combat/types'
import type { AgentConfig } from '../../src/combat/agent'

/** TestFighter + les compétences mentales (Discipline/Logique/Conviction 1, Résilience 2). */
function mentalist(mentalState: MentalState = 'focused', stability = 0): CombatantState {
  const base = makeCombatant()
  return {
    ...base,
    skills: { ...base.skills, discipline: 1, logic: 1, conviction: 1, resilience: 2 },
    mentalState,
    stability,
  }
}
// stabilityPool(TestFighter) = Ténacité 2 + Discipline 1 = 3

function resolve(state: CombatantState, id: 'preservation' | 'focalisation' | 'resolution' | 'meditation', flags: OutcomeFlags) {
  const { effects } = ACTION_DEFS[id].resolve(flags, state)
  return effects.reduce((s, fx) => applyEffectToState(s, fx), state)
}
const OK: OutcomeFlags   = { hit: true,  critical: false, flaw: false }
const CRIT: OutcomeFlags = { hit: true,  critical: true,  flaw: false }
const PART: OutcomeFlags = { hit: false, critical: false, flaw: false }

// ─── DD dynamique ──────────────────────────────────────────────────────────────

describe('DD = 8 + degré d\'état mental', () => {
  it('scales with distance from Concentré', () => {
    expect(ACTION_DEFS['resolution'].getDC!(mentalist('focused'))).toBe(8)    // degré 0
    expect(ACTION_DEFS['resolution'].getDC!(mentalist('panicked'))).toBe(10)  // degré 2
    expect(ACTION_DEFS['resolution'].getDC!(mentalist('terrified'))).toBe(11) // degré 3
  })
})

// ─── Décalages mentaux plafonnés + ◇ ───────────────────────────────────────────

describe('Résolution — 🔺 vers Agressif (jamais au-dessus) + ◇', () => {
  it('success from terrified moves one step toward rage and grants ◇', () => {
    const r = resolve(mentalist('terrified', 0), 'resolution', OK)
    expect(r.mentalState).toBe('panicked')
    expect(r.stability).toBe(1)
  })
  it('caps at Agressif — a critical from focused stops at aggressive', () => {
    expect(resolve(mentalist('focused', 0), 'resolution', CRIT).mentalState).toBe('aggressive')
  })
  it('partial still grants +1 ◇ but no shift', () => {
    const r = resolve(mentalist('terrified', 0), 'resolution', PART)
    expect(r.mentalState).toBe('terrified')
    expect(r.stability).toBe(1)
  })
})

describe('Préservation — 🔻 vers Prudent (jamais en dessous)', () => {
  it('success from enraged moves toward fear, capped so a crit stops at aggressive', () => {
    expect(resolve(mentalist('enraged', 0), 'preservation', OK).mentalState).toBe('furious')
    expect(resolve(mentalist('enraged', 0), 'preservation', CRIT).mentalState).toBe('aggressive')
  })
  it('from focused stops at Prudent (cautious)', () => {
    expect(resolve(mentalist('focused', 0), 'preservation', CRIT).mentalState).toBe('cautious')
  })
})

describe('Focalisation — recentre vers Concentré', () => {
  it('moves toward focused from either side', () => {
    expect(resolve(mentalist('terrified', 0), 'focalisation', OK).mentalState).toBe('panicked')
    expect(resolve(mentalist('enraged', 0), 'focalisation', CRIT).mentalState).toBe('aggressive')
  })
})

describe('Méditation — +1 ◇ par Résilience (plafonné au pool)', () => {
  it('gains Résilience ◇ on success', () => {
    const r = resolve(mentalist('focused', 0), 'meditation', OK)  // résilience 2
    expect(r.stability).toBe(2)
  })
  it('◇ never exceeds the pool (Ténacité + Discipline = 3)', () => {
    const r = resolve(mentalist('focused', 2), 'meditation', OK)  // 2 + 2 = 4 → plafonné à 3
    expect(r.stability).toBe(stabilityPool(mentalist()))
    expect(r.stability).toBe(3)
  })
})

describe('Défaut ⚠️ — perd 1 PA', () => {
  it('a flaw spends one action', () => {
    const before = mentalist('terrified', 0)
    const after  = resolve(before, 'resolution', { hit: true, critical: false, flaw: true })
    expect(after.actions).toBe(before.actions - 1)
  })
})

// ─── Garde de condition mentale ─────────────────────────────────────────────────

describe('mentalCondition gate', () => {
  it('Préservation needs Concentré or colère (not fear)', () => {
    expect(canUseAction(mentalist('enraged'),   'preservation')).toBe(true)
    expect(canUseAction(mentalist('focused'),   'preservation')).toBe(true)
    expect(canUseAction(mentalist('terrified'), 'preservation')).toBe(false)
  })
  it('Résolution needs Concentré or crainte (not rage)', () => {
    expect(canUseAction(mentalist('terrified'), 'resolution')).toBe(true)
    expect(canUseAction(mentalist('aggressive'),'resolution')).toBe(false)
  })
  it('Méditation needs Concentré exactly', () => {
    expect(canUseAction(mentalist('focused'),  'meditation')).toBe(true)
    expect(canUseAction(mentalist('panicked'), 'meditation')).toBe(false)
  })
  it('Focalisation has no mental constraint', () => {
    expect(canUseAction(mentalist('terrified'), 'focalisation')).toBe(true)
    expect(canUseAction(mentalist('enraged'),   'focalisation')).toBe(true)
  })
})

// ─── Agent : récupération quand l'état mental est pénalisant ─────────────────────
//
// Le planificateur par utilité n'a pas de seuil « degré ≥ 2 » : la consolidation
// est jouée quand ce qu'elle rachète (états pénalisants, ◇, +1⚡ de Concentré)
// vaut la Bande I. À degré 1 (Prudent), recentrer reste rationnel — c'est un
// petit gain, plus un ◇ — mais ne doit jamais évincer une urgence.

describe('scripted agent uses consolidation when off-centre', () => {
  const cfg: AgentConfig = { persona: 'cautious', targetId: 'B' }

  it('a terrified mentalist recentres (Focalisation) before attacking', () => {
    const plan = planNextAction(mentalist('terrified', 0), makeCombatant('B'), cfg)
    expect(plan?.action).toBe('focalisation')  // universelle, priorité
  })

  it('recentring from the extreme outweighs recentring from degré 1', () => {
    // La valeur du recentrage doit CROÎTRE avec la dégradation de l'état :
    // c'est la forme de la fonction de valeur, pas un seuil arbitraire.
    const at = (state: 'cautious' | 'panicked' | 'terrified') =>
      scorePlayerAction('focalisation', mentalist(state, 0), makeCombatant('B'), {
        selfId: 'A', isEnemy: id => id === 'B',
        getActor: () => undefined, weights: PERSONA_WEIGHTS.cautious,
      })
    // getActor sur soi est câblé par scorePlayerAction ; l'ennemi est sans objet ici.
    expect(at('terrified')).toBeGreaterThan(at('panicked'))
    expect(at('panicked')).toBeGreaterThan(at('cautious'))
  })

  it('an urgent recovery still beats a comfort consolidation (degré 1)', () => {
    // Prudent + fatigue haute : la Respiration doit primer sur la Focalisation.
    const winded = { ...mentalist('cautious', 0), fatigue: 12 }
    const plan = planNextAction(winded, makeCombatant('B'), cfg)
    expect(plan?.action).toBe('respiration')
  })
})
