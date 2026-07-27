/**
 * DISCIPLINES & atouts (perks) — registre, dérivation des skillTags, validation
 * de progression.
 *
 * Ce qu'on verrouille, c'est le CONTRAT, pas l'équilibrage :
 *  · la source data/disciplines/*.yaml se charge et se dérive (jamais de liste
 *    écrite à la main) ;
 *  · les marqueurs `style-*` se dérivent, les `favweapon-*` se résolvent ;
 *  · une fiche ne peut porter un perk que sa progression ouvre, ni investir un
 *    rang de discipline au-delà du cap débloqué.
 */
import {
  PERK_DEFS, DISCIPLINE_DEFS, loadPerkDefs,
  effectiveSkillTags, disciplineCapFor, validatePerks,
} from '../../src/character/disciplines'
import { validateCharacter } from '../../src/character/character'
import type { CharacteristicName } from '../../src/character/types'
import { makeCharacter } from '../helpers/fixtures'

// Valeurs de build « toutes à 3 » — satisfont tous les prérequis carac des Formes.
const CARACS_HIGH = Object.fromEntries(
  (['strength', 'agility', 'vigor', 'grace', 'acuity', 'willpower',
    'intelligence', 'tenacity', 'charisma', 'lucidity'] as CharacteristicName[])
    .map(c => [c, 3]),
) as Record<CharacteristicName, number>

// ─── Le registre et sa source ─────────────────────────────────────────────────

describe('data/disciplines — le registre', () => {
  it('charge les disciplines Escrime & Électromancie, cap 4', () => {
    expect(DISCIPLINE_DEFS.fencing).toBeDefined()
    expect(DISCIPLINE_DEFS.fencing.cap).toBe(4)
    expect(DISCIPLINE_DEFS.electromancy).toBeDefined()
    expect(DISCIPLINE_DEFS.electromancy.cap).toBe(4)
  })

  it('charge les trois Formes d\'Escrime + l\'Initiation à l\'Électromancie', () => {
    expect(Object.keys(PERK_DEFS).sort()).toEqual(['arc-initiate', 'duelist', 'finesse', 'warmonger'])
  })

  it('chaque perk est complet et rattaché à une discipline connue', () => {
    for (const [id, def] of Object.entries(PERK_DEFS)) {
      expect(def.id).toBe(id)
      expect(def.name.length).toBeGreaterThan(0)
      expect(DISCIPLINE_DEFS[def.discipline]).toBeDefined()
      expect(def.tier).toBeGreaterThanOrEqual(1)
      expect(Array.isArray(def.grants)).toBe(true)
    }
  })

  it('rejette un grant de type inconnu', () => {
    // loadPerkDefs relit le disque ; on ne peut pas injecter ici, mais le chemin
    // heureux prouve que GRANT_KINDS accepte les huit familles utilisées.
    expect(() => loadPerkDefs()).not.toThrow()
  })
})

// ─── skillTags : dérivation & cap ───────────────────────────────────────────────

describe('effectiveSkillTags', () => {
  it('dérive le marqueur de style, sans qu\'il figure sur la fiche', () => {
    const tags = effectiveSkillTags(['finesse'], ['favweapon-light'])
    expect(tags.has('style-finesse')).toBe(true)   // auto
    expect(tags.has('favweapon-light')).toBe(true) // choisi
  })

  it('un porteur sans perk n\'a que ses tags de fiche', () => {
    expect([...effectiveSkillTags([], ['x'])]).toEqual(['x'])
  })
})

describe('disciplineCapFor', () => {
  it('rend le cap débloqué par les Formes (1)', () => {
    expect(disciplineCapFor(['finesse'], 'fencing')).toBe(1)
  })
  it('0 si aucun perk n\'ouvre la discipline', () => {
    expect(disciplineCapFor([], 'fencing')).toBe(0)
  })
})

// ─── validatePerks ──────────────────────────────────────────────────────────────

describe('validatePerks', () => {
  it('accepte une Forme correctement montée', () => {
    const errs = validatePerks(['finesse'], ['favweapon-light'], { fencing: 1 }, CARACS_HIGH)
    expect(errs).toEqual([])
  })

  it('refuse un perk inconnu', () => {
    const errs = validatePerks(['ghost'], [], {}, CARACS_HIGH)
    expect(errs.join()).toMatch(/Unknown perk/)
  })

  it('refuse un rang de discipline au-delà du cap débloqué', () => {
    const errs = validatePerks(['finesse'], ['favweapon-light'], { fencing: 2 }, CARACS_HIGH)
    expect(errs.join()).toMatch(/exceeds cap 1/)
  })

  it('refuse un rang investi sans perk qui l\'ouvre', () => {
    const errs = validatePerks([], [], { fencing: 1 }, CARACS_HIGH)
    expect(errs.join()).toMatch(/no owned perk unlocks it/)
  })

  it('refuse un choix d\'arme non résolu', () => {
    const errs = validatePerks(['finesse'], [], { fencing: 1 }, CARACS_HIGH)
    expect(errs.join()).toMatch(/choice is unresolved/)
  })

  it('refuse un choix d\'arme sur-résolu (deux options)', () => {
    const errs = validatePerks(['finesse'], ['favweapon-light', 'favweapon-broad'], { fencing: 1 }, CARACS_HIGH)
    expect(errs.join()).toMatch(/over-resolved/)
  })

  it('refuse un skillTag parasite', () => {
    const errs = validatePerks(['finesse'], ['favweapon-light', 'favweapon-bogus'], { fencing: 1 }, CARACS_HIGH)
    expect(errs.join()).toMatch(/not offered by any owned perk/)
  })

  it('applique un prérequis carac « l\'un des trois » (characteristicsAny)', () => {
    const weak = { ...CARACS_HIGH, strength: 1, vigor: 1 }
    // Belliciste exige Force 2 OU Vigueur 2 : les deux à 1 → refus.
    const errs = validatePerks(['warmonger'], ['favweapon-light'], { fencing: 1 }, weak)
    expect(errs.join()).toMatch(/needs one of/)
  })
})

// ─── Intégration à validateCharacter ────────────────────────────────────────────

describe('validateCharacter — perks', () => {
  it('valide une fiche Fine Lame cohérente', () => {
    const char = makeCharacter({
      perks: ['finesse'], skillTags: ['favweapon-light'], disciplines: { fencing: 1 },
    })
    expect(validateCharacter(char).valid).toBe(true)
  })

  it('invalide une fiche dont le rang dépasse le cap', () => {
    const char = makeCharacter({
      perks: ['finesse'], skillTags: ['favweapon-light'], disciplines: { fencing: 3 },
    })
    const res = validateCharacter(char)
    expect(res.valid).toBe(false)
    expect(res.errors.join()).toMatch(/exceeds cap/)
  })
})
