/**
 * Loader for data/guards.yaml — the structured SOURCE of the five Gardes ⚡.
 *
 * Même patron que actions-data.ts : clés anglaises, chaînes Locale, lecture
 * SYNCHRONE à l'initialisation du module pour que GUARD_DEFS reste une const.
 *
 * Les Gardes étaient le dernier îlot de règles codé en dur : sans source de
 * données, rien ne pouvait comparer leurs jets au vault — c'est ce qui a laissé
 * Encaisser rouler Récupération + Vigueur pour Robustesse + Force côté carte.
 *
 * Ce que ce loader BRANCHE :
 *  - jet, initiative (= vitesse), coût, disponibilité ;
 *  - la concession 🟩, éventuellement conditionnée à un tag d'action ;
 *  - onFlaw / onCritical, via la grammaire d'EffectOp partagée avec les actions.
 *
 * Ce qu'il porte SANS le brancher (`wired: false`) : le Contrecoup ↩️ et tout
 * ce qui exige une Garde mutable réévaluée coup par coup (score qui décroît,
 * initiative qui dérive, Garde perdue). La donnée est là, le moteur suivra.
 */

import fs   from 'fs'
import path from 'path'
import { parse } from 'yaml'
import type { CharacteristicName, SkillName } from '../character/types'
import type { ActionCost, CardTag, GuardId, StatusEffect, CombatantState, CombatEffect } from './types'
import { opsToCombatEffects, type EffectOp } from './effect-ops'
import type { GuardDef } from './actions'
import { localize, type LocalizedString } from '../locale'

// ─── Raw YAML shapes ──────────────────────────────────────────────────────────

/** Une issue de Garde : texte affiché + ops appliqués. `wired: false` = donnée seule. */
interface RawGuardOutcome {
  text?:   LocalizedString
  effect?: EffectOp[]
  /** Indication de chantier, jamais lue par le moteur (voir `wired`). */
  guardInitiative?: number
  wired?:  boolean
}

interface RawGuardAvailability {
  /** Proxy d'équipement en attendant le modèle d'armes/boucliers. */
  requiresSkill?:   { skill: SkillName; minValue: number }
  blockedByStatus?: StatusEffect[]
  /** Aucune case n'est occultée 🌑 tant que la furtivité n'est pas simulée. */
  requiresOccultedSquare?: boolean
}

interface RawGuard {
  /** Id de la carte française dans rules/fr/cartes (test de cohérence). */
  vaultCard:    string
  name:         LocalizedString
  description:  LocalizedString
  /** VITESSE : la Garde répond aux actions d'initiative ≥ à la sienne. */
  initiative:   number
  cost:         { reactions?: number; fatigue?: number }
  roll:         { characteristic: CharacteristicName; skill: SkillName }
  availability?: RawGuardAvailability
  /** 🟩 offert à l'attaquant ; `againstTag` le restreint à un type d'action. */
  concession?:  { advantage: number; againstTag?: CardTag }
  unbreakable?: boolean
  /** ↩️ Prix payé à chaque attaque qui ÉCHOUE — donnée seule pour l'instant. */
  contrecoup?:  RawGuardOutcome & { guardScore?: number; losesGuard?: boolean }
  onFlaw?:      RawGuardOutcome
  onCritical?:  RawGuardOutcome
}

interface RawGuardsFile { guards: Record<string, RawGuard> }

// ─── Resolution ───────────────────────────────────────────────────────────────

/** Source file, at the repo-root /data next to player_actions.yaml. */
export const GUARDS_FILE =
  path.resolve(__dirname, '..', '..', '..', 'data', 'guards.yaml')

/**
 * Disponibilité d'une Garde, dérivée du bloc `availability`.
 * Absent = toujours disponible (c'est le cas d'Encaisser, et c'est sa définition).
 */
function makeIsAvailable(a: RawGuardAvailability = {}) {
  return (d: CombatantState): boolean => {
    // Terrain occulté : la Dérobade est déclarée mais structurellement
    // indisponible tant que la furtivité n'est pas simulée.
    if (a.requiresOccultedSquare) return false
    if (a.requiresSkill && d.skills[a.requiresSkill.skill] < a.requiresSkill.minValue) return false
    if (a.blockedByStatus?.some(s => d.status.includes(s))) return false
    return true
  }
}

/**
 * Effets d'une Garde jouée en réaction.
 *
 * isFirstUse = true  → première attaque de la manche sur cette cible : la Garde
 *   dépense son ⚡, et ses issues ⚠️/✴️ s'appliquent (le jet n'a lieu qu'une fois).
 * isFirstUse = false → Garde en cache réutilisée : aucun coût, aucun effet.
 *
 * Une issue `wired: false` est IGNORÉE — ni effet, ni note. Le silence vaut
 * mieux qu'une note qui annonce un effet que le moteur n'applique pas.
 */
function makeGuardEffects(raw: RawGuard, cost: ActionCost, locale: string) {
  const applicable = (o?: RawGuardOutcome) => (o && o.wired !== false ? o : undefined)
  const onFlaw     = applicable(raw.onFlaw)
  const onCritical = applicable(raw.onCritical)

  return (
    outcome:    { flaw: boolean; critical?: boolean },
    defender:   CombatantState,
    isFirstUse: boolean,
  ): { effects: CombatEffect[]; notes: string[] } => {
    const effects: CombatEffect[] = []
    const notes:   string[]       = []
    if (!isFirstUse) return { effects, notes }

    if (cost.reactions > 0) effects.push({ targetId: defender.id, kind: 'spend-reaction' })

    // Le défenseur est à la fois cible et porteur : les ops SELF (⚡ rendue)
    // comme les ops dirigées (💧, 🔻) atterrissent sur lui.
    const apply = (o: RawGuardOutcome) => {
      effects.push(...opsToCombatEffects(o.effect ?? [], defender.id, defender.id))
      if (o.text) notes.push(localize(o.text, locale))
    }
    if (outcome.flaw     && onFlaw)     apply(onFlaw)
    if (outcome.critical && onCritical) apply(onCritical)

    return { effects, notes }
  }
}

function toGuardDef(
  id: GuardId,
  raw: RawGuard,
  locale: string,
  makeRoll: (c: CharacteristicName, s: SkillName, guardId: GuardId) => GuardDef['rollDC'],
): GuardDef {
  const cost: ActionCost = {
    actions:        0,
    reactions:      raw.cost.reactions ?? 0,
    endPlayerRound: false,
    ...(raw.cost.fatigue != null && { fatigue: raw.cost.fatigue }),
  }
  return {
    id,
    label:      localize(raw.name, locale),
    initiative: raw.initiative,
    cost,
    rollChar:   raw.roll.characteristic,
    rollSkill:  raw.roll.skill,
    ...(raw.concession && {
      attackerAdvantage: raw.concession.advantage,
      ...(raw.concession.againstTag && { concessionTag: raw.concession.againstTag }),
    }),
    ...(raw.unbreakable && { unbreakable: true }),
    isAvailable: makeIsAvailable(raw.availability),
    rollDC:      makeRoll(raw.roll.characteristic, raw.roll.skill, id),
    effects:     makeGuardEffects(raw, cost, locale),
  }
}

/** Parse the raw file (exposed for the vault-coherence test). */
export function readRawGuards(): Record<string, RawGuard> {
  const doc = parse(fs.readFileSync(GUARDS_FILE, 'utf-8')) as RawGuardsFile
  return doc.guards ?? {}
}

/**
 * Assemble every GuardDef, keyed by GuardId.
 *
 * `makeRoll` est injecté par actions.ts : le jet de Garde applique les
 * modificateurs de l'état mental (défensifs), qui vivent là-bas — l'injecter
 * évite un cycle d'import entre le loader et les définitions.
 */
export function loadGuardDefs(
  makeRoll: (c: CharacteristicName, s: SkillName, guardId: GuardId) => GuardDef['rollDC'],
  locale = 'fr',
): Record<GuardId, GuardDef> {
  const raw = readRawGuards()
  return Object.fromEntries(
    Object.entries(raw).map(([id, r]) => [id, toGuardDef(id as GuardId, r, locale, makeRoll)]),
  ) as Record<GuardId, GuardDef>
}
