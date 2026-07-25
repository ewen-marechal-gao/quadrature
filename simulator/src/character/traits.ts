/**
 * Registre des TRAITS de personnage — loader de data/traits.yaml.
 *
 * Un trait est d'abord un fait de PROGRESSION (§ personnages.md : rangs 3 et 5
 * d'une compétence), d'où sa place ici plutôt que dans combat/. Le module de
 * combat n'en consomme que la partie mécanique (cf. combat/traits.ts).
 *
 * Contrat repris tel quel des traits d'adversaires (adversary/traits.ts) :
 *  · `effect` est de la PROSE d'affichage — jamais parsée ;
 *  · `grants` est le seul branchement moteur — ABSENT = trait prose-only.
 *
 * Chargement SYNCHRONE (readFileSync à l'init) comme actions-data.ts, pour que
 * TRAIT_DEFS reste un const importable partout sans bootstrap asynchrone.
 */

import fs   from 'fs'
import path from 'path'
import { parse } from 'yaml'
import type { SkillName } from './types'
import { localize, type LocalizedString } from '../locale'

// Le vocabulaire des grants (familles de trait ET de perk) est partagé —
// cf. character/grants.ts. Les traits n'en consomment que le conteneur TraitGrants.
export type { ReactiveModeGrant, CostDeltaGrant, TraitGrants } from './grants'
import type { TraitGrants } from './grants'

// ─── TraitDef ─────────────────────────────────────────────────────────────────

export interface TraitDef {
  /** Id stable, en kebab FR (comme `sanguinaire` et les `vaultCard`). */
  id:      string
  name:    string
  /** ⚒️ actif (modifie une action nommée) ou ♾️ passif. */
  kind:    'active' | 'passive'
  /** Compétence qui le débloque (rang 3 ou 5 — le vault ne dit pas lequel). */
  skill:   SkillName
  /** ActionId modifié par un trait ⚒️ ; absent pour un ♾️ (ou une action absente du sim). */
  action?: string
  /** Prose MJ, telle qu'imprimée. Jamais interprétée. */
  effect:  string
  /** Branchement moteur. ABSENT = trait prose-only. */
  grants?: TraitGrants
}

// ─── Chargement ───────────────────────────────────────────────────────────────

interface RawTrait {
  name:    LocalizedString
  kind:    'active' | 'passive'
  skill:   SkillName
  action?: string
  effect:  LocalizedString
  grants?: TraitGrants
}

interface RawTraitsFile { traits: Record<string, RawTrait> }

/** Source, dans le /data de la racine, à côté de player_actions.yaml. */
export const TRAITS_FILE =
  path.resolve(__dirname, '..', '..', '..', 'data', 'traits.yaml')

/** Parse brut du fichier (exposé pour le test de cohérence avec le vault). */
export function readRawTraits(): Record<string, RawTrait> {
  const doc = parse(fs.readFileSync(TRAITS_FILE, 'utf-8')) as RawTraitsFile
  return doc.traits ?? {}
}

export function loadTraitDefs(locale = 'fr'): Record<string, TraitDef> {
  return Object.fromEntries(
    Object.entries(readRawTraits()).map(([id, r]) => [id, {
      id,
      name:   localize(r.name, locale),
      kind:   r.kind,
      skill:  r.skill,
      ...(r.action && { action: r.action }),
      effect: localize(r.effect, locale),
      ...(r.grants && { grants: r.grants }),
    }]),
  )
}

export const TRAIT_DEFS: Record<string, TraitDef> = loadTraitDefs()

// ─── Accès ────────────────────────────────────────────────────────────────────

/**
 * Nombre de traits qu'une compétence ouvre à ce rang (§ personnages.md :
 * rang 3 → 1 trait, rang 5 → un second). Plusieurs compétences proposent 3
 * traits pour 2 emplacements : le joueur CHOISIT, on ne borne que le compte.
 */
export function traitSlots(rank: number): number {
  return (rank >= 3 ? 1 : 0) + (rank >= 5 ? 1 : 0)
}

/**
 * Erreurs de progression pour une liste de traits portés, au regard des rangs de
 * compétence. Utilisée par `validateCharacter` — une fiche ne peut pas porter un
 * trait qu'elle n'a pas les moyens d'avoir acheté.
 */
export function validateTraits(
  traits: readonly string[],
  skills: Record<SkillName, number>,
): string[] {
  const errors: string[] = []
  const takenBySkill = new Map<SkillName, number>()

  for (const id of traits) {
    const def = TRAIT_DEFS[id]
    if (!def) {
      errors.push(`Unknown trait "${id}" (not in data/traits.yaml)`)
      continue
    }
    takenBySkill.set(def.skill, (takenBySkill.get(def.skill) ?? 0) + 1)
  }

  const seen = new Set<string>()
  for (const id of traits) {
    if (seen.has(id)) errors.push(`Duplicate trait "${id}"`)
    seen.add(id)
  }

  for (const [skill, taken] of takenBySkill) {
    const slots = traitSlots(skills[skill] ?? 0)
    if (taken > slots) {
      errors.push(
        `Skill "${skill}" is rank ${skills[skill] ?? 0} — it opens ${slots} trait slot(s), ` +
        `but ${taken} trait(s) of that skill are carried`,
      )
    }
  }

  return errors
}
