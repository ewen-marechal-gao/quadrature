/**
 * Combat agent for the Quadrature simulator.
 *
 * Two implementations are provided:
 *
 * 1. Scripted agent (`planRound`): pure, synchronous, rule-based heuristics.
 *    Each AgentPersona encodes different tactical priorities.
 *    Suitable for automated batch simulations and deterministic baselines.
 *
 * 2. AI agent (`planRoundAI`): async, calls the Mistral API via node-llm.
 *    Each persona maps to a different system-prompt "voice", letting the model
 *    reason about the state and pick an action naturally.
 *    Requires MISTRAL_API_KEY in the environment (or a .env file).
 *    node-llm (@node-llm/core) provides a provider-agnostic interface — swapper
 *    vers OpenAI, Anthropic ou Ollama ne demande qu'un changement de config.
 *
 * Both return a `PlannedAction[]` compatible with `resolveRound`.
 * The scripted agent may plan up to three actions per round (depending on PA).
 * The AI agent plans exactly one action per round (simpler and more reliable).
 */

import { createLLM, ToolHalt } from '@node-llm/core'
import type { ToolDefinition }  from '@node-llm/core'

import type { CombatantState }    from './types'
import type { ActionId, GuardId } from './types'
import type { PhaseLog }          from './types'
import type { PlannedAction, GuardProvider } from './round'
import { ACTION_DEFS, GUARD_DEFS, canUseAction, canAffordAction, defFor } from './actions'
import { spendActionCost, effChar, isDefeated } from './combatant'
import { bandOf, BANDS, type Band } from './bands'
import { distance } from './position'
import { STATUS_DEFS } from './status'
import { type Actor, actorDefeated, isAdversaryActor } from '../adversary/actor'
import { cardMoveBudget } from '../adversary/agent'
import {
  planRoundUtility, simulateSelfEffects, selectGuardByEV,
  type PlannerConfig, type RankedPlan,
} from '../planner/planner'
import type { Weights } from '../planner/value'

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
  /**
   * Override the persona's valuation weights (offense / caution / finisher /
   * noise). Used by the strategy optimiser to sweep tactical styles. When
   * absent, the persona's default vector (PERSONA_WEIGHTS) is used.
   */
  weights?: Weights
}

// ─── LLM session ─────────────────────────────────────────────────────────────

/**
 * Persistent conversation context for one LLM-driven combatant.
 *
 * The Chat instance keeps the full conversation history: system prompt (rules +
 * persona) is sent only once. Each subsequent action call receives only the
 * delta (current state + opponent's previous actions) as a new user message.
 *
 * `pendingContext` accumulates opponent-action summaries between waves;
 * it is prepended to the next combat-state prompt and then cleared.
 */
export interface LLMAgentSession {
  /** node-llm Chat instance — carries full conversation history */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly chat:        any
  /** ID of the combatant this session belongs to */
  readonly combatantId: string
  /** Opponent-action summary to prepend to the next state prompt (consumed on use) */
  pendingContext:       string | null
}

/**
 * Initialise a persistent LLM session for a combatant.
 * The system prompt (rules + persona) is set here and never repeated.
 * Call once before the combat loop; pass the session to planRoundAI each turn.
 */
export function createAgentSession(combatantId: string, config: AgentConfig): LLMAgentSession {
  const llm  = createLLM({
     provider: 'mistral', 
     mistralApiKey: process.env.MISTRAL_API_KEY,
     requestTimeout: 60_000, // Timeout requests after 30 seconds (default)
     maxTokens: 2000 // Limit output to 4K tokens (default)
    })
  const chat = llm.chat(AI_MODEL, {
    requestTimeout: 60_000, // Timeout chat interactions after 30 seconds (default)
  }).withSystemPrompt(buildSystemPrompt(config.persona))
  return { chat, combatantId, pendingContext: null }
}

/**
 * Record the OPPONENT's visible actions from the last wave into the session,
 * so the combatant can factor them in when planning their next action.
 *
 * Visible info: action label, target, roll, result, damage notes, battle cry.
 * NOT included: reasoning (private internal thought of the opponent).
 *
 * The summary is stored in `pendingContext` and consumed on the next planRoundAI call.
 */
export function recordOpponentActions(
  session:    LLMAgentSession,
  phaseLogs:  PhaseLog[],
  opponentId: string,
): void {
  const entries = phaseLogs.flatMap(p => p.actions).filter(e => e.actorId === opponentId)
  if (entries.length === 0) return

  const lines: string[] = ['[Actions adverses lors de la vague précédente]']

  for (const e of entries) {
    const label  = ACTION_DEFS[e.action as ActionId]?.label ?? e.action
    const target = e.targetId
      ? ` → ${e.targetId === session.combatantId ? 'TOI' : e.targetId}`
      : ' (action personnelle)'
    const roll   = e.checkRoll ? ` — jet ${e.checkRoll.total} vs DD:${e.threshold}` : ''
    const result = e.hit ? '✅ Touché' : '❌ Raté/Égratigné'
    const notes  = e.notes.length ? `  (${e.notes.join(' | ')})` : ''
    const cry    = e.battleCry ? `\n  💬 "${e.battleCry}"` : ''
    lines.push(`${e.actorId} : ${label}${target}${roll} — ${result}${notes}${cry}`)
  }

  // Accumulate — if multiple waves happen before the next planRoundAI call,
  // we keep all of them (shouldn't happen in practice but safe)
  session.pendingContext = session.pendingContext
    ? `${session.pendingContext}\n\n${lines.join('\n')}`
    : lines.join('\n')
}

// ─── Scripted agent ───────────────────────────────────────────────────────────

/**
 * Plan the next single action for a combatant (scripted, synchronous).
 * Thin wrapper over the utility planner: the first action of the best round
 * plan. Kept for API compatibility with wave-based callers.
 */
export function planNextAction(
  self:     CombatantState,
  opponent: Actor,
  config:   AgentConfig,
): PlannedAction | null {
  return planRoundActions(self, opponent, config)[0] ?? null
}

/** Bridge the agent's public config to the planner's dependency-free mirror. */
function toPlannerConfig(config: AgentConfig): PlannerConfig {
  return {
    persona:  config.persona,
    targetId: config.targetId,
    ...(config.allowedActions && { allowedActions: config.allowedActions }),
    ...(config.weights && { weights: config.weights }),
  }
}

/**
 * Plan a combatant's round from `fromBand` onward (scripted, synchronous).
 *
 * Returns the actions committed to the still-open bands (≤ one per band). The
 * caller hands the lot to resolveRoundBands, which filters to the band it is
 * resolving. Called once per band with the CURRENT state, it adapts — a target
 * that fell, a gap the last band closed, a guard just revealed.
 *
 * `fromBand` (default 'I') is the first still-open band: earlier bands are
 * already resolved and never re-planned (their PA is spent in the live state).
 *
 * Positioning (on a board) is decided first — approach to get in range, KITE to
 * open distance when the actor outranges the enemy, or hold. The committed move
 * takes its band; the utility planner (src/planner) then fills the remaining
 * bands, pricing every legal action by exact outcome probabilities × effect
 * worth. Personas are weight vectors, not candidate lists.
 */
export function planRoundActions(
  self:     CombatantState,
  opponent: Actor,
  config:   AgentConfig,
  fromBand: Band = 'I',
  ranking?: RankedPlan[],
): PlannedAction[] {
  if (isDefeated(self)) return []

  const plannerCfg = toPlannerConfig(config)
  const fromIdx = BANDS.indexOf(fromBand)
  const plans: PlannedAction[] = []
  const usedBands = new Set<Band>()
  let state = self   // local simulation — real state is never mutated

  /** Commit a positioning move; only emits if its band is still open (≥ fromBand). */
  const commit = (id: ActionId, retreat: boolean): void => {
    const band = bandOf(ACTION_DEFS[id].initiative)
    state = simulateSelfEffects(spendActionCost(state, defFor(state, id).cost), id)
    if (band === null || BANDS.indexOf(band) < fromIdx) return
    usedBands.add(band)
    const p: PlannedAction = { actorId: self.id, action: id, targetId: config.targetId }
    if (retreat) p.retreat = true
    plans.push(p)
  }

  const canPlay = (id: ActionId): boolean =>
    isActionAllowed(id, config) && canUseAction(state, id) && canAffordAction(state, id)

  // ── Positionnement (§ positions) — approcher, kiter, ou tenir ────────────────
  for (const move of planPositioning(state, opponent, config, canPlay)) {
    commit(move.action, move.retreat)
  }

  // The utility planner fills every band positioning did not claim.
  return [...plans, ...planRoundUtility(state, opponent, plannerCfg, fromBand, usedBands, ranking)]
}

/** A movement the positioning layer wants to commit this round. */
interface PositioningMove { action: ActionId; retreat: boolean }

/**
 * Decide the round's MOVEMENT on a board: approach to get in range, kite to open
 * distance, or hold (no move). Returns the moves to commit (≤ course + charge);
 * an empty list means "hold — the utility planner attacks from here".
 *
 * The decision reads the actor's own weapon reach against the enemy's threat:
 *  - Out of my attack's max range → APPROACH (Course, then Charge for a melee
 *    finisher when the leap would connect).
 *  - I OUTRANGE the enemy and it sits within the ground it covers next turn (or
 *    I'm too close to shoot) → KITE (Course/Marche away — the archer opening the
 *    band it needs). A melee fighter never outranges anyone, so it never kites.
 *  - Otherwise → hold.
 */
function planPositioning(
  state:    CombatantState,
  opponent: Actor,
  config:   AgentConfig,
  canPlay:  (id: ActionId) => boolean,
): PositioningMove[] {
  const gap = state.pos && opponent.pos && !actorDefeated(opponent)
    ? distance(state.pos, opponent.pos)
    : null
  if (gap === null) return []                          // positionless → no move, utility does all

  const { maxReach, canHitHere } = offensiveEnvelope(state, opponent, config, gap)
  const enemyThreat = enemyReachThreat(opponent)       // how close the enemy gets next turn
  const mover: ActionId | null = canPlay('course') ? 'course' : canPlay('walk') ? 'walk' : null

  // ── Approach: my best blow can't reach — close the ground ──────────────────
  if (gap > maxReach) {
    if (mover === null) return []
    const moves: PositioningMove[] = [{ action: mover, retreat: false }]
    // Melee finisher: Charge if the leap would land it. The Course grants the
    // Inertia the Charge needs, so check the Charge against the POST-Course state.
    const afterMove = simulateSelfEffects(spendActionCost(state, defFor(state, mover).cost), mover)
    if (isActionAllowed('charge', config)
      && canUseAction(afterMove, 'charge') && canAffordAction(afterMove, 'charge')) {
      const budget     = moveBudgetOf(mover, state)
      const chargeMove = moveBudgetOf('charge', afterMove) || 6
      if (Math.max(1, gap - budget) <= 1 + chargeMove) moves.push({ action: 'charge', retreat: false })
    }
    return moves
  }

  // ── Kite: I outrange the enemy and it is within striking distance (or I'm too
  //    close to fire) — open the gap. Melee fighters (maxReach ≤ threat) skip. ──
  if (maxReach > enemyThreat && (gap <= enemyThreat || !canHitHere)) {
    return mover === null ? [] : [{ action: mover, retreat: true }]
  }

  return []                                             // in the sweet spot → hold and shoot
}

/**
 * The actor's offensive range envelope against this enemy: the widest max reach
 * among the attacks it can currently play, and whether any of them connects from
 * the present gap (minRange < gap ≤ reach). Falls back to melee reach 1 when the
 * actor has no usable offensive action (it still wants to be adjacent).
 */
function offensiveEnvelope(
  state:    CombatantState,
  opponent: Actor,
  config:   AgentConfig,
  gap:      number,
): { maxReach: number; canHitHere: boolean } {
  let maxReach = 0
  let canHitHere = false
  for (const id of ALL_ACTION_IDS) {
    const def = ACTION_DEFS[id]
    if (def.movement || def.selfTargeted || def.trigger || def.reach == null) continue
    if (!isActionAllowed(id, config) || !canUseAction(state, id)) continue
    maxReach = Math.max(maxReach, def.reach)
    if (gap > (def.minRange ?? 0) && gap <= def.reach) canHitHere = true
  }
  return maxReach === 0 ? { maxReach: 1, canHitHere: gap <= 1 } : { maxReach, canHitHere }
}

/**
 * How close the enemy can bring a blow next turn — its attack reach plus the
 * ground it can cover. For a creature, the longest move across its deck; for a
 * PC, a Course. This is the distance a kiter must stay beyond.
 */
function enemyReachThreat(opponent: Actor): number {
  if (isAdversaryActor(opponent)) {
    const move = Math.max(0, ...opponent.sheet.cards.map(cardMoveBudget))
    const reach = Math.max(1, ...opponent.sheet.cards.map(c => c.reach ?? 1))
    return reach + move
  }
  // PC enemy: a Course closes 5 + Mobilité, melee reach 1.
  return 1 + (5 + opponent.skills.mobility)
}

/** A movement action's budget in cases, resolved against the actor. */
function moveBudgetOf(id: ActionId, actor: CombatantState): number {
  const b = ACTION_DEFS[id].moveBudget
  return typeof b === 'function' ? b(actor) : (b ?? 0)
}

/**
 * Build a GuardProvider for a scripted agent.
 *
 * Guard selection is by EXPECTED VALUE (src/planner): among the guards fast
 * enough to react (initiative < attack.initiative — `absorb` at 0 always
 * passes), pick the one whose expected roll best protects the defender, net of
 * the free 🟩 Encaisser hands the attacker. Reads the same exact distributions
 * the attacker's planner uses, so both sides agree on the guard that will be
 * rolled.
 */
export function makeGuardProvider(_config: AgentConfig): GuardProvider {
  return (_targetId, state, available, _attackerId, actionId, attackInitiative) => {
    const def  = ACTION_DEFS[actionId as ActionId]        // undefined pour une carte d'adversaire
    const init = attackInitiative ?? def?.initiative ?? 99
    // Les tags disent si une concession conditionnelle s'applique (la Parade ne
    // concède rien à une lame, un 🟩 à une flèche). Inconnus pour une carte
    // d'adversaire → aucune concession conditionnelle n'est facturée.
    return selectGuardByEV(state, available, init, def?.tags).guardId
  }
}

// ─── AI agent ─────────────────────────────────────────────────────────────────

/** Model used for AI decisions. Override via MISTRAL_MODEL env var. */
const AI_MODEL = process.env.MISTRAL_MODEL ?? 'mistral-small-latest'

/**
 * Build a ToolDefinition whose handler captures the chosen action.
 *
 * The schema enum is restricted to `usable` so the model can only pick
 * actions that are currently affordable and legal.
 *
 * Returning `new ToolHalt(actionId)` stops the tool loop after a single API call —
 * no second roundtrip. The halt content becomes `response.content`.
 */
function makePlanActionTool(usable: ActionId[]): ToolDefinition {
  return {
    type: 'function',
    function: {
      name:        'plan_action',
      description: "Déclarer l'action que tu effectues ce tour de combat.",
      parameters:  {
        type:       'object',
        properties: {
          reasoning: {
            type:        'string',
            description:
              'Ton raisonnement interne : pourquoi ce choix, quels risques, quelle tactique. ' +
              'Non visible par ton adversaire — parle librement.',
          },
          action: {
            type:        'string',
            enum:        usable,
            description: "L'action à effectuer ce tour.",
          },
          battleCry: {
            type:        'string',
            description:
              "Une courte phrase à voix haute : commentaire des actions précédentes, instruction simple à un allié, réponse à l'adversaire, provocation, cri de guerre" +
              'Visible de tous. Cohérent avec ta persona et le déroulement de la bataille.',
          },
        },
        required: ['reasoning', 'action', 'battleCry'],
      },
    },
    handler: async (args) => {
      const a = args as { action: string; battleCry: string; reasoning: string }
      // Le halt encode action|battleCry|reasoning pour transmission à planRoundAI
      return new ToolHalt(JSON.stringify({ action: a.action, battleCry: a.battleCry, reasoning: a.reasoning }))
    },
  }
}

/**
 * Plan one action for a combatant's round using the Mistral API via node-llm (async).
 *
 * When a `session` is provided:
 *  - The Chat instance is reused (system prompt already in history → no repeat)
 *  - Any `pendingContext` (opponent's last-wave actions) is prepended to the
 *    state prompt and then cleared, keeping the model informed of combat events
 *
 * When no session is provided (legacy / backward compat):
 *  - A fresh Chat is created with the full system prompt
 *
 * Uses function calling with tool_choice: 'required' to guarantee a valid,
 * parseable response. `halt()` stops the tool loop after exactly one API call.
 * Falls back to the scripted agent if the API call fails.
 *
 * @throws Never — errors fall back to `planRound` with a logged warning.
 */
export async function planRoundAI(
  self:      CombatantState,
  opponent:  CombatantState,
  config:    AgentConfig,
  session?:  LLMAgentSession,
): Promise<PlannedAction[]> {
  if (isDefeated(self)) return []

  try {
    const unlocked = unlockedActions(self).filter(id => isActionAllowed(id, config))
    const usable   = usableActions(self).filter(id => isActionAllowed(id, config))

    if (usable.length === 0) return []

    const PlanActionTool = makePlanActionTool(usable)

    // Build the state prompt, optionally prepended with opponent's last actions
    const statePrompt   = buildCombatPrompt(self, opponent, unlocked, usable)
    const userMessage   = session?.pendingContext
      ? `${session.pendingContext}\n\n${statePrompt}`
      : statePrompt
    if (session) session.pendingContext = null  // consumed

    // Use the persistent chat session or create a fresh one (no session = backward compat)
    const chat = session
      ? session.chat
      : createLLM({ provider: 'mistral', mistralApiKey: process.env.MISTRAL_API_KEY })
          .chat(AI_MODEL)
          .withSystemPrompt(buildSystemPrompt(config.persona))

    const response = await chat
      .withTools([PlanActionTool], { choice: 'required', calls: 'one', replace: true })
      .ask(userMessage)

    // Le halt a encodé les trois champs en JSON
    const parsed = JSON.parse(response.content.trim()) as {
      action:    string
      battleCry: string
      reasoning: string
    }

    const actionId = parsed.action as ActionId
    if (!usable.includes(actionId)) {
      throw new Error(`AI agent: illegal action "${actionId}" (not in usable list)`)
    }

    const plan: PlannedAction = {
      actorId:   self.id,
      action:    actionId,
      battleCry: parsed.battleCry || undefined,
      reasoning: parsed.reasoning || undefined,
    }
    if (!ACTION_DEFS[actionId].selfTargeted) {
      plan.targetId = config.targetId
    }

    return [plan]

  } catch (err) {
    console.warn(`[agent] AI call failed for "${self.id}", falling back to scripted agent:`, err)
    return planRoundActions(self, opponent, config)
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
/**
 * Render the active statuses of a combatant with explicit mechanical consequences.
 *
 * Using `perspective`:
 *  - 'self'     → describes consequences in second person ("tu perds…")
 *  - 'opponent' → describes consequences in third person ("il perd…")
 *
 * This avoids the LLM misattributing a self-debuff (e.g. stunned) to the opponent
 * when it appears in the state context.
 */
function buildStatusBlock(state: CombatantState, perspective: 'self' | 'opponent'): string {
  if (state.status.length === 0) return '  aucun'

  const T = perspective === 'self'
    ? { subj: 'TU',  verb: 'tu',  poss: 'ta',  adj: 'tes',  prefix: '⚠️  TOI' }
    : { subj: 'IL',  verb: 'il',  poss: 'sa',  adj: 'ses',  prefix: '    adversaire' }

  const lines: string[] = []

  for (const statusId of state.status) {
    const def = STATUS_DEFS[statusId]
    const icon = def.icon
    const label = def.label

    const impacts: string[] = []

    // Immediate PA/reaction drain (drainActions / drainReactions) — already applied
    if (def.drainActions) {
      if (perspective === 'self') {
        impacts.push(`${T.verb} as déjà perdu ${def.drainActions}⚫ ce round (déduit à l'application)`)
      } else {
        impacts.push(`${T.verb} a déjà perdu ${def.drainActions}⚫ ce round`)
      }
    }
    if (def.drainReactions) {
      if (perspective === 'self') {
        impacts.push(`${T.adj} ⚡ réactions ont été vidées ce round`)
      } else {
        impacts.push(`${T.adj} ⚡ réactions ont été vidées`)
      }
    }

    // Next round PA penalty
    if (def.onTokenReset) {
      const preview = def.onTokenReset(state)
      if (preview.actionPenalty > 0) {
        impacts.push(`${T.verb} perdra ${preview.actionPenalty}⚫ supplémentaire(s) au début du prochain round`)
      }
      if (preview.clear) {
        impacts.push('statut retiré au début du prochain round')
      }
    }

    // Roll disadvantage
    if (def.rollDisadvantage) {
      if (perspective === 'self') {
        impacts.push(`TOUS ${T.adj} jets ont 🟥 (désavantage)`)
      } else {
        impacts.push(`tous ${T.adj} jets ont 🟥 (${T.poss} précision est réduite)`)
      }
    }

    // Attacker advantage
    if (def.attackerAdvantage) {
      if (perspective === 'self') {
        impacts.push(`les attaquants en mêlée ont 🟩 contre toi`)
      } else {
        impacts.push(`tes attaques en mêlée ont 🟩 contre lui`)
      }
    }

    // Hemorrhage: bypass protection on next wound conversion
    if (statusId === 'hemorrhage') {
      if (perspective === 'self') {
        impacts.push('la prochaine conversion de blessures légères ignorera TA protection 🛡️')
      } else {
        impacts.push('la prochaine conversion de blessures légères ignorera SA protection 🛡️ — profites-en')
      }
    }

    // Incapacitation
    if (def.incapacitates) {
      if (perspective === 'self') {
        impacts.push('TU NE PEUX PLUS AGIR')
      } else {
        impacts.push('il est hors de combat')
      }
    }

    const impactStr = impacts.length > 0
      ? impacts.map(i => `       • ${i}`).join('\n')
      : `       • (aucun effet mécanique supplémentaire ce tour)`

    lines.push(`  ${icon} ${label}\n${impactStr}`)
  }

  return lines.join('\n')
}

function buildCombatPrompt(
  self:     CombatantState,
  opponent: CombatantState,
  unlocked: ActionId[],
  usable:   ActionId[],
): string {
  const charLine  = (s: CombatantState) =>
    `For ${effChar(s,'strength')}  Agi ${effChar(s,'agility')}  Vig ${effChar(s,'vigor')}  Acu ${effChar(s,'acuity')}`

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
Fatigue     : ${self.fatigue}/20  |  ${charLine(self)}
💢 Blessures légères : ${self.lightWounds}  |  💔 Blessures graves : ${self.heavyWounds}  |  🛡️ Protection : ${self.protection}
Statuts qui TE touchent :
${buildStatusBlock(self, 'self')}

=== ADVERSAIRE (${opponent.id}) ===
Fatigue     : ${opponent.fatigue}/20  |  ${charLine(opponent)}
💢 Blessures légères : ${opponent.lightWounds}  |  💔 Blessures graves : ${opponent.heavyWounds}  |  🛡️ Protection : ${opponent.protection}
Statuts qui touchent L'ADVERSAIRE :
${buildStatusBlock(opponent, 'opponent')}

=== TON ARSENAL (actions débloquées) ===
${actionCatalogue}

=== DISPONIBLE CE TOUR ===
${availableThisTurn}

Déclare ton action parmi les disponibles avec l'outil plan_action.`
}

/** Every action known to the engine, in data/player_actions.yaml order. */
const ALL_ACTION_IDS = Object.keys(ACTION_DEFS) as ActionId[]

/**
 * Actions unlocked by the character's skills (prerequisite check only).
 * Used to build the full action catalogue shown in AI prompts.
 * Does NOT filter by current PA / reaction / state constraints.
 */
function unlockedActions(state: CombatantState): ActionId[] {
  return ALL_ACTION_IDS.filter(id => {
    const def = ACTION_DEFS[id]
    return !def.prerequisite
        || state.skills[def.prerequisite.skill] >= def.prerequisite.minValue
  })
}

/** Actions that are both unlocked AND currently usable + affordable this turn */
function usableActions(state: CombatantState): ActionId[] {
  return ALL_ACTION_IDS.filter(id => canUseAction(state, id) && canAffordAction(state, id))
}
