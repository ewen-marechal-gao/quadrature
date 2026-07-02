/**
 * Adversary runtime state and the body-part health model.
 *
 * Unlike a player character (single wound pool + end-of-round conversion), an
 * adversary's vitality lives in named body PARTS, each with its own armor and
 * one or more capability BLOCKS (§ Santé et parties du corps):
 *
 *  - 💢 light wounds are reduced by the part's armor (minimum 1 gets through)
 *    and fill blocks top → bottom; a full block is destroyed → its capability
 *    is lost. There is NO 💢→💔 conversion at round end.
 *  - 💔 a heavy wound destroys one whole block (the top-most intact one)…
 *  - …unless 🍀 Evasion is spent: one token turns the 💔 into 3 💢 (themselves
 *    armor-reduced) applied to the part instead (§ Évasion).
 *
 * Capabilities are read from INTACT blocks: the active deck (grantsCard), per-card
 * cost overrides (cardCost), regenerating resources (resource/amount, refilled at
 * round start), and passive immunities (immunity).
 *
 * Defeat is driven by Fatigue 💧 (the death clock), buffered by 🫁 Endurance
 * (spent before permanent fatigue). Destroying every part does not itself kill.
 *
 * All functions are pure: they return a new state and never mutate the input.
 */

import type { AdversarySheet, AdversaryPart, AdversaryCardDef, AdversaryResource, PartTag } from './types'

// ─── Mental track (3-state, simplified vs the player's 7) ─────────────────────

/** Simplified mental track: 😠 Enragé · 😐 Concentré · 😬 Paniqué. */
export type AdversaryMental = 'enraged' | 'focused' | 'panicked'
const MENTAL_TRACK: AdversaryMental[] = ['enraged', 'focused', 'panicked']

/** Default action points ⚫ per round when the sheet does not specify (kit not yet modelled). */
export const DEFAULT_ADVERSARY_ACTIONS = 2

// ─── Runtime state ────────────────────────────────────────────────────────────

/** A block's live state: capacity, current marks, and what it confers. */
export interface BlockState {
  cases:  number
  damage: number
  grant:  AdversaryPart['blocks'][number]['grants']
}

/** A part's live state (blocks in destruction order, top → bottom). */
export interface PartState {
  type:   string
  name:   string
  tag?:   PartTag
  armor:  number
  blocks: BlockState[]
}

/** Full mutable state of an adversary during a fight. */
export interface AdversaryCombatant {
  id:    string
  /** Immutable source sheet — never modified. */
  sheet: AdversarySheet
  parts:    PartState[]
  /** Weapons behave mechanically like parts (own armor + capability blocks). */
  weapons:  PartState[]
  /** Fatigue marks on the death clock (0 … sheet.fatigue). */
  fatigue:  number
  /** 🫁 Endurance buffer remaining this round (spent before permanent fatigue). */
  endurance: number
  /** 🍀 Evasion tokens remaining this round. */
  evasion:   number
  /** ◇ Stability tokens remaining (absorb mental shifts before the track moves). */
  stability: number
  mentalState: AdversaryMental
  /** Action points ⚫ remaining this round (no reaction ⚡ economy for adversaries). */
  actions:   number
}

// ─── Block / part predicates ──────────────────────────────────────────────────

/** A block is destroyed once all its cases are marked. */
export function isBlockDestroyed(b: BlockState): boolean {
  return b.damage >= b.cases
}

/** A part is destroyed when it has blocks and all of them are destroyed. */
export function isPartDestroyed(p: PartState): boolean {
  return p.blocks.length > 0 && p.blocks.every(isBlockDestroyed)
}

/** Every block across parts + weapons (used for capability derivation). */
function allBlocks(c: AdversaryCombatant): BlockState[] {
  return [...c.parts, ...c.weapons].flatMap(p => p.blocks)
}

// ─── Initialisation ─────────────────────────────────────────────────────────

function initPart(p: AdversaryPart): PartState {
  return {
    type:   p.type,
    name:   p.name,
    ...(p.tag && { tag: p.tag }),
    armor:  p.armor,
    blocks: p.blocks.map(b => ({ cases: b.cases, damage: 0, grant: b.grants })),
  }
}

/**
 * Build a fresh combatant from a sheet: all blocks intact, no fatigue, resources
 * filled to what the intact blocks grant, mental state Concentré.
 */
export function initAdversary(sheet: AdversarySheet): AdversaryCombatant {
  const base: AdversaryCombatant = {
    id:          sheet.id,
    sheet,
    parts:       sheet.parts.map(initPart),
    weapons:     sheet.weapons.map(initPart),
    fatigue:     0,
    endurance:   0,
    evasion:     0,
    stability:   0,
    mentalState: 'focused',
    actions:     0,
  }
  return startRound(base)
}

/** Base action points ⚫ granted each round (sheet override, else the default). */
export function baseActions(c: AdversaryCombatant): number {
  return c.sheet.actions ?? DEFAULT_ADVERSARY_ACTIONS
}

// ─── Resources (round start) ──────────────────────────────────────────────────

/** Total of a regenerating resource conferred by all INTACT blocks. */
export function grantedResource(c: AdversaryCombatant, resource: AdversaryResource): number {
  return allBlocks(c).reduce((sum, b) => {
    if (isBlockDestroyed(b) || b.grant.resource !== resource) return sum
    return sum + (b.grant.amount ?? 1)
  }, 0)
}

/**
 * Start-of-round refresh: regenerating resources are replenished to what the
 * currently-intact blocks grant (destroying the granting part cuts the buffer).
 */
export function startRound(c: AdversaryCombatant): AdversaryCombatant {
  return {
    ...c,
    stability: grantedResource(c, 'stability'),
    endurance: grantedResource(c, 'endurance'),
    evasion:   grantedResource(c, 'evasion'),
    actions:   baseActions(c),
  }
}

// ─── Capability derivation (from intact blocks) ───────────────────────────────

/**
 * The cards currently playable. A card gated by one or more blocks (grantsCard)
 * is available while at least one such block is intact; a card referenced by no
 * block is innate (always available).
 */
export function activeDeck(c: AdversaryCombatant): AdversaryCardDef[] {
  const blocks = allBlocks(c)
  return c.sheet.cards.filter(card => {
    const gating = blocks.filter(b => b.grant.grantsCard === card.id)
    return gating.length === 0 || gating.some(b => !isBlockDestroyed(b))
  })
}

/**
 * The current ⚫ cost of a card, in action points. An intact block may override
 * the base cost (cardCost); once that block is destroyed the base cost returns.
 */
export function cardCost(c: AdversaryCombatant, cardId: string): number {
  const base = c.sheet.cards.find(k => k.id === cardId)
  const override = allBlocks(c).find(
    b => !isBlockDestroyed(b) && b.grant.cardCost?.card === cardId,
  )
  if (override) return override.grant.cardCost!.cost
  return base ? base.cost : 0
}

/** True if an intact block grants immunity to the given status (e.g. knockdown). */
export function hasImmunity(c: AdversaryCombatant, status: string): boolean {
  return allBlocks(c).some(b => !isBlockDestroyed(b) && b.grant.immunity === status)
}

/** True if the card is currently in the deck and its cost fits the remaining ⚫. */
export function canPlayCard(c: AdversaryCombatant, cardId: string): boolean {
  return activeDeck(c).some(k => k.id === cardId) && cardCost(c, cardId) <= c.actions
}

/** Spend a card's current ⚫ cost from the remaining action points (floor 0). */
export function spendCardCost(c: AdversaryCombatant, cardId: string): AdversaryCombatant {
  return { ...c, actions: Math.max(0, c.actions - cardCost(c, cardId)) }
}

// ─── Damage to a part ─────────────────────────────────────────────────────────

/** Light wounds through the part's armor: at least 1 always lands (§ minimum 1). */
function armorReduced(part: PartState, light: number): number {
  return light > 0 ? Math.max(1, light - part.armor) : 0
}

/** Fill a part's blocks with light wounds, top → bottom; overflow is lost. */
function fillBlocks(part: PartState, amount: number): void {
  let remaining = amount
  for (const b of part.blocks) {
    if (remaining <= 0) break
    if (isBlockDestroyed(b)) continue
    const put = Math.min(b.cases - b.damage, remaining)
    b.damage += put
    remaining -= put
  }
}

/** Destroy the top-most intact block of a part (a heavy wound 💔). */
function destroyTopBlock(part: PartState): void {
  const b = part.blocks.find(x => !isBlockDestroyed(x))
  if (b) b.damage = b.cases
}

/**
 * Apply damage to a declared part.
 *
 * Light wounds are armor-reduced (min 1) and fill blocks top → bottom. Each
 * heavy wound destroys the top intact block — unless an 🍀 Evasion token is
 * available, in which case it is spent to convert that 💔 into 3 💢 (also
 * armor-reduced) applied to the part instead.
 *
 * @returns the new state (input is not mutated).
 */
export function damagePart(
  c:        AdversaryCombatant,
  partType: string,
  wounds:   { light?: number; heavy?: number },
): AdversaryCombatant {
  const next = structuredClone(c)
  const part = [...next.parts, ...next.weapons].find(p => p.type === partType)
  if (!part) return next  // unknown part → no effect

  let light = wounds.light ?? 0
  let heavy = wounds.heavy ?? 0

  // Evasion converts heavy wounds (while tokens last) into armor-reduced light.
  while (heavy > 0 && next.evasion > 0) {
    next.evasion -= 1
    heavy -= 1
    light += 3
  }

  fillBlocks(part, armorReduced(part, light))
  for (let i = 0; i < heavy; i++) destroyTopBlock(part)

  return next
}

// ─── Fatigue ──────────────────────────────────────────────────────────────────

/**
 * Add fatigue 💧. Endurance 🫁 tokens absorb it first; only the remainder marks
 * the permanent death clock (capped at the sheet's fatigue size).
 */
export function addAdversaryFatigue(c: AdversaryCombatant, amount: number): AdversaryCombatant {
  const absorbed  = Math.min(c.endurance, amount)
  const permanent = amount - absorbed
  return {
    ...c,
    endurance: c.endurance - absorbed,
    fatigue:   Math.min(c.sheet.fatigue, c.fatigue + permanent),
  }
}

// ─── Mental track ──────────────────────────────────────────────────────────────

/**
 * Shift the mental track. `delta` < 0 moves toward Peur (Paniqué, 🔻), > 0 toward
 * Colère (Enragé, 🔺). Each single step is first absorbed by a ◇ Stability token
 * (§ Ténacité); only when none remain does the track actually move (clamped).
 */
export function shiftAdversaryMental(c: AdversaryCombatant, delta: number): AdversaryCombatant {
  let stability = c.stability
  let idx = MENTAL_TRACK.indexOf(c.mentalState)
  const step = delta < 0 ? 1 : -1   // toward panicked (+idx) for 🔻, toward enraged (−idx) for 🔺
  for (let n = Math.abs(delta); n > 0; n--) {
    if (stability > 0) { stability -= 1; continue }
    idx = Math.max(0, Math.min(MENTAL_TRACK.length - 1, idx + step))
  }
  return { ...c, stability, mentalState: MENTAL_TRACK[idx] }
}

// ─── Defeat ─────────────────────────────────────────────────────────────────

/**
 * Out of combat when the fatigue death clock is full (§ Fatigue), or when every
 * body part is destroyed (§ Santé : « la créature reste en jeu tant que toutes
 * ses parties ne sont pas détruites »). Weapons do not count — losing equipment
 * never incapacitates.
 */
export function isAdversaryDefeated(c: AdversaryCombatant): boolean {
  if (c.fatigue >= c.sheet.fatigue) return true
  const damageable = c.parts.filter(p => p.blocks.length > 0)
  return damageable.length > 0 && damageable.every(isPartDestroyed)
}

// ─── Log helper ───────────────────────────────────────────────────────────────

/** Compact snapshot of an adversary's vitals at a single point in time. */
export interface AdversarySnapshot {
  id:          string
  fatigue:     number
  /** Size of the fatigue death clock (sheet.fatigue). */
  fatigueMax:  number
  endurance:   number
  evasion:     number
  stability:   number
  mentalState: AdversaryMental
  /** Per-part damage: marked cases / total cases, and destroyed flag. */
  parts: Array<{ type: string; marked: number; total: number; destroyed: boolean }>
}

/** Produce a compact AdversarySnapshot suitable for round-end logging. */
export function toAdversarySnapshot(c: AdversaryCombatant): AdversarySnapshot {
  return {
    id:          c.id,
    fatigue:     c.fatigue,
    fatigueMax:  c.sheet.fatigue,
    endurance:   c.endurance,
    evasion:     c.evasion,
    stability:   c.stability,
    mentalState: c.mentalState,
    parts: [...c.parts, ...c.weapons].map(p => ({
      type:      p.type,
      marked:    p.blocks.reduce((s, b) => s + b.damage, 0),
      total:     p.blocks.reduce((s, b) => s + b.cases, 0),
      destroyed: isPartDestroyed(p),
    })),
  }
}
