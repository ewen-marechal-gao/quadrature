/**
 * Optimiseur de stratégie pour le simulateur Quadrature.
 *
 * Le planificateur par utilité price le monde à travers un VECTEUR DE POIDS de
 * persona (offense / caution / finisher / noise — cf. planner/value.ts), conçu
 * explicitement comme hook d'optimisation. Cet outil balaye l'axe qui définit un
 * style tactique — l'AGRESSIVITÉ, le compromis offense ↔ caution — pour les deux
 * combattants, calcule les fonctions de meilleure réponse, et identifie
 * l'équilibre de Nash.
 *
 * Un niveau d'agressivité `a` produit le vecteur { offense: a, caution: SOMME−a,
 * finisher, noise } : plus `a` monte, plus le combattant valorise les dégâts
 * qu'il inflige et déprécie ceux qu'il encaisse. `finisher` et `noise` restent au
 * niveau de la persona de la rencontre (son tempérament de base). Le même harnais
 * se généralise à un autre axe en changeant `weightsFor`.
 *
 * Usage:
 *   npm run optimize                      → street-fight (défaut), 300 runs/cellule
 *   npm run optimize -- street-fight      → même chose
 *   npm run optimize -- street-fight 500  → 500 runs/cellule (plus précis, plus lent)
 */

import path from 'path'

import { loadCharacter }                        from './character/io'
import { loadEncounter, resolveCharacterPath }  from './encounter/io'
import type { Character }                       from './character/types'
import type { EncounterConfig }                 from './encounter/types'
import { initCombatant, resetRoundTokensWithLog, isDefeated } from './combat/combatant'
import { resolveRoundBands }                    from './combat/round'
import type { GuardProvider, PlannedAction }    from './combat/round'
import { planRoundActions, makeGuardProvider }  from './combat/agent'
import type { AgentConfig }                     from './combat/agent'
import type { CombatantState, MaintenanceEntry } from './combat/types'
import { PERSONA_WEIGHTS, type Weights }        from './planner/value'

const ENCOUNTERS_DIR = path.resolve(__dirname, '..', 'encounters')

// ─── Axe d'agressivité → vecteur de poids ─────────────────────────────────────
//
// L'agressivité `a` est directement le poids `offense` ; `caution` est son
// complément à SOMME, de sorte qu'offense + caution reste constant et que l'axe
// trace exactement le compromis « frapper vs se protéger » qui distingue les
// personas historiques (agressive 1.35/0.65 · prudente 0.80/1.40).

/** offense + caution le long de l'axe — englobe la plage des personas. */
const WEIGHT_SUM = 2.0

/** Niveaux d'agressivité balayés : 0.6 (très prudent) … 1.4 (très agressif). */
const AGGRESSIONS = Array.from({ length: 9 }, (_, i) => Math.round((0.6 + i * 0.1) * 10) / 10)

/** Un niveau d'agressivité, plaqué sur le tempérament (finisher/noise) d'une persona. */
function weightsFor(base: Weights, aggression: number): Weights {
  return {
    offense:  aggression,
    caution:  WEIGHT_SUM - aggression,
    finisher: base.finisher,
    noise:    base.noise,
  }
}

/** Clé de cellule stable (évite la dérive flottante) et libellé d'affichage. */
const fmt = (a: number): string => a.toFixed(1)
const cellKey = (a1: number, a2: number): string => `${fmt(a1)}:${fmt(a2)}`

// ─── Combat rapide (pas de CombatLog détaillé) ────────────────────────────────

/**
 * Exécute un combat et retourne uniquement le résultat :
 *  +1  combattant 1 gagne
 *  -1  combattant 2 gagne
 *   0  incapacitation mutuelle ou timeout
 */
async function quickCombat(
  encounter: EncounterConfig,
  char1:     Character,
  char2:     Character,
  cfg1:      AgentConfig,
  cfg2:      AgentConfig,
  getGuard:  GuardProvider,
): Promise<number> {
  let states = new Map<string, CombatantState>([
    [char1.name, initCombatant(char1)],
    [char2.name, initCombatant(char2)],
  ])

  for (let r = 0; r < encounter.maxRounds; r++) {
    // Phase d'entretien
    const maintenance: MaintenanceEntry[] = []
    for (const [id, s] of states) {
      const { state, maintenanceEntry } = resetRoundTokensWithLog(s)
      states.set(id, state)
      if (maintenanceEntry) maintenance.push(maintenanceEntry)
    }

    // Balayage par bandes (scripted uniquement dans l'optimiseur) : chaque
    // combattant engage sa manche entière, le résolveur en extrait chaque bande.
    const roundPlan: PlannedAction[] = [
      ...planRoundActions(states.get(char1.name)!, states.get(char2.name)!, cfg1),
      ...planRoundActions(states.get(char2.name)!, states.get(char1.name)!, cfg2),
    ]
    const { states: next } = await resolveRoundBands(
      states, r + 1, getGuard, maintenance,
      () => roundPlan,
    )
    states = next

    const d1 = isDefeated(states.get(char1.name)!)
    const d2 = isDefeated(states.get(char2.name)!)
    if (d1 || d2) return (d1 && d2) ? 0 : d2 ? +1 : -1
  }
  return 0
}

// ─── Grid search ─────────────────────────────────────────────────────────────

interface Cell { w1: number; w2: number; n: number }

async function evalGrid(
  encounter:     EncounterConfig,
  char1:         Character,
  char2:         Character,
  cfg1Base:      AgentConfig,
  cfg2Base:      AgentConfig,
  base1:         Weights,
  base2:         Weights,
  getGuard:      GuardProvider,
  aggressions1:  number[],
  aggressions2:  number[],
  runsPerCell:   number,
): Promise<Map<string, Cell>> {
  const results = new Map<string, Cell>()
  const total   = aggressions1.length * aggressions2.length
  let   done    = 0

  for (const a1 of aggressions1) {
    for (const a2 of aggressions2) {
      const cfg1 = { ...cfg1Base, weights: weightsFor(base1, a1) }
      const cfg2 = { ...cfg2Base, weights: weightsFor(base2, a2) }

      let w1 = 0, w2 = 0
      for (let i = 0; i < runsPerCell; i++) {
        const r = await quickCombat(encounter, char1, char2, cfg1, cfg2, getGuard)
        if (r > 0) w1++
        else if (r < 0) w2++
      }
      results.set(cellKey(a1, a2), { w1, w2, n: runsPerCell })

      done++
      const pct = Math.round(done / total * 100)
      process.stdout.write(`\r  ⏳ ${done}/${total} cellules (${pct}%)  `)
    }
  }
  process.stdout.write('\r' + ' '.repeat(40) + '\r')
  return results
}

// ─── Analyse et équilibre de Nash ────────────────────────────────────────────

function analyze(
  results:      Map<string, Cell>,
  aggressions1: number[],
  aggressions2: number[],
  name1:        string,
  name2:        string,
): void {
  const wr1 = (a1: number, a2: number) => {
    const c = results.get(cellKey(a1, a2))
    return c ? c.w1 / c.n : 0
  }

  // Meilleure réponse de chaque joueur
  const br1 = new Map<number, number>()  // a2 → meilleure agressivité a1 pour joueur 1
  const br2 = new Map<number, number>()  // a1 → meilleure agressivité a2 pour joueur 2

  for (const a2 of aggressions2) {
    let bestA1 = aggressions1[0], best = -Infinity
    for (const a1 of aggressions1) {
      const w = wr1(a1, a2)
      if (w > best) { best = w; bestA1 = a1 }
    }
    br1.set(a2, bestA1)
  }
  for (const a1 of aggressions1) {
    let bestA2 = aggressions2[0], best = Infinity
    for (const a2 of aggressions2) {
      const w = wr1(a1, a2)
      if (w < best) { best = w; bestA2 = a2 }
    }
    br2.set(a1, bestA2)
  }

  // Équilibre de Nash pur : br1(a2*) = a1* ET br2(a1*) = a2*
  const nash: Array<{ a1: number; a2: number; w: number }> = []
  for (const a1 of aggressions1) {
    for (const a2 of aggressions2) {
      if (br1.get(a2) === a1 && br2.get(a1) === a2) {
        nash.push({ a1, a2, w: wr1(a1, a2) })
      }
    }
  }

  // ── Affichage de la grille ────────────────────────────────────────────────
  const n1 = name1.split(' ')[0]
  const n2 = name2.split(' ')[0]

  console.log(`\n  Victoires ${name1} [%]   lignes = agress. ${n1}   colonnes = agress. ${n2}`)
  console.log(`  agress. = poids offense (caution = ${WEIGHT_SUM.toFixed(1)} − offense)`)
  console.log(`  * = meilleure réponse de ${n1}   [x] = équilibre de Nash\n`)

  // En-tête colonnes (cellules larges de 4 — même gabarit partout)
  process.stdout.write('  agr │')
  for (const a2 of aggressions2) process.stdout.write(fmt(a2).padStart(4))
  console.log()
  console.log('  ────┼' + '────'.repeat(aggressions2.length))

  for (const a1 of aggressions1) {
    process.stdout.write(`  ${fmt(a1).padStart(3)} │`)
    for (const a2 of aggressions2) {
      const w  = Math.round(wr1(a1, a2) * 100)
      const isNash = nash.some(p => p.a1 === a1 && p.a2 === a2)
      const isBR   = br1.get(a2) === a1
      const cell   = isNash ? `[${String(w).padStart(2)}]` : isBR ? ` ${String(w).padStart(2)}*` : `  ${String(w).padStart(2)} `
      process.stdout.write(cell)
    }
    // Meilleure réponse de joueur 2 pour cette agressivité a1
    const a2opt = br2.get(a1)!
    const wopt  = Math.round(wr1(a1, a2opt) * 100)
    console.log(`   BR${n2}→${fmt(a2opt)}(${wopt}%)`)
  }

  // ── Tableaux de meilleures réponses ─────────────────────────────────────
  console.log(`\n  Meilleures réponses de ${name1} (maximise ses victoires) :`)
  for (const a2 of aggressions2) {
    const a1 = br1.get(a2)!
    const w  = Math.round(wr1(a1, a2) * 100)
    console.log(`    Si ${n2}=${fmt(a2).padEnd(4)} → ${n1}=${fmt(a1).padEnd(4)} → ${w}% victoires`)
  }

  console.log(`\n  Meilleures réponses de ${name2} (minimise les victoires de ${name1}) :`)
  for (const a1 of aggressions1) {
    const a2 = br2.get(a1)!
    const w  = Math.round(wr1(a1, a2) * 100)
    console.log(`    Si ${n1}=${fmt(a1).padEnd(4)} → ${n2}=${fmt(a2).padEnd(4)} → ${w}% victoires ${n1}`)
  }

  // ── Résultat Nash ─────────────────────────────────────────────────────────
  console.log()
  if (nash.length > 0) {
    for (const { a1, a2, w } of nash) {
      const pct1 = Math.round(w * 100)
      const pct2 = 100 - pct1
      console.log(`  ✅ Équilibre de Nash pur :  agress.${n1}=${fmt(a1)}  agress.${n2}=${fmt(a2)}  →  ${pct1}% / ${pct2}%`)
    }
  } else {
    console.log('  ⚠️  Pas d\'équilibre de Nash pur — itération des meilleures réponses :')
    let a1 = aggressions1[Math.floor(aggressions1.length / 2)]
    let a2 = aggressions2[Math.floor(aggressions2.length / 2)]
    for (let i = 0; i < 30; i++) {
      const na1 = br1.get(a2) ?? a1
      const na2 = br2.get(na1) ?? a2
      if (na1 === a1 && na2 === a2) break
      a1 = na1; a2 = na2
    }
    const w = Math.round(wr1(a1, a2) * 100)
    console.log(`  Convergence : agress.${n1}=${fmt(a1)}  agress.${n2}=${fmt(a2)}  →  ${w}% / ${100 - w}%`)
  }
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────

async function optimize(): Promise<void> {
  const [arg1, arg2] = process.argv.slice(2)

  const encounterPath = !arg1
    ? path.join(ENCOUNTERS_DIR, 'street-fight.yaml')
    : (arg1.includes('/') || arg1.endsWith('.yaml'))
      ? path.resolve(arg1)
      : path.join(ENCOUNTERS_DIR, `${arg1}.yaml`)

  const runsPerCell = Number(arg2) || 300

  const encounter  = await loadEncounter(encounterPath)
  const [f1, f2]   = encounter.factions
  const charCfg1   = f1.characters[0]
  const charCfg2   = f2.characters[0]
  // L'optimiseur est un outil PJ-only : les adversaires du bestiaire n'ont pas
  // de persona à balayer.
  if (!charCfg1.sheet || !charCfg2.sheet) {
    throw new Error('optimize: les deux camps doivent être des personnages (champ "sheet") — adversaires non supportés.')
  }
  const char1      = await loadCharacter(resolveCharacterPath(charCfg1.sheet))
  const char2      = await loadCharacter(resolveCharacterPath(charCfg2.sheet))

  const cfg1Base: AgentConfig = { persona: charCfg1.persona!, targetId: char2.name, allowedActions: f1.allowedActions }
  const cfg2Base: AgentConfig = { persona: charCfg2.persona!, targetId: char1.name, allowedActions: f2.allowedActions }

  // Tempérament de base (finisher/noise) hérité de la persona de chaque camp ;
  // l'axe offense/caution est balayé par-dessus.
  const base1 = PERSONA_WEIGHTS[charCfg1.persona!]
  const base2 = PERSONA_WEIGHTS[charCfg2.persona!]

  // Guard providers : ne dépendent pas des poids — créés une seule fois
  const gp1 = makeGuardProvider(cfg1Base)
  const gp2 = makeGuardProvider(cfg2Base)
  const getGuard: GuardProvider = (targetId, state, available, attackerId, actionId) =>
    targetId === char1.name
      ? gp1(targetId, state, available, attackerId, actionId)
      : gp2(targetId, state, available, attackerId, actionId)

  const aggressions1 = AGGRESSIONS
  const aggressions2 = AGGRESSIONS
  const totalCombats = aggressions1.length * aggressions2.length * runsPerCell

  const sep = '═'.repeat(62)
  console.log(`\n${sep}`)
  console.log(`  🔬 Optimiseur de stratégie — ${encounter.name}`)
  console.log(`  ${char1.name} [${charCfg1.persona}]  vs  ${char2.name} [${charCfg2.persona}]`)
  console.log(`  ${aggressions1.length}×${aggressions2.length} combinaisons × ${runsPerCell} runs = ${totalCombats.toLocaleString()} combats`)
  console.log(sep)

  const start   = Date.now()
  const results = await evalGrid(
    encounter, char1, char2, cfg1Base, cfg2Base, base1, base2, getGuard,
    aggressions1, aggressions2, runsPerCell,
  )
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`  ✅ Terminé en ${elapsed}s\n`)

  analyze(results, aggressions1, aggressions2, char1.name, char2.name)

  console.log(`\n${sep}\n`)
}

optimize().catch(err => {
  console.error('\n❌ Erreur :', err)
  process.exit(1)
})
