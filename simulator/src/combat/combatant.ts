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
  return {
    id:                char.name,
    char,
    characteristics:   structuredClone(char.characteristics),
    skills:            structuredClone(char.skills),
    lightWounds:       0,
    heavyWounds:       0,
    fatigue:           0,
    mentalState:       'focused',
    status:            [],
    protection:        char.protection ?? 0,
    tempProtection:    0,
    actions:           3,
    firstActionPlayed: false,
    lastActionPlayed:  false,
    reactions:         reactivity,
    maxReactions:      reactivity,
  }
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

  const focusedBonus = state.mentalState === 'focused' ? 1 : 0

  let s: CombatantState = {
    ...state,
    actions:           Math.max(0, 3 - actionPenalty),
    firstActionPlayed: false,
    lastActionPlayed:  false,
    status:            newStatus,
    reactions:         state.maxReactions + focusedBonus,
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

  const focusedBonus = state.mentalState === 'focused' ? 1 : 0

  let s: CombatantState = {
    ...state,
    actions:           Math.max(0, 3 - actionPenalty),
    firstActionPlayed: false,
    lastActionPlayed:  false,
    status:            newStatus,
    reactions:         state.maxReactions + focusedBonus,
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

/** Resistance threshold: eff(vigor) + robustness skill */
export function resistanceThreshold(state: CombatantState): number {
  return effChar(state, 'vigor') + state.skills.robustness
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
  if ((cost.fatigue ?? 0) > 0) s = addFatigue(s, cost.fatigue!)
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
 * End-of-round processing:
 *  1. Wound overflow: if lightWounds > resistanceThreshold → 1 heavy wound
 *     - Hemorrhage active   → bypasses Protection (§Hémorragie ignores armor)
 *     - No hemorrhage       → heavy wound is absorbed by tempProtection / protection
 *     - Either way, only the excess above the threshold is removed (carry-over rule)
 *  2. Temporary protection expires: any remaining tempProtection cleared to 0
 *  3. Status end-of-round hooks
 *
 * Status hooks are called on the state snapshot from the start of this function
 * so they do not see each other's effects within the same tick.
 */
export function processRoundEnd(state: CombatantState): CombatantState {
  let s = state

  // 1. Wound overflow
  const threshold = resistanceThreshold(s)
  if (s.lightWounds > threshold) {
    // Hémorragie bypasses protection; normal overflow respects it.
    const hasHemorrhage = s.status.includes('hemorrhage')
    s = applyHeavyWound(s, /* bypassProtection = */ hasHemorrhage)
    s = { ...s, lightWounds: threshold }  // only the excess is removed (carry-over)
    if (hasHemorrhage) {
      s = removeStatus(s, 'hemorrhage')   // one 🩸 token consumed per conversion
    }
  }

  // 2. Temporary protection expires at round end
  s = { ...s, tempProtection: 0 }

  // 3. Status end-of-round hooks (iterate over original status list to avoid
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

/** Remove fatigue (floor 0) */
export function removeFatigue(state: CombatantState, amount: number): CombatantState {
  return { ...state, fatigue: Math.max(0, state.fatigue - amount) }
}

// ─── Mental state ─────────────────────────────────────────────────────────────

/** Shift 1 step along the mental state track toward calm (higher index) or rage (lower) */
export function shiftMentalState(
  state:     CombatantState,
  direction: 'toward-terror' | 'toward-rage' | 'toward-focused', 
): CombatantState {

  const level = MENTAL_STATES.indexOf(state.mentalState) - 3
  if (direction === 'toward-focused') {
    const newLevel = level < 0 ? level + 1 : Math.max(0, level - 1)
    return { ...state, mentalState: MENTAL_STATES[newLevel + 3] }
  } else {
    const newLevel = direction === 'toward-terror' ? Math.max(level - 1, -3) : Math.min(level + 1, 3)
    return { ...state, mentalState: MENTAL_STATES[newLevel + 3] }
  }
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
    case 'add-status':     return addStatus(s, effect.status)
    case 'remove-status':  return removeStatus(s, effect.status)
    case 'spend-actions':  return { ...s, actions: Math.max(0, s.actions - effect.amount) }
    case 'add-reaction':        return addReaction(s, effect.amount)
    case 'spend-reaction':      return spendReaction(s)
    case 'shift-mental':        return shiftMentalState(s, effect.direction)
    case 'add-temp-protection': return { ...s, tempProtection: s.tempProtection + effect.amount }
    case 'add-stability':       return s  // ◇ n'existe que sur les adversaires (routé par actor.ts)
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
    status:         [...state.status],
    charWounds,
    protection:     state.protection,
    tempProtection: state.tempProtection,
  }
}

