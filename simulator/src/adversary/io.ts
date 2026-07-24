/**
 * File I/O for adversary fiches (data/bestiary/cards/<id>.card.yaml).
 *
 * These files are GENERATED (tools/consolidate-bestiary.ts) and carry English
 * keys with Locale strings { fr, en? }. The loader resolves display strings to
 * a single locale (fr by default), yielding the plain-string AdversarySheet the
 * engine consumes.
 */

import path         from 'path'
import { readFile, readdir } from 'fs/promises'
import { parse }     from 'yaml'
import type {
  AdversarySheet, AdversaryPart, AdversaryCardDef, AdversaryTraitDef,
  AdversaryGuardType, AdversaryBlockGrant, AdversaryOutcome, AdversaryFivesOutcome,
  AdversaryEffectOp,
} from './types'
import type { AdversaryDie, PowerTier } from './dice'
import type { ActionTrigger } from '../combat/types'
import { localize, type LocalizedString } from '../locale'

// ─── Raw YAML shapes (English keys, Locale strings) ───────────────────────────

interface RawGrant {
  text: LocalizedString | 'auto'
  grantsCard?: string
  cardCost?: { card: string; cost: number }
  resource?: AdversaryBlockGrant['resource']
  amount?: number
  immunity?: string
  armorAll?: number
  guard?: number
}
interface RawBlock { cases: number; name?: LocalizedString; grants: RawGrant }
interface RawPart {
  type: string
  name: LocalizedString
  description?: LocalizedString
  tag?: import('./types').PartTag
  armor: number
  blocks: RawBlock[]
}
interface RawTrait { id?: string; name: LocalizedString; kind: 'passive' | 'active'; effect: LocalizedString }
interface RawOutcome { text: LocalizedString | 'auto'; effect: AdversaryEffectOp[] }
interface RawFivesOutcome extends RawOutcome { count: number }
interface RawCard {
  id: string
  name: LocalizedString
  cost: number
  fatigueCost?: number
  initiative: number
  tags?: import('./types').CardTag[]
  ranged?: boolean
  reach?: number
  /** Déclencheur ⚡ : présent = carte de réaction (gratuite, 1×/manche). */
  trigger?: ActionTrigger
  onSuccess: RawOutcome
  onFailure: RawOutcome
  onFives?: RawFivesOutcome
  note?: LocalizedString
}
interface RawAdversary {
  id: string
  name: LocalizedString
  power: PowerTier
  dice: AdversaryDie[]
  description?: LocalizedString
  guard: { type: AdversaryGuardType; value: number }
  disposition?: import('./combatant').AdversaryDisposition
  speed: { walk: number; run: number }
  fatigue: number
  actions?: number
  parts: RawPart[]
  weapons?: RawPart[]
  traits?: RawTrait[]
  cards: RawCard[]
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/** Resolve outcome/grant display text; the `auto` sentinel resolves to '' (auto-render deferred). */
function resolveText(t: LocalizedString | 'auto', locale: string): string {
  return t === 'auto' ? '' : localize(t, locale)
}

function resolveGrant(g: RawGrant, locale: string): AdversaryBlockGrant {
  return {
    text: resolveText(g.text, locale),
    ...(g.grantsCard && { grantsCard: g.grantsCard }),
    ...(g.cardCost   && { cardCost:   g.cardCost }),
    ...(g.resource   && { resource:   g.resource }),
    ...(g.amount != null && { amount:  g.amount }),
    ...(g.immunity   && { immunity:   g.immunity }),
    ...(g.armorAll != null && { armorAll: g.armorAll }),
    ...(g.guard != null && { guard: g.guard }),
  }
}

function resolveOutcome(o: RawOutcome, locale: string): AdversaryOutcome {
  return { text: resolveText(o.text, locale), effect: o.effect ?? [] }
}

function resolvePart(p: RawPart, locale: string): AdversaryPart {
  return {
    type:        p.type,
    name:        localize(p.name, locale),
    ...(p.description && { description: localize(p.description, locale) }),
    ...(p.tag && { tag: p.tag }),
    armor:       p.armor,
    blocks:      p.blocks.map(b => ({ cases: b.cases, ...(b.name && { name: localize(b.name, locale) }), grants: resolveGrant(b.grants, locale) })),
  }
}

function resolveCard(c: RawCard, locale: string): AdversaryCardDef {
  const fives: AdversaryFivesOutcome | undefined = c.onFives
    ? { ...resolveOutcome(c.onFives, locale), count: c.onFives.count }
    : undefined
  return {
    id:         c.id,
    name:       localize(c.name, locale),
    cost:       c.cost,
    ...(c.fatigueCost != null && { fatigueCost: c.fatigueCost }),
    initiative: c.initiative,
    tags:       c.tags ?? [],
    ...(c.ranged && { ranged: true }),
    ...(c.reach != null && { reach: c.reach }),
    ...(c.trigger && { trigger: c.trigger }),
    onSuccess:  resolveOutcome(c.onSuccess, locale),
    onFailure:  resolveOutcome(c.onFailure, locale),
    ...(fives && { onFives: fives }),
    ...(c.note && { note: localize(c.note, locale) }),
  }
}

function resolveTrait(t: RawTrait, locale: string): AdversaryTraitDef {
  return {
    ...(t.id && { id: t.id }),
    name: localize(t.name, locale), kind: t.kind, effect: localize(t.effect, locale),
  }
}

/** Resolve a raw parsed fiche into an AdversarySheet in the given locale. */
export function resolveAdversary(raw: RawAdversary, locale = 'fr'): AdversarySheet {
  if (!raw?.id) throw new Error('Adversary fiche is missing required field "id"')
  return {
    id:          raw.id,
    name:        localize(raw.name, locale),
    power:       raw.power,
    dice:        raw.dice,
    ...(raw.description && { description: localize(raw.description, locale) }),
    guard:       { type: raw.guard.type, value: raw.guard.value },
    ...(raw.disposition && { disposition: raw.disposition }),
    speed:       raw.speed,
    fatigue:     raw.fatigue,
    ...(raw.actions != null && { actions: raw.actions }),
    parts:       raw.parts.map(p => resolvePart(p, locale)),
    weapons:     (raw.weapons ?? []).map(p => resolvePart(p, locale)),
    traits:      (raw.traits ?? []).map(t => resolveTrait(t, locale)),
    cards:       raw.cards.map(c => resolveCard(c, locale)),
  }
}

// ─── File loading ─────────────────────────────────────────────────────────────

/** Directory holding the generated fiches, relative to the simulator root. */
export const BESTIARY_CARDS_DIR = path.resolve(__dirname, '..', '..', '..', 'data', 'bestiary', 'cards')

/** Parse an adversary fiche from a YAML string. */
export function deserializeAdversary(yamlStr: string, locale = 'fr'): AdversarySheet {
  return resolveAdversary(parse(yamlStr) as RawAdversary, locale)
}

/** Load a single fiche file by absolute path. */
export async function loadAdversaryFile(filePath: string, locale = 'fr'): Promise<AdversarySheet> {
  return deserializeAdversary(await readFile(filePath, 'utf-8'), locale)
}

/** Load a fiche by its id (data/bestiary/cards/<id>.card.yaml). */
export async function loadAdversary(id: string, locale = 'fr'): Promise<AdversarySheet> {
  return loadAdversaryFile(path.join(BESTIARY_CARDS_DIR, `${id}.card.yaml`), locale)
}

/** Load every fiche in the bestiary cards directory, ordered by filename. */
export async function loadAllAdversaries(locale = 'fr'): Promise<AdversarySheet[]> {
  const files = (await readdir(BESTIARY_CARDS_DIR))
    .filter(f => f.endsWith('.card.yaml'))
    .sort()
  return Promise.all(files.map(f => loadAdversaryFile(path.join(BESTIARY_CARDS_DIR, f), locale)))
}
