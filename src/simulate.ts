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

import path                     from 'path'
import { mkdir, writeFile }     from 'fs/promises'
import colors                   from 'colors/safe'

import { loadCharacter }        from './character/io'
import { ALL_CHARACTERISTICS, ALL_SKILLS } from './character/data'
import type { Character, CharacteristicName, SkillName } from './character/types'

import { loadEncounter, resolveCharacterPath } from './encounter/io'
import type { EncounterConfig, EncounterFaction } from './encounter/types'

import {
  initCombatant, resetRoundTokensWithLog, isDefeated, effChar, resistanceThreshold,
} from './combat/combatant'
import { resolveRoundWaves } from './combat/round'
import type { GuardProvider, PlannedAction } from './combat/round'
import { planNextAction, makeGuardProvider } from './combat/agent'
import type { AgentConfig }  from './combat/agent'
import type {
  CombatantState, CombatLog, CombatantSummary, RoundLog,
  CombatOutcome, ActionLogEntry, MaintenanceEntry,
} from './combat/types'
import {RollResult} from './types'

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

  const char1 = await loadCharacter(resolveCharacterPath(faction1.characters[0]))
  const char2 = await loadCharacter(resolveCharacterPath(faction2.characters[0]))

  printHeader(encounter.name, encounter.description, faction1, faction2, char1, char2)

  // ── Agent configs ─────────────────────────────────────────────────────────────
  const cfg1: AgentConfig = {
    persona:        faction1.persona,
    targetId:       char2.name,
    allowedActions: faction1.allowedActions,
  }
  const cfg2: AgentConfig = {
    persona:        faction2.persona,
    targetId:       char1.name,
    allowedActions: faction2.allowedActions,
  }

  // ── Guard provider (stateless — réutilisable entre les runs) ────────────────
  const guardProviders = new Map([
    [char1.name, makeGuardProvider(cfg1)],
    [char2.name, makeGuardProvider(cfg2)],
  ])
  const getGuard: GuardProvider = (targetId, state, available, attackerId, actionId) => {
    const p = guardProviders.get(targetId)
    return p ? p(targetId, state, available, attackerId, actionId) : 'absorb'
  }

  await mkdir(REPORTS_DIR, { recursive: true })

  // ── Mode 1 run ──────────────────────────────────────────────────────────────
  if (runCount === 1) {
    const log = runCombat(encounter, char1, char2, cfg1, cfg2, getGuard)
    for (const roundLog of log.rounds) printRound(roundLog)
    const reportPath = path.join(REPORTS_DIR, `${log.id}.json`)
    await writeFile(reportPath, JSON.stringify(log, null, 2), 'utf-8')
    printFooter(log.outcome, reportPath, log.durationMs)
    return
  }

  // ── Mode batch ──────────────────────────────────────────────────────────────
  const logs: CombatLog[] = []
  for (let i = 1; i <= runCount; i++) {
    const log = runCombat(encounter, char1, char2, cfg1, cfg2, getGuard)
    logs.push(log)
    printRunLine(i, runCount, log)
  }

  const timestamp  = new Date().toISOString()
  const batchId    = makeBatchId(timestamp, runCount, encounter.name, char1.name, char2.name)
  const batchReport = buildBatchReport(batchId, timestamp, encounter.name, logs, char1.name, char2.name)
  const reportPath  = path.join(REPORTS_DIR, `${batchId}.json`)
  await writeFile(reportPath, JSON.stringify(batchReport, null, 2), 'utf-8')

  printBatchSummary(batchReport, reportPath)
}

// ─── Combat loop (pur, sans I/O) ─────────────────────────────────────────────

/**
 * Exécute un combat complet et retourne le CombatLog sans rien afficher.
 * Peut être appelé N fois en mode batch.
 */
function runCombat(
  encounter: EncounterConfig,
  char1:     Character,
  char2:     Character,
  cfg1:      AgentConfig,
  cfg2:      AgentConfig,
  getGuard:  GuardProvider,
): CombatLog {
  const startMs = Date.now()

  let states = new Map<string, CombatantState>([
    [char1.name, initCombatant(char1)],
    [char2.name, initCombatant(char2)],
  ])

  const roundLogs: RoundLog[] = []
  let roundNumber = 0

  while (roundNumber < encounter.maxRounds) {
    roundNumber++

    // Phase d'entretien — reset tokens + test d'endurance
    const maintenanceEntries: MaintenanceEntry[] = []
    for (const [id, s] of states) {
      const { state, maintenanceEntry } = resetRoundTokensWithLog(s)
      states.set(id, state)
      if (maintenanceEntry) maintenanceEntries.push(maintenanceEntry)
    }

    // Résolution par vagues (une action par combattant par vague)
    const { states: next, log } = resolveRoundWaves(
      states, roundNumber, getGuard, maintenanceEntries,
      (currentStates) => {
        const s1 = currentStates.get(char1.name)!
        const s2 = currentStates.get(char2.name)!
        return [
          planNextAction(s1, s2, cfg1),
          planNextAction(s2, s1, cfg2),
        ].filter((p): p is PlannedAction => p !== null)
      },
    )
    states = next
    roundLogs.push(log)

    const dead1 = isDefeated(states.get(char1.name)!)
    const dead2 = isDefeated(states.get(char2.name)!)
    if (dead1 || dead2) break
  }

  const dead1 = isDefeated(states.get(char1.name)!)
  const dead2 = isDefeated(states.get(char2.name)!)

  const outcome: CombatOutcome =
    dead1 && dead2 ? { kind: 'mutual-incapacitation', rounds: roundNumber } :
    dead2          ? { kind: 'victor', victorId: char1.name, rounds: roundNumber } :
    dead1          ? { kind: 'victor', victorId: char2.name, rounds: roundNumber } :
                     { kind: 'max-rounds-reached', rounds: roundNumber }

  const durationMs = Date.now() - startMs
  const timestamp  = new Date().toISOString()
  const id         = makeReportId(timestamp, encounter.name, char1.name, char2.name)

  return {
    id,
    timestamp,
    combatants: [char1, char2].map(makeCombatantSummary),
    rounds:     roundLogs,
    outcome,
    durationMs,
  }
}

// ─── Console display — mode 1 run ─────────────────────────────────────────────

function printHeader(
  encounterName: string,
  description:   string | undefined,
  faction1:      EncounterFaction,
  faction2:      EncounterFaction,
  char1:         Character,
  char2:         Character,
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

  for (const [char, faction] of [[char1, faction1], [char2, faction2]] as [Character, EncounterFaction][]) {
    const s  = initCombatant(char)
    const rt = resistanceThreshold(s)
    const allowed = faction.allowedActions.length
      ? `[${faction.allowedActions.join(', ')}]`
      : '[toutes]'
    console.log(
      `  ${char.name.padEnd(18)}` +
      `  For ${effChar(s,'strength')}  Agi ${effChar(s,'agility')}` +
      `  Vig ${effChar(s,'vigor')}  Acu ${effChar(s,'acuity')}` +
      `  │  rés ${rt}  ⚡ ${s.maxReactions}  [${faction.persona}]`
    )
    console.log(`    Actions : ${allowed}`)
  }
  console.log(sep)
}

function printRound(log: RoundLog): void {
  console.log(`\n  ── ROUND ${log.round} ${'─'.repeat(52 - log.round.toString().length)}`)

  if (log.maintenance.length > 0) {
    console.log('  [entretien]')
    for (const entry of log.maintenance) {
      printMaintenance(entry)
    }
  }

  for (const phase of log.phases) {
    if (phase.actions.length === 0) continue
    console.log(`  [init ${phase.initiative}]`)
    for (const entry of phase.actions) {
      printAction(entry)
    }
  }

  // Vitaux de fin de round
  console.log()
  for (const snap of log.endOfRound) {
    const status = snap.status.length ? `  ⚑ ${snap.status.join(' ')}` : ''
    const chars  = Object.entries(snap.charWounds)
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
  const target  = e.targetId  ? ` → ${e.targetId}` : ''
  const roll    = e.checkRoll ? formatRoll(e.checkRoll) : ''
  const guard   = e.guardId   ? `  garde:${e.guardId}(${e.guardRoll?.total ?? '?'})` : ''
  const dc      = e.targetId  ? `  DD:${e.threshold}` : ''
  const outcome = e.targetId  ? (e.hit ? '  ✅' : '  ❌') : ''

  console.log(`    ${e.actorId}: ${e.action}${target} ${roll} vs ${guard}${dc}${outcome}`)

  for (const note of e.notes) {
    console.log(`      ${note}`)
  }
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

// ─── Entry point ──────────────────────────────────────────────────────────────

simulate().catch(err => {
  console.error('\n❌ Erreur de simulation :', err)
  process.exit(1)
})
