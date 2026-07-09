/**
 * data/player_actions.yaml — loader + cohérence avec le vault français.
 *
 * Tant que la projection générée (étape 3b) n'existe pas, les cartes de
 * rules/fr/cartes/*.yaml restent écrites à la main : ce test casse dès que
 * coût, initiative ou nom divergent entre la source machine (/data) et la
 * carte affichée (vault), via le lien `vaultCard` porté par chaque action.
 */
import fs   from 'fs'
import path from 'path'
import { parse } from 'yaml'
import { ACTION_DEFS } from '../../src/combat/actions'
import {
  readRawPlayerActions, loadPlayerActionDefs, PLAYER_ACTIONS_FILE,
} from '../../src/combat/actions-data'
import type { ActionId } from '../../src/combat/types'

const ALL_IDS: ActionId[] = [
  'armed-attack', 'unarmed-attack', 'brutal-strike',
  'sharp-strike', 'respiration', 'stabilize',
  'preservation', 'focalisation', 'resolution', 'meditation',
]

// ─── Loader ───────────────────────────────────────────────────────────────────

describe('loadPlayerActionDefs', () => {
  it('loads every ActionId with a callable resolve', () => {
    for (const id of ALL_IDS) {
      const def = ACTION_DEFS[id]
      expect(def).toBeDefined()
      expect(def.id).toBe(id)
      expect(typeof def.resolve).toBe('function')
      expect(def.tags.length).toBeGreaterThan(0)
    }
  })

  it('wires custom resolvers with their dynamic DC', () => {
    expect(ACTION_DEFS['respiration'].getDC).toBeDefined()
    expect(ACTION_DEFS['stabilize'].getDC).toBeDefined()
    expect(ACTION_DEFS['respiration'].outcomes).toBeUndefined()
    // Declarative actions carry their outcomes (and no custom DC)
    expect(ACTION_DEFS['armed-attack'].outcomes).toBeDefined()
    expect(ACTION_DEFS['armed-attack'].getDC).toBeUndefined()
  })

  it('is loadable in another locale (fr fallback when en is absent)', () => {
    const en = loadPlayerActionDefs('en')
    expect(en['armed-attack'].label).toBe('Attaque armée')  // fallback fr
  })
})

// ─── Cohérence /data ↔ vault (rules/fr/cartes) ────────────────────────────────

interface VaultCard { id: string; nom: string; initiative: number; cout: string }

function loadVaultCards(): Map<string, VaultCard> {
  const dir = path.resolve(path.dirname(PLAYER_ACTIONS_FILE), '..', 'rules', 'fr', 'cartes')
  const cards = new Map<string, VaultCard>()
  for (const file of ['actions_universelles.yaml', 'actions_avancees.yaml']) {
    const doc = parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as { cartes?: VaultCard[] }
    for (const c of doc.cartes ?? []) cards.set(c.id, c)
  }
  return cards
}

const count = (s: string, symbol: string) => s.split(symbol).length - 1

describe('cohérence data/player_actions.yaml ↔ rules/fr/cartes', () => {
  const raw   = readRawPlayerActions()
  const vault = loadVaultCards()

  it.each(ALL_IDS)('%s concorde avec sa carte du vault', (id) => {
    const action = raw[id]
    expect(action?.vaultCard).toBeDefined()
    const card = vault.get(action!.vaultCard!)
    expect(card).toBeDefined()

    const def = ACTION_DEFS[id]
    expect(card!.nom).toBe(def.label)
    expect(card!.initiative).toBe(def.initiative)

    // Coût : ⚫/🟢 = PA (🟢 = 1 PA jouable en première action), 💧 fatigue, ⚡ réactions
    expect(count(card!.cout, '⚫') + count(card!.cout, '🟢')).toBe(def.cost.actions)
    expect(count(card!.cout, '💧')).toBe(def.cost.fatigue ?? 0)
    expect(count(card!.cout, '⚡')).toBe(def.cost.reactions)
    expect(card!.cout.includes('🟢')).toBe(def.requiresFirstAction)
  })
})
