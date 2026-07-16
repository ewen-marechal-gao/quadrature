/**
 * Combatant state management for the Quadrature combat module.
 *
 * All functions are pure (return new state, never mutate in place).
 * Use `snapshotCombatant` before resolving a simultaneous initiative group.
 *
 * Status-effect lifecycle (stunned, knockdown, winded, hemorrhage, incapacitated)
 * is driven by STATUS_DEFS hooks — no status name is hardcoded here.
 */

import type { Character, CharacteristicName } from '../character/types'
import type {
  CombatantState, StatusEffect, MentalState,
  CombatEffect, CombatantSnapshot, ActionCost, MaintenanceEntry,
} from './types'
import { STATUS_DEFS } from './status'
import { applyMove } from './position'
import { PHYSICAL_CHARACTERISTICS } from '../character/data'
import { MENTAL_STATES } from './types'
import { roll, buildPool } from '../dieSystem'

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Create a fresh CombatantState from a Character sheet.
 * Starting mental state is 'focused'; reactions = reactivity skill; actions = 3.
 */
export function initCombatant(char: Character): CombatantState {
  const reactivity = char.skills.reactivity
  const base: CombatantState = {
    id:                char.name,
    char,
    characteristics:   structuredClone(char.characteristics),
    skills:            structuredClone(char.skills),
    lightWounds:       0,
    heavyWounds:       0,
    fatigue:           1,   // § Fatigue : débute à 1, jamais sous 1
    mentalState:       'focused',
    stability:         0,   // set below via stabilityPool (needs the built state)
    bleed:             0,
    status:            [],
    protection:        char.protection ?? 0,
    tempProtection:    0,
    actions:           3,
    firstActionPlayed: false,
    lastActionPlayed:  false,
    reactions:         reactivity,
    maxReactions:      reactivity,
  }
  return { ...base, stability: stabilityPool(base) }
}

/**
 * Stability ◇ pool (§ Stabilité = Ténacité ✪ + Discipline ✫).
 * Combat-long buffer against mental shocks, set once at initialisation. It does
 * not regenerate between rounds (no recovery rule yet).
 */
export function stabilityPool(state: CombatantState): number {
  return effChar(state, 'tenacity') + state.skills.discipline
}

/**
 * Reset action economy at the start of a new round.
 *
 * Token restoration:
 *  - Base: 3 PA (🟢⚫🔴)
 *  - Each active status whose onTokenReset returns a penalty subtracts PA
 *    and is optionally cleared (e.g. stunned, knockdown).
 *  - 'focused' mental state grants +1 reaction above the normal cap.
 *
 * Note: statuses without onTokenReset (winded, incapacitated, hemorrhage)
 * are intentionally left untouched here.
 */
export function resetRoundTokens(state: CombatantState): CombatantState {
  let actionPenalty = 0
  let newStatus     = [...state.status]

  for (const statusId of state.status) {
    const hook = STATUS_DEFS[statusId]?.onTokenReset
    if (!hook) continue
    const { actionPenalty: penalty, clear } = hook(state)
    actionPenalty += penalty
    if (clear) newStatus = newStatus.filter(s => s !== statusId)
  }

  const focusedBonus = MENTAL_STATE_EFFECTS[state.mentalState].bonusReactions

  let s: CombatantState = {
    ...state,
    actions:           Math.max(0, 3 - actionPenalty),
    firstActionPlayed: false,
    lastActionPlayed:  false,
    status:            newStatus,
    reactions:         state.maxReactions + focusedBonus,
    // NB : ◇ Stabilité n'est PAS rechargé chaque manche — c'est un pool de
    // combat (§ Stabilité) fixé à l'initialisation, qui se dépense et ne se
    // régénère pas (aucune règle de récupération pour l'instant).
  }

  // ── Test d'Endurance (phase d'entretien) ────────────────────────────────────
  // Déclenché si fatigue ≥ 10 et personnage non incapacité.
  // 🎲 Endurance🟨🟨 + Vigueur🟦 vs DD = fatigue
  // ✅ Succès : récupère (1 + Endurance)💧
  // ❌ Échec   : gagne l'état Essoufflé 😮‍💨
  if (s.fatigue >= 10 && !isDefeated(s)) {
    const statusDisadvantages = s.status.reduce(
      (sum, id) => sum + (STATUS_DEFS[id]?.rollDisadvantage ?? 0),
      0,
    )
    const enduranceRoll = roll(buildPool({
      characteristic: effChar(s, 'vigor'),
      skill:          s.skills.endurance,
      ...(statusDisadvantages > 0 ? { disadvantages: statusDisadvantages } : {}),
    }))
    if (enduranceRoll.total >= s.fatigue) {
      s = removeFatigue(s, 1 + s.skills.endurance)
    } else {
      s = addStatus(s, 'winded')
    }
  }

  return s
}

/**
 * Same as resetRoundTokens but also returns a MaintenanceEntry when a fatigue
 * test occurred, so the caller can include it in the round log.
 *
 * resetRoundTokens (state → state) is kept unchanged for backward compatibility
 * with tests and callers that don't need the log entry.
 */
export function resetRoundTokensWithLog(
  state: CombatantState,
): { state: CombatantState; maintenanceEntry: MaintenanceEntry | null } {
  const notes: string[] = []
  let actionPenalty = 0
  let newStatus     = [...state.status]

  for (const statusId of state.status) {
    const hook = STATUS_DEFS[statusId]?.onTokenReset
    if (!hook) continue
    const { actionPenalty: penalty, clear } = hook(state)
    actionPenalty += penalty
    if (clear) newStatus = newStatus.filter(s => s !== statusId)
  }

  const focusedBonus = MENTAL_STATE_EFFECTS[state.mentalState].bonusReactions

  let s: CombatantState = {
    ...state,
    actions:           Math.max(0, 3 - actionPenalty),
    firstActionPlayed: false,
    lastActionPlayed:  false,
    status:            newStatus,
    reactions:         state.maxReactions + focusedBonus,
    // NB : ◇ Stabilité n'est PAS rechargé chaque manche — c'est un pool de
    // combat (§ Stabilité) fixé à l'initialisation, qui se dépense et ne se
    // régénère pas (aucune règle de récupération pour l'instant).
  }

  let maintenanceEntry: MaintenanceEntry | null = null

  /** La fatigue est ≥ 10, test d'endurance */  
  if (s.fatigue >= 10 && !isDefeated(s)) {  

    // Status disadvantages are applied to the endurance test triggered by fatigue
    
    const statusDisadvantages = s.status.reduce(
      (sum, id) => sum + (STATUS_DEFS[id]?.rollDisadvantage ?? 0),
      0,
    )
    const enduranceRoll = roll(buildPool({
      characteristic: effChar(s, 'vigor'),
      skill:          s.skills.endurance,
      ...(statusDisadvantages > 0 ? { disadvantages: statusDisadvantages } : {}),
    }))

    if (enduranceRoll.critical && !enduranceRoll.flaw) {
      s = removeFatigue(s, 1)
      notes.push("✴️ Critique — le personnage récupère immédiatement 1💧 (diminue le DD)")
    }

    if (enduranceRoll.flaw && !enduranceRoll.critical) {
      s = addFatigue(s, 1)
      notes.push('⚠️ Maladresse - le personnage ajoute immédiatement 1💧 (augmente le DD)')
    }

    const threshold = s.fatigue
    const success = enduranceRoll.total >= threshold    
     
    if (success) {
      const recovered = 1 + s.skills.endurance
      s = removeFatigue(s, recovered)
      notes.push(`✅ Récupération — retire ${recovered}💧`)
    } else {      
       s = addStatus(s, 'winded')
      notes.push('❌ Échec — le personnage est Essoufflé 😮‍💨')
    }

    maintenanceEntry = {
      actorId:   s.id,
      roll:      enduranceRoll,
      threshold,
      success,
      notes,
    }
  }

  return { state: s, maintenanceEntry }
}

// ─── Effective values ─────────────────────────────────────────────────────────

/** Effective value of a characteristic: max(0, value − wounds) */
export function effChar(state: CombatantState, name: CharacteristicName): number {
  const c = state.characteristics[name]
  return Math.max(0, c.value - c.wounds)
}

/**
 * Resistance threshold (§ Résistance — prototype).
 * = Vigueur effective seule. Robustesse a été RETIRÉE du seuil : elle restait
 * doublement défensive (seuil + capacité d'armure). Elle ne pèse plus la défense
 * que via l'armure équipée. La conversion 💢→💔 se fait à 3:1 sur l'excédent
 * au-dessus de ce seuil (voir processRoundEnd).
 */
export function resistanceThreshold(state: CombatantState): number {
  return effChar(state, 'vigor')
}

// ─── Action economy ───────────────────────────────────────────────────────────

/**
 * Spend an action cost from the combatant's current economy.
 * Called when an action is committed (before dice rolls).
 * Fatigue cost is treated as damage (uses addFatigue internally).
 */
export function spendActionCost(state: CombatantState, cost: ActionCost): CombatantState {
  let s: CombatantState = {
    ...state,
    actions:           Math.max(0, state.actions - cost.actions),
    firstActionPlayed: true,
  }
  if (cost.endPlayerRound) s = { ...s, lastActionPlayed: true }
  if (cost.reactions > 0)  s = { ...s, reactions: Math.max(0, s.reactions - cost.reactions) }
  // Enragé : +1 fatigue 💧 supplémentaire à chaque action (§ Piste des États Mentaux)
  const mentalFatigue = MENTAL_STATE_EFFECTS[state.mentalState].fatiguePerAction
  const totalFatigue = (cost.fatigue ?? 0) + mentalFatigue
  if (totalFatigue > 0) s = addFatigue(s, totalFatigue)
  return s
}

// ─── Wound application ────────────────────────────────────────────────────────

/** Accumulate n light wounds 💢 */
export function applyLightWounds(state: CombatantState, amount: number): CombatantState {
  return { ...state, lightWounds: state.lightWounds + amount }
}

/**
 * Apply one heavy wound 💔 to a randomly chosen physical characteristic.
 *
 * Protection absorption (unless bypassProtection = true):
 *   - Temporary protection points are consumed first (1 per wound absorbed).
 *   - If tempProtection is exhausted, base protection is consumed next.
 *   - Only when both pools are at 0 does the wound actually land.
 *   - Pass bypassProtection = true for hemorrhage-triggered conversions
 *     (§Hémorragie: ignores armor).
 *
 * Selection: only characteristics that still have remaining capacity (effective
 * value > 0) are eligible. This matches the tabletop intent where each heavy
 * wound actually reduces a characteristic point — it is never wasted on an
 * already-exhausted slot.
 *
 * After applying, checks if ALL physical characteristics have been fully
 * wounded (effective value = 0). If so, applies the 'near-death' status
 * (§ Aux portes de la Mort: the character can no longer act).
 */
export function applyHeavyWound(state: CombatantState, bypassProtection = false): CombatantState {
  // Absorb via temporary protection first, then base protection
  if (!bypassProtection) {
    if (state.tempProtection > 0) {
      return { ...state, tempProtection: state.tempProtection - 1 }
    }
    if (state.protection > 0) {
      return { ...state, protection: state.protection - 1 }
    }
  }

  // Pick from characteristics that still have wound capacity
  const eligible = PHYSICAL_CHARACTERISTICS.filter(name => {
    const c = state.characteristics[name]
    return c.value - c.wounds > 0
  })
  // If all are already exhausted (should not happen outside tests), fall back
  const pool       = eligible.length > 0 ? eligible : PHYSICAL_CHARACTERISTICS
  const targetName = pool[Math.floor(Math.random() * pool.length)]
  const current    = state.characteristics[targetName]
  const newWounds  = current.wounds + 1
  let s: CombatantState = {
    ...state,
    heavyWounds: state.heavyWounds + 1,
    characteristics: {
      ...state.characteristics,
      [targetName]: { ...current, wounds: newWounds },
    },
  }
  // Check "Aux portes de la Mort": all physical characteristics at effective value 0
  if (!s.status.includes('near-death') && !s.status.includes('incapacitated')) {
    const allExhausted = PHYSICAL_CHARACTERISTICS.every(name => {
      const c = s.characteristics[name]
      return c.value - c.wounds <= 0
    })
    if (allExhausted) s = addStatus(s, 'near-death')
  }
  return s
}

/**
 * End-of-round processing (prototype — modèle blessures unifié) :
 *  1. Saignée 🩸 : les jetons décroissent d'abord de la Récupération ✫ (résistance
 *     passive), puis le reste s'ajoute aux blessures légères — ces 💢 percent
 *     l'armure lors de la conversion. Les jetons persistent (décroissent chaque
 *     manche) ; Stabiliser les vide.
 *  2. Conversion 💢→💔 à 3:1 sur l'excédent au-dessus de la Résistance (= Vigueur) :
 *     autant de graves que ⌊excédent / 3⌋, le reste est REPORTÉ (vrai carry-over).
 *     Une conversion alimentée par le saignement perce la Protection 🛡️.
 *  3. Protection temporaire expirée ; hooks de fin de manche.
 */
export function processRoundEnd(state: CombatantState): CombatantState {
  let s = state

  // 1. Saignée 🩸 — décroissance (Récupération) AVANT marquage, puis dépôt en 💢.
  let bledThisRound = 0
  if (s.bleed > 0) {
    const remaining = Math.max(0, s.bleed - s.skills.recovery)
    bledThisRound = remaining
    s = { ...s, bleed: remaining, lightWounds: s.lightWounds + remaining }
  }

  // 2. Conversion 💢→💔 à 3:1 sur l'excédent (§ Résistance).
  const threshold = resistanceThreshold(s)
  const excess = s.lightWounds - threshold
  if (excess >= 3) {
    const heavies = Math.floor(excess / 3)
    // Une saignée active fait percer l'armure aux graves qu'elle engendre.
    const bypass = bledThisRound > 0
    for (let i = 0; i < heavies; i++) s = applyHeavyWound(s, /* bypassProtection = */ bypass)
    s = { ...s, lightWounds: s.lightWounds - heavies * 3 }  // reste reporté
  }

  // 3. Temporary protection expires at round end
  s = { ...s, tempProtection: 0 }

  // 4. Status end-of-round hooks (iterate over original status list to avoid
  //    re-triggering statuses added by hooks within the same tick)
  for (const statusId of state.status) {
    const hook = STATUS_DEFS[statusId]?.onRoundEnd
    if (!hook) continue
    const { effects } = hook(s)
    for (const fx of effects) {
      s = applyEffectToState(s, fx)
    }
  }

  return s
}

// ─── Hémorragie 🩸 (PJ) ─────────────────────────────────────────────────────────

/** Add N cumulative bleed 🩸 tokens. */
export function addBleedPc(state: CombatantState, amount = 1): CombatantState {
  return { ...state, bleed: state.bleed + amount }
}

/** Clear all bleed 🩸 tokens (Stabiliser — soin actif). */
export function clearBleedPc(state: CombatantState): CombatantState {
  return { ...state, bleed: 0 }
}

/** Heal n light wounds (floor 0) */
export function healLightWounds(state: CombatantState, amount: number): CombatantState {
  return { ...state, lightWounds: Math.max(0, state.lightWounds - amount) }
}

// ─── Fatigue ──────────────────────────────────────────────────────────────────

/**
 * Add fatigue 💧 (capped at 20).
 * Reaching 20 triggers incapacitation via the incapacitated status.
 * The status is deduced from STATUS_DEFS: whichever status has incapacitates = true.
 */
export function addFatigue(state: CombatantState, amount: number): CombatantState {
  const newFatigue = Math.min(20, state.fatigue + amount)
  let s = { ...state, fatigue: newFatigue }
  if (newFatigue >= 20) {
    // Add any incapacitating status that is not already present
    for (const [id, def] of Object.entries(STATUS_DEFS)) {
      if (def.incapacitates && !s.status.includes(id as StatusEffect)) {
        s = { ...s, status: [...s.status, id as StatusEffect] }
      }
    }
  }
  return s
}

/** Remove fatigue — § Fatigue : ne descend jamais sous 1. */
export function removeFatigue(state: CombatantState, amount: number): CombatantState {
  return { ...state, fatigue: Math.max(1, state.fatigue - amount) }
}

// ─── Mental state ─────────────────────────────────────────────────────────────

/**
 * Shift one step along the mental track (§ État mental + Stabilité).
 *
 * MENTAL_STATES is ordered enraged(0) … focused(3) … terrified(6):
 *  - 🔻 toward-terror → toward terrified (index +1)
 *  - 🔺 toward-rage   → toward enraged   (index −1)
 *  - toward-focused   → recovery toward 'focused' (index 3) — beneficial
 *
 * A 🔻/🔺 shock is first ABSORBED by a Stability token ◇ when available: the
 * character spends one ◇ instead of moving the track. Recovery (toward-focused)
 * is never buffered.
 */
export function shiftMentalState(
  state:     CombatantState,
  direction: 'toward-terror' | 'toward-rage' | 'toward-focused',
): CombatantState {
  const idx = MENTAL_STATES.indexOf(state.mentalState)

  if (direction === 'toward-focused') {
    const FOCUSED = 3
    const next = idx < FOCUSED ? idx + 1 : idx > FOCUSED ? idx - 1 : idx
    return { ...state, mentalState: MENTAL_STATES[next] }
  }

  // Stability ◇ absorbs the shock before the track moves.
  if (state.stability > 0) {
    return { ...state, stability: state.stability - 1 }
  }

  const step = direction === 'toward-terror' ? 1 : -1
  const next = Math.max(0, Math.min(MENTAL_STATES.length - 1, idx + step))
  return { ...state, mentalState: MENTAL_STATES[next] }
}

/** Mechanical consequences of one mental state (§ Piste des États Mentaux). */
export interface MentalStateEffects {
  /** ⟳ relances par contexte de jet */
  rerolls:          { offensive: number; defensive: number }
  /** 🟥 désavantages par contexte de jet */
  disadvantages:    { offensive: number; defensive: number }
  /** Réactions ⚡ autorisées (gardes actives) */
  canReact:         boolean
  /** 💧 supplémentaire dépensée à chaque action */
  fatiguePerAction: number
  /** ⚡ bonus au début de chaque manche */
  bonusReactions:   number
}

/**
 * SOURCE UNIQUE des effets de la piste mentale, un état = une ligne.
 * Les seuils cumulatifs de la règle (Prudent+ : ⟳ défensif ; Paniqué+ : 🟥
 * offensif ; Agressif- : ⟳ offensif ; Furieux- : 🟥 défensif) sont dépliés en
 * valeurs effectives par état. Tous les sites (jets, réactions, coût d'action,
 * reset de manche) lisent cette table — ne rien coder en dur ailleurs.
 */
export const MENTAL_STATE_EFFECTS: Record<MentalState, MentalStateEffects> = {
  //             ⟳ off  ⟳ déf           🟥 off  🟥 déf              ⚡ réactions      💧/action           ⚡ bonus
  enraged:    { rerolls: { offensive: 1, defensive: 0 }, disadvantages: { offensive: 0, defensive: 1 }, canReact: true,  fatiguePerAction: 1, bonusReactions: 0 },
  furious:    { rerolls: { offensive: 1, defensive: 0 }, disadvantages: { offensive: 0, defensive: 1 }, canReact: true,  fatiguePerAction: 0, bonusReactions: 0 },
  aggressive: { rerolls: { offensive: 1, defensive: 0 }, disadvantages: { offensive: 0, defensive: 0 }, canReact: true,  fatiguePerAction: 0, bonusReactions: 0 },
  focused:    { rerolls: { offensive: 0, defensive: 0 }, disadvantages: { offensive: 0, defensive: 0 }, canReact: true,  fatiguePerAction: 0, bonusReactions: 1 },
  cautious:   { rerolls: { offensive: 0, defensive: 1 }, disadvantages: { offensive: 0, defensive: 0 }, canReact: true,  fatiguePerAction: 0, bonusReactions: 0 },
  panicked:   { rerolls: { offensive: 0, defensive: 1 }, disadvantages: { offensive: 1, defensive: 0 }, canReact: true,  fatiguePerAction: 0, bonusReactions: 0 },
  terrified:  { rerolls: { offensive: 0, defensive: 1 }, disadvantages: { offensive: 1, defensive: 0 }, canReact: false, fatiguePerAction: 0, bonusReactions: 0 },
}

/** Roll modifiers (⟳ relances / 🟥 désavantages) for one roll context. */
export function mentalRollModifiers(
  state:   MentalState,
  context: 'offensive' | 'defensive',
): { rerolls: number; disadvantages: number } {
  const fx = MENTAL_STATE_EFFECTS[state]
  return { rerolls: fx.rerolls[context], disadvantages: fx.disadvantages[context] }
}

/** Terrifié : « Impossible d'effectuer des réactions ⚡ » — gate for active guards. */
export function canReact(state: CombatantState): boolean {
  return MENTAL_STATE_EFFECTS[state.mentalState].canReact
}

/** Degré d'état mental = distance à Concentré (0 = concentré, 3 = enragé/terrifié). Sert au DD des consolidations. */
export function mentalDegree(state: MentalState): number {
  return Math.abs(MENTAL_STATES.indexOf(state) - 3)
}

/**
 * Voluntary mental step toward a target index, by `steps`, without ◇ absorption
 * (the character CHOOSES to move — a consolidation action, not a shock).
 * Returns the resulting MentalState.
 */
export function stepMentalToward(from: MentalState, targetIdx: number, steps: number): MentalState {
  const idx = MENTAL_STATES.indexOf(from)
  const next = idx < targetIdx ? Math.min(idx + steps, targetIdx)
             : idx > targetIdx ? Math.max(idx - steps, targetIdx)
             : idx
  return MENTAL_STATES[next]
}

// ─── Status effects ───────────────────────────────────────────────────────────

/**
 * Add a status effect (deduplicates silently).
 * If the status has drainReactions = true, all reaction tokens are set to 0
 * immediately (e.g. Sonné drains reactions at the moment it is applied).
 * If the status has drainActions = N, N action tokens are spent immediately
 * (affects the current round, not deferred to the next).
 */
export function addStatus(state: CombatantState, effect: StatusEffect): CombatantState {
  if (state.status.includes(effect)) return state
  let s = { ...state, status: [...state.status, effect] }
  if (STATUS_DEFS[effect]?.drainReactions) {
    s = { ...s, reactions: 0 }
  }
  const drainAct = STATUS_DEFS[effect]?.drainActions ?? 0
  if (drainAct > 0) {
    s = { ...s, actions: Math.max(0, s.actions - drainAct) }
  }
  return s
}

/** Remove a status effect */
export function removeStatus(state: CombatantState, effect: StatusEffect): CombatantState {
  return { ...state, status: state.status.filter(s => s !== effect) }
}

// ─── Reaction tokens ──────────────────────────────────────────────────────────

/** Add reaction tokens (⚡) */
export function addReaction(state: CombatantState, amount: number): CombatantState {
  return { ...state, reactions: state.reactions + amount }
}

/** Spend one reaction token (floor 0) */
export function spendReaction(state: CombatantState): CombatantState {
  return { ...state, reactions: Math.max(0, state.reactions - 1) }
}

// ─── Defeat check ─────────────────────────────────────────────────────────────

/**
 * Returns true if the combatant can no longer act.
 * Driven by STATUS_DEFS: any active status with incapacitates = true.
 */
export function isDefeated(state: CombatantState): boolean {
  return state.status.some(id => STATUS_DEFS[id]?.incapacitates === true)
}

// ─── Snapshot & effects application ──────────────────────────────────────────

/** Deep clone a CombatantState (used before resolving simultaneous actions) */
export function snapshotCombatant(state: CombatantState): CombatantState {
  return structuredClone(state)
}

/**
 * Apply a single CombatEffect to a CombatantState.
 * Used internally by applyEffects (Map-based) and processRoundEnd (single-state).
 */
export function applyEffectToState(s: CombatantState, effect: CombatEffect): CombatantState {
  switch (effect.kind) {
    case 'light-wound':    return applyLightWounds(s, effect.amount)
    case 'heavy-wound':    return applyHeavyWound(s)
    case 'heal-wounds':    return healLightWounds(s, effect.amount)
    case 'add-fatigue':    return addFatigue(s, effect.amount)
    case 'remove-fatigue': return removeFatigue(s, effect.amount)
    // Hémorragie 🩸 : compteur de jetons (prototype), pas un statut binaire.
    case 'add-status':     return effect.status === 'hemorrhage' ? addBleedPc(s, 1)  : addStatus(s, effect.status)
    case 'remove-status':  return effect.status === 'hemorrhage' ? clearBleedPc(s)   : removeStatus(s, effect.status)
    case 'spend-actions':  return { ...s, actions: Math.max(0, s.actions - effect.amount) }
    case 'add-reaction':        return addReaction(s, effect.amount)
    case 'spend-reaction':      return spendReaction(s)
    case 'shift-mental':        return shiftMentalState(s, effect.direction)
    case 'set-mental':          return { ...s, mentalState: effect.state }
    case 'add-temp-protection': return { ...s, tempProtection: s.tempProtection + effect.amount }
    // ◇ regagné (consolidation) — plafonné à la réserve Ténacité + Discipline.
    case 'add-stability':       return { ...s, stability: Math.min(stabilityPool(s), s.stability + effect.amount) }
    // Assaut mental (Provocation/Intimidation) — symétrique sur les PJ.
    case 'drain-stability':     return { ...s, stability: Math.max(0, s.stability - effect.amount) }
    case 'destabilize':         return s   // le ◇ PJ ne régénère pas → sans effet
    case 'shift-mental-broken': return s.stability > 0 ? s : shiftMentalState(s, effect.direction)
    case 'move':                return applyMove(s, effect.path)
    // Un intent non détendu (rencontre sans plateau) : rien à appliquer.
    case 'move-toward':         return s
  }
}

/**
 * Apply a list of CombatEffects to a map of combatant states.
 * Returns a new map — the original is not modified.
 */
export function applyEffects(
  states:  ReadonlyMap<string, CombatantState>,
  effects: CombatEffect[],
): Map<string, CombatantState> {
  const result = new Map(states)
  for (const effect of effects) {
    const s = result.get(effect.targetId)
    if (!s) continue
    result.set(effect.targetId, applyEffectToState(s, effect))
  }
  return result
}

// ─── Log helper ───────────────────────────────────────────────────────────────

/** Produce a compact CombatantSnapshot suitable for round-end logging */
export function toCombatantSnapshot(state: CombatantState): CombatantSnapshot {
  const charWounds: Partial<Record<CharacteristicName, number>> = {}
  for (const name of Object.keys(state.characteristics) as CharacteristicName[]) {
    const w = state.characteristics[name].wounds
    if (w > 0) charWounds[name] = w
  }
  return {
    id:             state.id,
    lightWounds:    state.lightWounds,
    heavyWounds:    state.heavyWounds,
    fatigue:        state.fatigue,
    mentalState:    state.mentalState,
    stability:      state.stability,
    bleed:          state.bleed,
    status:         [...state.status],
    charWounds,
    protection:     state.protection,
    tempProtection: state.tempProtection,
  }
}

