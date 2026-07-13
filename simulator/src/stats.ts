/**
 * Statistics computation and display for Quadrature combat simulations.
 *
 * computeStats(logs)               → pure aggregation over any number of CombatLog
 * printStats(stats, encounterName) → formatted console output
 *
 * Works for both single-run (n = 1) and batch modes.
 * In single-run mode values are exact; "avg" labels are omitted.
 */

import type { CombatLog, ActionId, GuardId, MentalState } from './combat/types'
import { MENTAL_ICONS }                       from './combat/types'
import { ACTION_DEFS, GUARD_DEFS }           from './combat/actions'
import type { AdversaryMental }              from './adversary/combatant'
import { ADVERSARY_MENTAL_ICONS }            from './adversary/combatant'

// ─── Accumulator ──────────────────────────────────────────────────────────────

interface Acc { sum: number; n: number; min: number; max: number }

function mkAcc(): Acc { return { sum: 0, n: 0, min: Infinity, max: -Infinity } }

function pushAcc(a: Acc, v: number): void {
  a.sum += v; a.n++
  if (v < a.min) a.min = v
  if (v > a.max) a.max = v
}

function accAvg(a: Acc): number     { return a.n ? a.sum / a.n : 0 }
function accMin(a: Acc): number     { return a.n ? a.min : 0 }
function accMax(a: Acc): number     { return a.n ? a.max : 0 }

// ─── Terminal width-aware padding ──────────────────────────────────────────────
//
// padStart/padEnd count UTF-16 code units, but emoji occupy 2 terminal columns
// while their JS length varies (😱 → 2, 🛡️ → 3 with its variation selector).
// This drifts columns progressively once emoji headers are involved. vwidth /
// padv account for the *visual* width instead.

/** Visual width of a string in terminal columns (emoji ≈ 2, VS-16 = 0). */
function vwidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp === 0xfe0f) continue                                  // variation selector → 0
    w += (cp >= 0x1f000 || (cp >= 0x2600 && cp <= 0x27bf)) ? 2 : 1  // emoji/dingbats → 2
  }
  return w
}

/** Pad `s` to `target` visual columns (right-aligned by default). */
function padv(s: string, target: number, align: 'left' | 'right' = 'right'): string {
  const gap = ' '.repeat(Math.max(0, target - vwidth(s)))
  return align === 'right' ? gap + s : s + gap
}

// ─── Stat shapes ──────────────────────────────────────────────────────────────

export interface ActionStat {
  /** Total times this action was declared */
  uses:             number
  /** Subset of uses that targeted an opponent */
  offensiveUses:    number
  /** Rolls that met or beat the threshold */
  hits:             number
  roll:             Acc
  crits:            number
  flaws:            number
  /** add-fatigue effects landing on the opponent (per offensive action) */
  fatigueDealt:     number
  /** light-wound effects landing on the opponent */
  lightDealt:       number
  /** heavy-wound effects landing on the opponent */
  heavyDealt:       number
  /** remove-fatigue effects landing on self (self-targeted actions) */
  fatigueRecovered: number
  /** heal-wounds effects landing on self */
  woundsHealed:     number
}

export interface EnduranceStat {
  tests:     number
  successes: number
  roll:      Acc
  dd:        Acc
}

interface GuardStat {
  /** Times this guard was chosen (≤ 1 per target per round) */
  setups:  number
  dcSum:   number
  dcN:     number
  /** Total attacks resolved against this guard */
  faced:   number
  /** Attacks where the attacker missed (roll < threshold) */
  blocked: number
}

interface VitalAcc {
  fatigue:     Acc
  lightWounds: Acc
  heavyWounds: Acc
  /** Base protection remaining at end of round (tempProtection is always 0 at snapshot time) */
  protection:  Acc
  /** Stability ◇ remaining at end of round */
  stability:   Acc
  /** 🩸 Hémorragie : jetons cumulés en fin de manche */
  bleed:       Acc
}

/** End-of-round vitals accumulator for an adversary (§ Progression adversaire). */
interface AdvVitalAcc {
  fatigue:        Acc
  /** Fatigue death-clock size (constant per adversary). */
  fatigueMax:     number
  stability:      Acc  // ◇
  endurance:      Acc  // 🫁
  evasion:        Acc  // 🍀
  /** Number of destroyed body parts (weapons included). */
  partsDestroyed: Acc
  bleed:          Acc  // 🩸 cumulative hemorrhage tokens
}

export interface ComputedStats {
  runCount:        number
  charNames:       string[]
  wins:            Record<string, number>
  mutual:          number
  timeout:         number
  rounds:          Acc
  roundDist:       Record<number, number>
  totalDurationMs: number
  /** [charId][round] end-of-round vitals across runs */
  vitalsByRound:   Record<string, Record<number, VitalAcc>>
  /** [charId][round][mentalState] → count of runs in that state at end of round */
  mentalByRound:   Record<string, Record<number, Partial<Record<MentalState, number>>>>
  /** [advId][round] end-of-round adversary vitals across runs */
  advVitalsByRound: Record<string, Record<number, AdvVitalAcc>>
  /** [advId][round][adversaryMentalState] → count of runs in that state */
  advMentalByRound: Record<string, Record<number, Partial<Record<AdversaryMental, number>>>>
  /**
   * [charId] vitals at the END of each run — the resources the fight cost.
   * A 100 % win rate can hide a pyrrhic fight: what gets balanced is how many
   * heavy wounds 💔 and how much fatigue 💧 the victory costs the PC.
   */
  finalVitals:     Record<string, VitalAcc>
  endurance:       Record<string, EnduranceStat>
  /** [charId][actionId] */
  actionStats:     Record<string, Record<string, ActionStat>>
  /** [defCharId][guardId] */
  guardStats:      Record<string, Record<string, GuardStat>>
  /**
   * [charId] total defensive reaction tokens ⚡ spent (one spend-reaction per
   * active guard used). Measures how actively a combatant defends — a PC that
   * only ever Encaisse (free) spends 0.
   */
  reactionsUsed:   Record<string, number>
  /** [charId][statusId] — how many times each status was applied */
  statusCounts:    Record<string, Record<string, number>>
}

// ─── Initialisation helpers ───────────────────────────────────────────────────

function mkActionStat(): ActionStat {
  return {
    uses: 0, offensiveUses: 0, hits: 0,
    roll: mkAcc(), crits: 0, flaws: 0,
    fatigueDealt: 0, lightDealt: 0, heavyDealt: 0,
    fatigueRecovered: 0, woundsHealed: 0,
  }
}

function mkGuardStat(): GuardStat {
  return { setups: 0, dcSum: 0, dcN: 0, faced: 0, blocked: 0 }
}

function mkVitalAcc(): VitalAcc {
  return { fatigue: mkAcc(), lightWounds: mkAcc(), heavyWounds: mkAcc(), protection: mkAcc(), stability: mkAcc(), bleed: mkAcc() }
}

function mkAdvVitalAcc(fatigueMax: number): AdvVitalAcc {
  return { fatigue: mkAcc(), fatigueMax, stability: mkAcc(), endurance: mkAcc(), evasion: mkAcc(), partsDestroyed: mkAcc(), bleed: mkAcc() }
}

// ─── Core aggregation ────────────────────────────────────────────────────────

export function computeStats(logs: CombatLog[]): ComputedStats {
  if (logs.length === 0) throw new Error('computeStats: empty log array')

  const charNames = logs[0]!.combatants.map(c => c.id)

  // Victories are keyed by FACTION (outcome.victorId is a faction name). Fall
  // back to combatant ids for older logs that predate the faction field.
  const factionNames = [...new Set(
    logs[0]!.combatants.map(c => c.faction).filter((f): f is string => !!f),
  )]
  const winKeys = factionNames.length > 0 ? factionNames : charNames
  const wins: Record<string, number>   = Object.fromEntries(winKeys.map(n => [n, 0]))
  let mutual = 0, timeout = 0

  const rounds:   Acc                          = mkAcc()
  const roundDist: Record<number, number>      = {}
  let totalDurationMs = 0

  const vitalsByRound:  Record<string, Record<number, VitalAcc>>    = {}
  const mentalByRound:  Record<string, Record<number, Partial<Record<MentalState, number>>>> = {}
  const advVitalsByRound: Record<string, Record<number, AdvVitalAcc>> = {}
  const advMentalByRound: Record<string, Record<number, Partial<Record<AdversaryMental, number>>>> = {}
  const finalVitals:    Record<string, VitalAcc>                    = {}
  const endurance:      Record<string, EnduranceStat>               = {}
  const actionStats:    Record<string, Record<string, ActionStat>>  = {}
  const guardStats:     Record<string, Record<string, GuardStat>>   = {}
  const reactionsUsed:  Record<string, number>                      = {}
  const statusCounts:   Record<string, Record<string, number>>      = {}

  for (const name of charNames) {
    vitalsByRound[name] = {}
    mentalByRound[name] = {}
    finalVitals[name]   = mkVitalAcc()
    endurance[name]     = { tests: 0, successes: 0, roll: mkAcc(), dd: mkAcc() }
    reactionsUsed[name] = 0
    statusCounts[name]  = {}
  }

  for (const log of logs) {

    // ── Outcome ────────────────────────────────────────────────────────────────
    const o = log.outcome
    pushAcc(rounds, o.rounds)
    roundDist[o.rounds] = (roundDist[o.rounds] ?? 0) + 1
    totalDurationMs += log.durationMs

    if (o.kind === 'victor') {
      wins[o.victorId] = (wins[o.victorId] ?? 0) + 1
    } else if (o.kind === 'mutual-incapacitation') {
      mutual++
    } else {
      timeout++
    }

    // ── Coût du combat : vitaux du dernier round (état final des PJ) ──────────
    const lastRound = log.rounds[log.rounds.length - 1]
    for (const snap of lastRound?.endOfRound ?? []) {
      const fv = finalVitals[snap.id]
      if (!fv) continue
      pushAcc(fv.fatigue,     snap.fatigue)
      pushAcc(fv.lightWounds, snap.lightWounds)
      pushAcc(fv.heavyWounds, snap.heavyWounds)
      pushAcc(fv.protection,  snap.protection)
    }

    // ── Per-round processing ───────────────────────────────────────────────────
    for (const round of log.rounds) {

      // Vitals — end-of-round snapshots
      for (const snap of round.endOfRound) {
        if (!vitalsByRound[snap.id]) continue
        if (!vitalsByRound[snap.id]![round.round]) {
          vitalsByRound[snap.id]![round.round] = mkVitalAcc()
        }
        const vr = vitalsByRound[snap.id]![round.round]!
        pushAcc(vr.fatigue,     snap.fatigue)
        pushAcc(vr.lightWounds, snap.lightWounds)
        pushAcc(vr.heavyWounds, snap.heavyWounds)
        pushAcc(vr.protection,  snap.protection)
        pushAcc(vr.stability,   snap.stability)
        pushAcc(vr.bleed,       snap.bleed)

        // Mental-state distribution for this round
        const mbr = mentalByRound[snap.id]!
        if (!mbr[round.round]) mbr[round.round] = {}
        const dist = mbr[round.round]!
        dist[snap.mentalState] = (dist[snap.mentalState] ?? 0) + 1
      }

      // Adversary vitals + mental — end-of-round snapshots
      for (const snap of round.adversariesEndOfRound ?? []) {
        if (!advVitalsByRound[snap.id]) advVitalsByRound[snap.id] = {}
        if (!advVitalsByRound[snap.id]![round.round]) {
          advVitalsByRound[snap.id]![round.round] = mkAdvVitalAcc(snap.fatigueMax)
        }
        const av = advVitalsByRound[snap.id]![round.round]!
        pushAcc(av.fatigue,        snap.fatigue)
        pushAcc(av.stability,      snap.stability)
        pushAcc(av.endurance,      snap.endurance)
        pushAcc(av.evasion,        snap.evasion)
        pushAcc(av.partsDestroyed, snap.parts.filter(p => p.destroyed).length)
        pushAcc(av.bleed,          snap.bleed)

        if (!advMentalByRound[snap.id]) advMentalByRound[snap.id] = {}
        const ambr = advMentalByRound[snap.id]!
        if (!ambr[round.round]) ambr[round.round] = {}
        const adist = ambr[round.round]!
        adist[snap.mentalState] = (adist[snap.mentalState] ?? 0) + 1
      }

      // Endurance tests (maintenance phase)
      for (const m of round.maintenance) {
        const es = endurance[m.actorId]
        if (!es) continue
        es.tests++
        if (m.success) es.successes++
        pushAcc(es.roll, m.roll.total)
        pushAcc(es.dd,   m.threshold)
      }

      // Guard deduplication — first attack on a target per round sets up the guard
      const seenTargets = new Set<string>()

      // Action entries across all phases (waves merged)
      for (const phase of round.phases) {
        for (const entry of phase.actions) {

          // ── Action stats ───────────────────────────────────────────────────
          if (!actionStats[entry.actorId]) actionStats[entry.actorId] = {}
          const charAs = actionStats[entry.actorId]!
          if (!charAs[entry.action]) charAs[entry.action] = mkActionStat()
          const as = charAs[entry.action]!

          as.uses++
          if (entry.targetId) as.offensiveUses++
          if (entry.hit)      as.hits++

          if (entry.checkRoll) {
            pushAcc(as.roll, entry.checkRoll.total)
            if (entry.checkRoll.critical) as.crits++
            if (entry.checkRoll.flaw)     as.flaws++
          }

          for (const fx of entry.effects) {
            // Offensive: effects landing on opponent
            if (entry.targetId) {
              if (fx.kind === 'add-fatigue'  && fx.targetId === entry.targetId) as.fatigueDealt += fx.amount
              if (fx.kind === 'light-wound'  && fx.targetId === entry.targetId) as.lightDealt += fx.amount
              if (fx.kind === 'heavy-wound'  && fx.targetId === entry.targetId) as.heavyDealt++
            }
            // Self-targeted: recovery effects
            if (fx.kind === 'remove-fatigue' && fx.targetId === entry.actorId) as.fatigueRecovered += fx.amount
            if (fx.kind === 'heal-wounds'    && fx.targetId === entry.actorId) as.woundsHealed     += fx.amount
          }

          // ── Status counts + defensive reactions spent ───────────────────────
          for (const fx of entry.effects) {
            if (fx.kind === 'add-status' && statusCounts[fx.targetId]) {
              const sc = statusCounts[fx.targetId]!
              sc[fx.status] = (sc[fx.status] ?? 0) + 1
            }
            // spend-reaction is only produced by active guards (defense)
            if (fx.kind === 'spend-reaction' && reactionsUsed[fx.targetId] !== undefined) {
              reactionsUsed[fx.targetId]++
            }
          }

          // ── Guard stats ────────────────────────────────────────────────────
          if (entry.targetId && entry.guardId) {
            const defId = entry.targetId
            const gId   = entry.guardId
            if (!guardStats[defId])    guardStats[defId] = {}
            if (!guardStats[defId]![gId]) guardStats[defId]![gId] = mkGuardStat()
            const gs = guardStats[defId]![gId]!

            if (!seenTargets.has(defId)) {
              // First attack on this target this round — guard was rolled here
              seenTargets.add(defId)
              gs.setups++
              if (entry.guardRoll) {
                gs.dcSum += entry.guardRoll.total
                gs.dcN++
              }
            }
            gs.faced++
            if (!entry.hit) gs.blocked++
          }
        }
      }
    }
  }

  return {
    runCount: logs.length, charNames,
    wins, mutual, timeout,
    rounds, roundDist, totalDurationMs,
    vitalsByRound, mentalByRound, advVitalsByRound, advMentalByRound,
    finalVitals, endurance, actionStats, guardStats, reactionsUsed, statusCounts,
  }
}

// ─── Display ─────────────────────────────────────────────────────────────────

const GUARD_LABEL: Record<string, string> = {
  absorb: 'Encaisser',
  dodge:  'Esquive',
  parry:  'Parade',
  block:  'Blocage',
}

/** Mental-state columns, fear → rage (matches the batch progression header). */
const MENTAL_COLUMN_ORDER: MentalState[] = [
  'terrified', 'panicked', 'cautious', 'focused', 'aggressive', 'furious', 'enraged',
]

/**
 * Compact 2-char cell for a mental-state percentage: blank below 10 %, the number
 * otherwise, with 100 rendered as "00" to stay two digits.
 */
function mentalCell(pct: number): string {
  if (pct < 10) return '  '
  return (pct >= 100 ? '00' : String(pct)).padStart(2)
}

const STATUS_LABEL: Record<string, string> = {
  hemorrhage:    '🩸 Hémorragie',
  stunned:       '💫 Sonné',
  knockdown:     '🙏 À terre',
  kneeling:      '🧎 À genoux',
  entrapped:     '🕸️ Entravé',
  winded:        '💨 Essoufflé',
  incapacitated: '❌ Incapacité',
}

export function printStats(stats: ComputedStats, encounterName: string): void {
  const W   = 72
  const SEP = '═'.repeat(W)
  const DIV = '─'.repeat(W)
  const n   = stats.runCount
  const isBatch = n > 1

  const pct = (num: number, denom: number): string =>
    denom > 0 ? ((num / denom) * 100).toFixed(1) : '0.0'

  const fmtAvg = (a: Acc, dp = 1): string =>
    a.n > 0 ? accAvg(a).toFixed(dp) : '—'

  console.log(`\n${SEP}`)
  console.log(`  📊 Statistiques — ${encounterName}` + (isBatch ? `  (${n} runs)` : ''))

  // ─ 1. Résultats globaux ────────────────────────────────────────────────────
  console.log(DIV)
  console.log('  RÉSULTATS GLOBAUX')
  const nW = String(n).length
  for (const [charId, w] of Object.entries(stats.wins)) {
    console.log(`  🏆 ${charId.padEnd(24)}  ${String(w).padStart(nW)} /${n}  (${pct(w, n)}%)`)
  }
  console.log(`  💀 Double incapacitation    ${String(stats.mutual).padStart(nW)} /${n}  (${pct(stats.mutual, n)}%)`)
  console.log(`  ⏰ Limite de rounds         ${String(stats.timeout).padStart(nW)} /${n}  (${pct(stats.timeout, n)}%)`)

  // ─ 2. Durée des combats ────────────────────────────────────────────────────
  console.log(DIV)
  console.log('  DURÉE DES COMBATS')
  if (isBatch) {
    const avgRnd = accAvg(stats.rounds)
    const avgMs  = Math.round(stats.totalDurationMs / n)
    console.log(
      `  Rounds : moy. ${avgRnd.toFixed(1).padStart(4)}   ` +
      `min ${accMin(stats.rounds)}   max ${accMax(stats.rounds)}`,
    )
    console.log(`  Durée  : total ${stats.totalDurationMs} ms  ·  moy. ${avgMs} ms/run`)

    // Distribution histogram
    const entries = Object.entries(stats.roundDist)
      .map(([k, v]) => [Number(k), v] as [number, number])
      .sort(([a], [b]) => a - b)
    const maxC  = Math.max(...entries.map(([, v]) => v))
    const BAR   = 30
    console.log()
    for (const [r, count] of entries) {
      const filled = Math.round((count / maxC) * BAR)
      const bar    = '█'.repeat(filled).padEnd(BAR, '░')
      console.log(`  ${String(r).padStart(3)} rds  ▐${bar}▌  ${String(count).padStart(nW)} (${pct(count, n)}%)`)
    }
  } else {
    console.log(`  Rounds : ${accMin(stats.rounds)}   Durée : ${stats.totalDurationMs} ms`)
  }

  // ─ 3. Progression des vitaux par round ─────────────────────────────────────
  for (const charId of stats.charNames) {
    const vbr = stats.vitalsByRound[charId]
    if (!vbr) continue
    const rdNums = Object.keys(vbr).map(Number).sort((a, b) => a - b)
    if (rdNums.length === 0) continue

    console.log(DIV)
    console.log(`  PROGRESSION — ${charId}`)

    const mbr = stats.mentalByRound[charId] ?? {}

    if (isBatch) {
      // Mental-state distribution columns (% of runs in each state, fear → rage).
      // Each mental column is a fixed 2-visual-column field so header icons and
      // percentage cells share the same grid.
      const mentalHdr = MENTAL_COLUMN_ORDER.map(s => padv(MENTAL_ICONS[s], 2)).join(' ')
      console.log(
        `  ${padv('Rd', 3)}  ${padv('💧 moy', 8)}  ${padv('💢 moy', 7)}  ` +
        `${padv('💔 moy', 7)}  ${padv('🛡️ moy', 7)}  ${padv('◇ moy', 6)}  ${padv('🩸 moy', 6)}  ` +
        `${mentalHdr}  ${padv('n runs', 6)}`,
      )
      for (const r of rdNums) {
        const v      = vbr[r]!
        const dist   = mbr[r] ?? {}
        const nRound = v.fatigue.n
        const mentalCells = MENTAL_COLUMN_ORDER
          .map(s => padv(mentalCell(Math.round(((dist[s] ?? 0) / nRound) * 100)), 2))
          .join(' ')
        console.log(
          `  ${padv(String(r), 3)}` +
          `  ${padv(accAvg(v.fatigue).toFixed(1), 8)}` +
          `  ${padv(accAvg(v.lightWounds).toFixed(1), 7)}` +
          `  ${padv(accAvg(v.heavyWounds).toFixed(2), 7)}` +
          `  ${padv(accAvg(v.protection).toFixed(2), 7)}` +
          `  ${padv(accAvg(v.stability).toFixed(1), 6)}` +
          `  ${padv(accAvg(v.bleed).toFixed(1), 6)}` +
          `  ${mentalCells}` +
          `  ${padv(String(nRound), 6)}`,
        )
      }
    } else {
      console.log(
        `  ${padv('Rd', 3)}  ${padv('💧', 8)}  ${padv('💢', 7)}  ${padv('💔', 7)}  ` +
        `${padv('🛡️', 5)}  ${padv('◇', 3)}  ${padv('🩸', 3)}  🧠`,
      )
      for (const r of rdNums) {
        const v     = vbr[r]!
        const dist  = mbr[r] ?? {}
        const state = (Object.keys(dist)[0] as MentalState | undefined)
        const icon  = state ? MENTAL_ICONS[state] : ''
        console.log(
          `  ${padv(String(r), 3)}` +
          `  ${padv(accAvg(v.fatigue).toFixed(0), 8)}` +
          `  ${padv(accAvg(v.lightWounds).toFixed(0), 7)}` +
          `  ${padv(accAvg(v.heavyWounds).toFixed(0), 7)}` +
          `  ${padv(accAvg(v.protection).toFixed(0), 5)}` +
          `  ${padv(accAvg(v.stability).toFixed(0), 3)}` +
          `  ${padv(accAvg(v.bleed).toFixed(0), 3)}` +
          `  ${icon}`,
        )
      }
    }
  }

  // ─ 3 ter. Progression des adversaires par round ────────────────────────────
  // Colonnes : 💧 (horloge /max), ◇/🫁/🍀 ressources, ✖ parties détruites (moy),
  // et distribution mentale 3 états (peur → rage : 😬 😐 😠).
  const ADV_MENTAL_COLUMN_ORDER: AdversaryMental[] = ['panicked', 'cautious', 'aggressive', 'enraged']
  for (const advId of Object.keys(stats.advVitalsByRound)) {
    const vbr = stats.advVitalsByRound[advId]!
    const rdNums = Object.keys(vbr).map(Number).sort((a, b) => a - b)
    if (rdNums.length === 0) continue
    const mbr = stats.advMentalByRound[advId] ?? {}

    console.log(DIV)
    console.log(`  PROGRESSION (adversaire) — ${advId}`)

    if (isBatch) {
      const mentalHdr = ADV_MENTAL_COLUMN_ORDER.map(s => padv(ADVERSARY_MENTAL_ICONS[s], 2)).join(' ')
      console.log(
        `  ${padv('Rd', 3)}  ${padv('💧 moy', 8)}  ${padv('◇ moy', 6)}  ${padv('🫁 moy', 6)}  ` +
        `${padv('🍀 moy', 6)}  ${padv('✖ moy', 6)}  ${padv('🩸 moy', 6)}  ${mentalHdr}  ${padv('n runs', 6)}`,
      )
      for (const r of rdNums) {
        const v      = vbr[r]!
        const dist   = mbr[r] ?? {}
        const nRound = v.fatigue.n
        const mentalCells = ADV_MENTAL_COLUMN_ORDER
          .map(s => padv(mentalCell(Math.round(((dist[s] ?? 0) / nRound) * 100)), 2))
          .join(' ')
        console.log(
          `  ${padv(String(r), 3)}` +
          `  ${padv(`${accAvg(v.fatigue).toFixed(1)}/${v.fatigueMax}`, 8)}` +
          `  ${padv(accAvg(v.stability).toFixed(1), 6)}` +
          `  ${padv(accAvg(v.endurance).toFixed(1), 6)}` +
          `  ${padv(accAvg(v.evasion).toFixed(1), 6)}` +
          `  ${padv(accAvg(v.partsDestroyed).toFixed(1), 6)}` +
          `  ${padv(accAvg(v.bleed).toFixed(1), 6)}` +
          `  ${mentalCells}` +
          `  ${padv(String(nRound), 6)}`,
        )
      }
    } else {
      console.log(
        `  ${padv('Rd', 3)}  ${padv('💧', 8)}  ${padv('◇', 3)}  ${padv('🫁', 3)}  ` +
        `${padv('🍀', 3)}  ${padv('✖', 3)}  ${padv('🩸', 3)}  🧠`,
      )
      for (const r of rdNums) {
        const v     = vbr[r]!
        const dist  = mbr[r] ?? {}
        const state = (Object.keys(dist)[0] as AdversaryMental | undefined)
        const icon  = state ? ADVERSARY_MENTAL_ICONS[state] : ''
        console.log(
          `  ${padv(String(r), 3)}` +
          `  ${padv(`${accAvg(v.fatigue).toFixed(0)}/${v.fatigueMax}`, 8)}` +
          `  ${padv(accAvg(v.stability).toFixed(0), 3)}` +
          `  ${padv(accAvg(v.endurance).toFixed(0), 3)}` +
          `  ${padv(accAvg(v.evasion).toFixed(0), 3)}` +
          `  ${padv(accAvg(v.partsDestroyed).toFixed(0), 3)}` +
          `  ${padv(accAvg(v.bleed).toFixed(0), 3)}` +
          `  ${icon}`,
        )
      }
    }
  }

  // ─ 3 bis. Coût du combat — ressources perdues par les PJ ───────────────────
  const hasCost = stats.charNames.some(id => (stats.finalVitals[id]?.fatigue.n ?? 0) > 0)
  if (hasCost) {
    console.log(DIV)
    console.log('  COÛT DU COMBAT — état final des PJ')
    const cHdr =
      `  ${'Personnage'.padEnd(22)}  ${'💔 moy'.padStart(7)}  ${'💔 max'.padStart(6)}  ` +
      `${'💧 moy'.padStart(7)}  ${'💧 max'.padStart(6)}  ${'💢 moy'.padStart(7)}`
    console.log(cHdr)
    console.log(`  ${'─'.repeat(cHdr.length - 2)}`)
    for (const charId of stats.charNames) {
      const fv = stats.finalVitals[charId]
      if (!fv || fv.fatigue.n === 0) continue  // adversaires : pas de snapshot PJ
      console.log(
        `  ${charId.padEnd(22)}` +
        `  ${accAvg(fv.heavyWounds).toFixed(2).padStart(7)}` +
        `  ${String(accMax(fv.heavyWounds)).padStart(6)}` +
        `  ${accAvg(fv.fatigue).toFixed(1).padStart(7)}` +
        `  ${String(accMax(fv.fatigue)).padStart(6)}` +
        `  ${accAvg(fv.lightWounds).toFixed(1).padStart(7)}`,
      )
    }
  }

  // ─ 4. Tests d'endurance ────────────────────────────────────────────────────
  const hasEndurance = Object.values(stats.endurance).some(e => e.tests > 0)
  if (hasEndurance) {
    console.log(DIV)
    console.log(`  TESTS D'ENDURANCE`)
    const eHdr =
      `  ${'Personnage'.padEnd(22)}  ${'Tests'.padStart(5)}  ${'Succ.'.padStart(5)}  ` +
      `${'Taux'.padStart(6)}  ${'Moy.jet'.padStart(7)}  ${'Moy.DD'.padStart(6)}`
    console.log(eHdr)
    console.log(`  ${'─'.repeat(eHdr.length - 2)}`)

    for (const charId of stats.charNames) {
      const e = stats.endurance[charId]
      if (!e || e.tests === 0) continue
      console.log(
        `  ${charId.padEnd(22)}` +
        `  ${String(e.tests).padStart(5)}` +
        `  ${String(e.successes).padStart(5)}` +
        `  ${pct(e.successes, e.tests).padStart(5)}%` +
        `  ${fmtAvg(e.roll).padStart(7)}` +
        `  ${fmtAvg(e.dd).padStart(6)}`,
      )
    }
  }

  // ─ 5. Performance des actions ──────────────────────────────────────────────
  for (const charId of stats.charNames) {
    const charAs = stats.actionStats[charId]
    if (!charAs) continue

    const entries = Object.entries(charAs)
      .filter(([, s]) => s.uses > 0)
      .sort(([a], [b]) => (ACTION_DEFS[a as ActionId]?.initiative ?? 99) - (ACTION_DEFS[b as ActionId]?.initiative ?? 99))
    if (entries.length === 0) continue

    console.log(DIV)
    console.log(`  ACTIONS — ${charId}`)

    const aHdr =
      `  ${'Action'.padEnd(20)}  ${'Util'.padStart(4)}  ${'/comb'.padStart(5)}  ${'Hit%'.padStart(6)}  ` +
      `${'Moy.J'.padStart(5)}  ${'Crit%'.padStart(5)}  ${'Flaw%'.padStart(5)}  Effet/util`
    console.log(aHdr)
    console.log(`  ${'─'.repeat(aHdr.length - 2)}`)

    for (const [actionId, s] of entries) {
      const label    = (ACTION_DEFS[actionId as ActionId]?.label ?? actionId).slice(0, 20).padEnd(20)
      const uses     = String(s.uses).padStart(4)
      const perCombat = (s.uses / stats.runCount).toFixed(1).padStart(5)

      // Hit rate: for offensive actions denominator = offensiveUses, else = uses
      const hitBase  = s.offensiveUses > 0 ? s.offensiveUses : s.uses
      const hitPct   = pct(s.hits, hitBase).padStart(5)
      const avgRoll  = fmtAvg(s.roll).padStart(5)
      const critPct  = pct(s.crits, s.uses).padStart(4)
      const flawPct  = pct(s.flaws, s.uses).padStart(4)

      // Summary of effects per use
      const parts: string[] = []
      if (s.fatigueDealt     > 0) parts.push(`${(s.fatigueDealt     / s.uses).toFixed(1)}💧↓`)
      if (s.lightDealt       > 0) parts.push(`${(s.lightDealt       / s.uses).toFixed(1)}💢`)
      if (s.heavyDealt       > 0) parts.push(`${(s.heavyDealt       / s.uses).toFixed(2)}💔`)
      if (s.fatigueRecovered > 0) parts.push(`${(s.fatigueRecovered / s.uses).toFixed(1)}💧↑`)
      if (s.woundsHealed     > 0) parts.push(`${(s.woundsHealed     / s.uses).toFixed(1)}💢↑`)
      const effet = parts.join(' ') || '—'

      console.log(
        `  ${label}` +
        `  ${uses}` +
        `  ${perCombat}` +
        `  ${hitPct}%` +
        `  ${avgRoll}` +
        `  ${critPct}%` +
        `  ${flawPct}%` +
        `  ${effet}`,
      )
    }
  }

  // ─ 6. Gardes en défense ────────────────────────────────────────────────────
  const hasGuards = stats.charNames.some(id => stats.guardStats[id] && Object.keys(stats.guardStats[id]!).length > 0)
  if (hasGuards) {
    console.log(DIV)
    console.log(`  GARDES EN DÉFENSE`)

    const gHdr =
      `  ${'Personnage'.padEnd(22)}  ${'Garde'.padEnd(10)}  ${'Setup'.padStart(5)}  ` +
      `${'DC moy'.padStart(6)}  ${'Faces'.padStart(5)}  ${'Bloqués'.padStart(7)}  Taux`
    console.log(gHdr)
    console.log(`  ${'─'.repeat(gHdr.length - 2)}`)

    for (const charId of stats.charNames) {
      const charGs = stats.guardStats[charId]
      if (!charGs) continue

      const guardOrder: GuardId[] = ['absorb', 'dodge', 'parry', 'block']
      const used = guardOrder.filter(g => charGs[g] && charGs[g]!.setups > 0)
      for (const gId of used) {
        const gs    = charGs[gId]!
        const label = (GUARD_DEFS[gId]?.label ?? GUARD_LABEL[gId] ?? gId).padEnd(10)
        const dcAvg = gs.dcN > 0 ? (gs.dcSum / gs.dcN).toFixed(1) : '—'
        console.log(
          `  ${charId.padEnd(22)}` +
          `  ${label}` +
          `  ${String(gs.setups).padStart(5)}` +
          `  ${String(dcAvg).padStart(6)}` +
          `  ${String(gs.faced).padStart(5)}` +
          `  ${String(gs.blocked).padStart(7)}` +
          `  ${pct(gs.blocked, gs.faced)}%`,
        )
      }

      // Synthèse défensive : réactions ⚡ dépensées + niveau de garde moyen
      // (pondéré sur tous les setups, Encaisser compris) + taux de blocage global.
      if (used.length > 0) {
        const dcSum    = used.reduce((s, g) => s + charGs[g]!.dcSum, 0)
        const dcN      = used.reduce((s, g) => s + charGs[g]!.dcN, 0)
        const faced    = used.reduce((s, g) => s + charGs[g]!.faced, 0)
        const blocked  = used.reduce((s, g) => s + charGs[g]!.blocked, 0)
        const avgGuard = dcN > 0 ? (dcSum / dcN).toFixed(1) : '—'
        const react    = stats.reactionsUsed[charId] ?? 0
        const reactStr = isBatch ? `${react} (${(react / n).toFixed(1)}/run)` : `${react}`
        console.log(
          `  ${''.padEnd(22)}  → ⚡ réactions déf. ${reactStr}` +
          `  ·  garde moy. ${avgGuard}` +
          `  ·  blocage global ${pct(blocked, faced)}%`,
        )
      }
    }
  }

  // ─ 7. Statuts appliqués ────────────────────────────────────────────────────
  const hasStatuses = stats.charNames.some(
    id => stats.statusCounts[id] && Object.keys(stats.statusCounts[id]!).length > 0,
  )
  if (hasStatuses) {
    console.log(DIV)
    console.log(`  STATUTS APPLIQUÉS`)
    console.log(
      `  ${'Personnage'.padEnd(22)}  ${'Statut'.padEnd(20)}  ${'Total'.padStart(5)}` +
      (isBatch ? `  ${'/ run'.padStart(5)}` : ''),
    )
    console.log(`  ${'─'.repeat(isBatch ? 60 : 52)}`)

    for (const charId of stats.charNames) {
      const sc = stats.statusCounts[charId]
      if (!sc || Object.keys(sc).length === 0) continue
      const sorted = Object.entries(sc).sort(([, a], [, b]) => b - a)
      for (const [statusId, count] of sorted) {
        const label = (STATUS_LABEL[statusId] ?? statusId).padEnd(20)
        const perRun = isBatch ? `  ${(count / n).toFixed(1).padStart(5)}` : ''
        console.log(`  ${charId.padEnd(22)}  ${label}  ${String(count).padStart(5)}${perRun}`)
      }
    }
  }

  console.log(`${SEP}\n`)
}
