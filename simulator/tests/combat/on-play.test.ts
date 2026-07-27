/**
 * Tier ▶️ onPlay — le socle INCONDITIONNEL d'une action déclarative. Il tombe
 * quel que soit le jet (touche ou non), APRÈS ⚠️ Défaut / ✴️ Critique mais AVANT
 * l'issue ✅/◐. C'est le support des ressources qu'une carte génère juste en
 * étant jouée (⊖ auto-chargée, Inertie…) — socle des combos d'Électromancie.
 */
import { makeResolve, type ActionOutcomes } from '../../src/combat/effect-ops'
import type { CombatEffect } from '../../src/combat/types'

const actor  = { id: 'A' }
const target = { id: 'T' }

/** Barème lisible : chaque tier pose une fatigue d'un montant unique et signé. */
const outcomes: ActionOutcomes = {
  onFlaw:    { text: 'flaw',    effect: [{ fatigue: 1 }] },
  onCritical:{ text: 'crit',    effect: [{ fatigue: 2 }] },
  onPlay:    { text: 'play',    effect: [{ fatigue: 3 }] },
  onSuccess: { text: 'success', effect: [{ fatigue: 4 }] },
  onFailure: { text: 'failure', effect: [{ fatigue: 5 }] },
}

const amounts = (r: { effects: CombatEffect[] }) =>
  r.effects.map(e => ('amount' in e ? e.amount : undefined))

describe('makeResolve — tier ▶️ onPlay', () => {
  const resolve = makeResolve(outcomes)

  it('tombe même sur un échec (◐) — inconditionnel', () => {
    const r = resolve({ hit: false, critical: false, flaw: false }, actor, target)
    expect(amounts(r)).toEqual([3, 5])           // onPlay puis onFailure
    expect(r.notes).toEqual(['▶️ play', '◐ failure'])
  })

  it('tombe aussi sur un succès (✅), avant l\'issue', () => {
    const r = resolve({ hit: true, critical: false, flaw: false }, actor, target)
    expect(amounts(r)).toEqual([3, 4])           // onPlay puis onSuccess
    expect(r.notes).toEqual(['▶️ play', '✅ success'])
  })

  it('ordre complet : ⚠️ Défaut → ✴️ Critique → ▶️ onPlay → issue', () => {
    const r = resolve({ hit: true, critical: true, flaw: true }, actor, target)
    expect(amounts(r)).toEqual([1, 2, 3, 4])
    expect(r.notes).toEqual(['⚠️ flaw', '✴️ crit', '▶️ play', '✅ success'])
  })

  it('sans onPlay déclaré, rien ne s\'intercale', () => {
    const bare = makeResolve({ onSuccess: outcomes.onSuccess, onFailure: outcomes.onFailure })
    const r = bare({ hit: true, critical: false, flaw: false }, actor, target)
    expect(amounts(r)).toEqual([4])
  })

  it('action sans cible : aucun effet (les actions ciblées seules passent ici)', () => {
    const r = resolve({ hit: true, critical: false, flaw: false }, actor, undefined)
    expect(r.effects).toEqual([])
  })

  it('un op SELF en onPlay atterrit sur le lanceur, pas la cible', () => {
    const selfPlay = makeResolve({
      onSuccess: { effect: [] },
      onFailure: { effect: [] },
      onPlay:    { effect: [{ selfCharge: -1 }] },   // le lanceur s'auto-charge ⊖
    })
    const r = selfPlay({ hit: true, critical: false, flaw: false }, actor, target)
    const charge = r.effects.find(e => e.kind === 'add-charge')
    expect(charge?.targetId).toBe('A')              // le lanceur, pas 'T'
    expect((charge as { capped?: boolean }).capped).toBe(true)
  })
})
