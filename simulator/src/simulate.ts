/**
 * Combat simulation entry point.
 *
 * Usage:
 *   npm run simulate                              → 1 run, encounters/street-fight.yaml
 *   npm run simulate -- street-fight              → 1 run, encounters/street-fight.yaml
 *   npm run simulate -- street-fight 10           → 10 runs, stats agrégées
 *   npm run simulate -- encounters/foo.yaml 50    → 50 runs, chemin explicite
 *
 * Mode 1 run  : sortie round-par-round + rapport JSON détaillé.
 * Mode N runs : une ligne par run + tableau de stats + rapport JSON agrégé.
 */

import 'dotenv/config'

import path                     from 'path'
import { mkdir, writeFile }     from 'fs/promises'
import colors                   from 'colors/safe'

import { loadCharacter }        from './character/io'
import { ALL_CHARACTERISTICS, ALL_SKILLS } from './character/data'
import type { Character, CharacteristicName, SkillName } from './character/types'

import { loadEncounter, resolveCharacterPath } from './encounter/io'
import type { EncounterConfig, EncounterFaction, EncounterCharacter, AgentType } from './encounter/types'

import {
  initCombatant, resetRoundTokensWithLog, effChar, resistanceThreshold,
} from './combat/combatant'
import { resolveRoundBands } from './combat/round'
import { BANDS, BAND_MOON, type Band } from './combat/bands'
import { type Position } from './combat/position'
import type { GuardProvider, PlannedAction, Plan } from './combat/round'

import { loadAdversary } from './adversary/io'
import type { AdversarySheet } from './adversary/types'
import {
  initAdversary, DEFAULT_ADVERSARY_ACTIONS, ADVERSARY_MENTAL_ICONS,
  type AdversarySnapshot,
} from './adversary/combatant'
import { ADVERSARY_EMOJI, type AdversaryRollResult } from './adversary/dice'
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
  CombatantState, CombatLog, CombatantSummary, RoundLog, PhaseLog,
  CombatOutcome, ActionLogEntry, MaintenanceEntry, CombatantSnapshot, PlanningEntry,
  CombatProfile, ActionId,
} from './combat/types'
import { MENTAL_ICONS } from './combat/types'
import {RollResult} from './types'

import { computeStats, printStats } from './stats'

// ─── Constants ────────────────────────────────────────────────────────────────

const REPORTS_DIR    = path.resolve(__dirname, '..', 'combatReports')
const ENCOUNTERS_DIR = path.resolve(__dirname, '..', 'encounters')


// ─── Batch report type ────────────────────────────────────────────────────────

interface BatchSummary {
  wins:                 Record<string, number>  // charId → nombre de victoires
  mutualIncapacitation: number
  maxRoundsReached:     number
  avgRounds:            number
  minRounds:            number
  maxRounds:            number
  totalDurationMs:      number
}

interface BatchReport {
  id:        string
  timestamp: string
  encounter: string
  runCount:  number
  summary:   BatchSummary
  runs:      CombatLog[]
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function simulate(): Promise<void> {
  const [arg1, arg2] = process.argv.slice(2)
  const encounterPath = resolveEncounterArg(arg1)
  const runCount      = resolveRunCount(arg2)

  // ── Load encounter ──────────────────────────────────────────────────────────
  const encounter = await loadEncounter(encounterPath)
  const participants = await loadParticipants(encounter.factions)
  const factionNames: [string, string] = [encounter.factions[0].name, encounter.factions[1].name]

  // ── LLM guards ───────────────────────────────────────────────────────────────
  const hasLLM = participants.some(p => p.side.kind === 'pc' && p.side.agentType === 'llm')
  if (hasLLM && runCount > 1) {
    throw new Error(
      `Le mode LLM ne peut pas être utilisé en mode batch.\n` +
      `Limitez à 1 run (argument omis ou "1") pour utiliser un agent LLM.`
    )
  }
  if (hasLLM && participants.length > 2) {
    throw new Error(`Agent LLM en combat de groupe : pas encore supporté. Limitez à un duel 1v1.`)
  }
  const hasAdversary = participants.some(p => p.side.kind === 'adversary')
  if (hasLLM && hasAdversary) {
    throw new Error(
      `Agent LLM contre un adversaire : pas encore supporté (le prompt de combat ` +
      `est construit sur l'état d'un personnage). Utilisez un agent scripted.`
    )
  }

  // Card-name registry for console display (card ids → localized names)
  for (const p of participants) {
    if (p.side.kind === 'adversary') {
      for (const card of p.side.sheet.cards) CARD_LABELS.set(card.id, card.name)
    }
  }

  printHeader(encounter, participants)

  // ── Guard provider (scripted, stateless — réutilisable entre les runs) ───────
  // La garde reste scripted même pour les agents LLM : trop coûteux à déléguer au modèle.
  // Seuls les PJ roulent une garde — les adversaires défendent sur valeur fixe.
  const guardProviders = new Map<string, GuardProvider>()
  for (const p of participants) {
    if (p.side.kind === 'pc') guardProviders.set(p.side.id, makeGuardProvider(p.side.cfg))
  }
  const getGuard: GuardProvider = (targetId, state, available, attackerId, actionId, attackInitiative) => {
    const gp = guardProviders.get(targetId)
    return gp ? gp(targetId, state, available, attackerId, actionId, attackInitiative) : 'absorb'
  }

  await mkdir(REPORTS_DIR, { recursive: true })

  // ── Mode 1 run — callbacks temps réel ──────────────────────────────────────
  if (runCount === 1) {
    const log = await runCombat(
      encounter, participants, getGuard,
      {
        onRoundStart: (round, maintenance) => {
          console.log(`\n  ── ROUND ${round} ${'─'.repeat(52 - round.toString().length)}`)
          if (maintenance.length > 0) {
            console.log('  [entretien]')
            for (const entry of maintenance) printMaintenance(entry)
          }
        },
        onWave: (phaseLogs) => {
          // Une révélation = une bande. L'en-tête la nomme, sans quoi le compte
          // rendu ne montre plus la structure de la manche — et « une carte par
          // bande » devient invérifiable à la lecture.
          const band = phaseLogs.find(p => p.band)?.band
          if (band && phaseLogs.some(p => p.actions.length > 0)) {
            console.log(`  ── Bande ${band} ${BAND_MOON[band]} ${'┈'.repeat(44)}`)
          }
          for (const phase of phaseLogs) {
            if (phase.actions.length === 0) continue
            console.log(`  [init ${phase.initiative}]`)
            for (const entry of phase.actions) printAction(entry)
          }
        },
        onRoundEnd: (snapshots, advSnapshots) => printRoundEnd(snapshots, advSnapshots),
      },
    )
    const reportPath = path.join(REPORTS_DIR, `${log.id}.json`)
    await writeFile(reportPath, JSON.stringify(log, null, 2), 'utf-8')
    printStats(computeStats([log]), encounter.name)
    printFooter(log.outcome, reportPath, log.durationMs)
    return
  }

  // ── Mode batch ──────────────────────────────────────────────────────────────
  // (hasLLM est false ici — garanti par la guard ci-dessus ; pas de callbacks)
  const logs: CombatLog[] = []
  for (let i = 1; i <= runCount; i++) {
    const log = await runCombat(encounter, participants, getGuard)
    logs.push(log)
    printRunLine(i, runCount, log)
  }

  const timestamp  = new Date().toISOString()
  const batchId    = makeBatchId(timestamp, runCount, encounter.name, factionNames[0], factionNames[1])
  const batchReport = buildBatchReport(batchId, timestamp, encounter.name, logs, factionNames[0], factionNames[1])
  // Suffixe `.batch.json` VOLONTAIRE (pas un simple `.json`) : il rend la nature
  // du rapport STRUCTURELLE plutôt que devinée d'après un `xN` dans le nom. Un
  // batch (jusqu'à ~90 Mo) n'a vocation qu'aux statistiques — jamais à être
  // chargé ni rejoué ; c'est le suffixe que l'indexeur web exclut (cf.
  // web/scripts/generate-combat-index.mjs). Seuls les rapports 1-run sont visualisés.
  const reportPath  = path.join(REPORTS_DIR, `${batchId}.batch.json`)
  await writeFile(reportPath, JSON.stringify(batchReport, null, 2), 'utf-8')

  const stats     = computeStats(logs)
  const statsPath = path.join(REPORTS_DIR, `${batchId}.stats.json`)
  // Infinity / -Infinity (from empty Acc) → null in JSON
  const statsJson = JSON.stringify(stats, (_k, v) =>
    typeof v === 'number' && !isFinite(v) ? null : v, 2)
  await writeFile(statsPath, statsJson, 'utf-8')

  printStats(stats, encounter.name)
  console.log(`  📄 ${reportPath}`)
  console.log(`  📊 ${statsPath}\n`)
}

// ─── Sides ───────────────────────────────────────────────────────────────────

/** A player-character side: sheet + persona-driven agent (scripted or LLM). */
interface PcSide {
  kind:      'pc'
  id:        string
  char:      Character
  cfg:       AgentConfig
  agentType: AgentType
  /** Starting square, when the encounter declares a board (§ EncounterConfig.board). */
  pos?:      Position
}

/** An adversary side: fiche-driven, scripted deck heuristic, fixed guard. */
interface AdversarySide {
  kind:  'adversary'
  id:    string
  sheet: AdversarySheet
  pos?:  Position
}

type Side = PcSide | AdversarySide

/** Load one faction slot into a Side (PC sheet or adversary fiche). */
async function loadSide(cfg: EncounterCharacter, faction: EncounterFaction): Promise<Side> {
  if (cfg.adversary) {
    const sheet = await loadAdversary(cfg.adversary)
    return { kind: 'adversary', id: sheet.id, sheet, ...(cfg.pos && { pos: cfg.pos }) }
  }
  const char = await loadCharacter(resolveCharacterPath(cfg.sheet!))
  return {
    kind:      'pc',
    id:        char.name,
    char,
    agentType: cfg.agent ?? 'scripted',
    ...(cfg.pos && { pos: cfg.pos }),
    // targetId is (re)assigned each wave to a living enemy in plansForParticipant
    cfg: { persona: cfg.persona!, targetId: '', allowedActions: faction.allowedActions },
  }
}

/** A combatant plus the faction (team) it fights for (index 0 or 1). */
interface Participant {
  side:        Side
  faction:     number
  factionName: string
}

/**
 * Load every combatant of both factions. Any number of combatants per faction
 * is supported (1v1, 2v1, group fights). Ids must be unique across the roster.
 */
async function loadParticipants(
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

/** Card id → localized name, for console display (populated in simulate()). */
const CARD_LABELS = new Map<string, string>()

// ─── Combat loop ─────────────────────────────────────────────────────────────

/**
 * Callbacks fired during combat for real-time display.
 * All are optional — absent callbacks produce no side effects.
 */
interface CombatCallbacks {
  /** Called once per round, before any wave, after maintenance is applied */
  onRoundStart?: (round: number, maintenance: MaintenanceEntry[]) => void
  /** Called after each wave is fully resolved, before the next wave's plans are requested */
  onWave?:       (phaseLogs: PhaseLog[]) => void
  /** Called after end-of-round processing (wound conversion, status ticks) */
  onRoundEnd?:   (snapshots: CombatantSnapshot[], advSnapshots?: AdversarySnapshot[]) => void
}

/**
 * Exécute un combat complet et retourne le CombatLog.
 *
 * En mode LLM, les sessions sont créées une seule fois avant la boucle.
 * Le system prompt (règles + persona) n'est envoyé qu'une fois par combattant.
 * Les callbacks permettent l'affichage temps réel et la mise à jour du contexte.
 *
 * @param agentType1  Type d'agent pour char1 ('scripted' par défaut)
 * @param agentType2  Type d'agent pour char2 ('scripted' par défaut)
 * @param callbacks   Hooks optionnels pour affichage en temps réel
 */
async function runCombat(
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
  // LLM vs adversaire : bloqué en amont dans simulate() (prompt PC-shaped).
  const plans = await planRoundAI(self, target as CombatantState, p.side.cfg, session)
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

// ─── Console display — mode 1 run ─────────────────────────────────────────────

function printHeader(encounter: EncounterConfig, participants: Participant[]): void {
  const sep = '═'.repeat(62)
  console.log(`\n${sep}`)
  console.log(`  ⚔️   ${encounter.name}`)
  if (encounter.description) {
    const words = encounter.description.replace(/\s+/g, ' ').trim().split(' ')
    let line = '  '
    for (const w of words) {
      if (line.length + w.length + 1 > 60) { console.log(line); line = '  ' }
      line += (line === '  ' ? '' : ' ') + w
    }
    if (line.trim()) console.log(line)
  }
  console.log(sep)

  for (let f = 0; f < 2; f++) {
    const faction = encounter.factions[f]
    if (f === 1) console.log(`  ${'─'.repeat(28)} vs`)
    console.log(`  ⟨${faction.name}⟩`)
    for (const p of participants.filter(pp => pp.faction === f)) {
      printCombatantHeader(p.side, faction)
    }
  }
  console.log(sep)
}

/** One combatant's header line (PC stat line + allowed actions, or adversary fiche). */
function printCombatantHeader(side: Side, faction: EncounterFaction): void {
  if (side.kind === 'adversary') {
    const sh   = side.sheet
    const dice = sh.dice.map(d => ADVERSARY_EMOJI[d]).join('')
    console.log(
      `  ${sh.name.padEnd(18)}` +
      `  ${dice}  garde ${sh.guard.type} ${sh.guard.value}` +
      `  │  💧 ${sh.fatigue}  ⚫ ${sh.actions ?? DEFAULT_ADVERSARY_ACTIONS}  [fiche:deck]`
    )
    console.log(`    Deck : [${sh.cards.map(c => c.name).join(', ')}]`)
    return
  }
  const s       = initCombatant(side.char)
  const rt      = resistanceThreshold(s)
  const allowed = faction.allowedActions.length
    ? `[${faction.allowedActions.join(', ')}]`
    : '[toutes]'
  const agentTag = side.agentType === 'llm' ? `🤖 llm:${side.cfg.persona}` : side.cfg.persona
  console.log(
    `  ${side.char.name.padEnd(18)}` +
    `  For ${effChar(s,'strength')}  Agi ${effChar(s,'agility')}` +
    `  Vig ${effChar(s,'vigor')}  Acu ${effChar(s,'acuity')}` +
    `  │  rés ${rt}  ⚡ ${s.maxReactions}  [${agentTag}]`
  )
  console.log(`    Actions : ${allowed}`)
}

/** Vitaux de fin de round (appelé via callback onRoundEnd) */
function printRoundEnd(snapshots: CombatantSnapshot[], advSnapshots: AdversarySnapshot[] = []): void {
  console.log()
  for (const snap of snapshots) {
    const status  = snap.status.length ? `  ⚑ ${snap.status.join(' ')}` : ''
    const chars   = Object.entries(snap.charWounds)
      .map(([c, w]) => `${c.slice(0, 3)}⁻${w}`)
      .join(' ')
    const charStr = chars ? `  ⟨${chars}⟩` : ''
    // Mental marker shown only when off 'focused' (keeps the common case clean)
    const mental  = snap.mentalState !== 'focused' ? `  ${MENTAL_ICONS[snap.mentalState]}` : ''
    console.log(
      `  ${snap.id.padEnd(18)}` +
      `  💢 ${String(snap.lightWounds).padStart(2)}` +
      `  💔 ${snap.heavyWounds}` +
      `  💧 ${String(snap.fatigue).padStart(2)}/20` +
      `  ◇${snap.stability}` +
      mental + charStr + status
    )
  }
  for (const snap of advSnapshots) {
    const parts = snap.parts
      .filter(p => p.marked > 0)
      .map(p => `${p.type} ${p.marked}/${p.total}${p.destroyed ? '✖' : ''}`)
      .join(' · ')
    const flags = `${snap.winded ? ' 😮‍💨' : ''}${snap.stunned ? ' 🫨' : ''}${snap.bleed > 0 ? ` 🩸${snap.bleed}` : ''}`
    console.log(
      `  ${snap.id.padEnd(18)}` +
      `  💧 ${String(snap.fatigue).padStart(2)}/${snap.fatigueMax}` +
      `  ◇${snap.stability} 🫁${snap.endurance} 🍀${snap.evasion}` +
      `  ${ADVERSARY_MENTAL_ICONS[snap.mentalState]}${flags}` +
      (parts ? `  ⟨${parts}⟩` : '')
    )
  }
}

function printMaintenance(e: MaintenanceEntry): void {
  const rollStr = formatRoll(e.roll)
  const outcome = e.success ? '  ✅' : '  ❌'
  console.log(`    ${e.actorId}: endurance${rollStr}  DD:${e.threshold}${outcome}`)
  for (const note of e.notes) {
    console.log(`      ${note}`)
  }
}

function printAction(e: ActionLogEntry): void {
  const tokens  = `[${e.actorActions}⚫][${e.actorReactions}⚡] `
  const label   = CARD_LABELS.get(e.action) ?? e.action
  const roll    = e.checkRoll     ? formatRoll(e.checkRoll)
                : e.adversaryRoll ? formatAdversaryRoll(e.adversaryRoll)
                : ''
  const dc      = `  DD:${e.threshold}`
  // Une action n'échoue jamais : succès ✅ ou succès partiel ◐.
  const outcome = e.hit ? '  ✅' : '  ◐'

  let line: string
  if (e.targetId) {
    // Offensive action: show target (+ declared body part) + guard roll
    const part  = e.targetPart ? `(${e.targetPart})` : ''
    const guard = e.guardId ? `  garde:${e.guardId}(${e.guardRoll?.total ?? '?'})` : ''
    line = `    ${tokens}${e.actorId}: ${label} → ${e.targetId}${part} ${roll} vs${guard}${dc}${outcome}`
  } else {
    // Self-targeted action (Respiration, Stabiliser): no guard, no "vs"
    line = `    ${tokens}${e.actorId}: ${label} ${roll}${dc}${outcome}`
  }

  // Cri de guerre — visible de tous, affiché avant le résultat
  if (e.battleCry) {
    console.log(`    ${colors.cyan(`💬 "${e.battleCry}"`)}`)
  }
  console.log(line)
  for (const note of e.notes) {
    console.log(`      ${note}`)
  }
  // Raisonnement interne — non transmis à l'adversaire, affiché en grisé
  if (e.reasoning) {
    console.log(colors.grey(`      💭 ${e.reasoning}`))
  }
}

/** Jet d'adversaire : dés sommés, ex. [3][5][2][4] = 14 ⭐ */
function formatAdversaryRoll(r: AdversaryRollResult): string {
  const dice  = r.values.map(v => colors.magenta(`[${v}]`)).join('')
  const stars = r.fives > 0 ? ` ${'⭐'.repeat(r.fives)}` : ''
  return `${dice} = ${r.total}${stars}`
}

function formatRoll(roll: RollResult): string {
  const formatWild = roll.wild === 'advantage' ? colors.green : roll.wild === 'disadvantage' ? colors.red : colors.grey
  const wildDie = formatWild(`[${roll.kept.wild.value}]`)
  const caracDie = colors.blue(`[${roll.kept.characteristic.value}]`)
  const skillDie1 = colors.yellow(`[${roll.kept.skill[0].value}]`)
  const skillDie2 = colors.yellow(`[${roll.kept.skill[1].value}]`)
  
  return `${wildDie}${caracDie}${skillDie1}${skillDie2} = ${roll.total} ${roll.critical ? '✴️ ' : ''}${roll.flaw ? ' ⚠️ ' : ''}`
}

function printFooter(outcome: CombatOutcome, reportPath: string, ms: number): void {
  const sep = '═'.repeat(62)
  console.log(`\n${sep}`)
  console.log(`  ${outcomeLabel(outcome)}`)
  console.log(`  ⏱  ${ms} ms`)
  console.log(`  📄 ${reportPath}`)
  console.log(`${sep}\n`)
}

// ─── Console display — mode batch ────────────────────────────────────────────

/**
 * Affiche une ligne condensée pour un run en mode batch :
 *   Run  3/10 : 🏆 Powerfull Brawler          ( 4 rounds)
 */
function printRunLine(i: number, total: number, log: CombatLog): void {
  const w      = String(total).length
  const iStr   = String(i).padStart(w)
  const label  = outcomeShortLabel(log.outcome).padEnd(32)
  const rounds = `(${String(log.outcome.rounds).padStart(2)} rounds)`
  console.log(`  Run ${iStr}/${total} : ${label} ${rounds}`)
}

/**
 * Affiche les statistiques agrégées après tous les runs :
 *
 *   ══ … ══
 *   📊 10 simulations — Bagarre de rue
 *   ── … ──
 *   🏆 Powerfull Brawler   7 /10  (70.0%)
 *   🏆 Enduring Brawler    2 /10  (20.0%)
 *   💀 Double incapacitation  1 /10  (10.0%)
 *   ⏰ Limite de rounds    0 /10   (0.0%)
 *   ── … ──
 *   Rounds   moy. 4.9   min 3   max 8
 *   Durée    total 42 ms  ·  moy. 4 ms/run
 *   📄 /path/batch.json
 *   ══ … ══
 */
function printBatchSummary(report: BatchReport, reportPath: string): void {
  const sep  = '═'.repeat(62)
  const sep2 = '─'.repeat(62)
  const n    = report.runCount
  const s    = report.summary

  const pct = (v: number) => ((v / n) * 100).toFixed(1).padStart(5)
  const cnt = (v: number) => String(v).padStart(String(n).length)

  console.log(`\n${sep}`)
  console.log(`  📊 ${n} simulation${n > 1 ? 's' : ''} — ${report.encounter}`)
  console.log(sep2)

  for (const [charId, wins] of Object.entries(s.wins)) {
    console.log(`  🏆 ${charId.padEnd(22)} ${cnt(wins)} /${n}  (${pct(wins)}%)`)
  }
  console.log(`  💀 Double incapacitation   ${cnt(s.mutualIncapacitation)} /${n}  (${pct(s.mutualIncapacitation)}%)`)
  console.log(`  ⏰ Limite de rounds        ${cnt(s.maxRoundsReached)} /${n}  (${pct(s.maxRoundsReached)}%)`)

  console.log(sep2)
  console.log(`  Rounds   moy. ${s.avgRounds.toFixed(1).padStart(4)}   min ${s.minRounds}   max ${s.maxRounds}`)
  console.log(`  Durée    total ${s.totalDurationMs} ms  ·  moy. ${Math.round(s.totalDurationMs / n)} ms/run`)
  console.log(`  📄 ${reportPath}`)
  console.log(`${sep}\n`)
}

// ─── Outcome labels ───────────────────────────────────────────────────────────

function outcomeLabel(o: CombatOutcome): string {
  switch (o.kind) {
    case 'victor':                return `🏆 Vainqueur : ${o.victorId} (${o.rounds} rounds)`
    case 'mutual-incapacitation': return `💀 Double incapacitation (${o.rounds} rounds)`
    case 'max-rounds-reached':    return `⏰ Limite de ${o.rounds} rounds — match nul`
  }
}

/** Version courte sans le compte de rounds, pour l'affichage batch */
function outcomeShortLabel(o: CombatOutcome): string {
  switch (o.kind) {
    case 'victor':                return `🏆 ${o.victorId}`
    case 'mutual-incapacitation': return `💀 Double incapacitation`
    case 'max-rounds-reached':    return `⏰ Limite atteinte`
  }
}

// ─── Batch report builder ────────────────────────────────────────────────────

function buildBatchReport(
  id:           string,
  timestamp:    string,
  encounterName: string,
  logs:         CombatLog[],
  name1:        string,
  name2:        string,
): BatchReport {
  const wins: Record<string, number> = { [name1]: 0, [name2]: 0 }
  let mutualIncapacitation = 0
  let maxRoundsReached     = 0
  let totalRounds          = 0
  let minRounds            = Infinity
  let maxRoundsVal         = 0
  let totalDurationMs      = 0

  for (const log of logs) {
    const r = log.outcome.rounds
    totalRounds    += r
    minRounds       = Math.min(minRounds, r)
    maxRoundsVal    = Math.max(maxRoundsVal, r)
    totalDurationMs += log.durationMs

    if (log.outcome.kind === 'victor') {
      wins[log.outcome.victorId] = (wins[log.outcome.victorId] ?? 0) + 1
    } else if (log.outcome.kind === 'mutual-incapacitation') {
      mutualIncapacitation++
    } else {
      maxRoundsReached++
    }
  }

  return {
    id,
    timestamp,
    encounter: encounterName,
    runCount:  logs.length,
    summary: {
      wins,
      mutualIncapacitation,
      maxRoundsReached,
      avgRounds:      totalRounds / logs.length,
      minRounds:      minRounds === Infinity ? 0 : minRounds,
      maxRounds:      maxRoundsVal,
      totalDurationMs,
    },
    runs: logs,
  }
}

// ─── Argument resolution ─────────────────────────────────────────────────────

/**
 * Résout l'argument CLI en chemin absolu vers un fichier d'encounter.
 *
 *   (aucun)               → encounters/street-fight.yaml  (défaut)
 *   street-fight          → encounters/street-fight.yaml  (nom court)
 *   encounters/foo.yaml   → <cwd>/encounters/foo.yaml     (chemin explicite)
 */
function resolveEncounterArg(arg: string | undefined): string {
  if (!arg) return path.join(ENCOUNTERS_DIR, 'street-fight.yaml')
  if (!arg.includes('/') && !arg.includes('\\') && !arg.endsWith('.yaml')) {
    return path.join(ENCOUNTERS_DIR, `${arg}.yaml`)
  }
  return path.resolve(process.cwd(), arg)
}

/**
 * Résout le second argument CLI en nombre de runs.
 * Absent ou undefined → 1. Entier positif → N.
 */
function resolveRunCount(arg: string | undefined): number {
  if (!arg) return 1
  const n = parseInt(arg, 10)
  if (isNaN(n) || n < 1) {
    throw new Error(`Nombre de runs invalide : "${arg}" — doit être un entier positif.`)
  }
  return n
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Identifiant d'un rapport individuel :
 * "20260529-143022-bagarre-de-rue-brawler-vs-enduring"
 */
function makeReportId(
  iso:           string,
  encounterName: string,
  name1:         string,
  name2:         string,
): string {
  const d   = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  const dt  = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
              `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const slug = (s: string) =>
    s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${dt}-${slug(encounterName)}-${slug(name1)}-vs-${slug(name2)}`
}

/**
 * Identifiant d'un rapport de batch :
 * "20260529-143022-x10-bagarre-de-rue-brawler-vs-enduring"
 */
function makeBatchId(
  iso:           string,
  n:             number,
  encounterName: string,
  name1:         string,
  name2:         string,
): string {
  const d   = new Date(iso)
  const pad = (x: number) => String(x).padStart(2, '0')
  const dt  = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
              `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const slug = (s: string) =>
    s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${dt}-x${n}-${slug(encounterName)}-${slug(name1)}-vs-${slug(name2)}`
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
 * Dedicated adversary stats are part of the upcoming balancing pass (I.4).
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

// ─── Entry point ──────────────────────────────────────────────────────────────

simulate().catch(err => {
  console.error('\n❌ Erreur de simulation :', err)
  process.exit(1)
})
