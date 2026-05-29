/**
 * Optimiseur de stratégie pour le simulateur Quadrature.
 *
 * Effectue un grid search sur `respirationThreshold` pour les deux combattants,
 * calcule les fonctions de meilleure réponse, et identifie l'équilibre de Nash.
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
import { resolveRoundWaves }                    from './combat/round'
import type { GuardProvider, PlannedAction }    from './combat/round'
import { planNextAction, makeGuardProvider }    from './combat/agent'
import type { AgentConfig }                     from './combat/agent'
import type { CombatantState, MaintenanceEntry } from './combat/types'

const ENCOUNTERS_DIR = path.resolve(__dirname, '..', 'encounters')

// ─── Combat rapide (pas de CombatLog détaillé) ────────────────────────────────

/**
 * Exécute un combat et retourne uniquement le résultat :
 *  +1  combattant 1 gagne
 *  -1  combattant 2 gagne
 *   0  incapacitation mutuelle ou timeout
 */
function quickCombat(
  encounter: EncounterConfig,
  char1:     Character,
  char2:     Character,
  cfg1:      AgentConfig,
  cfg2:      AgentConfig,
  getGuard:  GuardProvider,
): number {
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

    // Résolution par vagues
    const { states: next } = resolveRoundWaves(
      states, r + 1, getGuard, maintenance,
      (cur) => [
        planNextAction(cur.get(char1.name)!, cur.get(char2.name)!, cfg1),
        planNextAction(cur.get(char2.name)!, cur.get(char1.name)!, cfg2),
      ].filter((p): p is PlannedAction => p !== null),
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

function evalGrid(
  encounter:    EncounterConfig,
  char1:        Character,
  char2:        Character,
  cfg1Base:     AgentConfig,
  cfg2Base:     AgentConfig,
  getGuard:     GuardProvider,
  thresholds1:  number[],
  thresholds2:  number[],
  runsPerCell:  number,
): Map<string, Cell> {
  const results = new Map<string, Cell>()
  const total   = thresholds1.length * thresholds2.length
  let   done    = 0

  for (const t1 of thresholds1) {
    for (const t2 of thresholds2) {
      const cfg1 = { ...cfg1Base, respirationThreshold: t1 }
      const cfg2 = { ...cfg2Base, respirationThreshold: t2 }

      let w1 = 0, w2 = 0
      for (let i = 0; i < runsPerCell; i++) {
        const r = quickCombat(encounter, char1, char2, cfg1, cfg2, getGuard)
        if (r > 0) w1++
        else if (r < 0) w2++
      }
      results.set(`${t1}:${t2}`, { w1, w2, n: runsPerCell })

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
  results:     Map<string, Cell>,
  thresholds1: number[],
  thresholds2: number[],
  name1:       string,
  name2:       string,
): void {
  const wr1 = (t1: number, t2: number) => {
    const c = results.get(`${t1}:${t2}`)
    return c ? c.w1 / c.n : 0
  }

  // Meilleure réponse de chaque joueur
  const br1 = new Map<number, number>()  // t2 → meilleur t1 pour joueur 1
  const br2 = new Map<number, number>()  // t1 → meilleur t2 pour joueur 2

  for (const t2 of thresholds2) {
    let bestT1 = thresholds1[0], best = -Infinity
    for (const t1 of thresholds1) {
      const w = wr1(t1, t2)
      if (w > best) { best = w; bestT1 = t1 }
    }
    br1.set(t2, bestT1)
  }
  for (const t1 of thresholds1) {
    let bestT2 = thresholds2[0], best = Infinity
    for (const t2 of thresholds2) {
      const w = wr1(t1, t2)
      if (w < best) { best = w; bestT2 = t2 }
    }
    br2.set(t1, bestT2)
  }

  // Équilibre de Nash pur : br1(t2*) = t1* ET br2(t1*) = t2*
  const nash: Array<{ t1: number; t2: number; w: number }> = []
  for (const t1 of thresholds1) {
    for (const t2 of thresholds2) {
      if (br1.get(t2) === t1 && br2.get(t1) === t2) {
        nash.push({ t1, t2, w: wr1(t1, t2) })
      }
    }
  }

  // ── Affichage de la grille ────────────────────────────────────────────────
  const n1 = name1.split(' ')[0]
  const n2 = name2.split(' ')[0]

  console.log(`\n  Victoires ${name1} [%]   lignes = seuil ${n1}   colonnes = seuil ${n2}`)
  console.log(`  * = meilleure réponse de ${n1}   [x] = équilibre de Nash\n`)

  // En-tête colonnes
  process.stdout.write('  seuil │')
  for (const t2 of thresholds2) process.stdout.write(String(t2).padStart(5))
  console.log()
  console.log('  ──────┼' + '─────'.repeat(thresholds2.length))

  for (const t1 of thresholds1) {
    process.stdout.write(`   ${String(t1).padStart(3)}  │`)
    for (const t2 of thresholds2) {
      const w  = Math.round(wr1(t1, t2) * 100)
      const isNash = nash.some(p => p.t1 === t1 && p.t2 === t2)
      const isBR   = br1.get(t2) === t1
      const cell   = isNash ? `[${String(w).padStart(2)}]` : isBR ? ` ${String(w).padStart(2)}*` : `  ${String(w).padStart(2)} `
      process.stdout.write(cell)
    }
    // Meilleure réponse de joueur 2 pour ce t1
    const t2opt = br2.get(t1)!
    const wopt  = Math.round(wr1(t1, t2opt) * 100)
    console.log(`   BR${n2}→${t2opt}(${wopt}%)`)
  }

  // ── Tableaux de meilleures réponses ─────────────────────────────────────
  console.log(`\n  Meilleures réponses de ${name1} (maximise ses victoires) :`)
  console.log(`  ${'Seuil '+n2+' ='}  → seuil ${n1} optimal  → taux victoire ${n1}`)
  for (const t2 of thresholds2) {
    const t1 = br1.get(t2)!
    const w  = Math.round(wr1(t1, t2) * 100)
    console.log(`    Si ${n2}=${String(t2).padEnd(4)} → ${n1}=${String(t1).padEnd(4)} → ${w}% victoires`)
  }

  console.log(`\n  Meilleures réponses de ${name2} (minimise les victoires de ${name1}) :`)
  for (const t1 of thresholds1) {
    const t2 = br2.get(t1)!
    const w  = Math.round(wr1(t1, t2) * 100)
    console.log(`    Si ${n1}=${String(t1).padEnd(4)} → ${n2}=${String(t2).padEnd(4)} → ${w}% victoires ${n1}`)
  }

  // ── Résultat Nash ─────────────────────────────────────────────────────────
  console.log()
  if (nash.length > 0) {
    for (const { t1, t2, w } of nash) {
      const pct1 = Math.round(w * 100)
      const pct2 = 100 - pct1
      console.log(`  ✅ Équilibre de Nash pur :  seuil${n1}=${t1}  seuil${n2}=${t2}  →  ${pct1}% / ${pct2}%`)
    }
  } else {
    console.log('  ⚠️  Pas d\'équilibre de Nash pur — itération des meilleures réponses :')
    let t1 = thresholds1[Math.floor(thresholds1.length / 2)]
    let t2 = thresholds2[Math.floor(thresholds2.length / 2)]
    for (let i = 0; i < 30; i++) {
      const nt1 = br1.get(t2) ?? t1
      const nt2 = br2.get(nt1) ?? t2
      if (nt1 === t1 && nt2 === t2) break
      t1 = nt1; t2 = nt2
    }
    const w = Math.round(wr1(t1, t2) * 100)
    console.log(`  Convergence : seuil${n1}=${t1}  seuil${n2}=${t2}  →  ${w}% / ${100 - w}%`)
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

  const encounter = await loadEncounter(encounterPath)
  const [f1, f2]  = encounter.factions
  const char1     = await loadCharacter(resolveCharacterPath(f1.characters[0]))
  const char2     = await loadCharacter(resolveCharacterPath(f2.characters[0]))

  const cfg1Base: AgentConfig = { persona: f1.persona, targetId: char2.name, allowedActions: f1.allowedActions }
  const cfg2Base: AgentConfig = { persona: f2.persona, targetId: char1.name, allowedActions: f2.allowedActions }

  // Guard providers : ne dépendent pas du seuil de Respiration — créés une seule fois
  const gp1 = makeGuardProvider(cfg1Base)
  const gp2 = makeGuardProvider(cfg2Base)
  const getGuard: GuardProvider = (targetId, state, available, attackerId, actionId) =>
    targetId === char1.name
      ? gp1(targetId, state, available, attackerId, actionId)
      : gp2(targetId, state, available, attackerId, actionId)

  // Plage de recherche : 4..16
  const thresholds1 = Array.from({ length: 13 }, (_, i) => i + 4)
  const thresholds2 = Array.from({ length: 13 }, (_, i) => i + 4)
  const totalCombats = thresholds1.length * thresholds2.length * runsPerCell

  const sep = '═'.repeat(62)
  console.log(`\n${sep}`)
  console.log(`  🔬 Optimiseur de stratégie — ${encounter.name}`)
  console.log(`  ${char1.name} [${f1.persona}]  vs  ${char2.name} [${f2.persona}]`)
  console.log(`  ${thresholds1.length}×${thresholds2.length} combinaisons × ${runsPerCell} runs = ${totalCombats.toLocaleString()} combats`)
  console.log(sep)

  const start   = Date.now()
  const results = evalGrid(
    encounter, char1, char2, cfg1Base, cfg2Base, getGuard,
    thresholds1, thresholds2, runsPerCell,
  )
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`  ✅ Terminé en ${elapsed}s\n`)

  analyze(results, thresholds1, thresholds2, char1.name, char2.name)

  console.log(`\n${sep}\n`)
}

optimize().catch(err => {
  console.error('\n❌ Erreur :', err)
  process.exit(1)
})
