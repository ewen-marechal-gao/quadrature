/**
 * Escrime — famille `rollSubstitution` (armes de prédilection) branchée au
 * moteur, et cohérence des cibles avec les actions/gardes réelles.
 *
 * LE garde-fou : une substitution branchée qui viserait une action ou une garde
 * inexistante est un bug muet — le jet ne serait jamais substitué et rien ne le
 * dirait. On vérifie donc que chaque cible BRANCHÉE existe.
 */
import { PERK_DEFS } from '../../src/character/disciplines'
import { rollSubstitutionRank } from '../../src/combat/perks'
import { ACTION_DEFS, GUARD_DEFS, checkRollParams } from '../../src/combat/actions'
import { makeCombatant } from '../helpers/fixtures'

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
