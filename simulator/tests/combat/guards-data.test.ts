/**
 * data/guards.yaml — loader + cohérence avec les cartes du vault.
 *
 * LE garde-fou qui manquait. Les Gardes étaient le dernier îlot de règles codé
 * en dur : sans source de données ni lien `vaultCard`, rien ne pouvait comparer
 * leurs jets à la carte imprimée — et deux d'entre eux avaient divergé sans
 * qu'aucun test ne bronche (Encaisser roulait Récupération + Vigueur pour
 * Robustesse + Force côté carte ; le Blocage l'inverse).
 *
 * La liste des gardes est DÉRIVÉE du fichier, jamais écrite à la main : une
 * garde qui existe est vérifiée.
 */
import fs   from 'fs'
import path from 'path'
import { parse } from 'yaml'
import { GUARD_DEFS, availableGuards, guardConcession, guardAnswers } from '../../src/combat/actions'
import { readRawGuards, GUARDS_FILE } from '../../src/combat/guards-data'
import { SKILL_LABEL, CHARACTERISTIC_LABEL } from '../../src/character/data'
import type { GuardId } from '../../src/combat/types'
import { makeCombatant, makeCharacter } from '../helpers/fixtures'

const ALL_IDS = Object.keys(readRawGuards()) as GuardId[]

// ─── Loader ───────────────────────────────────────────────────────────────────

describe('loadGuardDefs', () => {
  it('charge les cinq Gardes du vault', () => {
    expect(ALL_IDS.sort()).toEqual(['absorb', 'block', 'dodge', 'evade', 'parry'])
  })

  it('chaque Garde est complète et jouable', () => {
    for (const id of ALL_IDS) {
      const def = GUARD_DEFS[id]
      expect(def.id).toBe(id)
      expect(def.label.length).toBeGreaterThan(0)
      expect(typeof def.rollDC).toBe('function')
      expect(typeof def.effects).toBe('function')
      expect(typeof def.isAvailable).toBe('function')
      expect(def.cost.actions).toBe(0)          // une Garde ne coûte jamais de PA
      expect(def.cost.endPlayerRound).toBe(false)
    }
  })

  it('seule Encaisser est gratuite — et inbrisable', () => {
    expect(GUARD_DEFS['absorb'].cost.reactions).toBe(0)
    expect(GUARD_DEFS['absorb'].unbreakable).toBe(true)
    for (const id of ALL_IDS.filter(g => g !== 'absorb')) {
      expect(GUARD_DEFS[id].cost.reactions).toBe(1)
      expect(GUARD_DEFS[id].unbreakable).toBeUndefined()
    }
  })

  it('une Garde roule bien le jet de sa carte (le bug qui a motivé ce test)', () => {
    expect(GUARD_DEFS['absorb'].rollSkill).toBe('robustness')
    expect(GUARD_DEFS['absorb'].rollChar).toBe('strength')
    expect(GUARD_DEFS['block'].rollSkill).toBe('endurance')
    expect(GUARD_DEFS['block'].rollChar).toBe('vigor')
  })
})

// ─── Cohérence /data ↔ vault (rules/fr/cartes/reactions_defense.yaml) ─────────

interface VaultCard {
  id: string; nom: string; initiative?: number; cout?: string
  jet?: string; concession?: string; contrecoup?: string; defaut?: string; critique?: string
}

function loadGuardCards(): Map<string, VaultCard> {
  const file = path.resolve(
    path.dirname(GUARDS_FILE), '..', 'rules', 'fr', 'cartes', 'reactions_defense.yaml')
  const doc = parse(fs.readFileSync(file, 'utf-8')) as { cartes?: VaultCard[] }
  return new Map((doc.cartes ?? []).map(c => [c.id, c]))
}

const count = (s: string, symbol: string) => s.split(symbol).length - 1

describe('cohérence data/guards.yaml ↔ rules/fr/cartes/reactions_defense.yaml', () => {
  const raw   = readRawGuards()
  const cards = loadGuardCards()

  it.each(ALL_IDS)('%s concorde avec sa carte', (id) => {
    const card = cards.get(raw[id].vaultCard)
    expect(card).toBeDefined()

    const def = GUARD_DEFS[id]
    expect(card!.nom).toBe(def.label)
    // L'initiative d'une Garde est sa VITESSE : elle doit sortir de la carte.
    expect(card!.initiative).toBe(def.initiative)
    // Coût : ⚡ comptés dans la pastille ; Encaisser n'a pas de ligne de coût.
    expect(count(card!.cout ?? '', '⚡')).toBe(def.cost.reactions)
  })

  /**
   * Le jet de la carte est de la PROSE française (« Robustesse 🟨🟨 + Force 🟦 »).
   * On la relit contre les libellés du simulateur : c'est exactement la
   * comparaison qu'aucun test ne faisait, et par laquelle les deux jets ont
   * divergé sans bruit.
   */
  it.each(ALL_IDS)('%s : le jet du moteur est celui écrit sur la carte', (id) => {
    const card = cards.get(raw[id].vaultCard)!
    const def  = GUARD_DEFS[id]
    expect(card.jet).toContain(SKILL_LABEL[def.rollSkill])
    expect(card.jet).toContain(CHARACTERISTIC_LABEL[def.rollChar])
  })

  it('toute carte de famille « garde » a une entrée moteur', () => {
    const linked = new Set(ALL_IDS.map(id => raw[id].vaultCard))
    for (const [cardId, card] of cards) {
      if ((card as { famille?: string }).famille !== 'garde') continue
      expect(`${cardId} → moteur`).toBe(linked.has(cardId) ? `${cardId} → moteur` : 'ORPHELINE')
    }
  })

  it('chaque Garde porte un Contrecoup ↩️ des deux côtés', () => {
    for (const id of ALL_IDS) {
      expect(raw[id].contrecoup).toBeDefined()
      expect(cards.get(raw[id].vaultCard)!.contrecoup).toBeDefined()
    }
  })
})

// ─── Disponibilité ────────────────────────────────────────────────────────────

describe('disponibilité des Gardes', () => {
  it('Encaisser est toujours disponible — c\'est le repli, pas un choix', () => {
    const worn = { ...makeCombatant('B'), reactions: 0 }
    expect(GUARD_DEFS['absorb'].isAvailable(worn)).toBe(true)
    expect(availableGuards(worn)).toEqual(['absorb'])
  })

  it("l'Esquive est fermée par Entravé 🕸️", () => {
    const trapped = makeCombatant('B', {})
    expect(GUARD_DEFS['dodge'].isAvailable({ ...trapped, status: ['entrapped'] })).toBe(false)
    expect(GUARD_DEFS['dodge'].isAvailable({ ...trapped, status: [] })).toBe(true)
  })

  it('la Dérobade n\'est jamais disponible : aucune case occultée 🌑 simulée', () => {
    expect(GUARD_DEFS['evade'].isAvailable(makeCombatant('B'))).toBe(false)
  })

  it('Parade et Blocage restent gâtés par un proxy d\'équipement', () => {
    const unarmed = makeCombatant('B', {
      skills: { ...makeCharacter().skills, power: 0, robustness: 0 },
    })
    expect(GUARD_DEFS['parry'].isAvailable(unarmed)).toBe(false)
    expect(GUARD_DEFS['block'].isAvailable(unarmed)).toBe(false)
  })
})

// ─── Vitesse et concession, lues depuis la donnée ─────────────────────────────

describe('vitesse de Garde — dérivée des initiatives du vault', () => {
  it('les cinq initiatives sont celles des cartes', () => {
    expect(GUARD_DEFS['absorb'].initiative).toBe(1)
    expect(GUARD_DEFS['parry'].initiative).toBe(2)
    expect(GUARD_DEFS['dodge'].initiative).toBe(3)
    expect(GUARD_DEFS['evade'].initiative).toBe(3)
    expect(GUARD_DEFS['block'].initiative).toBe(4)
  })

  it('une Garde répond aux actions au moins aussi lentes qu\'elle', () => {
    expect(guardAnswers('block', 4)).toBe(true)    // égalité : elle passe
    expect(guardAnswers('block', 3)).toBe(false)
  })
})

describe('concession 🟩 — lue depuis guards.yaml', () => {
  it('la Parade concède au tir et non à la mêlée', () => {
    expect(guardConcession('parry', ['offensive', 'ranged'])).toBe(1)
    expect(guardConcession('parry', ['offensive', 'melee'])).toBe(0)
  })

  it('Encaisser concède sans condition', () => {
    expect(guardConcession('absorb', ['offensive', 'melee'])).toBe(1)
  })
})
