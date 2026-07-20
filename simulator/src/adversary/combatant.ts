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
import type { Position } from '../combat/position'

// ─── Mental track (4-state, simplified vs the player's 7) ─────────────────────

/**
 * Piste mentale simplifiée SANS centre neutre : deux dispositions douces
 * (Agressif / Prudent, choisies par le meneur en début de combat) encadrées par
 * les deux extrêmes (Enragé / Paniqué). Ordre colère→peur : enraged(0),
 * aggressive(1), cautious(2), panicked(3). Franchir la frontière Agressif|Prudent
 * bascule la disposition ; 🔺 remonte vers la colère, 🔻 descend vers la peur.
 */
export type AdversaryMental = 'enraged' | 'aggressive' | 'cautious' | 'panicked'
const MENTAL_TRACK: AdversaryMental[] = ['enraged', 'aggressive', 'cautious', 'panicked']

/** Disposition de départ (états doux) — le meneur pose « agressive » ou « prudente ». */
export type AdversaryDisposition = 'aggressive' | 'cautious'

/** Display icon per adversary mental state (shared by simulate.ts and stats.ts). */
export const ADVERSARY_MENTAL_ICONS: Record<AdversaryMental, string> = {
  enraged:    '😡',
  aggressive: '😠',
  cautious:   '😟',
  panicked:   '😱',
}

/**
 * Effets mécaniques par état mental (§ Piste mentale des créatures).
 * - `dieRank` : décalage du RANG des dés de menace (⬆ renforce / ⬇ dégrade),
 *   empilé avec les 🟩/🟥 de matchup — le rang plafonne (🟧→⬜→🟫).
 * - `guard`   : modificateur PLAT du seuil de garde (la garde est un nombre fixe).
 * Les états doux sont un pur bonus ; seuls les extrêmes portent la contrepartie.
 */
export const ADVERSARY_MENTAL_EFFECTS: Record<AdversaryMental, { dieRank: number; guard: number }> = {
  enraged:    { dieRank: +1, guard: -2 },
  aggressive: { dieRank: +1, guard:  0 },
  cautious:   { dieRank:  0, guard: +1 },
  panicked:   { dieRank: -2, guard: +1 },
}

/** ⬆/⬇ décalage de rang des dés de menace pour cet état mental. */
export function mentalDieRank(state: AdversaryMental): number {
  return ADVERSARY_MENTAL_EFFECTS[state].dieRank
}

/** ± modificateur plat du seuil de garde pour cet état mental. */
export function mentalGuardMod(state: AdversaryMental): number {
  return ADVERSARY_MENTAL_EFFECTS[state].guard
}

/** Default action points ⚫ per round when the sheet does not specify (kit not yet modelled). */
export const DEFAULT_ADVERSARY_ACTIONS = 2

// ─── Runtime state ────────────────────────────────────────────────────────────

/** A block's live state: capacity, current marks, and what it confers. */
export interface BlockState {
  cases:  number
  damage: number
  name?:  string
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
  /**
   * Sonné 🫨 this round: the creature cannot use reactive defences — its Evasion
   * 🍀 is disabled (heavy wounds land in full). Set when a stun lands, cleared at
   * round start. Parallels a PC losing its reactions ⚡.
   */
  stunned:   boolean
  /**
   * 🩸 Hémorragie : jetons cumulatifs. En fin de manche la créature coche autant
   * de cases ▢ qu'elle a de jetons, en ignorant armure/réduction, sur les blocs
   * les plus entamés d'abord (§ Hémorragie — saignée), PUIS la plaie se referme
   * d'un cran (−1 jeton). Un saignement s'estompe seul sans nouvelle blessure.
   */
  bleed:     number
  /**
   * « Déstabilisé » : la créature ignore son PROCHAIN regain de ◇ au début de
   * manche (posé par Provocation/Intimidation, consommé au startRound). Assèche
   * durablement le ◇ malgré sa régénération.
   */
  destabilized: boolean
  /**
   * Square on the board — optional, exactly like a PC's (§ CombatantState.pos):
   * absent means this encounter has no spatial model. Speeds are NOT stored
   * here; they live on the fiche (`sheet.speed`, walk/run in cases), set by the
   * mutations that shaped the creature's legs.
   */
  pos?: Position
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
    blocks: p.blocks.map(b => ({ cases: b.cases, damage: 0, ...(b.name && { name: b.name }), grant: b.grants })),
  }
}

/**
 * Build a fresh combatant from a sheet: all blocks intact, no fatigue, resources
 * filled to what the intact blocks grant, mental state = disposition de départ.
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
    mentalState: sheet.disposition ?? 'aggressive',
    actions:     0,
    stunned:     false,
    bleed:       0,
    destabilized: false,
  }
  return startRound(base)
}

/**
 * Base action points ⚫ granted each round (sheet override, else the default),
 * minus 1 when Essoufflé — i.e. past half its fatigue clock (§ État mental /
 * Essoufflé : la créature agit moins en s'épuisant). Never below 1.
 */
export function baseActions(c: AdversaryCombatant): number {
  const base = c.sheet.actions ?? DEFAULT_ADVERSARY_ACTIONS
  return Math.max(1, base - (isAdversaryWinded(c) ? 1 : 0))
}

/** Essoufflé 😮‍💨 : past half the fatigue clock (drives the −1 ⚫ in baseActions). */
export function isAdversaryWinded(c: AdversaryCombatant): boolean {
  return c.fatigue > c.sheet.fatigue / 2
}

// ─── Resources (round start) ──────────────────────────────────────────────────

/** Total of a regenerating resource conferred by all INTACT blocks. */
export function grantedResource(c: AdversaryCombatant, resource: AdversaryResource): number {
  return allBlocks(c).reduce((sum, b) => {
    if (isBlockDestroyed(b) || b.grant.resource !== resource) return sum
    return sum + (b.grant.amount ?? 1)
  }, 0)
}

/** Bonus de garde conféré par les blocs INTACTS (détruire le bloc le fait perdre). */
export function grantedGuard(c: AdversaryCombatant): number {
  return allBlocks(c).reduce((sum, b) => {
    if (isBlockDestroyed(b) || b.grant.guard == null) return sum
    return sum + b.grant.guard
  }, 0)
}

/**
 * Garde EFFECTIVE : garde de base de la fiche + bonus des blocs intacts
 * + modificateur d'état mental (Prudent/Paniqué +1, Enragé −2). Plancher à 1.
 * SOURCE UNIQUE du seuil que le PJ doit atteindre pour toucher la créature.
 */
export function effectiveGuard(c: AdversaryCombatant): number {
  return Math.max(1, c.sheet.guard.value + grantedGuard(c) + mentalGuardMod(c.mentalState))
}

/**
 * Start-of-round refresh: regenerating resources are replenished to what the
 * currently-intact blocks grant (destroying the granting part cuts the buffer).
 * « Déstabilisé » saute UNE régénération de ◇ (l'état est alors consommé) :
 * le ◇ asséché par Provocation/Intimidation reste bas la manche suivante.
 */
export function startRound(c: AdversaryCombatant): AdversaryCombatant {
  return {
    ...c,
    stability: c.destabilized ? c.stability : grantedResource(c, 'stability'),
    endurance: grantedResource(c, 'endurance'),
    evasion:   grantedResource(c, 'evasion'),
    actions:   baseActions(c),
    stunned:   false,        // Sonné se dissipe au début de la manche
    destabilized: false,     // « Déstabilisé » consommé (a sauté ce regain de ◇)
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

/**
 * Bonus armor 🛡️ conferred to `targetType` by intact `armorAll` blocks on OTHER
 * parts (e.g. a carapace shields the rest of the body). The source part shields
 * itself with its own armor only — hence the exclusion — and the bonus vanishes
 * when the carrying block is destroyed (crack the shell → the body is exposed).
 */
export function grantedArmorAll(c: AdversaryCombatant, targetType: string): number {
  return [...c.parts, ...c.weapons].reduce((sum, p) => {
    if (p.type === targetType) return sum
    return sum + p.blocks.reduce((s, b) => s + (isBlockDestroyed(b) ? 0 : (b.grant.armorAll ?? 0)), 0)
  }, 0)
}

/** Base fatigue cost 💧 of a card (innate — no block override). */
export function cardFatigueCost(c: AdversaryCombatant, cardId: string): number {
  return c.sheet.cards.find(k => k.id === cardId)?.fatigueCost ?? 0
}

/**
 * True if the card is in the deck, its ⚫ cost fits the remaining actions, and
 * paying its 💧 cost would not fill the death clock — une créature ne peut pas
 * se mettre hors de combat en agissant.
 */
export function canPlayCard(c: AdversaryCombatant, cardId: string): boolean {
  if (!activeDeck(c).some(k => k.id === cardId)) return false
  if (cardCost(c, cardId) > c.actions) return false
  const permanent = Math.max(0, cardFatigueCost(c, cardId) - c.endurance)
  return c.fatigue + permanent < c.sheet.fatigue
}

/** Spend a card's ⚫ and 💧 costs (💧 fully absorbable by the 🫁 buffer). */
export function spendCardCost(c: AdversaryCombatant, cardId: string): AdversaryCombatant {
  const spent = { ...c, actions: Math.max(0, c.actions - cardCost(c, cardId)) }
  return spendAdversaryFatigueCost(spent, cardFatigueCost(c, cardId))
}

// ─── Damage to a part ─────────────────────────────────────────────────────────

/** Light wounds through armor: at least 1 always lands (§ minimum 1). */
function armorReduced(armor: number, light: number): number {
  return light > 0 ? Math.max(1, light - armor) : 0
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
 * Apply damage to a declared part. Chaîne défensive, dans l'ordre :
 *
 *  1. 🍀 **Évasion** (défense réactive, rare — désactivée si Sonné 🫨) : chaque
 *     jeton convertit une 💔 en 3 💢 (le coup ripe).
 *  2. 🛡️ **Armure** (§ Armure à cases) : chaque 💔 restante est **annulée** —
 *     mais l'encaisser **détruit un point d'armure** de la partie (la plaque
 *     cède). L'armure ne se régénère PAS : c'est une défense d'attrition.
 *  3. 💢 réduites par l'armure **restante** (+ `armorAll` des blocs intacts
 *     d'autres parties), minimum 1 qui passe. Une armure entamée protège donc
 *     moins des 💢 : craquer la cuirasse ouvre les DEUX canaux à la fois.
 *  4. Les 💔 non absorbées détruisent chacune le bloc intact du dessus.
 *
 * Note : le bonus `armorAll` (carapace) ne réduit que les 💢 — seule l'armure
 * PROPRE de la partie, celle qui porte les cases, encaisse une 💔.
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

  // 1. Évasion : convertit la 💔 en 3 💢 (tant qu'il reste des jetons).
  while (heavy > 0 && next.evasion > 0 && !next.stunned) {
    next.evasion -= 1
    heavy -= 1
    light += 3
  }

  // 2. Armure : annule la 💔 en cédant un point (la plaque se détruit).
  while (heavy > 0 && part.armor > 0) {
    part.armor -= 1
    heavy -= 1
  }

  // 3. 💢 réduites par l'armure RESTANTE + le bonus des carapaces intactes.
  const effectiveArmor = part.armor + grantedArmorAll(next, part.type)
  fillBlocks(part, armorReduced(effectiveArmor, light))
  for (let i = 0; i < heavy; i++) destroyTopBlock(part)

  return next
}

// ─── Hémorragie 🩸 ──────────────────────────────────────────────────────────────

/** Add N cumulative bleed 🩸 tokens (each marks one case at round end). */
export function addBleed(c: AdversaryCombatant, amount = 1): AdversaryCombatant {
  return { ...c, bleed: c.bleed + amount }
}

/**
 * End-of-round bleed: mark `bleed` cases ▢ across the creature, ignoring armor,
 * on the MOST-wounded intact block first (§ Hémorragie — saignée : concentre les
 * pertes vers la destruction). A block filled this way is destroyed (capability
 * lost). La plaie se referme d'UN cran par manche (−1 jeton) : un saignement
 * récent continue de couler puis s'estompe si la créature n'est pas re-blessée.
 */
export function bleedTick(c: AdversaryCombatant): AdversaryCombatant {
  if (c.bleed <= 0) return c
  const next = structuredClone(c)
  const blocks = [...next.parts, ...next.weapons].flatMap(p => p.blocks)
  for (let i = 0; i < next.bleed; i++) {
    // Most-wounded intact block (highest damage, then most nearly full).
    const target = blocks
      .filter(b => !isBlockDestroyed(b))
      .sort((a, b) => b.damage - a.damage || (b.cases - b.damage) - (a.cases - a.damage))[0]
    if (!target) break   // no intact block left — the bleed has nowhere to land
    target.damage += 1
  }
  next.bleed = Math.max(0, next.bleed - 1)   // la plaie se referme d'un cran par manche
  return next
}

// ─── Fatigue ──────────────────────────────────────────────────────────────────

/** Core: spend 🫁 first, then mark the clock; `minThrough` cases always land. */
function applyFatigue(c: AdversaryCombatant, amount: number, minThrough: number): AdversaryCombatant {
  if (amount <= 0) return c
  const absorbed  = Math.min(c.endurance, amount - minThrough)
  const permanent = amount - absorbed
  return {
    ...c,
    endurance: c.endurance - absorbed,
    fatigue:   Math.min(c.sheet.fatigue, c.fatigue + permanent),
  }
}

/**
 * Fatigue 💧 SUBIE (attaques). L'Endurance 🫁 absorbe d'abord, mais au moins
 * 1💧 marque toujours l'horloge — le « tampon poreux », miroir du « minimum 1 »
 * de l'armure : le harcèlement progresse toujours, le burst reste récompensé.
 */
export function addAdversaryFatigue(c: AdversaryCombatant, amount: number): AdversaryCombatant {
  return applyFatigue(c, amount, 1)
}

/**
 * Coût en 💧 d'une action de la créature (carte à fatigueCost). Absorbable
 * INTÉGRALEMENT par les 🫁 : agir en étant frais est gratuit — mais le tampon
 * brûlé n'absorbe plus les attaques de fatigue de la manche.
 */
export function spendAdversaryFatigueCost(c: AdversaryCombatant, amount: number): AdversaryCombatant {
  return applyFatigue(c, amount, 0)
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
  /** 🫁 Endurance restante ce round (tampon de fatigue). */
  endurance:   number
  /** 🫁 Endurance maximale (rechargée chaque manche par les blocs intacts). */
  enduranceMax: number
  evasion:     number
  /** ◇ Stabilité restante. */
  stability:   number
  /** ◇ Stabilité maximale (conférée par les blocs intacts). */
  stabilityMax: number
  mentalState: AdversaryMental
  /** Sonné 🫨 this round (Evasion 🍀 disabled). */
  stunned:     boolean
  /** Essoufflé 😮‍💨 : past half the fatigue clock (−1 ⚫). */
  winded:      boolean
  /** 🩸 Jetons d'hémorragie cumulés (cases cochées en fin de manche). */
  bleed:       number
  /** « Déstabilisé » : sautera son prochain regain de ◇. */
  destabilized: boolean
  /** 🛡️ Armure totale restante (somme sur les parties, consommée par les 💔). */
  armorTotal:  number
  /** Per-part damage: marked/total cases, destroyed flag, remaining armor, and what it confers. */
  parts: Array<{ type: string; marked: number; total: number; destroyed: boolean; armor: number; confers: string[] }>
}

/** Produce a compact AdversarySnapshot suitable for round-end logging. */
/**
 * Ce qu'une partie « confère » — résumé lisible des grants de ses blocs (pour
 * l'onOver des parties : voir ce qu'on perd quand elle tombe). Chaîne pré-formée
 * ici pour que le snapshot soit auto-suffisant côté affichage.
 */
export function partConfers(part: PartState): string[] {
  const out: string[] = []
  for (const b of part.blocks) {
    const g = b.grant
    if (g.grantsCard)   out.push(`carte ${g.grantsCard}`)
    if (g.resource)     out.push(`${g.amount ?? 1}${g.resource === 'stability' ? '◇' : g.resource === 'endurance' ? '🫁' : '🍀'}`)
    if (g.armorAll)     out.push(`+${g.armorAll}🛡️ (autres parties)`)
    if (g.guard)        out.push(`+${g.guard} garde`)
    if (g.immunity)     out.push(`immunité ${g.immunity}`)
    if (g.cardCost)     out.push(`coût ${g.cardCost.card}→${g.cardCost.cost}⚫`)
    if (g.trait)        out.push(`trait ${g.trait.name}`)
  }
  return out
}

export function toAdversarySnapshot(c: AdversaryCombatant): AdversarySnapshot {
  const allParts = [...c.parts, ...c.weapons]
  return {
    id:          c.id,
    fatigue:     c.fatigue,
    fatigueMax:  c.sheet.fatigue,
    endurance:   c.endurance,
    enduranceMax: grantedResource(c, 'endurance'),
    evasion:     c.evasion,
    stability:   c.stability,
    stabilityMax: grantedResource(c, 'stability'),
    mentalState: c.mentalState,
    stunned:     c.stunned,
    winded:      isAdversaryWinded(c),
    bleed:       c.bleed,
    destabilized: c.destabilized,
    /** Armure totale = somme de l'armure RESTANTE des parties (consommée par les 💔). */
    armorTotal:  allParts.reduce((s, p) => s + p.armor, 0),
    parts: allParts.map(p => ({
      type:      p.type,
      marked:    p.blocks.reduce((s, b) => s + b.damage, 0),
      total:     p.blocks.reduce((s, b) => s + b.cases, 0),
      destroyed: isPartDestroyed(p),
      armor:     p.armor,
      confers:   partConfers(p),
    })),
  }
}
