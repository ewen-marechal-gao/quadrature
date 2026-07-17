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
import { ACTION_DEFS, GUARD_DEFS, canUseAction, canAffordAction, availableGuards } from './actions'
import { spendActionCost, effChar, isDefeated, mentalDegree } from './combatant'
import { bandOf, type Band } from './bands'
import { distance } from './position'
import { STATUS_DEFS } from './status'
import { type Actor, isAdversaryActor, actorDefeated } from '../adversary/actor'
import { isPartDestroyed } from '../adversary/combatant'

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
   * Override the persona's default fatigue threshold for triggering Respiration.
   * Used by the strategy optimiser. When absent, the persona default is used.
   */
  respirationThreshold?: number
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
  opponent: Actor,
  config:   AgentConfig,
): PlannedAction | null {
  if (isDefeated(self)) return null

  const selfAction = selectSelfAction(self, config)
  if (selfAction !== null) {
    return { actorId: self.id, action: selfAction }
  }

  if (!actorDefeated(opponent)) {
    const offAction = selectOffensiveAction(self, opponent, config)
    if (offAction !== null) {
      return { actorId: self.id, action: offAction, targetId: config.targetId }
    }
  }

  return null
}

/**
 * Plan a combatant's whole round at once (scripted, synchronous).
 *
 * Returns 0–3 PlannedActions depending on available PA and strategy. The caller
 * hands the lot to resolveRoundBands, which reveals them band by band.
 *
 * Why plan the round as a whole rather than one band at a time: a combatant must
 * RESERVE its PA. Spending greedily band after band would strand the late cards —
 * a Frappe brutale (Bande III, 2 PA) would never fire once bands I and II had
 * drained the pool. Committing the round up front means giving up the
 * inter-band adaptation the rules allow, which a scripted agent would not
 * exploit anyway.
 *
 * Local state is simulated via `spendActionCost` to track resource consumption
 * across multiple planned actions — the real CombatantState is never mutated.
 *
 * Round structure:
 *  Phase A  — Self-targeted action (Bande I), if warranted by persona
 *  Phase B  — Primary offensive action
 *  Phase C  — Second offensive action (aggressive / opportunist only)
 */
export function planRoundActions(
  self:     CombatantState,
  opponent: Actor,
  config:   AgentConfig,
): PlannedAction[] {
  if (isDefeated(self)) return []

  const plans: PlannedAction[] = []
  const usedBands = new Set<Band>()
  let state = self   // local simulation — real state is never mutated

  /**
   * Commit an action to the round, unless its band is already taken: only one
   * card per band (§ combat.md). Every band is thus a choice — soigner OU
   * frapper. Returns false when the band is spoken for.
   *
   * The local `state` is advanced not just by PA spend but by the action's
   * SELF-EFFECTS that later bands gate on — the élan a Course grants, the winded
   * it inflicts, the winded a Respiration clears. Without this the planner could
   * not see that a Course in Bande II unlocks the Charge in Bande III.
   */
  const commit = (id: ActionId, targetId?: string): boolean => {
    const band = bandOf(ACTION_DEFS[id].initiative)
    if (band === null || usedBands.has(band)) return false
    usedBands.add(band)
    plans.push(targetId === undefined
      ? { actorId: self.id, action: id }
      : { actorId: self.id, action: id, targetId })
    state = simulateSelfEffects(spendActionCost(state, ACTION_DEFS[id].cost), id)
    return true
  }

  const canPlay = (id: ActionId): boolean =>
    isActionAllowed(id, config) && canUseAction(state, id) && canAffordAction(state, id)

  // ── Approche (§ positions) : hors de portée de mêlée, on court plutôt que de
  //    frapper dans le vide. Se déclenche sur un plateau (positions connues) si
  //    le combattant a de quoi se rapprocher — sinon on retombe sur le
  //    comportement d'avant les positions.
  //
  //    Heuristique FOCALISÉE, pas l'agent tactique général (todo #19) : elle ne
  //    connaît qu'un motif — s'approcher et charger —, parce que c'est tout
  //    l'intérêt de donner la Charge à un duelliste sans Puissance. Un kiter
  //    voudrait l'instinct inverse ; c'est différé. ──────────────────────────
  const MELEE_REACH = 1
  const gap = state.pos && opponent.pos && !actorDefeated(opponent)
    ? distance(state.pos, opponent.pos)
    : null

  if (gap !== null && gap > MELEE_REACH &&
      (canPlay('course') || canPlay('walk') || state.status.includes('winded'))) {
    // Bande I : d'abord se soigner. Une Respiration ici lève l'essoufflement de
    // la Course de la manche précédente — c'est ce qui rouvre la Course.
    const selfA = selectSelfAction(state, config)
    if (selfA !== null && bandOf(ACTION_DEFS[selfA].initiative) === 'I') commit(selfA)

    // Bande II : on court (Course) si possible, sinon Marche.
    const mover: ActionId | null = canPlay('course') ? 'course' : canPlay('walk') ? 'walk' : null
    if (mover !== null) {
      const budget = moveBudgetOf(mover, state)
      commit(mover, config.targetId)

      // Bande III : charger seulement si le bond porterait — sinon les 💧 sont
      // gâchées. `state` porte à présent l'élan que la Course vient de donner.
      if (canPlay('charge')) {
        const postGap    = Math.max(MELEE_REACH, gap - budget)
        const chargeMove = moveBudgetOf('charge', state) || 6
        if (postGap <= MELEE_REACH + chargeMove) commit('charge', config.targetId)
      }
      return plans
    }
  }

  // ── Phase A: Self-care (Bande I) ────────────────────────────────────────
  const selfAction = selectSelfAction(state, config)
  if (selfAction !== null) commit(selfAction)

  // ── Phase B: Primary offensive action ───────────────────────────────────
  const offAction = selectOffensiveAction(state, opponent, config)
  if (offAction !== null) commit(offAction, config.targetId)

  // ── Phase C: Second offensive action, in ANOTHER band ───────────────────
  if (config.persona === 'aggressive' || config.persona === 'opportunist') {
    const played = new Set<ActionId>(plans.map(p => p.action))
    const secondAction = selectOffensiveAction(state, opponent, config, played)
    if (secondAction !== null) commit(secondAction, config.targetId)
  }

  return plans
}

/**
 * Apply an action's SELF-EFFECTS to a planning-time state — only the fields a
 * later band gates on. Not a resolution: no rolls, no target, no board. It just
 * keeps `canUseAction` honest across the round (élan for the Charge, winded for
 * the Course, and Respiration clearing it).
 */
function simulateSelfEffects(state: CombatantState, id: ActionId): CombatantState {
  const def = ACTION_DEFS[id]
  let s = state
  if (def.grantsInertia != null) s = { ...s, inertia: def.grantsInertia }
  if (def.grantsStatus && !s.status.includes(def.grantsStatus)) {
    s = { ...s, status: [...s.status, def.grantsStatus] }
  }
  if (def.clearsStatus) s = { ...s, status: s.status.filter(x => x !== def.clearsStatus) }
  return s
}

/** A movement action's budget in cases, resolved against the actor. */
function moveBudgetOf(id: ActionId, actor: CombatantState): number {
  const b = ACTION_DEFS[id].moveBudget
  return typeof b === 'function' ? b(actor) : (b ?? 0)
}

/**
 * Build a GuardProvider for a scripted agent.
 *
 * Guard selection is stats-optimal and initiative-aware:
 *  1. Filter: keep only guards whose `initiative < attack.initiative`
 *     (the guard must react faster than the incoming attack).
 *     `absorb` (initiative 0) always passes — it is the passive fallback.
 *  2. Score: for each eligible guard compute
 *     `effChar(state, guard.rollChar) + state.skills[guard.rollSkill]`
 *  3. Pick: highest score. Ties are broken by preferring active guards
 *     (dodge > parry > block > absorb) — equal pool quality, but active
 *     guards can improve with extra reactions.
 */
export function makeGuardProvider(_config: AgentConfig): GuardProvider {
  return (_targetId, state, available, _attackerId, actionId, attackInitiative) => {
    return selectGuardByStats(state, available, actionId, attackInitiative)
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

/**
 * Select the guard with the best expected dice pool against a specific attack.
 *
 * Step 1 — Initiative filter:
 *   Only guards with `guardDef.initiative < attackDef.initiative` are eligible.
 *   `absorb` (initiative 0) always passes and acts as the last-resort fallback.
 *
 * Step 2 — Stat score:
 *   Score = effChar(state, guard.rollChar) + state.skills[guard.rollSkill]
 *   Higher score → larger pool → better expected guard roll.
 *
 * Step 3 — Tiebreak:
 *   Equal scores: prefer active guards (dodge > parry > block > absorb).
 *   Active guards benefit from future reaction bonuses; absorb never does.
 */
function selectGuardByStats(
  state:     CombatantState,
  available: GuardId[],
  attackId:  ActionId | string,
  attackInitiative?: number,
): GuardId {
  // Adversary card ids are not in ACTION_DEFS: their initiative arrives explicitly.
  const attackInit = attackInitiative
    ?? ACTION_DEFS[attackId as ActionId]?.initiative
    ?? 99  // unknown attack: every guard may react

  // Canonical priority for tiebreaking (active guards first)
  const TIEBREAK_ORDER: GuardId[] = ['dodge', 'parry', 'block', 'absorb']

  // Filter by initiative, then score
  const eligible = available
    .filter(id => GUARD_DEFS[id].initiative < attackInit)
    .map(id => {
      const gd    = GUARD_DEFS[id]
      const score = effChar(state, gd.rollChar) + state.skills[gd.rollSkill]
      const rank  = TIEBREAK_ORDER.indexOf(id)   // lower rank = higher priority
      return { id, score, rank }
    })
    .sort((a, b) => b.score - a.score || a.rank - b.rank)

  // absorb (initiative 0) always passes the filter, so eligible is never empty
  return eligible[0]?.id ?? 'absorb'
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

  const fatigueThresholdDefault: Record<AgentPersona, number> = {
    aggressive:    10,
    cautious:       8,
    opportunist:    8,
    inexperienced: 20,  // cap — never triggers from fatigue alone
  }
  const heavyWoundThreshold: Record<AgentPersona, number> = {
    aggressive:     4,
    cautious:       1,
    opportunist:    2,
    inexperienced:  3,
  }

  const fatigueThreshold = config.respirationThreshold ?? fatigueThresholdDefault[persona]

  // Consolidation mentale (🟢) : dès que l'état mental est pénalisant (degré ≥ 2 :
  // Paniqué/Terrifié → 🟥 offensif + plus de réactions ; Furieux/Enragé → 🟥 défensif
  // + fatigue), tenter de se recentrer. Priorité Focalisation > Résolution >
  // Préservation (la première utilisable selon les compétences du personnage).
  if (mentalDegree(state.mentalState) >= 2) {
    for (const id of ['focalisation', 'resolution', 'preservation'] as ActionId[]) {
      if (isActionAllowed(id, config) && canUseAction(state, id) && canAffordAction(state, id)) {
        return id
      }
    }
  }

  // Respiration: clears winded or reduces fatigue
  const wantRespiration =
    state.status.includes('winded') ||
    state.fatigue >= fatigueThreshold

  if (wantRespiration
    && isActionAllowed('respiration', config)
    && canUseAction(state, 'respiration')
    && canAffordAction(state, 'respiration')
  ) {
    return 'respiration'
  }

  // Stabiliser: clears hemorrhage or heals light wounds
  const wantStabilize =
    state.bleed > 0 ||
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
  opponent: Actor,
  config:   AgentConfig,
  exclude:  ReadonlySet<ActionId> = new Set(),
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
      // Frappe vive d'abord — c'est l'attaque de Précision, fiable et bon marché ;
      // l'Attaque armée vient EN PLUS, pour couvrir une seconde bande (le duelliste
      // Précis à Puissance 0 la rate souvent, mais le plancher de dégâts d'échec
      // la rend rentable — c'est ce qui remplit sa bande vide).
      if (shouldGamble(opponent)) {
        candidates = lowOnFatigue
          ? ['sharp-strike', 'armed-attack', 'unarmed-attack']
          : ['brutal-strike', 'sharp-strike', 'armed-attack', 'unarmed-attack']
      } else {
        candidates = lowOnFatigue
          ? ['armed-attack', 'unarmed-attack']
          : ['sharp-strike', 'armed-attack', 'unarmed-attack']
      }
      break

    case 'inexperienced':
      candidates = ['unarmed-attack', 'armed-attack']
      break
  }

  // Whitelist du scénario, puis cartes déjà engagées cette manche (une carte ne
  // peut être jouée qu'une fois par bande, et son initiative la fixe à une bande)
  const allowed = candidates.filter(id => isActionAllowed(id, config) && !exclude.has(id))

  for (const actionId of allowed) {
    if (canUseAction(state, actionId) && canAffordAction(state, actionId)) {
      return actionId
    }
  }

  // Repli social : aucune attaque du persona n'est jouable (ex. un « meneur »
  // dont l'encounter n'autorise que les actions sociales). Pousse l'état mental
  // de la cible — Intimidation (🔻) avant Provocation (🔺) par défaut ; la
  // whitelist de l'encounter choisit laquelle est réellement disponible.
  for (const social of ['intimidation', 'provocation'] as ActionId[]) {
    if (isActionAllowed(social, config) && !exclude.has(social)
      && canUseAction(state, social) && canAffordAction(state, social)) {
      return social
    }
  }
  return null
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * True when the opponent is vulnerable enough to justify gambling on
 * brutal-strike (1💔 hit vs 2💢 miss).
 *
 * PC opponent: ≥ 2 heavy wounds, or a status that costs them PA next round.
 * Adversary opponent: a destroyed body part, or half its fatigue clock filled.
 */
function shouldGamble(opponent: Actor): boolean {
  if (isAdversaryActor(opponent)) {
    return opponent.parts.some(isPartDestroyed)
        || opponent.fatigue * 2 >= opponent.sheet.fatigue
  }
  return opponent.heavyWounds >= 2
      || opponent.bleed > 0
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
