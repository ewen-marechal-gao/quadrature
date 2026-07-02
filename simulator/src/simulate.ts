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
import { resolveRoundWaves } from './combat/round'
import type { GuardProvider, PlannedAction, Plan } from './combat/round'

import { loadAdversary } from './adversary/io'
import type { AdversarySheet } from './adversary/types'
import {
  initAdversary, DEFAULT_ADVERSARY_ACTIONS, type AdversarySnapshot,
} from './adversary/combatant'
import { ADVERSARY_EMOJI, type AdversaryRollResult } from './adversary/dice'
import { planAdversaryCard, selectTargetPart } from './adversary/agent'
import { type Actor, isAdversaryActor, actorDefeated, actorStartRound } from './adversary/actor'
import {
  planNextAction, planRoundAI, makeGuardProvider,
  createAgentSession, recordOpponentActions,
} from './combat/agent'
import type { AgentConfig, LLMAgentSession } from './combat/agent'
import type {
  CombatantState, CombatLog, CombatantSummary, RoundLog, PhaseLog,
  CombatOutcome, ActionLogEntry, MaintenanceEntry, CombatantSnapshot,
} from './combat/types'
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
  const [faction1, faction2] = encounter.factions

  if (faction1.characters.length > 1 || faction2.characters.length > 1) {
    console.warn('⚠️  Plusieurs personnages par faction détectés — seul le premier sera utilisé (mode 1v1).')
  }

  const side1 = await loadSide(faction1.characters[0], faction1)
  const side2 = await loadSide(faction2.characters[0], faction2)

  // Cross-wire target ids (needed the other side's id)
  if (side1.kind === 'pc') side1.cfg.targetId = side2.id
  if (side2.kind === 'pc') side2.cfg.targetId = side1.id

  // ── LLM guards ───────────────────────────────────────────────────────────────
  const hasLLM = (side1.kind === 'pc' && side1.agentType === 'llm')
              || (side2.kind === 'pc' && side2.agentType === 'llm')
  if (hasLLM && runCount > 1) {
    throw new Error(
      `Le mode LLM ne peut pas être utilisé en mode batch.\n` +
      `Limitez à 1 run (argument omis ou "1") pour utiliser un agent LLM.`
    )
  }
  const hasAdversary = side1.kind === 'adversary' || side2.kind === 'adversary'
  if (hasLLM && hasAdversary) {
    throw new Error(
      `Agent LLM contre un adversaire : pas encore supporté (le prompt de combat ` +
      `est construit sur l'état d'un personnage). Utilisez un agent scripted.`
    )
  }

  // Card-name registry for console display (card ids → localized names)
  for (const side of [side1, side2]) {
    if (side.kind === 'adversary') {
      for (const card of side.sheet.cards) CARD_LABELS.set(card.id, card.name)
    }
  }

  printHeader(encounter.name, encounter.description, faction1, faction2, side1, side2)

  // ── Guard provider (scripted, stateless — réutilisable entre les runs) ───────
  // La garde reste scripted même pour les agents LLM : trop coûteux à déléguer au modèle.
  // Seuls les PJ roulent une garde — les adversaires défendent sur valeur fixe.
  const guardProviders = new Map(
    [side1, side2]
      .filter((s): s is PcSide => s.kind === 'pc')
      .map(s => [s.id, makeGuardProvider(s.cfg)] as const),
  )
  const getGuard: GuardProvider = (targetId, state, available, attackerId, actionId, attackInitiative) => {
    const p = guardProviders.get(targetId)
    return p ? p(targetId, state, available, attackerId, actionId, attackInitiative) : 'absorb'
  }

  await mkdir(REPORTS_DIR, { recursive: true })

  // ── Mode 1 run — callbacks temps réel ──────────────────────────────────────
  if (runCount === 1) {
    const log = await runCombat(
      encounter, side1, side2, getGuard,
      {
        onRoundStart: (round, maintenance) => {
          console.log(`\n  ── ROUND ${round} ${'─'.repeat(52 - round.toString().length)}`)
          if (maintenance.length > 0) {
            console.log('  [entretien]')
            for (const entry of maintenance) printMaintenance(entry)
          }
        },
        onWave: (phaseLogs) => {
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
    const log = await runCombat(encounter, side1, side2, getGuard)
    logs.push(log)
    printRunLine(i, runCount, log)
  }

  const timestamp  = new Date().toISOString()
  const batchId    = makeBatchId(timestamp, runCount, encounter.name, side1.id, side2.id)
  const batchReport = buildBatchReport(batchId, timestamp, encounter.name, logs, side1.id, side2.id)
  const reportPath  = path.join(REPORTS_DIR, `${batchId}.json`)
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
}

/** An adversary side: fiche-driven, scripted deck heuristic, fixed guard. */
interface AdversarySide {
  kind:  'adversary'
  id:    string
  sheet: AdversarySheet
}

type Side = PcSide | AdversarySide

/** Load one faction slot into a Side (PC sheet or adversary fiche). */
async function loadSide(cfg: EncounterCharacter, faction: EncounterFaction): Promise<Side> {
  if (cfg.adversary) {
    const sheet = await loadAdversary(cfg.adversary)
    return { kind: 'adversary', id: sheet.id, sheet }
  }
  const char = await loadCharacter(resolveCharacterPath(cfg.sheet!))
  return {
    kind:      'pc',
    id:        char.name,
    char,
    agentType: cfg.agent ?? 'scripted',
    // targetId is cross-wired in simulate() once both sides are loaded
    cfg: { persona: cfg.persona!, targetId: '', allowedActions: faction.allowedActions },
  }
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
  encounter:  EncounterConfig,
  side1:      Side,
  side2:      Side,
  getGuard:   GuardProvider,
  callbacks?: CombatCallbacks,
): Promise<CombatLog> {
  const startMs = Date.now()

  // Créer les sessions LLM une seule fois — le system prompt n'est envoyé qu'une fois
  const session1 = side1.kind === 'pc' && side1.agentType === 'llm'
    ? createAgentSession(side1.id, side1.cfg) : undefined
  const session2 = side2.kind === 'pc' && side2.agentType === 'llm'
    ? createAgentSession(side2.id, side2.cfg) : undefined

  // Délai minimum entre vagues pour les agents LLM (évite le rate-limit Mistral)
  const hasLLM      = session1 !== undefined || session2 !== undefined
  const rateLimitMs = hasLLM
    ? Math.max(0, parseInt(process.env.MISTRAL_API_RATELIMIT_MS ?? '0', 10))
    : 0

  const initSide = (s: Side): Actor =>
    s.kind === 'pc' ? initCombatant(s.char) : initAdversary(s.sheet)

  let states = new Map<string, Actor>([
    [side1.id, initSide(side1)],
    [side2.id, initSide(side2)],
  ])

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

    // Résolution par vagues — le planner peut être sync ou async
    const { states: next, log } = await resolveRoundWaves(
      states, roundNumber, getGuard, maintenanceEntries,
      async (currentStates) => {
        const t0 = Date.now()
        // Les deux planners tournent en parallèle (gain latence en mode LLM)
        const [plans1, plans2] = await Promise.all([
          plansForSide(side1, side2, currentStates, session1),
          plansForSide(side2, side1, currentStates, session2),
        ])
        // Rate limit : si les appels ont été plus rapides que le seuil, on attend le reste
        if (rateLimitMs > 0) {
          const elapsed = Date.now() - t0
          if (elapsed < rateLimitMs) await new Promise<void>(r => setTimeout(r, rateLimitMs - elapsed))
        }
        return [...plans1, ...plans2]
      },
      (phaseLogs) => {
        // Mise à jour du contexte LLM avec les actions adverses (avant la prochaine vague)
        if (session1) recordOpponentActions(session1, phaseLogs, side2.id)
        if (session2) recordOpponentActions(session2, phaseLogs, side1.id)
        // Affichage temps réel
        callbacks?.onWave?.(phaseLogs)
      },
    )
    states = next
    roundLogs.push(log)

    callbacks?.onRoundEnd?.(log.endOfRound, log.adversariesEndOfRound)

    if (actorDefeated(states.get(side1.id)!) || actorDefeated(states.get(side2.id)!)) break
  }

  const dead1 = actorDefeated(states.get(side1.id)!)
  const dead2 = actorDefeated(states.get(side2.id)!)

  const outcome: CombatOutcome =
    dead1 && dead2 ? { kind: 'mutual-incapacitation', rounds: roundNumber } :
    dead2          ? { kind: 'victor', victorId: side1.id, rounds: roundNumber } :
    dead1          ? { kind: 'victor', victorId: side2.id, rounds: roundNumber } :
                     { kind: 'max-rounds-reached', rounds: roundNumber }

  const durationMs = Date.now() - startMs
  const timestamp  = new Date().toISOString()
  const id         = makeReportId(timestamp, encounter.name, side1.id, side2.id)

  return {
    id,
    timestamp,
    combatants: [side1, side2].map(makeSideSummary),
    rounds:     roundLogs,
    outcome,
    durationMs,
  }
}

// ─── Agent planner helpers ────────────────────────────────────────────────────

/**
 * Plan one side's actions for the current wave.
 *
 * - Adversary side → scripted deck heuristic (planAdversaryCard).
 * - PC side        → planFor (scripted or LLM); when the opponent is an
 *   adversary, the declared body part (melee priority) is attached to each
 *   offensive plan (§ Cibler une partie).
 */
async function plansForSide(
  side:     Side,
  other:    Side,
  states:   ReadonlyMap<string, Actor>,
  session?: LLMAgentSession,
): Promise<Plan[]> {
  const self = states.get(side.id)
  const opp  = states.get(other.id)
  if (!self || !opp) return []

  if (side.kind === 'adversary') {
    if (!isAdversaryActor(self) || actorDefeated(self) || actorDefeated(opp)) return []
    const plan = planAdversaryCard(self, other.id)
    return plan ? [plan] : []
  }

  if (isAdversaryActor(self)) return []  // defensive — a pc side holds a PC state
  const plans = await planFor(side.agentType, self, opp, side.cfg, session)
  if (isAdversaryActor(opp)) {
    return plans.map(p => p.targetId === other.id
      ? { ...p, targetPart: p.targetPart ?? selectTargetPart(opp, 'melee')?.type }
      : p)
  }
  return plans
}

/**
 * Dispatch action planning to the appropriate agent implementation.
 * Always returns a Promise<PlannedAction[]> for a uniform async interface.
 *
 * - 'scripted'  → planNextAction (sync, wrapped in Promise.resolve)
 * - 'llm'       → planRoundAI with persistent session
 */
async function planFor(
  agentType: AgentType,
  self:      CombatantState,
  opponent:  Actor,
  cfg:       AgentConfig,
  session?:  LLMAgentSession,
): Promise<PlannedAction[]> {
  if (agentType === 'llm') {
    // LLM vs adversaire : bloqué en amont dans simulate() (prompt PC-shaped)
    return planRoundAI(self, opponent as CombatantState, cfg, session)
  }
  const action = planNextAction(self, opponent, cfg)
  return action ? [action] : []
}

// ─── Console display — mode 1 run ─────────────────────────────────────────────

function printHeader(
  encounterName: string,
  description:   string | undefined,
  faction1:      EncounterFaction,
  faction2:      EncounterFaction,
  side1:         Side,
  side2:         Side,
): void {
  const sep = '═'.repeat(62)
  console.log(`\n${sep}`)
  console.log(`  ⚔️   ${encounterName}`)
  if (description) {
    const words = description.replace(/\s+/g, ' ').trim().split(' ')
    let line = '  '
    for (const w of words) {
      if (line.length + w.length + 1 > 60) { console.log(line); line = '  ' }
      line += (line === '  ' ? '' : ' ') + w
    }
    if (line.trim()) console.log(line)
  }
  console.log(sep)

  for (const [side, faction] of [[side1, faction1], [side2, faction2]] as [Side, EncounterFaction][]) {
    if (side.kind === 'adversary') {
      const sh   = side.sheet
      const dice = sh.dice.map(d => ADVERSARY_EMOJI[d]).join('')
      console.log(
        `  ${sh.name.padEnd(18)}` +
        `  ${dice}  garde ${sh.guard.type} ${sh.guard.value}` +
        `  │  💧 ${sh.fatigue}  ⚫ ${sh.actions ?? DEFAULT_ADVERSARY_ACTIONS}  [fiche:deck]`
      )
      console.log(`    Deck : [${sh.cards.map(c => c.name).join(', ')}]`)
      continue
    }
    const s      = initCombatant(side.char)
    const rt     = resistanceThreshold(s)
    const allowed = faction.allowedActions.length
      ? `[${faction.allowedActions.join(', ')}]`
      : '[toutes]'
    const agentTag = side.agentType === 'llm'
      ? `🤖 llm:${side.cfg.persona}`
      : side.cfg.persona
    console.log(
      `  ${side.char.name.padEnd(18)}` +
      `  For ${effChar(s,'strength')}  Agi ${effChar(s,'agility')}` +
      `  Vig ${effChar(s,'vigor')}  Acu ${effChar(s,'acuity')}` +
      `  │  rés ${rt}  ⚡ ${s.maxReactions}  [${agentTag}]`
    )
    console.log(`    Actions : ${allowed}`)
  }
  console.log(sep)
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
    console.log(
      `  ${snap.id.padEnd(18)}` +
      `  💢 ${String(snap.lightWounds).padStart(2)}` +
      `  💔 ${snap.heavyWounds}` +
      `  💧 ${String(snap.fatigue).padStart(2)}/20` +
      charStr + status
    )
  }
  const MENTAL_ICON = { enraged: '😠', focused: '😐', panicked: '😬' } as const
  for (const snap of advSnapshots) {
    const parts = snap.parts
      .filter(p => p.marked > 0)
      .map(p => `${p.type} ${p.marked}/${p.total}${p.destroyed ? '✖' : ''}`)
      .join(' · ')
    console.log(
      `  ${snap.id.padEnd(18)}` +
      `  💧 ${String(snap.fatigue).padStart(2)}/${snap.fatigueMax}` +
      `  ◇${snap.stability} 🫁${snap.endurance} 🍀${snap.evasion}` +
      `  ${MENTAL_ICON[snap.mentalState]}` +
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
  const outcome = e.hit ? '  ✅' : '  ❌'

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

// ─── Entry point ──────────────────────────────────────────────────────────────

simulate().catch(err => {
  console.error('\n❌ Erreur de simulation :', err)
  process.exit(1)
})
