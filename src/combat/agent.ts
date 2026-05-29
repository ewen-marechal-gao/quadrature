/**
 * Combat agent for the Quadrature simulator.
 *
 * Two implementations are provided:
 *
 * 1. Scripted agent (`planRound`): pure, synchronous, rule-based heuristics.
 *    Each AgentPersona encodes different tactical priorities.
 *    Suitable for automated batch simulations and deterministic baselines.
 *
 * 2. AI agent (`planRoundAI`): async, calls the Claude API via tool_use.
 *    Each persona maps to a different system-prompt "voice", letting Claude
 *    reason about the state and pick an action naturally.
 *    Requires ANTHROPIC_API_KEY in the environment.
 *
 * Both return a `PlannedAction[]` compatible with `resolveRound`.
 * The scripted agent may plan up to three actions per round (depending on PA).
 * The AI agent plans exactly one action per round (simpler and more reliable).
 */

import Anthropic from '@anthropic-ai/sdk'

import type { CombatantState } from './types'
import type { ActionId, GuardId } from './types'
import type { PlannedAction, GuardProvider } from './round'
import { ACTION_DEFS, GUARD_DEFS, canUseAction, canAffordAction, availableGuards } from './actions'
import { spendActionCost, effChar, isDefeated } from './combatant'
import { STATUS_DEFS } from './status'

export type { GuardProvider }

// ─── Public types ─────────────────────────────────────────────────────────────

/** Tactical style that shapes decision-making priorities */
export type AgentPersona = 'aggressive' | 'cautious' | 'opportunist' | 'inexperienced'

export interface AgentConfig {
  /** Tactical style of this combatant */
  persona:  AgentPersona
  /** ID of the primary target (opponent in 1v1) */
  targetId: string
  /**
   * Scenario-level action whitelist.
   * If set and non-empty, only listed actions may be chosen.
   * Absent or empty = no restriction (all valid actions available).
   */
  allowedActions?: ActionId[]
}

// ─── Scripted agent ───────────────────────────────────────────────────────────

/**
 * Plan the next single action for a combatant (scripted, synchronous).
 *
 * Intended for wave-based round loops: called each wave with the current state,
 * returns exactly one PlannedAction (or null if the combatant cannot act).
 *
 * Decision order:
 *  1. Self-care (Respiration / Stabiliser), if warranted by persona
 *  2. Offensive action, if opponent is not defeated
 *  3. null — combatant passes (no PA, or nothing sensible to do)
 */
export function planNextAction(
  self:     CombatantState,
  opponent: CombatantState,
  config:   AgentConfig,
): PlannedAction | null {
  if (isDefeated(self)) return null

  const selfAction = selectSelfAction(self, config)
  if (selfAction !== null) {
    return { actorId: self.id, action: selfAction }
  }

  if (!isDefeated(opponent)) {
    const offAction = selectOffensiveAction(self, opponent, config)
    if (offAction !== null) {
      return { actorId: self.id, action: offAction, targetId: config.targetId }
    }
  }

  return null
}

/**
 * Plan all actions for one combatant's round (scripted, synchronous).
 *
 * Returns 0–3 PlannedActions depending on available PA and strategy.
 * Guard choice is included on every entry; resolveRound uses the first one.
 *
 * Local state is simulated via `spendActionCost` to track resource consumption
 * across multiple planned actions — the real CombatantState is never mutated.
 *
 * Round structure:
 *  Phase A  — Self-targeted action (🟢 first action), if warranted by persona
 *  Phase B  — Primary offensive action
 *  Phase C  — Second offensive action (aggressive / opportunist only)
 *
 * @deprecated Use planNextAction + resolveRoundWaves for wave-based simulation.
 */
export function planRound(
  self:     CombatantState,
  opponent: CombatantState,
  config:   AgentConfig,
): PlannedAction[] {
  if (isDefeated(self)) return []

  const plans: PlannedAction[] = []
  let state = self   // local simulation — real state is never mutated

  // ── Phase A: First-action self-care (🟢) ────────────────────────────────
  const selfAction = selectSelfAction(state, config)
  if (selfAction !== null) {
    plans.push({ actorId: self.id, action: selfAction })
    state = spendActionCost(state, ACTION_DEFS[selfAction].cost)
  }

  // ── Phase B: Primary offensive action ───────────────────────────────────
  const offAction = selectOffensiveAction(state, opponent, config)
  if (offAction !== null) {
    plans.push({ actorId: self.id, action: offAction, targetId: config.targetId })
    state = spendActionCost(state, ACTION_DEFS[offAction].cost)
  }

  // ── Phase C: Second offensive action (if PA allows) ─────────────────────
  if (config.persona === 'aggressive' || config.persona === 'opportunist') {
    const secondAction = selectOffensiveAction(state, opponent, config)
    if (secondAction !== null) {
      plans.push({ actorId: self.id, action: secondAction, targetId: config.targetId })
    }
  }

  return plans
}

/**
 * Build a GuardProvider for a scripted agent.
 *
 * The callback is invoked by resolveRound the first time this combatant is
 * attacked in a round. Guard selection follows the same persona priorities as
 * offensive planning but uses the provided `available` list directly (safe,
 * since resolveRound already filters by canUseGuard).
 */
export function makeGuardProvider(config: AgentConfig): GuardProvider {
  return (_targetId, state, available) => {
    const preferred = selectGuard(state, config.persona)
    return (preferred !== null && available.includes(preferred)) ? preferred : 'absorb'
  }
}

// ─── AI agent ─────────────────────────────────────────────────────────────────

/** Model used for AI decisions. Override via CLAUDE_MODEL env var. */
const AI_MODEL = process.env.CLAUDE_MODEL ?? 'claude-3-5-haiku-20241022'

/**
 * Plan one action for a combatant's round using the Claude API (async).
 *
 * Sends the combat state and available options to Claude as structured context.
 * Uses tool_use to guarantee a valid, parseable response.
 * Falls back to the scripted agent if the API call fails.
 *
 * @throws Never — errors fall back to `planRound` with a logged warning.
 */
export async function planRoundAI(
  self:     CombatantState,
  opponent: CombatantState,
  config:   AgentConfig,
): Promise<PlannedAction[]> {
  if (isDefeated(self)) return []

  try {
    const client   = new Anthropic()
    const unlocked = unlockedActions(self).filter(id => isActionAllowed(id, config))
    const usable   = usableActions(self).filter(id => isActionAllowed(id, config))

    if (usable.length === 0) return []

    const response = await client.messages.create({
      model:      AI_MODEL,
      max_tokens: 512,
      system:     buildSystemPrompt(config.persona),
      messages:   [{ role: 'user', content: buildCombatPrompt(self, opponent, unlocked, usable) }],
      tools:      [PLAN_ACTION_TOOL],
      tool_choice: { type: 'auto' },
    })

    const toolBlock = response.content.find(b => b.type === 'tool_use')
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('AI agent: no tool_use block in response')
    }

    const input    = toolBlock.input as { action: string }
    const actionId = input.action as ActionId

    if (!usable.includes(actionId)) {
      throw new Error(`AI agent: illegal action "${actionId}" (not in usable list)`)
    }

    const plan: PlannedAction = { actorId: self.id, action: actionId }
    if (!ACTION_DEFS[actionId].selfTargeted) {
      plan.targetId = config.targetId
    }

    return [plan]

  } catch (err) {
    console.warn(`[agent] AI call failed for "${self.id}", falling back to scripted agent:`, err)
    return planRound(self, opponent, config)
  }
}

// ─── Allowed-action helper ────────────────────────────────────────────────────

/**
 * True if the action is permitted by the encounter's allowedActions whitelist.
 * If the config has no whitelist (empty or absent), everything is allowed.
 */
function isActionAllowed(actionId: ActionId, config: AgentConfig): boolean {
  return !config.allowedActions?.length || config.allowedActions.includes(actionId)
}

// ─── Guard selection (scripted) ───────────────────────────────────────────────

/**
 * Select the preferred guard for this combatant's round.
 * Returns null → resolveRound auto-selects 'absorb' as fallback.
 *
 * Priority per persona:
 *  aggressive:    dodge > parry > absorb     (stay mobile, counterattack ready)
 *  cautious:      parry > block > dodge > absorb  (best available defence)
 *  opportunist:   parry > dodge > absorb     (balanced)
 *  inexperienced: absorb                     (simple, always works)
 */
function selectGuard(self: CombatantState, persona: AgentPersona): GuardId | null {
  const available = availableGuards(self)

  const priorities: Record<AgentPersona, GuardId[]> = {
    aggressive:    ['dodge', 'parry', 'absorb'],
    cautious:      ['parry', 'block', 'dodge', 'absorb'],
    opportunist:   ['parry', 'dodge', 'absorb'],
    inexperienced: ['absorb'],
  }

  for (const g of priorities[persona]) {
    if (available.includes(g)) return g
  }
  return null
}

// ─── Self-action selection (scripted) ────────────────────────────────────────

/**
 * Decide whether to use a first-action (🟢) self-targeted action.
 * Returns the ActionId if warranted, null otherwise.
 *
 * Priority: Respiration first (restores 🔴 access), then Stabiliser.
 *
 * Thresholds by persona — lower threshold = act sooner:
 *  aggressive:    fatigue ≥ 15, heavy wounds ≥ 4   (only in extremis)
 *  cautious:      fatigue ≥ 8,  heavy wounds ≥ 1   (early and often)
 *  opportunist:   fatigue ≥ 10, heavy wounds ≥ 2   (moderate)
 *  inexperienced: fatigue ≥ 20, heavy wounds ≥ 3   (barely notices)
 */
function selectSelfAction(
  state:  CombatantState,
  config: AgentConfig,
): ActionId | null {
  const { persona } = config

  const fatigueThreshold: Record<AgentPersona, number> = {
    aggressive:    15,
    cautious:       8,
    opportunist:   10,
    inexperienced: 20,  // cap — never triggers from fatigue alone
  }
  const heavyWoundThreshold: Record<AgentPersona, number> = {
    aggressive:     4,
    cautious:       1,
    opportunist:    2,
    inexperienced:  3,
  }

  // Respiration: clears winded or reduces fatigue
  const wantRespiration =
    state.status.includes('winded') ||
    state.fatigue >= fatigueThreshold[persona]

  if (wantRespiration
    && isActionAllowed('respiration', config)
    && canUseAction(state, 'respiration')
    && canAffordAction(state, 'respiration')
  ) {
    return 'respiration'
  }

  // Stabiliser: clears hemorrhage or heals light wounds
  const wantStabilize =
    state.status.includes('hemorrhage') ||
    state.heavyWounds >= heavyWoundThreshold[persona]

  if (wantStabilize
    && isActionAllowed('stabilize', config)
    && canUseAction(state, 'stabilize')
    && canAffordAction(state, 'stabilize')
  ) {
    return 'stabilize'
  }

  return null
}

// ─── Offensive action selection (scripted) ───────────────────────────────────

/**
 * Pick the best offensive action given current state and persona.
 * Returns null if no action is usable or affordable.
 *
 * Fatigue safety: if fatigue ≥ 14, skip fatigue-costing actions (brutal/sharp)
 * regardless of persona — prevents accidental self-incapacitation.
 *
 * Persona candidate lists (highest priority first):
 *  aggressive:    brutal-strike → armed-attack → sharp-strike → unarmed-attack
 *  cautious:      armed-attack → unarmed-attack → sharp-strike
 *  opportunist:   gambles on brutal-strike when opponent is vulnerable
 *  inexperienced: unarmed-attack → armed-attack (simple, low-commitment)
 */
function selectOffensiveAction(
  state:    CombatantState,
  opponent: CombatantState,
  config:   AgentConfig,
): ActionId | null {
  const { persona } = config
  const lowOnFatigue = state.fatigue >= 14

  let candidates: ActionId[]

  switch (persona) {
    case 'aggressive':
      candidates = lowOnFatigue
        ? ['armed-attack', 'unarmed-attack']
        : ['brutal-strike', 'armed-attack', 'sharp-strike', 'unarmed-attack']
      break

    case 'cautious':
      candidates = ['armed-attack', 'unarmed-attack']
      break

    case 'opportunist':
      if (shouldGamble(opponent)) {
        candidates = lowOnFatigue
          ? ['armed-attack', 'sharp-strike', 'unarmed-attack']
          : ['brutal-strike', 'armed-attack', 'sharp-strike', 'unarmed-attack']
      } else {
        candidates = lowOnFatigue
          ? ['armed-attack', 'unarmed-attack']
          : ['armed-attack', 'sharp-strike', 'unarmed-attack']
      }
      break

    case 'inexperienced':
      candidates = ['unarmed-attack', 'armed-attack']
      break
  }

  // Apply scenario whitelist — only keep actions the encounter permits
  const allowed = candidates.filter(id => isActionAllowed(id, config))

  for (const actionId of allowed) {
    if (canUseAction(state, actionId) && canAffordAction(state, actionId)) {
      return actionId
    }
  }
  return null
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * True when the opponent is vulnerable enough to justify gambling on
 * brutal-strike (1💔 hit vs 2💢 miss).
 *
 * Heuristic: ≥ 2 heavy wounds, or has a status that costs them PA next round.
 */
function shouldGamble(opponent: CombatantState): boolean {
  return opponent.heavyWounds >= 2
      || opponent.status.includes('hemorrhage')
      || opponent.status.includes('stunned')
      || opponent.status.includes('knockdown')
}

// ─── AI helpers ───────────────────────────────────────────────────────────────

/** Persona-specific system prompt for the AI agent */
const PERSONA_VOICE: Record<AgentPersona, string> = {
  aggressive: `Tu es un combattant agressif et intrépide dans le jeu de rôle Quadrature.
Ta philosophie : attaquer fort, attaquer vite. Tu acceptes les risques si la récompense est grande.
Tu préfères les coups lourds (Frappe brutale, Attaque armée) aux attaques molles.
Tu n'hésites pas à dépenser de la fatigue pour écraser ton adversaire.`,

  cautious: `Tu es un combattant prudent et méthodique dans le jeu de rôle Quadrature.
Ta priorité absolue est de survivre. Tu t'occupes d'abord de ta santé et ta fatigue.
Tu préfères les attaques fiables (Attaque armée) aux coups risqués.
Tu économises tes ressources et évites tout ce qui pourrait te mettre en danger.`,

  opportunist: `Tu es un combattant opportuniste dans le jeu de rôle Quadrature.
Tu analyses la situation et t'adaptes : si ton adversaire est affaibli, tu frappes fort.
Sinon tu joues la régularité. Tu traites tes urgences (essoufflé, hémorragie) rapidement
mais sans trop hésiter. Tu exploites les faiblesses de ton adversaire.`,

  inexperienced: `Tu es un combattant inexpérimenté dans le jeu de rôle Quadrature.
Tu connais les bases mais tu n'as pas encore de stratégie affinée.
Tu tends à choisir des actions simples et tu ne remarques pas toujours les meilleures options.
Tu fais du mieux que tu peux avec ta connaissance limitée du combat.`,
}

/** Tool definition for structured action declaration */
const PLAN_ACTION_TOOL: Anthropic.Tool = {
  name: 'plan_action',
  description: "Déclarer l'action que tu effectues ce tour de combat.",
  input_schema: {
    type:       'object' as const,
    properties: {
      action: {
        type:        'string',
        enum:        ['armed-attack', 'unarmed-attack', 'brutal-strike', 'sharp-strike', 'respiration', 'stabilize'],
        description: "L'action à effectuer ce tour.",
      },
    },
    required: ['action'],
  },
}

function buildSystemPrompt(persona: AgentPersona): string {
  // Build the status catalogue dynamically from STATUS_DEFS
  const statusDescriptions = Object.values(STATUS_DEFS)
    .map(s => `▸ ${s.icon} ${s.label} [${s.id}]\n  ${s.description}`)
    .join('\n\n')

  // Build the action catalogue dynamically from ACTION_DEFS, sorted by initiative
  const actionDescriptions = Object.values(ACTION_DEFS)
    .sort((a, b) => a.initiative - b.initiative)
    .map(d => {
      const costParts: string[] = [`init ${d.initiative}`, `${d.cost.actions} PA`]
      if ((d.cost.fatigue ?? 0) > 0) costParts.push(`+${d.cost.fatigue}💧 fatigue`)
      if (d.requiresFirstAction)     costParts.push('🟢 première action uniquement')
      return `▸ ${d.label} [${d.id}] (${costParts.join(', ')})\n  ${d.description}`
    })
    .join('\n\n')

  return `${PERSONA_VOICE[persona]}

=== RÈGLES DE COMBAT QUADRATURE ===

── DÉROULEMENT D'UN ROUND ──
Chaque round comprend deux phases :

1. PHASE D'ENTRETIEN (début de round, automatique)
   • Chaque combattant reçoit 3 PA 🟢⚫🔴.
   • Si ta fatigue 💧 ≥ 10 : test d'Endurance automatique.
     🎲 Endurance🟨🟨 + Vigueur🟦 vs DD = ton niveau de fatigue
     ✅ Succès : tu récupères (1 + Endurance)💧.
     ❌ Échec  : tu gagnes l'état Essoufflé 😮‍💨.

2. PHASE D'ACTIONS
   Chaque combattant dispose de 3 PA (Points d'Action) par round. Un round contient
   généralement plusieurs actions par combattant, enchaînées jusqu'à épuisement des PA
   ou faute d'action disponible.
   • Les actions sont déclarées simultanément par tous les combattants.
   • Elles sont résolues par ordre d'initiative croissant (1 = en premier, 6 = en dernier).
   • Les actions de même valeur d'initiative sont résolues simultanément : les jets sont
     effectués sur l'état figé en début de groupe, et tous leurs effets sont appliqués
     d'un coup à la fin du groupe.

── ACTIONS DISPONIBLES ──
${actionDescriptions}

── SYSTÈME DE GARDE ──
Quand un combattant est attaqué pour la première fois d'un round, il choisit sa garde.
Le jet de garde est effectué une seule fois ; son résultat devient le seuil (DD) que
tout attaquant doit égaler ou dépasser ce round-là pour réussir son action.
• Encaisser (passive) : toujours disponible, coûte 0 réaction (⚡).
• Gardes actives (Esquive / Parade / Blocage) : coûtent 1⚡ lors du premier usage ;
  le résultat est mémorisé et réutilisé gratuitement pour les attaquants suivants.
• Sur un Défaut du jet de garde, le défenseur subit +1💧 de fatigue.
Ta garde est sélectionnée automatiquement selon ta personnalité — concentre-toi sur
tes actions offensives ou de soin.

── BLESSURES ET RÉSISTANCE ──
Les blessures légères (💢) s'accumulent pendant le round. En fin de round :
• Si les blessures légères dépassent le seuil de résistance (Vigueur effective +
  Robustesse), elles se convertissent en 1 blessure grave (💔) et le compteur est
  remis à zéro.
• Les blessures graves réduisent définitivement les caractéristiques physiques.
• Atteindre 20💧 de fatigue entraîne l'incapacitation.

── ÉTATS ET STATUTS ──
${statusDescriptions}

Utilise TOUJOURS l'outil plan_action pour déclarer ton action.`
}

/**
 * Build the user-turn prompt for the AI agent.
 *
 * @param unlocked  All actions this character has unlocked (prerequisite check only)
 *                  — shown with full descriptions so Claude understands the toolkit.
 * @param usable    Subset affordable and legal THIS turn — shown as the restricted choice list.
 */
function buildCombatPrompt(
  self:     CombatantState,
  opponent: CombatantState,
  unlocked: ActionId[],
  usable:   ActionId[],
): string {
  const statusStr = (s: CombatantState) => s.status.length > 0 ? s.status.join(', ') : 'aucun'
  const charLine  = (s: CombatantState) =>
    `Str ${effChar(s,'strength')} Agi ${effChar(s,'agility')} Vig ${effChar(s,'vigor')} Acu ${effChar(s,'acuity')}`

  const actionCatalogue = unlocked.map(id => {
    const d    = ACTION_DEFS[id]
    const cost = `init ${d.initiative}, ${d.cost.actions} PA${(d.cost.fatigue ?? 0) > 0 ? ` +${d.cost.fatigue}💧` : ''}`
    return `  • ${d.label} [${id}] (${cost})\n    ${d.description}`
  }).join('\n')

  const availableThisTurn = usable.length > 0
    ? usable.map(id => `[${id}]`).join('  ')
    : '(aucune — tu ne peux pas agir ce tour)'

  return `=== TON ÉTAT (${self.id}) ===
PA restants : ${self.actions}/3  |  ⚡ Réactions : ${self.reactions}/${self.maxReactions}
Fatigue     : ${self.fatigue}/20  |  État mental : ${self.mentalState}
💢 Blessures légères : ${self.lightWounds}  |  💔 Blessures graves : ${self.heavyWounds}
Statuts : ${statusStr(self)}  |  ${charLine(self)}

=== ADVERSAIRE (${opponent.id}) ===
Fatigue     : ${opponent.fatigue}/20  |  État mental : ${opponent.mentalState}
💢 Blessures légères : ${opponent.lightWounds}  |  💔 Blessures graves : ${opponent.heavyWounds}
Statuts : ${statusStr(opponent)}

=== TON ARSENAL (actions débloquées) ===
${actionCatalogue}

=== DISPONIBLE CE TOUR ===
${availableThisTurn}

Déclare ton action parmi les disponibles avec l'outil plan_action.`
}

/**
 * Actions unlocked by the character's skills (prerequisite check only).
 * Used to build the full action catalogue shown in AI prompts.
 * Does NOT filter by current PA / reaction / state constraints.
 */
function unlockedActions(state: CombatantState): ActionId[] {
  const allActions: ActionId[] = [
    'armed-attack', 'unarmed-attack', 'brutal-strike',
    'sharp-strike', 'respiration', 'stabilize',
  ]
  return allActions.filter(id => {
    const def = ACTION_DEFS[id]
    return !def.prerequisite
        || state.skills[def.prerequisite.skill] >= def.prerequisite.minValue
  })
}

/** Actions that are both unlocked AND currently usable + affordable this turn */
function usableActions(state: CombatantState): ActionId[] {
  const allActions: ActionId[] = [
    'armed-attack', 'unarmed-attack', 'brutal-strike',
    'sharp-strike', 'respiration', 'stabilize',
  ]
  return allActions.filter(id => canUseAction(state, id) && canAffordAction(state, id))
}
