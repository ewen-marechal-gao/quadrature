/**
 * Banc d'essai d'équilibrage des PJ — `npm run bench`.
 *
 * Usage:
 *   npm run bench                    → tous les gabarits, 200 runs chacun
 *   npm run bench -- 50              → 50 runs
 *   npm run bench -- 50 brute,fencer → 50 runs, sous-ensemble de gabarits
 *
 * ── Ce que le banc mesure, et pourquoi en DEUX passes ─────────────────────────
 * Un même combat ne peut pas mesurer proprement l'offense ET la résistance : qui
 * frappe fort tue vite, donc encaisse moins, et son score de survie récompense
 * ses dégâts. On sépare donc les deux à l'aide de deux mannequins qui ne meurent
 * jamais (cf. bench/mannequins/) :
 *
 *   • OFFENSE     — le gabarit tape un Sac de frappe qui ne riposte pas. Chaque
 *                   run va au bout du compteur de manches, donc le dénominateur
 *                   du DpM est le même pour tous.
 *   • RÉSISTANCE  — une Sentinelle frappe le gabarit une fois par manche, à
 *                   dégâts fixes. Elle est invincible : la fin du combat ne
 *                   dépend QUE de ce que le PJ arrive à encaisser.
 *
 * ── L'objectif : comparer des gabarits, pas battre des adversaires ────────────
 * C'est un JdR. On ne cherche pas à ce que chaque personnage batte chaque
 * créature, mais à ce que les profils OFFENSIFS se tiennent entre eux. Les
 * chiffres se lisent donc en écart d'un gabarit à l'autre — jamais dans l'absolu.
 *
 * ── Économie de lecture ───────────────────────────────────────────────────────
 * Aucun log de combat n'est écrit : un batch complet pèserait des dizaines de Mo
 * pour un banc dont la sortie tient en trois tableaux. Les CombatLog sont agrégés
 * en mémoire par `computeStats` puis jetés ; seule la synthèse part sur disque.
 */

import path                 from 'path'
import { mkdir, writeFile } from 'fs/promises'

import { loadCharacter }    from './character/io'
import { computeDerived }   from './character/character'
import { ALL_SKILLS }       from './character/data'
import { initCombatant, resistanceThreshold, COMBUSTION_THRESHOLD } from './combat/combatant'
import { SIMULATOR_ROOT }   from './encounter/io'
import type { EncounterConfig } from './encounter/types'
import type { ActionId, CombatLog } from './combat/types'
import { runCombat, loadParticipants, makeRosterGuardProvider, timestampSlug } from './engine'
import { computeStats, type ComputedStats } from './stats'
import { PRICE } from './planner/value'

// ─── Constantes du banc ───────────────────────────────────────────────────────
//
// Ce sont les boutons de calibrage. Les déplacer déplace l'échelle de TOUS les
// gabarits à la fois — ce qui est le but : le banc compare, il ne note pas.

/** Runs par gabarit et par passe, quand la ligne de commande n'en impose pas. */
const DEFAULT_RUNS = 200

/**
 * Manches de la passe d'offense. Le Sac ne ripostant pas, la seule chose qui
 * puisse écourter un run est l'épuisement du PJ — ce qui est un vrai coût, et
 * qu'on veut donc voir. 10 manches laissent la place à une boucle lente (la
 * Focalisation → Décharge de l'Électromancien demande deux manches par cycle)
 * sans laisser la fatigue tout dominer.
 */
const OFFENSE_ROUNDS = 10

/**
 * Plafond de la passe de résistance. Assez haut pour qu'un gabarit solide y
 * survive (et se lise « a tenu le plafond ») sans que les runs s'éternisent.
 */
const RESISTANCE_ROUNDS = 20

/**
 * Persona des DEUX passes. `opportunist` pèse offense et prudence à 1.0 : c'est
 * la seule qui n'incline pas la mesure. En prendre une par passe (agressive pour
 * frapper, prudente pour encaisser) mesurerait deux personnages différents.
 */
const PERSONA = 'opportunist' as const

const DUMMY_PATH    = 'bench/mannequins/training-dummy.card.yaml'
const SENTINEL_PATH = 'bench/mannequins/training-sentinel.card.yaml'

/** Noms de faction FIXES : ce sont les clés sur lesquelles les victoires sont comptées. */
const PC_FACTION  = 'PJ'
const ADV_FACTION = 'Mannequin'

const REPORTS_DIR = path.resolve(SIMULATOR_ROOT, 'bench', 'reports')

// ─── Roster ───────────────────────────────────────────────────────────────────

interface BenchArchetype {
  id:    string
  label: string
  sheet: string
  /**
   * Trousse autorisée. Elle fait partie du gabarit au même titre que sa fiche :
   * un profil qu'on laisserait piocher dans TOUTES les actions ne mesurerait plus
   * une voie, il mesurerait le planificateur. Respiration / Stabiliser sont
   * communes — ce sont les soupapes d'entretien (fatigue 💧 et stabilité ◇), et
   * les retirer punirait arbitrairement les gabarits qui dépensent le plus.
   */
  kit:   ActionId[]
}

const UPKEEP: ActionId[] = ['respiration', 'stabilize']

const ARCHETYPES: BenchArchetype[] = [
  {
    id:    'brute',
    label: 'Brute',
    sheet: 'bench/archetypes/Bench_brute.yaml',
    kit:   ['armed-attack', 'brutal-strike', ...UPKEEP],
  },
  {
    id:    'ranger',
    label: 'Tireur',
    sheet: 'bench/archetypes/Bench_ranger.yaml',
    kit:   ['quick-shot', 'aimed-shot', ...UPKEEP],
  },
  {
    // Précision 0 : la Frappe vive lui est fermée (prérequis rang 1). Sa voie
    // offensive est donc l'Attaque armée — ce qui rend l'écart avec la Brute
    // lisible comme un seul arbitrage (cf. Bench_fencer.yaml).
    id:    'fencer',
    label: 'Escrimeur',
    sheet: 'bench/archetypes/Bench_fencer.yaml',
    kit:   ['armed-attack', ...UPKEEP],
  },
  {
    id:    'electromancer',
    label: 'Électromancien',
    sheet: 'bench/archetypes/Bench_electromancer.yaml',
    kit:   ['spark', 'cathodic-focus', 'discharge', ...UPKEEP],
  },
]

// ─── Mesures ──────────────────────────────────────────────────────────────────

/** Audit de budget : ce qui prouve que les gabarits sont comparables. */
interface RosterAudit {
  label:      string
  skillPoints: number
  resistance: number
  stability:  number
  reactions:  number
  protection: number
  disciplines: string
}

interface OffenseMetrics {
  /** 💢 émises par manche — la mesure de dégâts principale. */
  lightPerRound: number
  /** 💔 émises par manche (Frappe brutale, Tir ciblé…). */
  heavyPerRound: number
  /** 🔥 posées par manche (Étincelle…) — le vecteur des disciplines de feu. */
  burnPerRound:  number
  /**
   * LA colonne de comparaison : 💢, 💔 et 🔥 ramenées à une monnaie unique.
   * Sans elle, trois profils sortant chacun dans une devise différente ne se
   * comparent pas — c'est exactement le cas de la Brute (que des 💔), de
   * l'Escrimeur (que des 💢) et de l'Électromancien (que des 🔥).
   */
  equivPerRound: number
  /** Part des attaques qui franchissent la garde du Sac. */
  hitPct:        number
  /** Actions offensives déclarées par manche — le débit, indépendant de leur réussite. */
  attacksPerRound: number
  /** Manches effectivement jouées en moyenne (< plafond = le PJ s'est épuisé). */
  roundsAvg:     number
}

interface ResistanceMetrics {
  /** Manches tenues avant de tomber (ou plafond atteint). */
  roundsAvg: number
  roundsMin: number
  /** Part des runs où le PJ est tombé avant le plafond. */
  downPct:   number
  /** 💔 portées en fin de run. */
  heavyAvg:  number
  heavyMax:  number
  /** 💧 portée en fin de run. */
  fatigueAvg: number
}

interface BenchRow {
  id:         string
  label:      string
  audit:      RosterAudit
  offense:    OffenseMetrics
  resistance: ResistanceMetrics
}

// ─── Exécution ────────────────────────────────────────────────────────────────

/** Rencontre synthétique : un gabarit contre un mannequin, sans tapis. */
function makeEncounter(
  a: BenchArchetype, adversaryPath: string, maxRounds: number,
): EncounterConfig {
  return {
    name:      `Banc — ${a.label}`,
    maxRounds,
    factions: [
      {
        name:       PC_FACTION,
        characters: [{ sheet: a.sheet, persona: PERSONA }],
        allowedActions: a.kit,
      },
      {
        name:       ADV_FACTION,
        characters: [{ adversary: adversaryPath }],
        allowedActions: [],
      },
    ],
  }
}

/**
 * N runs d'une rencontre, agrégés. Le roster et le provider de garde sont montés
 * UNE fois : ils sont apatrides, et les recharger à chaque run ferait du banc une
 * mesure d'I/O disque.
 */
async function runBatch(enc: EncounterConfig, runs: number): Promise<ComputedStats> {
  const participants = await loadParticipants(enc.factions)
  const getGuard     = makeRosterGuardProvider(participants)
  const logs: CombatLog[] = []
  for (let i = 0; i < runs; i++) logs.push(await runCombat(enc, participants, getGuard))
  return computeStats(logs)
}

/** Moyenne d'un accumulateur de stats.ts (n = 0 → 0, jamais NaN). */
const avg = (a: { sum: number; n: number }): number => (a.n > 0 ? a.sum / a.n : 0)
/** Max d'un accumulateur (n = 0 → 0, jamais −Infinity). */
const max = (a: { max: number; n: number }): number => (a.n > 0 ? a.max : 0)

/**
 * Valeur d'un marqueur 🔥 en 💢-équivalents. La combustion convertit chaque lot
 * de 5 🔥 en une 💔 : un 🔥 vaut donc un cinquième de 💔. C'est une estimation
 * BASSE et volontairement telle — elle ignore la propagation (+1 🔥 par manche
 * tant qu'il en reste un) et le fait que la 💔 de combustion perce l'armure.
 * Mieux vaut sous-créditer une discipline que la surévaluer sur un banc.
 */
const BURN_EQUIV = PRICE.heavy / COMBUSTION_THRESHOLD

function offenseFrom(stats: ComputedStats, pcId: string): OffenseMetrics {
  const totalRounds = stats.rounds.sum || 1
  const actions = stats.actionStats[pcId] ?? {}

  let light = 0, heavy = 0, burn = 0, hits = 0, offUses = 0
  for (const s of Object.values(actions)) {
    light   += s.lightDealt
    heavy   += s.heavyDealt
    burn    += s.burnDealt
    hits    += s.offensiveUses > 0 ? s.hits : 0
    offUses += s.offensiveUses
  }

  return {
    lightPerRound:   light / totalRounds,
    heavyPerRound:   heavy / totalRounds,
    burnPerRound:    burn / totalRounds,
    equivPerRound:   (light + heavy * PRICE.heavy + burn * BURN_EQUIV) / totalRounds,
    hitPct:          offUses > 0 ? (hits / offUses) * 100 : 0,
    attacksPerRound: offUses / totalRounds,
    roundsAvg:       avg(stats.rounds),
  }
}

function resistanceFrom(stats: ComputedStats, pcId: string): ResistanceMetrics {
  const fv = stats.finalVitals[pcId]
  // La Sentinelle ne peut pas perdre : une victoire du camp Mannequin signifie
  // exactement « le PJ est tombé ». Tout le reste, c'est le plafond atteint.
  const down = stats.wins[ADV_FACTION] ?? 0
  return {
    roundsAvg:  avg(stats.rounds),
    roundsMin:  stats.rounds.n > 0 ? stats.rounds.min : 0,
    downPct:    (down / stats.runCount) * 100,
    heavyAvg:   fv ? avg(fv.heavyWounds) : 0,
    heavyMax:   fv ? max(fv.heavyWounds) : 0,
    fatigueAvg: fv ? avg(fv.fatigue) : 0,
  }
}

async function auditOf(a: BenchArchetype): Promise<{ audit: RosterAudit; pcId: string }> {
  const char = await loadCharacter(path.resolve(SIMULATOR_ROOT, a.sheet))
  const st   = initCombatant(char)
  const d    = computeDerived(char)
  const disc = Object.entries(char.disciplines ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')
  return {
    pcId: char.name,
    audit: {
      label:       a.label,
      skillPoints: ALL_SKILLS.reduce((s, k) => s + char.skills[k], 0),
      // ⚠️ Le seuil vient du MOTEUR (Vigueur effective seule), pas de
      // computeDerived — qui rend encore Vigueur + Robustesse et diverge donc de
      // ce que le combat applique réellement. Afficher le second ferait mentir
      // l'audit de 2 points sur un gabarit à Robustesse 2.
      resistance:  resistanceThreshold(st),
      stability:   d.maxStability,
      reactions:   st.maxReactions,
      protection:  char.protection ?? 0,
      disciplines: disc || '—',
    },
  }
}

async function benchArchetype(a: BenchArchetype, runs: number): Promise<BenchRow> {
  const { audit, pcId } = await auditOf(a)

  const offStats = await runBatch(makeEncounter(a, DUMMY_PATH,    OFFENSE_ROUNDS),    runs)
  const resStats = await runBatch(makeEncounter(a, SENTINEL_PATH, RESISTANCE_ROUNDS), runs)

  return {
    id: a.id, label: a.label, audit,
    offense:    offenseFrom(offStats, pcId),
    resistance: resistanceFrom(resStats, pcId),
  }
}

// ─── Affichage ────────────────────────────────────────────────────────────────

const W = 78
const SEP = '═'.repeat(W)
const DIV = '─'.repeat(W)

const n1 = (v: number) => v.toFixed(1)
const n2 = (v: number) => v.toFixed(2)

function printRoster(rows: BenchRow[]): void {
  console.log(DIV)
  console.log('  ROSTER — audit de budget (des colonnes identiques = des gabarits comparables)')
  console.log(
    `  ${'Gabarit'.padEnd(16)}${'pts'.padStart(4)}${'rés'.padStart(5)}` +
    `${'◇'.padStart(4)}${'⚡'.padStart(4)}${'🛡️'.padStart(4)}   Discipline`,
  )
  for (const r of rows) {
    const a = r.audit
    console.log(
      `  ${a.label.padEnd(16)}${String(a.skillPoints).padStart(4)}${String(a.resistance).padStart(5)}` +
      `${String(a.stability).padStart(4)}${String(a.reactions).padStart(4)}${String(a.protection).padStart(4)}   ${a.disciplines}`,
    )
  }
}

function printOffense(rows: BenchRow[]): void {
  console.log(DIV)
  console.log(`  OFFENSE — contre le Sac de frappe (garde 8, ${OFFENSE_ROUNDS} manches)`)
  console.log(`  ⟨éq⟩ = 💢 + ${PRICE.heavy}×💔 + ${BURN_EQUIV}×🔥 — LA colonne à comparer`)
  console.log(
    `  ${'Gabarit'.padEnd(16)}${'éq/manche'.padStart(10)}${'💢/m'.padStart(8)}${'💔/m'.padStart(8)}${'🔥/m'.padStart(8)}` +
    `${'touche'.padStart(8)}${'att/manche'.padStart(11)}${'manches'.padStart(9)}`,
  )
  for (const r of rows) {
    const o = r.offense
    console.log(
      `  ${r.label.padEnd(16)}${n2(o.equivPerRound).padStart(10)}` +
      `${n2(o.lightPerRound).padStart(8)}${n2(o.heavyPerRound).padStart(8)}${n2(o.burnPerRound).padStart(8)}` +
      `${(n1(o.hitPct) + '%').padStart(8)}${n2(o.attacksPerRound).padStart(11)}${n1(o.roundsAvg).padStart(9)}`,
    )
  }
}

function printResistance(rows: BenchRow[]): void {
  console.log(DIV)
  console.log(`  RÉSISTANCE — contre la Sentinelle (1 frappe 💢💢💢 / manche, plafond ${RESISTANCE_ROUNDS})`)
  console.log(
    `  ${'Gabarit'.padEnd(16)}${'tenue moy'.padStart(10)}${'min'.padStart(6)}` +
    `${'tombé'.padStart(8)}${'💔 moy'.padStart(8)}${'💔 max'.padStart(7)}${'💧 moy'.padStart(8)}`,
  )
  for (const r of rows) {
    const s = r.resistance
    console.log(
      `  ${r.label.padEnd(16)}${n1(s.roundsAvg).padStart(10)}${String(s.roundsMin).padStart(6)}` +
      `${(n1(s.downPct) + '%').padStart(8)}${n2(s.heavyAvg).padStart(8)}${String(s.heavyMax).padStart(7)}${n1(s.fatigueAvg).padStart(8)}`,
    )
  }
}

// ─── Arguments ────────────────────────────────────────────────────────────────

function resolveRuns(arg: string | undefined): number {
  if (!arg) return DEFAULT_RUNS
  const n = parseInt(arg, 10)
  if (isNaN(n) || n < 1) {
    throw new Error(`Nombre de runs invalide : "${arg}" — doit être un entier positif.`)
  }
  return n
}

function resolveRoster(arg: string | undefined): BenchArchetype[] {
  if (!arg) return ARCHETYPES
  const wanted = arg.split(',').map(s => s.trim()).filter(Boolean)
  const picked = wanted.map(id => {
    const a = ARCHETYPES.find(x => x.id === id)
    if (!a) {
      throw new Error(
        `Gabarit inconnu : "${id}" — connus : ${ARCHETYPES.map(x => x.id).join(', ')}.`,
      )
    }
    return a
  })
  return picked
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function bench(): Promise<void> {
  const [arg1, arg2] = process.argv.slice(2)
  const runs   = resolveRuns(arg1)
  const roster = resolveRoster(arg2)

  const startMs = Date.now()

  console.log(`\n${SEP}`)
  console.log(`  ⚖️   BANC D'ESSAI — ${roster.length} gabarit${roster.length > 1 ? 's' : ''} × ${runs} runs × 2 passes`)
  console.log(`  persona ${PERSONA} · sans tapis (tous à portée)`)
  console.log(SEP)

  const rows: BenchRow[] = []
  for (const a of roster) {
    process.stdout.write(`  … ${a.label}\r`)
    rows.push(await benchArchetype(a, runs))
  }

  printRoster(rows)
  printOffense(rows)
  printResistance(rows)

  const durationMs = Date.now() - startMs
  const timestamp  = new Date().toISOString()
  const id         = `${timestampSlug(timestamp)}-x${runs}-bench`

  await mkdir(REPORTS_DIR, { recursive: true })
  const reportPath = path.join(REPORTS_DIR, `${id}.json`)
  await writeFile(reportPath, JSON.stringify({
    id, timestamp, runs, durationMs,
    // La config voyage AVEC les chiffres : sans elle, deux rapports pris à des
    // calibrages différents seraient indistinguables et donc incomparables.
    config: {
      persona: PERSONA,
      offenseRounds: OFFENSE_ROUNDS,
      resistanceRounds: RESISTANCE_ROUNDS,
      dummy: DUMMY_PATH,
      sentinel: SENTINEL_PATH,
    },
    rows,
  }, null, 2), 'utf-8')

  console.log(DIV)
  console.log(`  ⏱  ${(durationMs / 1000).toFixed(1)} s`)
  console.log(`  📊 ${reportPath}`)
  console.log(`${SEP}\n`)
}

bench().catch(err => {
  console.error('\n❌ Erreur de banc d’essai :', err)
  process.exit(1)
})
