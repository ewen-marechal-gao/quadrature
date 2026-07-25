/**
 * Escrime — famille `rollSubstitution` (armes de prédilection) branchée au
 * moteur, et cohérence des cibles avec les actions/gardes réelles.
 *
 * LE garde-fou : une substitution branchée qui viserait une action ou une garde
 * inexistante est un bug muet — le jet ne serait jamais substitué et rien ne le
 * dirait. On vérifie donc que chaque cible BRANCHÉE existe.
 */
import { PERK_DEFS } from '../../src/character/disciplines'
import { rollSubstitutionRank, initialMentalState, reactionGrants } from '../../src/combat/perks'
import { ACTION_DEFS, GUARD_DEFS, checkRollParams, resolveAction } from '../../src/combat/actions'
import { makeCombatant, makeCharacter } from '../helpers/fixtures'

// ─── Cohérence des cibles (le garde-fou) ────────────────────────────────────────

describe('perks — cohérence des cibles branchées', () => {
  it('chaque rollSubstitution branchée vise une action ou une garde réelle', () => {
    for (const def of Object.values(PERK_DEFS)) {
      for (const g of def.grants) {
        if (g.kind !== 'rollSubstitution' || g.wired === false) continue
        if (g.target.type === 'action') expect(ACTION_DEFS[g.target.id as keyof typeof ACTION_DEFS]).toBeDefined()
        else                            expect(GUARD_DEFS[g.target.id as keyof typeof GUARD_DEFS]).toBeDefined()
      }
    }
  })
})

// ─── rollSubstitutionRank — la logique de sélection ─────────────────────────────

describe('rollSubstitutionRank', () => {
  const finesseLight = makeCombatant('Fencer', {
    perks: ['finesse'], skillTags: ['favweapon-light'], disciplines: { fencing: 3 },
  })

  it('substitue sur l\'action visée quand l\'arme de prédilection correspond', () => {
    // Fine Lame [légères] : Frappe vive → Escrime.
    expect(rollSubstitutionRank(finesseLight, 'action', 'sharp-strike')).toBe(3)
  })

  it('ne substitue pas une action non visée par ce style/arme', () => {
    // favweapon-light ne vise pas Charge (c'est [larges]).
    expect(rollSubstitutionRank(finesseLight, 'action', 'charge')).toBeNull()
  })

  it('ne substitue rien sans le bon skillTag', () => {
    const finesseBroad = makeCombatant('F2', {
      perks: ['finesse'], skillTags: ['favweapon-broad'], disciplines: { fencing: 3 },
    })
    expect(rollSubstitutionRank(finesseBroad, 'action', 'sharp-strike')).toBeNull()
    // …mais bien sur Charge, qui EST [larges].
    expect(rollSubstitutionRank(finesseBroad, 'action', 'charge')).toBe(3)
  })

  it('un porteur sans perk ne substitue jamais', () => {
    expect(rollSubstitutionRank(makeCombatant('Plain'), 'action', 'sharp-strike')).toBeNull()
  })

  it('substitue sur les GARDES (Duelliste : Mur de lame / Blocage à l\'épée)', () => {
    const duelBroad = makeCombatant('Duel', {
      perks: ['duelist'], skillTags: ['favweapon-broad'], disciplines: { fencing: 2 },
    })
    expect(rollSubstitutionRank(duelBroad, 'guard', 'parry')).toBe(2)
    expect(rollSubstitutionRank(duelBroad, 'guard', 'block')).toBeNull() // block = [lourdes]
  })

  it('ignore les grants wired:false (Insaisissable — Posture non branchée)', () => {
    const duelLight = makeCombatant('Duel2', {
      perks: ['duelist'], skillTags: ['favweapon-light'], disciplines: { fencing: 2 },
    })
    // costOverride posture est wired:false ; aucune substitution de jet ne le concerne.
    expect(rollSubstitutionRank(duelLight, 'guard', 'parry')).toBeNull()
  })
})

// ─── Intégration au jet (checkRollParams) ───────────────────────────────────────

describe('checkRollParams — substitution d\'Escrime', () => {
  it('remplace la valeur de compétence par le rang d\'Escrime sur Frappe vive', () => {
    // precision 5 sur la fiche, mais Escrime 1 : la substitution doit gagner.
    const fencer = makeCombatant('Fencer', {
      perks: ['finesse'], skillTags: ['favweapon-light'],
      disciplines: { fencing: 1 },
      skills: { ...makeCombatant('x').skills, precision: 5 },
    })
    const params = checkRollParams(fencer, 'sharp-strike', undefined, undefined)
    expect(params.skill).toBe(1)           // Escrime, pas precision
  })

  it('laisse la compétence de base quand aucune substitution ne s\'applique', () => {
    const plain = makeCombatant('Plain')
    const params = checkRollParams(plain, 'sharp-strike', undefined, undefined)
    expect(params.skill).toBe(plain.skills.precision)
  })
})

// ═══ Lot 2 : les ♾️ Formes ══════════════════════════════════════════════════════

// ─── mentalInit — l'état mental de départ ───────────────────────────────────────

describe('initialMentalState — ♾️ Formes', () => {
  const withForme = (id: string, tag: string) =>
    makeCharacter({ perks: [id], skillTags: [tag], disciplines: { fencing: 1 } })

  it('Duelliste commence Prudent', () => {
    expect(initialMentalState(withForme('duelist', 'favweapon-broad'))).toBe('cautious')
  })
  it('Fine Lame commence Concentré', () => {
    expect(initialMentalState(withForme('finesse', 'favweapon-light'))).toBe('focused')
  })
  it('Belliciste commence Agressif', () => {
    expect(initialMentalState(withForme('warmonger', 'favweapon-heavy'))).toBe('aggressive')
  })
  it('sans Forme, Concentré par défaut', () => {
    expect(initialMentalState(makeCharacter())).toBe('focused')
  })
  it('initCombatant applique l\'état de la Forme', () => {
    const b = makeCombatant('B', { perks: ['warmonger'], skillTags: ['favweapon-heavy'], disciplines: { fencing: 1 } })
    expect(b.mentalState).toBe('aggressive')
  })
})

// ─── reactionOnTrigger — ⚡ sur déclencheur gaté ─────────────────────────────────

describe('reactionGrants — ♾️ Formes', () => {
  const belliciste = { char: makeCharacter({ perks: ['warmonger'], skillTags: ['favweapon-heavy'], disciplines: { fencing: 2 } }) }
  const fineLame   = { char: makeCharacter({ perks: ['finesse'],   skillTags: ['favweapon-light'], disciplines: { fencing: 2 } }) }

  it('Belliciste : +1⚡ sur attaque armée réussie, en Agressif', () => {
    const r = reactionGrants(belliciste, 'B', { isArmedAttack: true, usedFencing: false, hit: true, flaw: false, mentalState: 'aggressive' })
    expect(r.effects).toEqual([{ targetId: 'B', kind: 'add-reaction', amount: 1 }])
    expect(r.notes[0]).toMatch(/♾️/)
  })
  it('Belliciste : rien hors état Agressif', () => {
    const r = reactionGrants(belliciste, 'B', { isArmedAttack: true, usedFencing: false, hit: true, flaw: false, mentalState: 'focused' })
    expect(r.effects).toEqual([])
  })
  it('Belliciste : rien sur attaque manquée', () => {
    const r = reactionGrants(belliciste, 'B', { isArmedAttack: true, usedFencing: false, hit: false, flaw: false, mentalState: 'aggressive' })
    expect(r.effects).toEqual([])
  })

  it('Fine Lame : +1⚡ sur jet Escrime réussi sans Défaut, en Concentré', () => {
    const r = reactionGrants(fineLame, 'F', { isArmedAttack: true, usedFencing: true, hit: true, flaw: false, mentalState: 'focused' })
    expect(r.effects).toEqual([{ targetId: 'F', kind: 'add-reaction', amount: 1 }])
  })
  it('Fine Lame : rien si Défaut', () => {
    const r = reactionGrants(fineLame, 'F', { isArmedAttack: true, usedFencing: true, hit: true, flaw: true, mentalState: 'focused' })
    expect(r.effects).toEqual([])
  })
  it('Fine Lame : rien si le jet n\'utilise pas Escrime', () => {
    const r = reactionGrants(fineLame, 'F', { isArmedAttack: true, usedFencing: false, hit: true, flaw: false, mentalState: 'focused' })
    expect(r.effects).toEqual([])
  })

  it('un porteur sans perk ne gagne jamais de ⚡', () => {
    const r = reactionGrants({ char: makeCharacter() }, 'x', { isArmedAttack: true, usedFencing: true, hit: true, flaw: false, mentalState: 'aggressive' })
    expect(r.effects).toEqual([])
  })
})

// ─── Intégration : resolveAction émet les ⚡ ─────────────────────────────────────

describe('resolveAction — émission des ⚡ ♾️', () => {
  const noReaction = { effects: [], notes: [] }

  it('Belliciste (Agressif) touche armed-attack → +1⚡ dans les effets', () => {
    const belliciste = makeCombatant('B', { perks: ['warmonger'], skillTags: ['favweapon-heavy'], disciplines: { fencing: 2 } })
    const target = makeCombatant('T')
    const r = resolveAction(belliciste, 'armed-attack', { dc: 0, guardReaction: noReaction, target })
    expect(r.hit).toBe(true)
    expect(r.effects).toContainEqual({ targetId: 'B', kind: 'add-reaction', amount: 1 })
    expect(r.notes.some(n => n.includes('♾️'))).toBe(true)
  })

  it('un combattant sans Forme ne gagne pas de ⚡ en attaquant', () => {
    const plain  = makeCombatant('P')
    const target = makeCombatant('T')
    const r = resolveAction(plain, 'armed-attack', { dc: 0, guardReaction: noReaction, target })
    expect(r.effects.some(e => e.kind === 'add-reaction')).toBe(false)
  })
})
