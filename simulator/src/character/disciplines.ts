/**
 * Registre des DISCIPLINES et de leurs atouts (perks) — loader de
 * data/disciplines/*.yaml.
 *
 * Un perk est d'abord un fait de PROGRESSION (§ disciplines/ : Formes → Spé →
 * Bottes, débloqués par rang de discipline + prérequis), d'où sa place ici
 * plutôt que dans combat/. Le module de combat n'en consomme que la partie
 * mécanique branchée (cf. combat/perks.ts).
 *
 * Contrat, repris des traits (character/traits.ts) :
 *  · `grants` est le seul branchement moteur — mais HÉTÉROGÈNE (liste d'unions),
 *    car un perk « confère une ou plusieurs » choses de natures différentes ;
 *  · un grant `wired: false` est de la DONNÉE porteuse, ignorée par le moteur
 *    (même convention que le Contrecoup des gardes).
 *
 * Chargement SYNCHRONE (readFileSync à l'init) comme actions-data.ts, pour que
 * PERK_DEFS reste un const importable partout sans bootstrap asynchrone.
 */

import fs   from 'fs'
import path from 'path'
import { parse } from 'yaml'
import type { CharacteristicName, DisciplineId } from './types'
import { localize, type LocalizedString } from '../locale'
// Vocabulaire des grants partagé avec les traits — cf. character/grants.ts.
import { GRANT_KINDS, type PerkGrant } from './grants'
export type {
  PerkGrant, PerkTarget, RollSubstitutionGrant, SkillTagGrant, SkillTagChoiceGrant,
  MentalInitGrant, ReactionOnTriggerGrant, RollBonusGrant, CostOverrideGrant,
  OutcomeRiderGrant,
} from './grants'

// ─── Prérequis ────────────────────────────────────────────────────────────────

/**
 * Prérequis d'un perk. Tous les blocs présents doivent tenir (ET), sauf
 * `characteristicsAny` (au moins UN des groupes tient) — c'est la forme des
 * prérequis « Force 2 ou Vigueur 2 » du vault.
 */
export interface PerkPrereq {
  characteristics?:    Partial<Record<CharacteristicName, number>>
  characteristicsAny?: Partial<Record<CharacteristicName, number>>[]
  disciplines?:        Partial<Record<DisciplineId, number>>
  perks?:              string[]
  skillTags?:          string[]
}

// ─── PerkDef ──────────────────────────────────────────────────────────────────

export interface PerkDef {
  /** Id stable, en kebab anglais (comme les clés de player_actions.yaml). */
  id:         string
  name:       string
  discipline: DisciplineId
  /** Rangement (§ disciplines/) : 1 Formes, 2 Spé/Bottes, 3 Expertise. */
  tier:       number
  /** Plafond d'Escrime que ce perk débloque (le « Bonus de compétence : max N »). */
  disciplineCap?: number
  prereq?:    PerkPrereq
  grants:     PerkGrant[]
}

export interface DisciplineDef {
  id:   DisciplineId
  name: string
  /** Cap absolu de rang atteignable par atouts (§ : 4 ; le 5 est hors modèle). */
  cap:  number
}

// ─── Chargement ───────────────────────────────────────────────────────────────

interface RawPerk {
  name:  LocalizedString
  tier:  number
  disciplineCap?: number
  prereq?: PerkPrereq
  grants: PerkGrant[]
}

interface RawDisciplineFile {
  discipline: { id: string; name: LocalizedString; cap: number }
  perks?:     Record<string, RawPerk>
  // `actions` (cartes de discipline) : schéma ActionDef, chargé au Lot 2.
  actions?:   Record<string, unknown>
}

/** Dossier source, à la racine /data à côté de player_actions.yaml. */
export const DISCIPLINES_DIR =
  path.resolve(__dirname, '..', '..', '..', 'data', 'disciplines')

function readRawFiles(): RawDisciplineFile[] {
  if (!fs.existsSync(DISCIPLINES_DIR)) return []
  return fs.readdirSync(DISCIPLINES_DIR)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .map(f => parse(fs.readFileSync(path.join(DISCIPLINES_DIR, f), 'utf-8')) as RawDisciplineFile)
}

export function loadDisciplineDefs(locale = 'fr'): Record<DisciplineId, DisciplineDef> {
  const out = {} as Record<DisciplineId, DisciplineDef>
  for (const file of readRawFiles()) {
    const d = file.discipline
    out[d.id as DisciplineId] = { id: d.id as DisciplineId, name: localize(d.name, locale), cap: d.cap }
  }
  return out
}

export function loadPerkDefs(locale = 'fr'): Record<string, PerkDef> {
  const out: Record<string, PerkDef> = {}
  for (const file of readRawFiles()) {
    const disc = file.discipline.id as DisciplineId
    for (const [id, r] of Object.entries(file.perks ?? {})) {
      for (const g of r.grants) {
        if (!GRANT_KINDS.includes(g.kind)) {
          throw new Error(`disciplines/${disc}: perk "${id}" — grant inconnu "${g.kind}"`)
        }
      }
      out[id] = {
        id,
        name:       localize(r.name, locale),
        discipline: disc,
        tier:       r.tier,
        ...(r.disciplineCap != null && { disciplineCap: r.disciplineCap }),
        ...(r.prereq && { prereq: r.prereq }),
        grants:     r.grants,
      }
    }
  }
  return out
}

export const DISCIPLINE_DEFS: Record<DisciplineId, DisciplineDef> = loadDisciplineDefs()
export const PERK_DEFS:       Record<string, PerkDef>            = loadPerkDefs()

// ─── Accès ────────────────────────────────────────────────────────────────────

/**
 * skillTags EFFECTIFS d'un porteur : ceux notés sur la fiche (les CHOIX résolus)
 * ∪ les marqueurs `skillTag` conférés d'office par les perks possédés. Les
 * marqueurs auto n'ont pas à figurer sur la fiche — ils se dérivent.
 */
export function effectiveSkillTags(
  perks:      readonly string[],
  sheetTags:  readonly string[],
): Set<string> {
  const tags = new Set(sheetTags)
  for (const id of perks) {
    for (const g of PERK_DEFS[id]?.grants ?? []) {
      if (g.kind === 'skillTag') tags.add(g.value)
    }
  }
  return tags
}

/**
 * Cap d'une discipline pour un ensemble de perks : le plus haut `disciplineCap`
 * conféré, borné par le cap absolu de la discipline. 0 si aucun perk ne l'ouvre.
 */
export function disciplineCapFor(perks: readonly string[], discipline: DisciplineId): number {
  let cap = 0
  for (const id of perks) {
    const def = PERK_DEFS[id]
    if (def?.discipline === discipline && def.disciplineCap != null) {
      cap = Math.max(cap, def.disciplineCap)
    }
  }
  return Math.min(cap, DISCIPLINE_DEFS[discipline]?.cap ?? cap)
}

// ─── Validation de progression ────────────────────────────────────────────────

/** Un prérequis carac est satisfait si la valeur de build atteint le minimum. */
function meetsCaracs(req: Partial<Record<CharacteristicName, number>>, caracs: Record<CharacteristicName, number>): boolean {
  return Object.entries(req).every(([c, min]) => (caracs[c as CharacteristicName] ?? 0) >= (min ?? 0))
}

/**
 * Erreurs de progression pour les perks / skillTags / rangs de discipline d'une
 * fiche. Miroir de `validateTraits` — une fiche ne peut pas porter un atout que
 * sa progression n'autorise pas, ni investir un rang au-delà du cap débloqué.
 *
 * `caracs` = valeurs de BUILD (non blessées) des caractéristiques.
 */
export function validatePerks(
  perks:       readonly string[],
  skillTags:   readonly string[],
  disciplines: Partial<Record<DisciplineId, number>>,
  caracs:      Record<CharacteristicName, number>,
): string[] {
  const errors: string[] = []

  // 1. Existence + doublons.
  const seen = new Set<string>()
  for (const id of perks) {
    if (!PERK_DEFS[id]) errors.push(`Unknown perk "${id}" (not in data/disciplines/*.yaml)`)
    if (seen.has(id))   errors.push(`Duplicate perk "${id}"`)
    seen.add(id)
  }

  const owned = perks.filter(id => PERK_DEFS[id])
  const effTags = effectiveSkillTags(owned, skillTags)

  // 2. Prérequis de chaque perk possédé.
  for (const id of owned) {
    const p = PERK_DEFS[id].prereq
    if (!p) continue
    if (p.characteristics && !meetsCaracs(p.characteristics, caracs))
      errors.push(`Perk "${id}": characteristic prerequisite not met`)
    if (p.characteristicsAny && !p.characteristicsAny.some(g => meetsCaracs(g, caracs)))
      errors.push(`Perk "${id}": needs one of ${p.characteristicsAny.map(g => Object.entries(g).map(([c, n]) => `${c} ${n}`).join('/')).join(' or ')}`)
    for (const [d, min] of Object.entries(p.disciplines ?? {}))
      if ((disciplines[d as DisciplineId] ?? 0) < (min ?? 0))
        errors.push(`Perk "${id}": requires ${d} ${min}`)
    for (const req of p.perks ?? [])
      if (!owned.includes(req)) errors.push(`Perk "${id}": requires perk "${req}"`)
    for (const tag of p.skillTags ?? [])
      if (!effTags.has(tag)) errors.push(`Perk "${id}": requires skillTag "${tag}"`)
  }

  // 3. Chaque skillTagChoice d'un perk possédé résolu EXACTEMENT une fois.
  const choiceOptions = new Set<string>()
  for (const id of owned) {
    for (const g of PERK_DEFS[id].grants) {
      if (g.kind !== 'skillTagChoice') continue
      g.options.forEach(o => choiceOptions.add(o))
      const picked = g.options.filter(o => skillTags.includes(o))
      if (picked.length === 0) errors.push(`Perk "${id}": a skillTag choice is unresolved (pick one of ${g.options.join(', ')})`)
      if (picked.length > 1)   errors.push(`Perk "${id}": skillTag choice over-resolved (${picked.join(', ')})`)
    }
  }

  // 4. Aucun skillTag parasite : chaque tag noté doit être une option offerte.
  for (const tag of skillTags)
    if (!choiceOptions.has(tag)) errors.push(`skillTag "${tag}" is not offered by any owned perk`)

  // 5. Rang investi ≤ cap débloqué (et ≤ cap absolu de la discipline).
  for (const [d, rank] of Object.entries(disciplines)) {
    if ((rank ?? 0) <= 0) continue
    const cap = disciplineCapFor(owned, d as DisciplineId)
    if (cap === 0) errors.push(`Discipline "${d}" rank ${rank} but no owned perk unlocks it`)
    else if ((rank ?? 0) > cap) errors.push(`Discipline "${d}" rank ${rank} exceeds cap ${cap} unlocked by perks`)
  }

  return errors
}
