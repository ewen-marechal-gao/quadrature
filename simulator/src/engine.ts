/**
 * Moteur de combat — exécution d'une rencontre, sans aucune entrée/sortie.
 *
 * Ce module est le CŒUR réutilisable : il charge un roster, déroule les manches
 * et rend un CombatLog. Il n'écrit rien, n'affiche rien, ne lit pas process.argv
 * et ne s'auto-exécute pas — c'est précisément ce qui le rend appelable par
 * plusieurs frontaux (`simulate.ts` en CLI, `bench.ts` en banc d'essai).
 *
 * La frontière : tout ce qui relève du RENDU (console, fichiers, identifiants de
 * rapport de batch, arguments CLI) reste chez l'appelant.
 */

import path from 'path'

import { loadCharacter }        from './character/io'
import { ALL_CHARACTERISTICS, ALL_SKILLS } from './character/data'
import type { Character, CharacteristicName, SkillName } from './character/types'

import { resolveCharacterPath } from './encounter/io'
import type { EncounterConfig, EncounterFaction, EncounterCharacter, AgentType } from './encounter/types'

import { initCombatant, resetRoundTokensWithLog } from './combat/combatant'
import { resolveRoundBands } from './combat/round'
import { type Band } from './combat/bands'
import { type Position } from './combat/position'
import type { GuardProvider, PlannedAction, Plan } from './combat/round'

import { loadAdversary } from './adversary/io'
import type { AdversarySheet } from './adversary/types'
import { initAdversary } from './adversary/combatant'
import { selectTargetPart, cardMoveBudget } from './adversary/agent'
import { ACTION_DEFS } from './combat/actions'
import { type Actor, isAdversaryActor, actorDefeated, actorStartRound } from './adversary/actor'
import {
  planRoundActions, planRoundAI, makeGuardProvider,
  createAgentSession, recordOpponentActions,
} from './combat/agent'
import type { AgentConfig, LLMAgentSession } from './combat/agent'
import { planAdversaryRoundUtility, makeReactionProvider, type RankedPlan } from './planner/planner'
import type { ReactionSupport } from './combat/triggers'
import type {
  CombatLog, CombatantSummary, RoundLog,
  CombatOutcome, MaintenanceEntry, CombatantSnapshot, PlanningEntry,
  CombatProfile, ActionId,
} from './combat/types'
import type { AdversarySnapshot } from './adversary/combatant'

export const ENCOUNTERS_DIR = path.resolve(__dirname, '..', 'encounters')

// ─── Sides ───────────────────────────────────────────────────────────────────

/** A player-character side: sheet + persona-driven agent (scripted or LLM). */
export interface PcSide {
  kind:      'pc'
  id:        string
  char:      Character
  cfg:       AgentConfig
  agentType: AgentType
  /** Starting square, when the encounter declares a board (§ EncounterConfig.board). */
  pos?:      Position
}

/** An adversary side: fiche-driven, scripted deck heuristic, fixed guard. */
export interface AdversarySide {
  kind:  'adversary'
  id:    string
  sheet: AdversarySheet
  pos?:  Position
}

export type Side = PcSide | AdversarySide

/** Load one faction slot into a Side (PC sheet or adversary fiche). */
async function loadSide(cfg: EncounterCharacter, faction: EncounterFaction): Promise<Side> {
  if (cfg.adversary) {
    const sheet = await loadAdversary(cfg.adversary)
    return { kind: 'adversary', id: sheet.id, sheet, ...(cfg.pos && { pos: cfg.pos }) }
  }
  const char = await loadCharacter(resolveCharacterPath(cfg.sheet!))
  return {
    kind:      'pc',
    char,
    id:        char.name,
    agentType: cfg.agent ?? 'scripted',
    ...(cfg.pos && { pos: cfg.pos }),
    // targetId is (re)assigned each wave to a living enemy in plansForParticipant
    cfg: { persona: cfg.persona!, targetId: '', allowedActions: faction.allowedActions },
  }
}

/** A combatant plus the faction (team) it fights for (index 0 or 1). */
export interface Participant {
  side:        Side
  faction:     number
  factionName: string
}

/**
 * Load every combatant of both factions. Any number of combatants per faction
 * is supported (1v1, 2v1, group fights). Ids must be unique across the roster.
 */
export async function loadParticipants(
  factions: readonly [EncounterFaction, EncounterFaction],
): Promise<Participant[]> {
  const participants: Participant[] = []
  for (let f = 0; f < 2; f++) {
    const faction = factions[f]
    if (faction.characters.length === 0) {
      throw new Error(`La faction « ${faction.name} » ne comporte aucun combattant.`)
    }
    for (const cfg of faction.characters) {
      participants.push({ side: await loadSide(cfg, faction), faction: f, factionName: faction.name })
    }
  }
  const ids = participants.map(p => p.side.id)
  const dup = ids.find((id, i) => ids.indexOf(id) !== i)
  if (dup) {
    throw new Error(`Deux combattants partagent l'identifiant « ${dup} » — chaque combattant doit être unique.`)
  }
  return participants
}

// ─── Guard provider ──────────────────────────────────────────────────────────

/**
 * Provider de garde du roster — scripted et APATRIDE, donc construit une fois
 * puis réutilisé sur tous les runs d'un batch.
 *
 * La garde reste scripted même pour les agents LLM : trop coûteux à déléguer au
 * modèle. Seuls les PJ roulent une garde — les adversaires défendent sur valeur
 * fixe, d'où le repli `absorb` pour tout id inconnu du registre.
 */
export function makeRosterGuardProvider(participants: Participant[]): GuardProvider {
  const providers = new Map<string, GuardProvider>()
  for (const p of participants) {
    if (p.side.kind === 'pc') providers.set(p.side.id, makeGuardProvider(p.side.cfg))
  }
  return (targetId, state, available, attackerId, actionId, attackInitiative) => {
    const gp = providers.get(targetId)
    return gp ? gp(targetId, state, available, attackerId, actionId, attackInitiative) : 'absorb'
  }
}

// ─── Agent constraints ───────────────────────────────────────────────────────

/**
 * Garde-fous des agents LLM. Un agent LLM est asynchrone, coûteux et son prompt
 * est bâti sur l'état d'un PERSONNAGE : il ne tient donc ni le batch, ni le
 * combat de groupe, ni l'adversaire. On échoue tôt et explicitement plutôt que
 * de laisser une facture d'API ou un prompt incohérent partir en silence.
 */
export function assertAgentConstraints(participants: Participant[], runCount: number): void {
  const hasLLM = participants.some(p => p.side.kind === 'pc' && p.side.agentType === 'llm')
  if (!hasLLM) return

  if (runCount > 1) {
    throw new Error(
      `Le mode LLM ne peut pas être utilisé en mode batch.\n` +
      `Limitez à 1 run (argument omis ou "1") pour utiliser un agent LLM.`
    )
  }
  if (participants.length > 2) {
    throw new Error(`Agent LLM en combat de groupe : pas encore supporté. Limitez à un duel 1v1.`)
  }
  if (participants.some(p => p.side.kind === 'adversary')) {
    throw new Error(
      `Agent LLM contre un adversaire : pas encore supporté (le prompt de combat ` +
      `est construit sur l'état d'un personnage). Utilisez un agent scripted.`
    )
  }
}

// ─── Combat loop ─────────────────────────────────────────────────────────────

/**
 * Callbacks fired during combat for real-time display.
 * All are optional — absent callbacks produce no side effects.
 */
export interface CombatCallbacks {
  /** Called once per round, before any wave, after maintenance is applied */
  onRoundStart?: (round: number, maintenance: MaintenanceEntry[]) => void
  /** Called after each wave is fully resolved, before the next wave's plans are requested */
  onWave?:       (phaseLogs: import('./combat/types').PhaseLog[]) => void
  /** Called after end-of-round processing (wound conversion, status ticks) */
  onRoundEnd?:   (snapshots: CombatantSnapshot[], advSnapshots?: AdversarySnapshot[]) => void
}

/**
 * Exécute un combat complet et retourne le CombatLog.
 *
 * En mode LLM, les sessions sont créées une seule fois avant la boucle.
 * Le system prompt (règles + persona) n'est envoyé qu'une fois par combattant.
 * Les callbacks permettent l'affichage temps réel et la mise à jour du contexte.
 */
export async function runCombat(
  encounter:    EncounterConfig,
  participants: Participant[],
  getGuard:     GuardProvider,
  callbacks?:   CombatCallbacks,
): Promise<CombatLog> {
  const startMs = Date.now()

  // Sessions LLM (restreintes au 1v1 en amont) — le system prompt n'est envoyé qu'une fois
  const sessions = new Map<string, LLMAgentSession>()
  for (const p of participants) {
    if (p.side.kind === 'pc' && p.side.agentType === 'llm') {
      sessions.set(p.side.id, createAgentSession(p.side.id, p.side.cfg))
    }
  }
  const rateLimitMs = sessions.size > 0
    ? Math.max(0, parseInt(process.env.MISTRAL_API_RATELIMIT_MS ?? '0', 10))
    : 0

  // La case de depart vient de la rencontre ; sans plateau, l'acteur reste sans
  // position et tout le modele spatial est inerte (cf. CombatantState.pos).
  const initSide = (s: Side): Actor => {
    const actor: Actor = s.kind === 'pc' ? initCombatant(s.char) : initAdversary(s.sheet)
    return s.pos ? { ...actor, pos: s.pos } : actor
  }

  let states = new Map<string, Actor>(participants.map(p => [p.side.id, initSide(p.side)]))

  // Profils (portée/déplacement/trousse) figés sur l'état de DÉBUT — statiques.
  const profileById = new Map<string, CombatProfile>(
    participants.map(p => [p.side.id, makeProfile(p, states.get(p.side.id)!)]),
  )

  // ── Réactions ⚡ : ce que le moteur doit savoir pour ouvrir une fenêtre ──────
  const factionOf = new Map(participants.map(p => [p.side.id, p.faction]))
  const reactionSupport: ReactionSupport = {
    isEnemy: (a, b) => {
      const fa = factionOf.get(a), fb = factionOf.get(b)
      return fa !== undefined && fb !== undefined && fa !== fb
    },
    kitOf:  id => profileById.get(id)?.actions ?? [],
    choose: makeReactionProvider(id => {
      const p = participants.find(q => q.side.id === id)
      return p?.side.kind === 'pc'
        ? { persona: p.side.cfg.persona, targetId: p.side.cfg.targetId, allowedActions: p.side.cfg.allowedActions }
        : { persona: 'aggressive', targetId: '' }
    }),
  }

  // Le tapis avant le premier coup — les phases n'enregistrent que l'APRÈS.
  const startPositions = encounter.board
    ? Object.fromEntries([...states].flatMap(([id, a]) => a.pos ? [[id, a.pos] as const] : []))
    : undefined

  /** A faction is alive while at least one of its members can still act. */
  const factionAlive = (f: number) =>
    participants.some(p => p.faction === f && !actorDefeated(states.get(p.side.id)!))

  const roundLogs: RoundLog[] = []
  let roundNumber = 0

  while (roundNumber < encounter.maxRounds) {
    roundNumber++

    // Phase d'entretien — PJ : reset tokens + test d'endurance ;
    // adversaire : refill des ressources régénérantes (◇/🫁/🍀) et des ⚫
    const maintenanceEntries: MaintenanceEntry[] = []
    for (const [id, s] of states) {
      if (isAdversaryActor(s)) {
        states.set(id, actorStartRound(s))
        continue
      }
      const { state, maintenanceEntry } = resetRoundTokensWithLog(s)
      states.set(id, state)
      if (maintenanceEntry) maintenanceEntries.push(maintenanceEntry)
    }

    callbacks?.onRoundStart?.(roundNumber, maintenanceEntries)

    // Agents LLM : planifiés UNE fois par manche (une action / manche, session
    // persistante — replanifier par bande triplerait le coût d'API). Leur plan
    // est servi à chaque bande, resolveRoundBands le filtre sur la bonne.
    const t0 = Date.now()
    const llmPlans = (await Promise.all(
      participants
        .filter(p => p.side.kind === 'pc' && p.side.agentType === 'llm')
        .map(p => plansForParticipant(p, participants, states, sessions.get(p.side.id))),
    )).flat()
    if (rateLimitMs > 0) {
      const elapsed = Date.now() - t0
      if (elapsed < rateLimitMs) await new Promise<void>(r => setTimeout(r, rateLimitMs - elapsed))
    }

    // Agents scriptés (PJ) et créatures : plan RECALCULÉ au début de CHAQUE bande
    // (décision créateur). Les cartes d'une bande en cours ne changent plus une
    // fois révélées, mais chaque bande repart de l'état réel — ce qui est
    // indispensable dès qu'une RÉACTION ⚡ a pu se déclencher dans la précédente.
    // `fromBand` fait que la réservation de PA reste optimale sur les bandes
    // restantes. (Renversement assumé du choix « plan de manche entière ».)
    const planning: PlanningEntry[] = []
    const { states: next, log } = await resolveRoundBands(
      states, roundNumber, getGuard, maintenanceEntries,
      (currentStates, band) => {
        const banded = scriptedRoundPlan(participants, currentStates, band)
        for (const rp of banded) {
          if (rp.ranking.length > 0) planning.push({ actorId: rp.actorId, band, plans: rp.ranking })
        }
        return [...llmPlans, ...banded.flatMap(rp => rp.plans)]
      },
      (_band, phaseLogs) => {
        // Mise à jour du contexte LLM avec les actions adverses (avant la prochaine bande)
        for (const p of participants) {
          const session = sessions.get(p.side.id)
          if (!session) continue
          for (const other of participants) {
            if (other.side.id !== p.side.id) recordOpponentActions(session, phaseLogs, other.side.id)
          }
        }
        callbacks?.onWave?.(phaseLogs)
      },
      encounter.board,
      reactionSupport,
    )
    states = next

    // Raisonnement du planificateur : top-3 plans/utilités par acteur ET par bande.
    if (planning.length > 0) log.planning = planning

    roundLogs.push(log)

    callbacks?.onRoundEnd?.(log.endOfRound, log.adversariesEndOfRound)

    if (!factionAlive(0) || !factionAlive(1)) break
  }

  const alive0 = factionAlive(0)
  const alive1 = factionAlive(1)
  const [name0, name1] = [participants.find(p => p.faction === 0)!.factionName,
                          participants.find(p => p.faction === 1)!.factionName]

  const outcome: CombatOutcome =
    !alive0 && !alive1 ? { kind: 'mutual-incapacitation', rounds: roundNumber } :
    !alive1            ? { kind: 'victor', victorId: name0, rounds: roundNumber } :
    !alive0            ? { kind: 'victor', victorId: name1, rounds: roundNumber } :
                         { kind: 'max-rounds-reached', rounds: roundNumber }

  const durationMs = Date.now() - startMs
  const timestamp  = new Date().toISOString()
  const id         = makeReportId(timestamp, encounter.name, name0, name1)

  return {
    id,
    timestamp,
    combatants: participants.map(p => ({
      ...makeParticipantSummary(p),
      ...(profileById.get(p.side.id) && { profile: profileById.get(p.side.id) }),
    })),
    ...(encounter.board && { board: encounter.board }),
    ...(startPositions && { startPositions }),
    rounds:     roundLogs,
    outcome,
    durationMs,
  }
}

// ─── Agent planner helpers ────────────────────────────────────────────────────

/** The first still-living enemy of a participant's faction (focus-fire). */
function firstLivingEnemy(
  p:            Participant,
  participants: Participant[],
  states:       ReadonlyMap<string, Actor>,
): Participant | undefined {
  return participants.find(q => {
    if (q.faction === p.faction) return false
    const s = states.get(q.side.id)
    return s !== undefined && !actorDefeated(s)
  })
}

/**
 * Attach the declared body part (melee priority) to offensive plans aimed at an
 * adversary — routed downstream to the block the wounds land on.
 */
function withTargetPart(plans: PlannedAction[], enemyId: string, target: Actor): PlannedAction[] {
  if (!isAdversaryActor(target)) return plans
  return plans.map(pl => pl.targetId === enemyId
    ? { ...pl, targetPart: pl.targetPart ?? selectTargetPart(target, 'melee')?.type }
    : pl)
}

/**
 * Plan an LLM participant's action for the whole round (one action / round,
 * async, session-carrying). Target = first living enemy. Called once per round.
 */
async function plansForParticipant(
  p:            Participant,
  participants: Participant[],
  states:       ReadonlyMap<string, Actor>,
  session?:     LLMAgentSession,
): Promise<Plan[]> {
  if (p.side.kind !== 'pc') return []
  const self = states.get(p.side.id)
  if (!self || actorDefeated(self) || isAdversaryActor(self)) return []

  const enemy = firstLivingEnemy(p, participants, states)
  if (!enemy) return []
  const target = states.get(enemy.side.id)!

  p.side.cfg.targetId = enemy.side.id
  // LLM vs adversaire : bloqué en amont par assertAgentConstraints (prompt PC-shaped).
  const plans = await planRoundAI(self, target as import('./combat/types').CombatantState, p.side.cfg, session)
  return withTargetPart(plans, enemy.side.id, target)
}

/** One scripted participant's whole-round plan, plus who it was aimed at. */
interface ActorRoundPlan {
  actorId:  string
  targetId: string
  plans:    Plan[]
  /** Top-3 candidate plans by utility (empty for LLM agents). For the log. */
  ranking:  RankedPlan[]
}

/**
 * Whole-round plan for every scripted participant (créatures + PJ scriptés),
 * decided from the START-of-round state. The PA reservation is optimal and the
 * plan keeps its bite (planning band by band from the real mid-round state
 * proved more timid — the fragile Précis/Puissant duel tipped into stalemate).
 * Movement heuristics (approach) read the start-of-round gap; the resolution
 * layer re-gates reach after feet move (gateByReach).
 */
function scriptedRoundPlan(
  participants: Participant[],
  states:       ReadonlyMap<string, Actor>,
  fromBand:     Band = 'I',
): ActorRoundPlan[] {
  const out: ActorRoundPlan[] = []

  for (const p of participants) {
    if (p.side.kind === 'pc' && p.side.agentType === 'llm') continue  // planned elsewhere
    const self = states.get(p.side.id)
    if (!self || actorDefeated(self)) continue

    const enemy = firstLivingEnemy(p, participants, states)
    if (!enemy) continue

    const ranking: RankedPlan[] = []
    const plans = planParticipantRound(p, self, enemy, states, ranking, fromBand)
    out.push({ actorId: p.side.id, targetId: enemy.side.id, plans, ranking })
  }
  return out
}

/** Full-round plan for one scripted participant against a chosen enemy. */
function planParticipantRound(
  p:        Participant,
  self:     Actor,
  enemy:    Participant,
  states:   ReadonlyMap<string, Actor>,
  ranking:  RankedPlan[],
  fromBand: Band = 'I',
): Plan[] {
  const target = states.get(enemy.side.id)!

  // Créature : planificateur par utilité UNIFIÉ (même moteur que les PJ).
  if (p.side.kind === 'adversary') {
    if (!isAdversaryActor(self) || isAdversaryActor(target)) return []
    return planAdversaryRoundUtility(
      self, target, { persona: 'aggressive', targetId: enemy.side.id }, fromBand, new Set(), ranking,
    )
  }

  if (isAdversaryActor(self) || p.side.kind !== 'pc') return []  // defensive
  p.side.cfg.targetId = enemy.side.id
  return withTargetPart(planRoundActions(self, target, p.side.cfg, fromBand, ranking), enemy.side.id, target)
}

// ─── Summaries & profiles ────────────────────────────────────────────────────

/** Slug for report ids: unaccented, lowercase, hyphen-separated. */
export function slug(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** `YYYYMMDD-HHMMSS` in local time — the prefix of every report id. */
export function timestampSlug(iso: string): string {
  const d   = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
         `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/**
 * Identifiant d'un rapport individuel :
 * "20260529-143022-bagarre-de-rue-brawler-vs-enduring"
 */
export function makeReportId(
  iso:           string,
  encounterName: string,
  name1:         string,
  name2:         string,
): string {
  return `${timestampSlug(iso)}-${slug(encounterName)}-${slug(name1)}-vs-${slug(name2)}`
}

function makeCombatantSummary(char: Character): CombatantSummary {
  const stats  = Object.fromEntries(
    ALL_CHARACTERISTICS.map(c => [c, char.characteristics[c].value])
  ) as Record<CharacteristicName, number>
  const skills = Object.fromEntries(
    ALL_SKILLS.map(s => [s, char.skills[s]])
  ) as Record<SkillName, number>
  return {
    id:       char.name,
    charName: char.name,
    ...(char.people && { people: char.people.name }),
    stats,
    skills,
  }
}

/**
 * Summary for either side. Adversaries have no characteristics/skills — the
 * records are zero-filled so the CombatLog schema (and stats aggregation) holds.
 */
function makeSideSummary(side: Side): CombatantSummary {
  if (side.kind === 'pc') return makeCombatantSummary(side.char)
  const stats  = Object.fromEntries(ALL_CHARACTERISTICS.map(c => [c, 0])) as Record<CharacteristicName, number>
  const skills = Object.fromEntries(ALL_SKILLS.map(s => [s, 0])) as Record<SkillName, number>
  return {
    id:       side.id,
    charName: side.sheet.name,
    stats,
    skills,
  }
}

/** Combatant summary tagged with its faction — the unit victory is keyed on. */
function makeParticipantSummary(p: Participant): CombatantSummary {
  return { ...makeSideSummary(p.side), faction: p.factionName }
}

/**
 * Enveloppe spatiale + trousse d'un acteur, pour les zones et la liste d'actions
 * du viewer. Dérivée de la trousse (allowedActions / deck) et des stats — statique.
 */
function makeProfile(p: Participant, state: Actor): CombatProfile {
  if (isAdversaryActor(state)) {
    const cards = state.sheet.cards
    return {
      actions:  cards.map(c => c.id),
      reach:    Math.max(1, ...cards.map(c => c.reach ?? 1)),
      minRange: 0,
      move:     Math.max(0, ...cards.map(cardMoveBudget)),
    }
  }
  // PJ : enveloppe d'attaque = l'action offensive à la plus large portée.
  const allowed = (p.side.kind === 'pc' && p.side.cfg.allowedActions?.length
    ? p.side.cfg.allowedActions
    : (Object.keys(ACTION_DEFS) as ActionId[]))
  let reach = 1, minRange = 0
  for (const id of allowed) {
    const def = ACTION_DEFS[id]
    // Les réactions ⚡ ne définissent pas l'enveloppe d'attaque « en action ».
    if (!def || def.movement || def.trigger || def.reach == null || !def.tags.includes('offensive')) continue
    if (def.reach > reach) { reach = def.reach; minRange = def.minRange ?? 0 }
  }
  const moveOf = (id: ActionId): number => {
    const b = ACTION_DEFS[id]?.moveBudget
    return typeof b === 'function' ? b(state) : (b ?? 0)
  }
  const move = allowed.includes('course') ? moveOf('course')
             : allowed.includes('walk')   ? moveOf('walk') : 0
  return { actions: [...allowed], reach, minRange, move }
}
