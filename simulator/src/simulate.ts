/**
 * Combat simulation entry point — FRONTAL CLI.
 *
 * Usage:
 *   npm run simulate                              → 1 run, encounters/street-fight.yaml
 *   npm run simulate -- street-fight              → 1 run, encounters/street-fight.yaml
 *   npm run simulate -- street-fight 10           → 10 runs, stats agrégées
 *   npm run simulate -- encounters/foo.yaml 50    → 50 runs, chemin explicite
 *
 * Mode 1 run  : sortie round-par-round + rapport JSON détaillé.
 * Mode N runs : une ligne par run + tableau de stats + rapport JSON agrégé.
 *
 * Ce module ne contient QUE l'entrée/sortie : arguments, affichage console et
 * écriture des rapports. Le déroulé du combat vit dans `engine.ts`, qui n'a
 * aucun effet de bord et sert aussi le banc d'essai (`bench.ts`).
 */

import 'dotenv/config'

import path                     from 'path'
import { mkdir, writeFile }     from 'fs/promises'
import colors                   from 'colors/safe'

import { loadEncounter }        from './encounter/io'
import type { EncounterConfig, EncounterFaction } from './encounter/types'

import { initCombatant, effChar, resistanceThreshold } from './combat/combatant'
import { BAND_MOON }            from './combat/bands'

import {
  DEFAULT_ADVERSARY_ACTIONS, ADVERSARY_MENTAL_ICONS,
  type AdversarySnapshot,
} from './adversary/combatant'
import { ADVERSARY_EMOJI, type AdversaryRollResult } from './adversary/dice'

import {
  runCombat, loadParticipants, makeRosterGuardProvider, assertAgentConstraints,
  timestampSlug, slug, ENCOUNTERS_DIR,
  type Participant, type Side,
} from './engine'

import type {
  CombatLog, RoundLog, PhaseLog,
  CombatOutcome, ActionLogEntry, MaintenanceEntry, CombatantSnapshot,
} from './combat/types'
import { MENTAL_ICONS } from './combat/types'
import { RollResult } from './types'

import { computeStats, printStats } from './stats'

// ─── Constants ────────────────────────────────────────────────────────────────

const REPORTS_DIR = path.resolve(__dirname, '..', 'combatReports')

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

  assertAgentConstraints(participants, runCount)

  // Card-name registry for console display (card ids → localized names)
  for (const p of participants) {
    if (p.side.kind === 'adversary') {
      for (const card of p.side.sheet.cards) CARD_LABELS.set(card.id, card.name)
    }
  }

  printHeader(encounter, participants)

  const getGuard = makeRosterGuardProvider(participants)

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
  // (assertAgentConstraints garantit qu'aucun agent LLM n'est en jeu ici)
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

/** Card id → localized name, for console display (populated in simulate()). */
const CARD_LABELS = new Map<string, string>()

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
  return `${timestampSlug(iso)}-x${n}-${slug(encounterName)}-${slug(name1)}-vs-${slug(name2)}`
}

// ─── Entry point ──────────────────────────────────────────────────────────────

simulate().catch(err => {
  console.error('\n❌ Erreur de simulation :', err)
  process.exit(1)
})
