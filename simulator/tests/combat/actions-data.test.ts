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

/**
 * Toutes les actions du fichier — DÉRIVÉES, jamais listées à la main.
 *
 * Cette liste a été codée en dur, et six actions ajoutées après coup (les deux
 * tirs, les deux sociales, la Frappe opportuniste) ont traversé le garde-fou sans
 * être vues : c'est ce qui a laissé passer un Tir ciblé à l'initiative 8 côté
 * moteur pour 7 côté vault. Une action qui existe DOIT être vérifiée.
 */
const ALL_IDS = Object.keys(readRawPlayerActions()) as ActionId[]

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

interface VaultOption { id: string; nom?: string; initiative?: number; cout?: string; effet?: string }
interface VaultCard {
  id: string; nom: string; initiative?: number; cout?: string
  /** Options : une carte est du matériel, une action est une règle — pas 1↔1. */
  options?: VaultOption[]
}

function loadVaultCards(): Map<string, VaultCard> {
  const dir = path.resolve(path.dirname(PLAYER_ACTIONS_FILE), '..', 'rules', 'fr', 'cartes')
  const cards = new Map<string, VaultCard>()
  // Les TROIS jeux de cartes : oublier reactions_defense.yaml rendait toute
  // réaction ⚡ invérifiable (elle n'a pas de carte dans les deux autres).
  for (const file of ['actions_universelles.yaml', 'actions_avancees.yaml', 'reactions_defense.yaml']) {
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

    // Une action du moteur vise une UNITÉ JOUABLE : la carte elle-même, ou l'une
    // de ses options quand elle en porte (`vaultOption`). C'est le lien matériel
    // → règle, qui n'est pas 1↔1.
    const unit = action!.vaultOption
      ? card!.options?.find(o => o.id === action!.vaultOption)
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
 * une carte à effets multiples en donne une par option qui redéfinit son coût.
 *
 * L'aplatissement est ce qui compte : sans lui, une option ne porte ni `cout` ni
 * `initiative` à la racine de la carte et traverse le lint sans être vue — un
 * faux vert, deja constate deux fois sur ce chantier.
 */
function playableUnits(): Array<{ id: string; initiative: number; cout: string }> {
  const out: Array<{ id: string; initiative: number; cout: string }> = []
  for (const c of loadVaultCards().values()) {
    // La carte ET ses options : la pastille imprimée est une unité jouable à
    // part entière, et n'importe laquelle des deux peut dériver.
    if (c.cout && c.initiative != null) {
      out.push({ id: c.id, initiative: c.initiative, cout: c.cout })
    }
    for (const m of c.options ?? []) {
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

  it('couvre la carte ET ses options — rien ne passe entre les mailles', () => {
    const ids = banded.map(u => u.id)
    expect(ids).toContain('deplacement')          // la pastille : 4️⃣ 🌕
    expect(ids).toContain('deplacement/course')   // l'option : 🏃 Course, 6️⃣ 🌕💧
  })

  it("l'initiative citée dans la prose d'une option colle à sa donnée", () => {
    // La prose est ecrite a la main (choix assume) : ce garde-fou ne contraint
    // rien — une prose muette reste valide — mais supprime la divergence des que
    // l'autrice ecrit le chiffre.
    for (const c of loadVaultCards().values()) {
      for (const o of c.options ?? []) {
        const cite = /initiative de (\d)/.exec(o.effet ?? '')
        if (cite && o.initiative != null) {
          expect(`${c.id}/${o.id}: ${cite[1]}`).toBe(`${c.id}/${o.id}: ${o.initiative}`)
        }
      }
    }
  })
})
