/**
 * Déclencheurs ⚡ — le support des RÉACTIONS (§ defense_reactions.md).
 *
 * Une réaction n'est jamais planifiée : elle est **proposée** à son porteur quand
 * un événement survient au milieu de la résolution, se résout immédiatement, puis
 * la bande reprend son cours. C'est exactement le contrat que la Garde honore déjà
 * (cf. `getOrRollGuard` dans round.ts) — ce module généralise le motif aux autres
 * familles de déclencheurs.
 *
 * ── Règles de bornage (décisions créateur) ───────────────────────────────────
 *  · PJ        : la réaction coûte des ⚡ (`cost.reactions`) — le pool borne.
 *  · Créature  : la carte de réaction est **GRATUITE** (ni ⚫ ni ⚡ : rien de plus
 *                à suivre pour le meneur), bornée à **1 fois par manche PAR CARTE**.
 *  · Profondeur 1 : une réaction n'émet PAS de déclencheur (anti-boucle).
 */

import type { Actor } from '../adversary/actor'
import { isAdversaryActor, actorDefeated } from '../adversary/actor'
import type { ActionId, TriggerKind } from './types'
import { ACTION_DEFS } from './actions'
import { canReact } from './combatant'
import { distance } from './position'

/** Ce qui vient de se produire et peut ouvrir une fenêtre de réaction. */
export interface TriggerEvent {
  kind: TriggerKind
  /** L'acteur dont l'action provoque l'événement (celui qui bouge, qui encaisse…). */
  actorId: string
  /** L'action / carte en cours de résolution, pour le journal. */
  source?: string
}

/** Une réaction jouable par un acteur donné, en réponse à l'événement. */
export interface ReactionOption {
  reactorId: string
  /** ActionId (PJ) ou id de carte (créature). */
  action:    string
  /** Cible de la réaction : l'acteur qui a déclenché. */
  targetId:  string
  kind:      'pc' | 'adversary'
}

/**
 * Ce que le moteur doit savoir du monde extérieur pour proposer des réactions.
 * Injecté comme `GuardProvider` l'est déjà — absent = aucune réaction (comportement
 * historique strictement inchangé).
 */
export interface ReactionSupport {
  /** Deux acteurs sont-ils dans des factions opposées ? (on ne frappe pas un allié) */
  isEnemy: (a: string, b: string) => boolean
  /** Trousse d'un PJ (ses ActionId autorisés). Les créatures utilisent leur deck. */
  kitOf:   (actorId: string) => readonly string[]
  /** Décide quelle réaction jouer (ou aucune). Voir `makeReactionProvider`. */
  choose:  ReactionProvider
}

export type ReactionProvider = (
  event:   TriggerEvent,
  options: ReactionOption[],
  states:  ReadonlyMap<string, Actor>,
) => ReactionOption | null

/** Portée d'éligibilité d'une réaction, en cases. */
function triggerRange(scope: 'reach' | 'adjacent' | undefined, reach: number | undefined): number {
  if (scope === 'adjacent') return 1
  return reach ?? 1
}

/**
 * Toutes les réactions jouables en réponse à `event`, tous acteurs confondus.
 *
 * Filtre : faction opposée · vivant · déclencheur correspondant · à portée (sans
 * plateau la distance n'est pas gâtée) · payable (⚡ pour un PJ ; carte non encore
 * utilisée cette manche pour une créature).
 */
export function eligibleReactions(
  event:   TriggerEvent,
  states:  ReadonlyMap<string, Actor>,
  support: ReactionSupport,
): ReactionOption[] {
  const source = states.get(event.actorId)
  if (!source || actorDefeated(source)) return []

  const options: ReactionOption[] = []
  for (const [id, actor] of states) {
    if (id === event.actorId || actorDefeated(actor)) continue
    if (!support.isEnemy(id, event.actorId)) continue

    // Distance : gâtée seulement si les deux figurines sont sur un plateau.
    const gap = actor.pos && source.pos ? distance(actor.pos, source.pos) : null

    if (isAdversaryActor(actor)) {
      for (const card of actor.sheet.cards) {
        if (card.trigger?.on !== event.kind) continue
        if (actor.usedReactions?.includes(card.id)) continue   // 1×/manche/carte
        if (gap !== null && gap > triggerRange(card.trigger.scope, card.reach)) continue
        options.push({ reactorId: id, action: card.id, targetId: event.actorId, kind: 'adversary' })
      }
      continue
    }

    // PJ : le déclencheur doit être dans sa trousse, et les ⚡ payés.
    if (!canReact(actor)) continue
    for (const actionId of support.kitOf(id)) {
      const def = ACTION_DEFS[actionId as ActionId]
      if (!def?.trigger || def.trigger.on !== event.kind) continue
      if (actor.reactions < (def.cost.reactions ?? 0)) continue
      if (gap !== null && gap > triggerRange(def.trigger.scope, def.reach)) continue
      options.push({ reactorId: id, action: actionId, targetId: event.actorId, kind: 'pc' })
    }
  }
  return options
}
