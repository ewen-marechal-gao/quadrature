/**
 * ÉQUIPEMENT — registre, dérivations, et cohérence au vault.
 *
 * Ce que ces tests protègent :
 *  · le registre charge et se valide (ids uniques, zones connues, portées ≥ 1) ;
 *  · la Protection de l'armure est calculée à DEUX endroits — la règle du vault
 *    (« chaque emplacement utilisé offre un point de protection ») et la colonne
 *    du tableau Matériel — donc elle se teste par égalité ;
 *  · le catalogue de mêlée est la projection EXACTE des tableaux du vault : même
 *    liste d'armes, même texte de mécanique, et la conversion Allonge N → portée
 *    N+1 est vérifiée ligne à ligne, pas supposée ;
 *  · le repli de non-régression : sans inventaire, la fiche garde sa Protection
 *    saisie, ce qui est la condition pour que le banc ne bouge pas.
 */

import fs   from 'fs'
import path from 'path'
import { ITEMS, getItem } from '../../src/equipment/items-data'
import { ZONE_CAPACITY, ALL_BODY_ZONES, isWeapon, isArmor } from '../../src/equipment/types'
import type { WeaponFamily } from '../../src/equipment/types'
import {
  hasEquipment, baseProtection, roundProtection, effectiveProtection,
  wieldedWeapons, drawableWeapons, availableAttacks, reachFor,
  canParry, canBlock, totalSlots, overload, overfilledZones,
  type Inventory,
} from '../../src/equipment/inventory'

const VAULT = path.resolve(__dirname, '..', '..', '..', 'rules', 'fr', 'core', 'equipement.md')

// ─── Registre ─────────────────────────────────────────────────────────────────

describe('registre d\'équipement', () => {
  it('charge les trois fichiers sans doublon d\'id', () => {
    expect(Object.keys(ITEMS).length).toBeGreaterThan(40)
    for (const [id, item] of Object.entries(ITEMS)) expect(item.id).toBe(id)
  })

  it('n\'expose que des zones connues, et jamais plus que la capacité anatomique', () => {
    for (const item of Object.values(ITEMS)) {
      for (const z of item.zones) expect(ALL_BODY_ZONES).toContain(z)
      if (item.size === 'normal')
        for (const z of item.zones) expect(item.slots).toBeLessThanOrEqual(ZONE_CAPACITY[z])
    }
  })

  it('donne à toute arme une portée absolue ≥ 1 et au moins une attaque', () => {
    for (const item of Object.values(ITEMS).filter(isWeapon)) {
      expect(item.reach).toBeGreaterThanOrEqual(1)
      expect(item.attacks.length).toBeGreaterThan(0)
      // Toute arme tenue en main permet l'Attaque armée — sauf les armes de tir,
      // qui ne frappent pas (§ equipement, bandeau des familles).
      if (item.family !== 'bows' && item.family !== 'crossbows')
        expect(item.attacks).toContain('armed')
    }
  })

  it('lève sur un id inconnu plutôt que de rendre undefined', () => {
    expect(() => getItem('epee-de-lumiere')).toThrow(/Objet inconnu/)
  })
})

// ─── La Protection, calculée deux fois ────────────────────────────────────────

describe('Protection 🛡️ — règle du vault vs tableau', () => {
  /**
   * equipement.md § Armures : « Le Torse dispose de 4 emplacements. Chaque
   * emplacement utilisé offre un point de protection. » Le tableau Matériel
   * redonne la même chose colonne par colonne. Les deux doivent coïncider.
   */
  it('une armure de torse confère exactement autant de 🛡️ que de 🔳 occupés', () => {
    const bodyArmors = Object.values(ITEMS).filter(isArmor).filter(a => a.zones.includes('body'))
    expect(bodyArmors.length).toBe(4)
    for (const a of bodyArmors) expect(a.protection).toBe(a.slots)
  })

  it('distingue le stock d\'armure de la protection rendue chaque manche', () => {
    const inv: Inventory = { worn: { body: ['heavy-armor'], hands: ['buckler'] } }
    expect(baseProtection(inv)).toBe(4)   // se vide, ne revient pas
    expect(roundProtection(inv)).toBe(1)  // revient à chaque manche
  })
})

// ─── Cohérence au vault : le catalogue de mêlée ───────────────────────────────

/** Lignes d'un tableau markdown situé sous un titre donné. */
function vaultTable(heading: string): string[][] {
  const md = fs.readFileSync(VAULT, 'utf-8')
  const start = md.indexOf(heading)
  if (start < 0) throw new Error(`Titre introuvable dans le vault : ${heading}`)
  const rest  = md.slice(start + heading.length)
  const end   = rest.search(/\n#{2,4} /)
  const block = end < 0 ? rest : rest.slice(0, end)

  return block.split('\n')
    .filter(l => l.trim().startsWith('|'))
    .map(l => l.split('|').slice(1, -1).map(c => c.trim()))
    // en-tête + ligne de séparation
    .filter(cells => !/^:?-+:?$/.test(cells[0]) && cells[0] !== 'Nom')
}

const MELEE_TABLES: { heading: string; family: WeaponFamily }[] = [
  { heading: '### Famille d\'armes : lames courtes', family: 'short-blades' },
  { heading: '### Famille d\'armes : lames longues', family: 'long-blades' },
  { heading: '## Famille d\'armes : armes d\'impact', family: 'impact' },
  { heading: '### Famille d\'armes : Allonge',        family: 'polearms' },
]

describe('catalogue de mêlée — projection exacte de equipement.md', () => {
  it.each(MELEE_TABLES)('$family : mêmes armes que le vault', ({ heading, family }) => {
    const vaultNames = vaultTable(heading).map(c => c[0]).sort()
    const yamlNames  = Object.values(ITEMS).filter(isWeapon)
      .filter(w => w.family === family)
      .map(w => w.vaultRow)
      .filter((n): n is string => n != null)
      .sort()
    expect(yamlNames).toEqual(vaultNames)
  })

  it.each(MELEE_TABLES)('$family : mécanique reportée verbatim', ({ heading, family }) => {
    const byName = new Map(vaultTable(heading).map(c => [c[0], c[c.length - 1]]))
    for (const w of Object.values(ITEMS).filter(isWeapon).filter(w => w.family === family)) {
      if (!w.vaultRow) continue
      expect(w.mechanic?.fr).toBe(byName.get(w.vaultRow))
    }
  })

  /**
   * La conversion la plus facile à se tromper de tout le chantier : le vault
   * note un BONUS (« Allonge 1 »), le moteur veut une PORTÉE. Testée ligne à
   * ligne contre la colonne du vault, pas supposée.
   */
  it('armes d\'allonge : portée = Allonge du vault + 1', () => {
    const rows = vaultTable('### Famille d\'armes : Allonge')
    expect(rows.length).toBe(6)
    const byName = new Map(rows.map(c => [c[0], Number(c[2])]))
    for (const w of Object.values(ITEMS).filter(isWeapon).filter(w => w.family === 'polearms')) {
      const allonge = byName.get(w.vaultRow!)
      expect(allonge).toBeDefined()
      expect(w.reach).toBe(allonge! + 1)
    }
  })
})

// ─── Dérivations d'inventaire ─────────────────────────────────────────────────

describe('inventaire porté', () => {
  const lena: Inventory = {
    worn: {
      hands: ['scimitar'],
      back:  ['weapon-harness', 'generic-bow'],
      waist: ['quiver'],
    },
  }

  it('ne tient pour armes que celles qui sont en main', () => {
    expect(wieldedWeapons(lena).map(w => w.id)).toEqual(['scimitar'])
  })

  it('rend dégainable une arme du Dos SI la zone porte un harnais', () => {
    expect(drawableWeapons(lena).map(w => w.id)).toEqual(['generic-bow'])
    // Sans harnais : l'arc voyage décordé, il n'est pas jouable.
    const sansHarnais: Inventory = { worn: { hands: ['scimitar'], back: ['generic-bow'] } }
    expect(drawableWeapons(sansHarnais)).toEqual([])
  })

  it('ouvre les attaques de l\'arme en main, et pas celles du sac', () => {
    const attacks = availableAttacks(lena)
    expect(attacks.has('armed')).toBe(true)
    expect(attacks.has('powerful')).toBe(true)
    expect(attacks.has('ranged-quick')).toBe(false)   // l'arc est au dos
  })

  it('retient la meilleure portée parmi les armes qui servent l\'attaque', () => {
    const lanceEtDague: Inventory = { worn: { hands: ['spear', 'dagger'] } }
    expect(reachFor(lanceEtDague, 'quick')).toBe(3)   // c'est la lance qui frappe
    expect(reachFor(lanceEtDague, 'powerful')).toBeUndefined()  // ni l'une ni l'autre
  })

  it('remplace les proxys de compétence des Gardes par la vraie condition', () => {
    expect(canParry(lena)).toBe(true)
    expect(canBlock(lena)).toBe(false)
    const avecEcu: Inventory = { worn: { hands: ['long-sword', 'buckler'] } }
    expect(canBlock(avecEcu)).toBe(true)
    // Un arc ne pare pas.
    expect(canParry({ worn: { hands: ['generic-bow'] } })).toBe(false)
  })

  it('compte les 🔳 et la surcharge', () => {
    // cimeterre 1 + harnais 2 + arc 1 + carquois 1 = 5
    expect(totalSlots(lena)).toBe(5)
    expect(overload(lena, 4)).toBe(1)   // Charge Max 4 → −1 🟦 sur les jets physiques
    expect(overload(lena, 5)).toBe(0)
  })

  it('refuse plus d\'objets qu\'une zone n\'a de place', () => {
    const troisSacs: Inventory = { worn: { back: ['backpack', 'backpack', 'backpack'] } }
    expect(overfilledZones(troisSacs)).toEqual(['back'])
  })
})

// ─── Non-régression ───────────────────────────────────────────────────────────

describe('repli sans inventaire', () => {
  it('une fiche sans équipement garde sa Protection saisie', () => {
    expect(hasEquipment(undefined)).toBe(false)
    expect(hasEquipment({ worn: {} })).toBe(false)
    expect(effectiveProtection(undefined, 2)).toBe(2)
    expect(effectiveProtection({ worn: {} }, 3)).toBe(3)
  })

  it('une fiche équipée dérive sa Protection et ignore la valeur saisie', () => {
    const inv: Inventory = { worn: { body: ['light-armor'] } }
    expect(effectiveProtection(inv, 99)).toBe(2)
  })
})
