/**
 * Loader for data/player_actions.yaml — the structured SOURCE of player
 * actions (chantier « unification des actions », étape 3a).
 *
 * The file carries English keys and Locale strings { fr, en? }; this loader
 * resolves display strings to one locale and assembles full ActionDefs:
 *  - declarative entries get their resolve() GENERATED (makeResolve);
 *  - `resolver: <id>` entries plug the matching CustomActionResolver
 *    (getDC + resolve) from action-resolvers.ts.
 *
 * Loading is SYNCHRONOUS (readFileSync at module init) so ACTION_DEFS stays a
 * plain const, importable everywhere without an async bootstrap.
 */

import fs   from 'fs'
import path from 'path'
import { parse } from 'yaml'
import type { CharacteristicName, SkillName, DisciplineId } from '../character/types'
import type { ActionId, ActionCost, CardTag, StatusEffect, CombatantState, ActionTrigger } from './types'
import {
  makeResolve, type ActionOutcome, type ActionOutcomes, type EffectOp,
} from './effect-ops'
import { ACTION_RESOLVERS, type ActionResolverId } from './action-resolvers'
import type { ActionDef } from './actions'
import type { MentalState } from './types'
import { localize, type LocalizedString } from '../locale'

// ─── Raw YAML shapes (English keys, Locale strings) ───────────────────────────

interface RawOutcome { text?: LocalizedString; effect: EffectOp[] }

interface RawPlayerAction {
  /** Id of the matching French card in rules/fr/cartes (coherence test, 3b projection). */
  vaultCard?:   string
  /**
   * Id de l'OPTION visée sur cette carte, quand elle en porte plusieurs
   * (deplacement → marche | course). Une carte est du matériel, une action est
   * une règle : le lien n'est pas 1↔1. Absent = la carte n'a qu'une action.
   */
  vaultOption?: string
  name:         LocalizedString
  description:  LocalizedString
  initiative:   number
  cost:         { actions: number; reactions?: number; fatigue?: number; endPlayerRound?: boolean }
  tags:         CardTag[]
  /** Portée MAX du coup, en cases. Absent = non gâté (cf. ActionDef.reach). */
  reach?:       number
  /**
   * Portée MAX d'un tir, en cases (§ equipement — « jusqu'à leur Portée sans
   * pénalité »). Synonyme de `reach` pour les actions à distance ; les deux
   * mappent sur ActionDef.reach. Sera dérivé de l'arme (chantier armes #18).
   */
  effectiveRange?: number
  /**
   * Portée MIN, en cases : un tir ne part pas si la cible est plus proche
   * (§ equipement — « Pas d'attaque si engagé » pour un arc). minRange 1 →
   * distance > 1 requise (pas de tir au contact).
   */
  minRange?:    number
  /** Déclencheur ⚡ : présent = l'action est une RÉACTION (cf. ActionDef.trigger). */
  trigger?:     ActionTrigger
  prerequisite?: { skill: SkillName; minValue: number }
  /** Mental states allowing this action (empty/absent = no constraint). */
  mentalConditions?: MentalState[]
  requiresFirstAction?: boolean
  roll?:        { characteristic: CharacteristicName; skill: SkillName }
  selfTargeted?: boolean
  // ── Déplacement & élan (§ positions) ────────────────────────────────────────
  /** Action de mouvement (Marche/Course) : ni jet ni garde. */
  movement?:    boolean
  /** Budget de déplacement : un nombre fixe, ou { base, addSkill } dérivé d'une compétence. */
  moveBudget?:  number | { base: number; addSkill: SkillName }
  /** Inertie ➡️ posée en se résolvant (Marche 2, Course 3). */
  grantsInertia?: number
  /** Statut auto-infligé (Course → winded). */
  grantsStatus?: StatusEffect
  /** Statut levé à coup sûr (Respiration → winded), pour le planificateur. */
  clearsStatus?: StatusEffect
  /** Statuts qui interdisent l'action. */
  blockedByStatus?: StatusEffect[]
  /** Inertie ➡️ minimale requise (Charge/Bousculade : 3). */
  requiresInertia?: number
  /** 🟩 que l'action s'accorde sur son propre jet (Charge « avec 🟩 »). */
  selfAdvantage?: number
  onSuccess?:   RawOutcome
  onFailure?:   RawOutcome
  onCritical?:  RawOutcome
  onFlaw?:      RawOutcome
  /** Socle inconditionnel : appliqué quel que soit le jet (après crit/défaut, avant l'issue). */
  onPlay?:      RawOutcome
  resolver?:    string
}

interface RawPlayerActionsFile { actions: Record<string, RawPlayerAction> }

// ─── Resolution ───────────────────────────────────────────────────────────────

/** Source file, at the repo-root /data next to adversary_actions.yaml. */
export const PLAYER_ACTIONS_FILE =
  path.resolve(__dirname, '..', '..', '..', 'data', 'player_actions.yaml')

function resolveOutcome(o: RawOutcome, locale: string): ActionOutcome {
  return { ...(o.text && { text: localize(o.text, locale) }), effect: o.effect ?? [] }
}

export function toActionDef(id: ActionId, raw: RawPlayerAction, locale: string): ActionDef {
  const cost: ActionCost = {
    actions:        raw.cost.actions,
    reactions:      raw.cost.reactions ?? 0,
    endPlayerRound: raw.cost.endPlayerRound ?? false,
    ...(raw.cost.fatigue != null && { fatigue: raw.cost.fatigue }),
  }
  // Budget de déplacement : nombre fixe, ou dérivé d'une compétence (Course = 5 + Mobilité).
  const moveBudget = raw.moveBudget == null ? undefined
    : typeof raw.moveBudget === 'number' ? raw.moveBudget
    : (() => { const { base, addSkill } = raw.moveBudget as { base: number; addSkill: SkillName }
               return (actor: CombatantState) => base + actor.skills[addSkill] })()

  const base = {
    id,
    label:       localize(raw.name, locale),
    description: localize(raw.description, locale),
    initiative:  raw.initiative,
    cost,
    tags:        raw.tags,
    // Portée MAX : `reach` (mêlée) ou `effectiveRange` (tir — future dérivée de l'arme).
    ...((raw.reach ?? raw.effectiveRange) != null && { reach: raw.reach ?? raw.effectiveRange }),
    // Portée MIN : un tir ne part pas au contact (§ equipement — arc engagé).
    ...(raw.minRange != null && { minRange: raw.minRange }),
    ...(raw.trigger && { trigger: raw.trigger }),
    ...(raw.prerequisite && { prerequisite: raw.prerequisite }),
    mentalConditions: raw.mentalConditions ?? [],
    requiresFirstAction: raw.requiresFirstAction ?? false,
    // Les actions de mouvement n'ont pas de jet ; on met un jet nominal jamais lu.
    rollChar:    raw.roll?.characteristic ?? 'agility',
    rollSkill:   raw.roll?.skill ?? 'mobility',
    selfTargeted: raw.selfTargeted ?? false,
    ...(raw.movement && { movement: true }),
    ...(moveBudget != null && { moveBudget }),
    ...(raw.grantsInertia != null && { grantsInertia: raw.grantsInertia }),
    ...(raw.grantsStatus && { grantsStatus: raw.grantsStatus }),
    ...(raw.clearsStatus && { clearsStatus: raw.clearsStatus }),
    ...(raw.blockedByStatus && { blockedByStatus: raw.blockedByStatus }),
    ...(raw.requiresInertia != null && { requiresInertia: raw.requiresInertia }),
    ...(raw.selfAdvantage != null && { selfAdvantage: raw.selfAdvantage }),
  }

  if (raw.resolver) {
    const custom = ACTION_RESOLVERS[raw.resolver as ActionResolverId]
    if (!custom) throw new Error(`player_actions.yaml: resolver inconnu "${raw.resolver}" (action ${id})`)
    return { ...base, getDC: custom.getDC, resolve: (o, actor) => custom.resolve(o, actor) }
  }

  // Action de mouvement : résolue par resolveMovementAction (branche dédiée de
  // resolvePlans), pas par def.resolve — d'où un resolve inerte, jamais appelé.
  if (raw.movement) {
    return { ...base, resolve: () => ({ effects: [], notes: [] }) }
  }

  if (!raw.onSuccess || !raw.onFailure) {
    throw new Error(`player_actions.yaml: action ${id} sans resolver ni onSuccess/onFailure`)
  }
  const outcomes: ActionOutcomes = {
    onSuccess: resolveOutcome(raw.onSuccess, locale),
    onFailure: resolveOutcome(raw.onFailure, locale),
    ...(raw.onCritical && { onCritical: resolveOutcome(raw.onCritical, locale) }),
    ...(raw.onFlaw     && { onFlaw:     resolveOutcome(raw.onFlaw, locale) }),
    ...(raw.onPlay     && { onPlay:     resolveOutcome(raw.onPlay, locale) }),
  }
  return { ...base, outcomes, resolve: makeResolve(outcomes) }
}

/** Parse the raw file (exposed for the vault-coherence test). */
export function readRawPlayerActions(): Record<string, RawPlayerAction> {
  const doc = parse(fs.readFileSync(PLAYER_ACTIONS_FILE, 'utf-8')) as RawPlayerActionsFile
  return doc.actions ?? {}
}

/** Load and assemble every player ActionDef, keyed by ActionId. */
export function loadPlayerActionDefs(locale = 'fr'): Record<ActionId, ActionDef> {
  const raw  = readRawPlayerActions()
  const defs = Object.fromEntries(
    Object.entries(raw).map(([id, r]) => [id, toActionDef(id as ActionId, r, locale)]),
  ) as Record<ActionId, ActionDef>
  return defs
}

// ─── Cartes de discipline (Lot 2) ──────────────────────────────────────────────

/** Dossier des disciplines, à la racine /data (miroir de PLAYER_ACTIONS_FILE). */
export const DISCIPLINES_DIR =
  path.resolve(__dirname, '..', '..', '..', 'data', 'disciplines')

interface RawDisciplineActionsFile {
  discipline: { id: string }
  actions?:   Record<string, RawPlayerAction>
}

/**
 * Charge les CARTES de discipline (`actions` de data/disciplines/*.yaml) comme
 * ActionDefs — même schéma et même assembleur que les actions universelles, mais
 * chaque def est tagguée de sa `discipline` (gating par possession, cf.
 * canUseAction). Les fichiers sans bloc `actions` (Escrime pour l'instant) sont
 * ignorés. Fusionnées dans ACTION_DEFS à côté des actions universelles.
 */
export function loadDisciplineActionDefs(locale = 'fr'): Record<ActionId, ActionDef> {
  const out = {} as Record<ActionId, ActionDef>
  if (!fs.existsSync(DISCIPLINES_DIR)) return out
  for (const file of fs.readdirSync(DISCIPLINES_DIR).filter(f => /\.ya?ml$/.test(f)).sort()) {
    const doc = parse(fs.readFileSync(path.join(DISCIPLINES_DIR, file), 'utf-8')) as RawDisciplineActionsFile
    const discipline = doc.discipline?.id as DisciplineId
    for (const [id, raw] of Object.entries(doc.actions ?? {})) {
      out[id as ActionId] = { ...toActionDef(id as ActionId, raw, locale), discipline }
    }
  }
  return out
}
