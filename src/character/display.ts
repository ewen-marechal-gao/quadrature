import type { Character, CharacteristicName } from './types'
import {
  PHYSICAL_CHARACTERISTICS, MENTAL_CHARACTERISTICS,
  CHARACTERISTIC_LABEL, SKILL_LABEL,
  CARAC_SKILLS,
} from './data'
import { computeDerived } from './character'

// ─── Layout constants ─────────────────────────────────────────────────────────

const COL_W  = 38              // chars per column
const SEP    = '  │  '         // 5-char column divider
const FULL_W = COL_W * 2 + SEP.length   // 81
const HDR    = '═'.repeat(FULL_W)
const DIV    = '─'.repeat(FULL_W)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Filled / wounded / empty dots for a characteristic value */
function dots(value: number, wounds: number): string {
  const active = Math.max(0, value - wounds)
  const woundMark = wounds > 0 ? '✕'.repeat(wounds) : ''
  return '●'.repeat(active) + woundMark + '○'.repeat(5 - value)
}

/** Compact value label — shows wounds annotation when relevant */
function valLabel(value: number, wounds: number): string {
  if (wounds === 0) return String(value)
  return `${value - wounds}(−${wounds}⚔)`
}

/** Pad/trim a string to exactly `w` characters (BMP-safe) */
function col(s: string, w = COL_W): string {
  return s.length >= w ? s.slice(0, w) : s.padEnd(w)
}

/**
 * Renders a characteristic + its 2 skills as 3 padded lines.
 * Each line is exactly COL_W characters wide for alignment.
 */
function caracBlock(char: Character, c: CharacteristicName): [string, string, string] {
  const state     = char.characteristics[c]
  const [s1, s2]  = CARAC_SKILLS[c]
  const v1        = char.skills[s1]
  const v2        = char.skills[s2]

  const l0 = `  ${CHARACTERISTIC_LABEL[c].padEnd(14)}${dots(state.value, state.wounds)}  ${valLabel(state.value, state.wounds)}`
  const l1 = `   ✦ ${SKILL_LABEL[s1].padEnd(13)} ${dots(v1, 0)}  ${v1}`
  const l2 = `   ✦ ${SKILL_LABEL[s2].padEnd(13)} ${dots(v2, 0)}  ${v2}`

  return [col(l0), col(l1), col(l2)]
}

// ─── Public formatter ─────────────────────────────────────────────────────────

/** Formats a complete character sheet as a two-column Corps | Esprit layout */
export function formatCharacter(char: Character): string {
  const derived = computeDerived(char)
  const lines: string[] = []

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(HDR)
  const subtitle = char.people ? `  ·  ${char.people.name}` : ''
  lines.push(` ${char.name.toUpperCase()}${subtitle}`)
  lines.push(HDR)

  // ── Column titles ─────────────────────────────────────────────────────────
  lines.push('')
  lines.push(`${col('  CORPS')}${SEP}  ESPRIT`)
  lines.push(`  ${'─'.repeat(COL_W - 2)}${SEP}${'─'.repeat(COL_W - 2)}`)
  lines.push('')

  // ── Characteristics & skills (5 pairs: Corps left, Esprit right) ──────────
  for (let i = 0; i < PHYSICAL_CHARACTERISTICS.length; i++) {
    const [l0, l1, l2] = caracBlock(char, PHYSICAL_CHARACTERISTICS[i])
    const [r0, r1, r2] = caracBlock(char, MENTAL_CHARACTERISTICS[i])
    lines.push(`${l0}${SEP}${r0}`)
    lines.push(`${l1}${SEP}${r1}`)
    lines.push(`${l2}${SEP}${r2}`)
    lines.push('')
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  lines.push(DIV)
  lines.push(' DERIVED STATS')
  lines.push('')
  lines.push(`  ♥ Health              ${derived.currentHealth} / ${derived.maxHealth}`)
  lines.push(`  Résistance (max)      ${derived.resistanceThreshold}   (vigor + robustness)`)
  lines.push(`  ◇ Stability (max)     ${derived.maxStability}   (tenacity + discipline)`)
  lines.push(`  Carry capacity        ${derived.carryCapacity}   (2 + strength + robustness)`)
  lines.push('')

  // ── Creation summary ──────────────────────────────────────────────────────
  if (char.people || char.origin || char.training) {
    lines.push(DIV)
    lines.push(' CREATION')
    lines.push('')
    if (char.people) {
      lines.push(`  People    ${char.people.name}`)
      lines.push(`   +caracs  ${char.people.caracs.join(', ')}`)
      lines.push(`   +skills  ${char.people.skills.join(', ')}`)
    }
    if (char.origin) {
      lines.push(`  Origin`)
      lines.push(`   +caracs  ${char.origin.caracs.join(', ')}`)
      lines.push(`   +skills  ${char.origin.skills.join(', ')}`)
    }
    if (char.training) {
      lines.push(`  Training`)
      lines.push(`   +skills  ${char.training.skills.join(', ')}`)
    }
    lines.push('')
  }

  lines.push(DIV)
  return lines.join('\n')
}
