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
import { initCombatant, resistanceThreshold } from './combat/combatant'
import { SIMULATOR_ROOT }   from './encounter/io'
import type { EncounterConfig } from './encounter/types'
import type { ActionId, CombatLog } from './combat/types'
import { runCombat, loadParticipants, makeRosterGuardProvider, timestampSlug } from './engine'
import { computeStats, type ComputedStats } from './stats'

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
/** Id porté par la fiche du Sac — la clé sous laquelle ses instantanés sont logués. */
const DUMMY_ID      = 'training-dummy'

/** Noms de faction FIXES : ce sont les clés sur lesquelles les victoires sont comptées. */
const PC_FACTION  = 'PJ'
const ADV_FACTION = 'Mannequin'

const REPORTS_DIR = path.resolve(SIMULATOR_ROOT, 'bench', 'reports')

// ─── Roster ───────────────────────────────────────────────────────────────────

interface BenchArchetype {
  id:    string
  label: string
  sheet: string
}

/**
 * LA MÊME trousse pour tous les gabarits — et c'est un point de méthode, pas
 * une commodité.
 *
 * Une trousse taillée par gabarit fait arbitrer le CONCEPTEUR du banc à la place
 * du build : retirer la Frappe brutale à l'Escrimeur « parce qu'il n'est pas une
 * brute » alors que sa Puissance 1 la lui ouvre, c'est décider soi-même du
 * résultat qu'on prétend mesurer. On donne donc à chacun la liste entière, et on
 * laisse les VRAIS verrous filtrer :
 *   · les prérequis de compétence (canUseAction) — Puissance 0 ferme la Frappe
 *     brutale, Précision 0 ferme la Frappe vive, Intuition 0 ferme le Tir rapide ;
 *   · la possession de discipline — les cartes d'Électromancie sont fermées à
 *     quiconque n'a pas le rang.
 * Ce que le gabarit peut jouer devient ainsi une CONSÉQUENCE de sa fiche.
 *
 * Deux familles restent volontairement dehors :
 *   · le déplacement — le banc se joue sans tapis, il serait inerte ;
 *   · le social (Provocation, Intimidation) — les mannequins ont la piste
 *     mentale verrouillée, donc ces actions n'auraient aucun effet mesurable et
 *     n'ajouteraient que du bruit dans le choix du planificateur.
 */
const SHARED_KIT: ActionId[] = [
  // Offensives universelles — filtrées par leurs prérequis.
  'armed-attack', 'unarmed-attack', 'brutal-strike', 'sharp-strike',
  'quick-shot', 'aimed-shot',
  // Cartes de discipline — filtrées par la possession du rang.
  'spark', 'cathodic-focus', 'discharge',
  // Entretien : les soupapes de fatigue 💧 et de stabilité ◇. Les retirer
  // punirait arbitrairement les gabarits qui dépensent le plus.
  'respiration', 'stabilize',
  // Éteindre les flammes — indispensable à la passe de RÉSISTANCE : sans elle, un
  // gabarit exposé au feu n'aurait aucune parade et le banc mesurerait une
  // vulnérabilité imaginaire. Inerte dans la passe d'offense (rien ne brûle le PJ).
  'extinguish',
]

const ARCHETYPES: BenchArchetype[] = [
  // Les trois Formes d'Escrime d'abord — elles se lisent l'une contre l'autre.
  { id: 'brute',         label: 'Brute (Bellic.)', sheet: 'bench/archetypes/Bench_brute.yaml' },
  { id: 'duelist',       label: 'Duelliste',       sheet: 'bench/archetypes/Bench_duelist.yaml' },
  { id: 'finesse',       label: 'Fine Lame',       sheet: 'bench/archetypes/Bench_finesse.yaml' },
  // Puis les deux voies hors Escrime, qui servent de points de repère externes.
  { id: 'ranger',        label: 'Tireur',          sheet: 'bench/archetypes/Bench_ranger.yaml' },
  { id: 'electromancer', label: 'Électromancien',  sheet: 'bench/archetypes/Bench_electromancer.yaml' },
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
  /**
   * LA colonne de comparaison : cases ▢ effectivement cochées sur la cible, par
   * manche. Elle absorbe sans conversion des profils qui produisent chacun dans
   * une devise différente — la Brute presque que des 💔, l'Escrimeur que des 💢,
   * l'Électromancien que des 🔥.
   */
  casesPerRound: number
  /** 💢 émises par manche — diagnostic : de quoi le débit est fait. */
  lightPerRound: number
  /** 💔 émises par manche (Frappe brutale, Tir ciblé…) — diagnostic. */
  heavyPerRound: number
  /** 🔥 posées par manche (Étincelle…) — diagnostic. */
  burnPerRound:  number
  /**
   * Part de la capacité du mannequin consommée par le run le plus violent.
   * Au-delà de ~90 %, la mesure n'est plus fiable : le trop-plein est perdu.
   */
  saturationPct: number
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
        allowedActions: SHARED_KIT,
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
async function runBatch(
  enc: EncounterConfig, runs: number,
): Promise<{ stats: ComputedStats; logs: CombatLog[] }> {
  const participants = await loadParticipants(enc.factions)
  const getGuard     = makeRosterGuardProvider(participants)
  const logs: CombatLog[] = []
  for (let i = 0; i < runs; i++) logs.push(await runCombat(enc, participants, getGuard))
  return { stats: computeStats(logs), logs }
}

/** Moyenne d'un accumulateur de stats.ts (n = 0 → 0, jamais NaN). */
const avg = (a: { sum: number; n: number }): number => (a.n > 0 ? a.sum / a.n : 0)
/** Max d'un accumulateur (n = 0 → 0, jamais −Infinity). */
const max = (a: { max: number; n: number }): number => (a.n > 0 ? a.max : 0)

// ─── La monnaie du banc : la CASE ▢ cochée ────────────────────────────────────
//
// On ne convertit RIEN. On compte ce que la cible encaisse réellement, en cases
// cochées sur son anatomie — et les vecteurs de dégâts y aboutissent déjà, chacun
// à son juste prix, sans qu'aucun taux de change n'ait à être décrété :
//   · une blessure légère 💢 coche une case ;
//   · une blessure grave 💔 DÉTRUIT un bloc (destroyTopBlock pose damage = cases),
//     donc coche d'un coup toutes les cases de ce bloc ;
//   · les 🔥 deviennent un embrasement ❤️‍🔥 tous les 5 marqueurs, et CHAQUE
//     embrasement détruit un bloc en se déclarant puis en rallume un de plus à
//     chaque fin de manche (§ combustion) ; l'hémorragie 🩸 coche une case par
//     manche.
//
// Le prix relatif d'une 💔 cesse ainsi d'être une opinion du banc : c'est la
// PROFONDEUR DES BLOCS du mannequin, calquée sur l'anatomie réelle des créatures
// (3 cases — cf. bench/mannequins/training-dummy.card.yaml). Le bouton de
// calibrage est dans la fiche, là où un concepteur ira le chercher.
//
// Les colonnes 💢 / 💔 / 🔥 restent affichées, mais comme DIAGNOSTIC : elles
// disent de quoi le débit est fait, pas ce qu'il vaut.

/**
 * Cases ▢ cochées sur la cible, cumulées sur tous les runs.
 *
 * Lues sur le dernier instantané de chaque run — les marques s'accumulent, donc
 * l'état final EST le total encaissé. On lit l'état de la CIBLE plutôt que la
 * somme des effets émis, et c'est délibéré : c'est la seule façon de capturer ce
 * qui transite par un détour temporel (une brûlure posée à la manche 2 ne
 * détruit un bloc qu'à la 5ᵉ, et aucun effet émis ne le dira).
 */
function markedCases(
  logs: CombatLog[], advId: string,
): { marked: number; capacity: number; peak: number } {
  let marked = 0, capacity = 0, peak = 0
  for (const log of logs) {
    const last = log.rounds[log.rounds.length - 1]
    const snap = last?.adversariesEndOfRound?.find(s => s.id === advId)
    if (!snap) continue
    const m = snap.parts.reduce((s, p) => s + p.marked, 0)
    marked  += m
    capacity = snap.parts.reduce((s, p) => s + p.total, 0)
    if (m > peak) peak = m
  }
  return { marked, capacity, peak }
}

function offenseFrom(
  stats: ComputedStats, pcId: string, logs: CombatLog[], advId: string,
): OffenseMetrics {
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

  const cases = markedCases(logs, advId)

  return {
    casesPerRound:   cases.marked / totalRounds,
    lightPerRound:   light / totalRounds,
    heavyPerRound:   heavy / totalRounds,
    burnPerRound:    burn / totalRounds,
    hitPct:          offUses > 0 ? (hits / offUses) * 100 : 0,
    attacksPerRound: offUses / totalRounds,
    roundsAvg:       avg(stats.rounds),
    // Au-delà de la capacité, le trop-plein d'un bloc plein est PERDU
    // (fillBlocks) : le débit serait sous-compté en silence, et d'autant plus
    // que le gabarit frappe fort. Le banc doit crier, pas arrondir.
    saturationPct:   cases.capacity > 0 ? (cases.peak / cases.capacity) * 100 : 0,
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
      // Le seuil est lu sur l'état MOTEUR : c'est lui qui régit la conversion
      // 💢→💔, donc c'est lui que l'audit doit montrer. `computeDerived` donne
      // désormais la même valeur (cf. tests/character/derived.test.ts, qui croise
      // les deux) — mais autant lire la source plutôt que son reflet.
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

  const off = await runBatch(makeEncounter(a, DUMMY_PATH,    OFFENSE_ROUNDS),    runs)
  const res = await runBatch(makeEncounter(a, SENTINEL_PATH, RESISTANCE_ROUNDS), runs)

  return {
    id: a.id, label: a.label, audit,
    offense:    offenseFrom(off.stats, pcId, off.logs, DUMMY_ID),
    resistance: resistanceFrom(res.stats, pcId),
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
  console.log('  ⟨▢/manche⟩ = cases cochées sur la cible — LA colonne à comparer')
  console.log('  (une 💔 détruit un bloc, donc coche ses 3 cases : rien n\'est converti)')
  console.log(
    `  ${'Gabarit'.padEnd(16)}${'▢/manche'.padStart(10)}${'💢/m'.padStart(8)}${'💔/m'.padStart(8)}${'🔥/m'.padStart(8)}` +
    `${'touche'.padStart(8)}${'att/manche'.padStart(11)}${'manches'.padStart(9)}`,
  )
  for (const r of rows) {
    const o = r.offense
    console.log(
      `  ${r.label.padEnd(16)}${n2(o.casesPerRound).padStart(10)}` +
      `${n2(o.lightPerRound).padStart(8)}${n2(o.heavyPerRound).padStart(8)}${n2(o.burnPerRound).padStart(8)}` +
      `${(n1(o.hitPct) + '%').padStart(8)}${n2(o.attacksPerRound).padStart(11)}${n1(o.roundsAvg).padStart(9)}`,
    )
  }
  // Saturation : au-delà, le mannequin déborde et le débit est sous-compté.
  const saturated = rows.filter(r => r.offense.saturationPct >= 90)
  if (saturated.length > 0) {
    console.log(
      `  ⚠️  MESURE NON FIABLE — le mannequin sature (` +
      saturated.map(r => `${r.label} ${n1(r.offense.saturationPct)}%`).join(', ') +
      `). Ajoutez des blocs à sa fiche : le trop-plein est perdu, donc sous-compté.`,
    )
  } else {
    const worst = rows.reduce((m, r) => Math.max(m, r.offense.saturationPct), 0)
    console.log(`  capacité du mannequin consommée au pire : ${n1(worst)} %`)
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
