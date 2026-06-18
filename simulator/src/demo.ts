/**
 * Quadrature simulator demo.
 * Run with: npm run demo
 */
import * as path from 'path'
import * as os from 'os'
import {
  buildPool, makeRoll,
  rollPool, computeResult,
  formatPool, formatRolls, formatResult, interpretScore,
} from './index'
import {
  addSkillPoint, computeDerived, getRollParams,
  formatCharacter,
  serializeToYaml,
  saveCharacter, loadCharacter,
} from './character/index'

const SEP = '─'.repeat(52)
function heading(s: string): void { console.log(`\n${s}\n${SEP}`) }

const CHAR_SHEETS = path.join(__dirname, '..', 'characterSheets')
const LENA_PATH   = path.join(CHAR_SHEETS, 'lena.yaml')
const KEVIN_PATH  = path.join(CHAR_SHEETS, 'kevin.yaml')

console.log(`\n${'═'.repeat(52)}`)
console.log(' 🎲  Quadrature — Simulator Demo')
console.log(`${'═'.repeat(52)}`)

// ═══════════════════════════════════════════════════
//  PART 1 — DICE ROLLS (unchanged examples)
// ═══════════════════════════════════════════════════

heading('Roll 1 — Lena: Strength 3 / Power 1 / drunk (🟥)')
{
  const pool = buildPool({ characteristic: 3, skill: 1, disadvantages: 1 })
  console.log(formatPool(pool))
  const rolls = rollPool(pool)
  console.log(formatRolls(rolls))
  const result = computeResult(rolls, pool)
  console.log(formatResult(result))
  console.log(interpretScore(result.total))
}

heading('Roll 2 — Kevin: Strength 1 / Power 0 / drunk (🟥) + mood (🟩)')
{
  const pool = buildPool({ characteristic: 1, skill: 0, advantages: 1, disadvantages: 1 })
  console.log(formatPool(pool))
  console.log(formatResult(makeRoll({ characteristic: 1, skill: 0 })))
}

// ═══════════════════════════════════════════════════
//  PARTS 2–5 — CHARACTER DEMOS (all async: load from YAML)
// ═══════════════════════════════════════════════════

async function main(): Promise<void> {

  // ═══════════════════════════════════════════════════
  //  PART 2 — CHARACTER SHEET
  // ═══════════════════════════════════════════════════

  heading('Character — Lena (loaded from YAML)')
  {
    const lena = await loadCharacter(LENA_PATH)
    console.log(formatCharacter(lena))
  }

  // ═══════════════════════════════════════════════════
  //  PART 3 — PROGRESSION
  // ═══════════════════════════════════════════════════

  heading('Character — Kevin (loaded + progression)')
  {
    let kevin = await loadCharacter(KEVIN_PATH)

    console.log('After creation:')
    const derived0 = computeDerived(kevin)
    console.log(`  intelligence: ${kevin.characteristics.intelligence.value}`)
    console.log(`  logic: ${kevin.skills.logic}  |  discipline: ${kevin.skills.discipline}`)
    console.log(`  maxHealth: ${derived0.maxHealth}  |  maxStability: ${derived0.maxStability}`)

    // Progression: +1 logic (rank 1→2 triggers intelligence +1)
    console.log('\nProgression: +1 logic (rank 1→2 triggers intelligence +1)')
    kevin = addSkillPoint(kevin, 'logic')
    console.log(`  intelligence: ${kevin.characteristics.intelligence.value}  (was 3, now 4)`)
    console.log(`  logic: ${kevin.skills.logic}`)

    console.log('\nProgression: +1 logic again (rank 2→3, no trigger)')
    kevin = addSkillPoint(kevin, 'logic')
    console.log(`  intelligence: ${kevin.characteristics.intelligence.value}  (unchanged)`)
    console.log(`  logic: ${kevin.skills.logic}`)
  }

  // ═══════════════════════════════════════════════════
  //  PART 4 — ROLL BRIDGE
  // ═══════════════════════════════════════════════════

  heading('Roll bridge — Lena attacks (strength / power)')
  {
    const lena   = await loadCharacter(LENA_PATH)
    const params = getRollParams(lena, 'strength', 'power')
    console.log(`  char=${params.characteristic}  skill=${params.skill}`)
    const result = makeRoll(params)
    console.log(formatResult(result))
    console.log(interpretScore(result.total))
  }

  // ═══════════════════════════════════════════════════
  //  PART 5 — YAML SAVE & LOAD
  // ═══════════════════════════════════════════════════

  heading('YAML — save & load')
  {
    const lena = await loadCharacter(LENA_PATH)

    // Print YAML serialisation
    const yaml = serializeToYaml(lena)
    console.log(yaml)

    // Save to temp file, reload, verify round-trip integrity
    const tmpPath = path.join(os.tmpdir(), 'lena.yaml')
    await saveCharacter(lena, tmpPath)
    const loaded = await loadCharacter(tmpPath)

    const match =
      loaded.name === lena.name &&
      loaded.characteristics.strength.value === lena.characteristics.strength.value &&
      loaded.skills.power === lena.skills.power
    console.log(`Saved to ${tmpPath}`)
    console.log(`Reloaded — integrity check: ${match ? '✅ OK' : '❌ MISMATCH'}`)
  }
}

main().then(() => {
  console.log(`\n${'═'.repeat(52)}`)
  console.log(' ✅  All demos complete.')
  console.log(`${'═'.repeat(52)}\n`)
}).catch(console.error)
