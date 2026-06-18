export type {
  MentalState, StatusEffect, ActionCost,
  ActionId, GuardId,
  CombatantState, CombatEffect,
  ResolvedAction,
  CombatantSnapshot,
  ActionLogEntry, PhaseLog, MaintenanceEntry, RoundLog,
  CombatantSummary, CombatOutcome, CombatLog,
} from './types'
export { MENTAL_STATES } from './types'

export {
  initCombatant,
  resetRoundTokens,
  resetRoundTokensWithLog,
  spendActionCost,
  effChar,
  resistanceThreshold,
  applyLightWounds,
  applyHeavyWound,
  processRoundEnd,
  healLightWounds,
  addFatigue,
  removeFatigue,
  shiftMentalState,
  addStatus,
  removeStatus,
  addReaction,
  spendReaction,
  isDefeated,
  snapshotCombatant,
  applyEffectToState,
  applyEffects,
  toCombatantSnapshot,
} from './combatant'

export type { PlannedAction, GuardProvider } from './round'
export { resolveRound, resolveRoundWaves } from './round'

export type { ActionDef, GuardDef, ActionContext } from './actions'
export {
  ACTION_DEFS,
  GUARD_DEFS,
  rollParamsFrom,
  resolveAction,
  canUseAction,
  canAffordAction,
  canUseGuard,
  availableGuards,
} from './actions'

export type { StatusDef } from './status'
export { STATUS_DEFS } from './status'

export type { AgentPersona, AgentConfig } from './agent'
export { planNextAction, planRound, planRoundAI, makeGuardProvider } from './agent'
