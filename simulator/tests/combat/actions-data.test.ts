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

interface VaultMode { id: string; nom: string; initiative: number; cout?: string }
interface VaultCard {
  id: string; nom: string; initiative?: number; cout?: string
  /** Modes : une carte est du matériel, une action est une règle — le lien n'est pas 1↔1. */
  modes?: VaultMode[]
}

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

/** Lunes de coût : chacune vaut 1 PA et porte la bande de la carte (§ combat.md). */
const MOONS: string[] = ['🌓', '🌕', '🌗']

describe('cohérence data/player_actions.yaml ↔ rules/fr/cartes', () => {
  const raw   = readRawPlayerActions()
  const vault = loadVaultCards()

  it.each(ALL_IDS)('%s concorde avec sa carte du vault', (id) => {
    const action = raw[id]
    expect(action?.vaultCard).toBeDefined()
    const card = vault.get(action!.vaultCard!)
    expect(card).toBeDefined()

    // Une action du moteur vise une UNITÉ JOUABLE : la carte elle-même, ou l'un
    // de ses modes quand elle en porte (`vaultMode`). C'est le lien matériel →
    // règle, qui n'est pas 1↔1.
    const unit = action!.vaultMode
      ? card!.modes?.find(m => m.id === action!.vaultMode)
      : card
    expect(unit).toBeDefined()

    const def = ACTION_DEFS[id]
    expect(unit!.nom).toBe(def.label)
    expect(unit!.initiative).toBe(def.initiative)

    // Coût : 🌓/🌕/🌗 = 1 PA chacune (la lune porte la bande), 💧 fatigue, ⚡ réactions.
    // La « première action » n'est plus encodée dans le coût : les PA colorés 🟢⚫🔴
    // sont retirés au profit des bandes d'initiative.
    const cout = unit!.cout ?? ''
    expect(MOONS.reduce((n, m) => n + count(cout, m), 0)).toBe(def.cost.actions)
    expect(count(cout, '💧')).toBe(def.cost.fatigue ?? 0)
    expect(count(cout, '⚡')).toBe(def.cost.reactions)
  })
})

// ─── Lint du vault : la lune du coût encode la bande de l'initiative ───────────

/** Bande d'une initiative : I (1-3) 🌓 · II (4-6) 🌕 · III (7-9) 🌗. 0 et 10 sont hors-bande. */
const bandMoon = (initiative: number): string =>
  initiative <= 3 ? '🌓' : initiative <= 6 ? '🌕' : '🌗'

/**
 * Toutes les UNITÉS JOUABLES du vault : une carte à action unique en donne une,
 * une carte à modes en donne une par mode (Déplacement → marche · course).
 *
 * L'aplatissement est ce qui compte : sans lui, une carte à modes n'a ni `cout`
 * ni `initiative` à sa racine et traverse le lint sans être vue — un faux vert.
 */
function playableUnits(): Array<{ id: string; initiative: number; cout: string }> {
  const out: Array<{ id: string; initiative: number; cout: string }> = []
  for (const c of loadVaultCards().values()) {
    // La base ET les variantes : une carte à variantes garde son action de base
    // (Déplacement = la Marche), et n'importe laquelle des deux peut dériver.
    if (c.cout && c.initiative != null) {
      out.push({ id: c.id, initiative: c.initiative, cout: c.cout })
    }
    for (const m of c.modes ?? []) {
      if (m.cout && m.initiative != null) {
        out.push({ id: `${c.id}/${m.id}`, initiative: m.initiative, cout: m.cout })
      }
    }
  }
  return out
}

describe("vault — la lune du coût correspond à la bande de l'initiative", () => {
  const banded = playableUnits().filter(
    u => MOONS.some(m => u.cout.includes(m)) && u.initiative >= 1 && u.initiative <= 9,
  )

  it.each(banded.map(u => [u.id, u] as const))('%s', (_id, unit) => {
    for (const ch of [...unit.cout]) {
      if (MOONS.includes(ch)) expect(ch).toBe(bandMoon(unit.initiative))
    }
  })

  it('couvre la base ET les variantes — rien ne passe entre les mailles', () => {
    const ids = banded.map(u => u.id)
    expect(ids).toContain('deplacement')          // la base : 🚶 Marche, 4️⃣ 🌕
    expect(ids).toContain('deplacement/course')   // la variante : 🏃 Course, 6️⃣ 🌕💧
  })
})
