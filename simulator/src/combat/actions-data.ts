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
import type { CharacteristicName, SkillName } from '../character/types'
import type { ActionId, ActionCost, CardTag } from './types'
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
  name:         LocalizedString
  description:  LocalizedString
  initiative:   number
  cost:         { actions: number; reactions?: number; fatigue?: number; endPlayerRound?: boolean }
  tags:         CardTag[]
  /** Portée du coup, en cases. Absent = non gâté (cf. ActionDef.reach). */
  reach?:       number
  prerequisite?: { skill: SkillName; minValue: number }
  /** Mental states allowing this action (empty/absent = no constraint). */
  mentalConditions?: MentalState[]
  requiresFirstAction?: boolean
  roll:         { characteristic: CharacteristicName; skill: SkillName }
  selfTargeted?: boolean
  onSuccess?:   RawOutcome
  onFailure?:   RawOutcome
  onCritical?:  RawOutcome
  onFlaw?:      RawOutcome
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

function toActionDef(id: ActionId, raw: RawPlayerAction, locale: string): ActionDef {
  const cost: ActionCost = {
    actions:        raw.cost.actions,
    reactions:      raw.cost.reactions ?? 0,
    endPlayerRound: raw.cost.endPlayerRound ?? false,
    ...(raw.cost.fatigue != null && { fatigue: raw.cost.fatigue }),
  }
  const base = {
    id,
    label:       localize(raw.name, locale),
    description: localize(raw.description, locale),
    initiative:  raw.initiative,
    cost,
    tags:        raw.tags,
    ...(raw.reach != null && { reach: raw.reach }),
    ...(raw.prerequisite && { prerequisite: raw.prerequisite }),
    mentalConditions: raw.mentalConditions ?? [],
    requiresFirstAction: raw.requiresFirstAction ?? false,
    rollChar:    raw.roll.characteristic,
    rollSkill:   raw.roll.skill,
    selfTargeted: raw.selfTargeted ?? false,
  }

  if (raw.resolver) {
    const custom = ACTION_RESOLVERS[raw.resolver as ActionResolverId]
    if (!custom) throw new Error(`player_actions.yaml: resolver inconnu "${raw.resolver}" (action ${id})`)
    return { ...base, getDC: custom.getDC, resolve: (o, actor) => custom.resolve(o, actor) }
  }

  if (!raw.onSuccess || !raw.onFailure) {
    throw new Error(`player_actions.yaml: action ${id} sans resolver ni onSuccess/onFailure`)
  }
  const outcomes: ActionOutcomes = {
    onSuccess: resolveOutcome(raw.onSuccess, locale),
    onFailure: resolveOutcome(raw.onFailure, locale),
    ...(raw.onCritical && { onCritical: resolveOutcome(raw.onCritical, locale) }),
    ...(raw.onFlaw     && { onFlaw:     resolveOutcome(raw.onFlaw, locale) }),
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
