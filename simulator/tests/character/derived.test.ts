/**
 * Statistiques dérivées d'une fiche — et surtout leur ACCORD avec le moteur.
 *
 * Le seuil de Résistance est calculé à deux endroits pour deux usages : l'affichage
 * de fiche (`computeDerived`) et la conversion 💢→💔 en fin de manche
 * (`resistanceThreshold` de combat/combatant.ts, qui fait foi). Ils ont divergé
 * en silence — la fiche a longtemps ajouté la Robustesse que le moteur avait
 * retirée, soit 100 % d'écart pour un personnage à Robustesse 2 — parce que
 * RIEN ne les comparait. C'est ce que fait ce fichier.
 */
import path from 'path'
import { loadCharacter } from '../../src/character/io'
import { computeDerived } from '../../src/character/character'
import { initCombatant, resistanceThreshold, stabilityPool } from '../../src/combat/combatant'
import type { Character } from '../../src/character/types'

const LENA_PATH = path.resolve(__dirname, '../../characterSheets/lena.yaml')

describe('computeDerived — accord avec le moteur de combat', () => {
  let lena: Character

  beforeAll(async () => { lena = await loadCharacter(LENA_PATH) })

  // ⚠️ Lena porte Robustesse 0 : la croiser telle quelle ne prouverait RIEN, les
  // deux formules coïncidant trivialement. On force une Robustesse non nulle —
  // c'est le seul cas où l'ancien bug se voyait.
  const robustify = (c: Character, robustness: number): Character =>
    ({ ...c, skills: { ...c.skills, robustness } })

  it('le seuil de Résistance affiché est celui que le moteur applique', () => {
    for (const robustness of [0, 1, 3, 5]) {
      const c = robustify(lena, robustness)
      expect(computeDerived(c).resistanceThreshold)
        .toBe(resistanceThreshold(initCombatant(c)))
    }
  })

  it('la Stabilité maximale affichée est celle que le moteur alloue', () => {
    expect(computeDerived(lena).maxStability).toBe(stabilityPool(initCombatant(lena)))
  })

  // Le point de rupture précis : la Robustesse ne doit PAS entrer dans le seuil
  // (elle rendait la caractéristique doublement défensive), mais reste dans la
  // capacité de charge. Un personnage robuste est le seul à révéler l'écart.
  it('la Robustesse ne compte pas dans le seuil, mais compte dans la charge', () => {
    const robuste: Character = {
      ...lena,
      skills: { ...lena.skills, robustness: 3 },
    }
    const fragile: Character = {
      ...lena,
      skills: { ...lena.skills, robustness: 0 },
    }
    expect(computeDerived(robuste).resistanceThreshold)
      .toBe(computeDerived(fragile).resistanceThreshold)
    expect(computeDerived(robuste).carryCapacity)
      .toBeGreaterThan(computeDerived(fragile).carryCapacity)
  })

  it('une blessure de caractéristique abaisse le seuil (Vigueur effective)', () => {
    const blessee: Character = {
      ...lena,
      characteristics: {
        ...lena.characteristics,
        vigor: { ...lena.characteristics.vigor, wounds: lena.characteristics.vigor.value },
      },
    }
    expect(computeDerived(blessee).resistanceThreshold).toBe(0)
  })
})
