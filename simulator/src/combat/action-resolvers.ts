/**
 * Custom action resolvers — the declared ESCAPE HATCH of the declarative
 * outcomes system (chantier « unification des actions »).
 *
 * An action whose behaviour the shared op grammar cannot express (dynamic
 * amounts, unconditional riders) references one of these by id from
 * data/player_actions.yaml (`resolver: <id>`). The registry entry owns both
 * the dynamic DC formula and the effect resolution.
 */

import type { CombatantState, CombatEffect, MentalState } from './types'
import type { OutcomeFlags } from './effect-ops'
import { mentalDegree } from './combatant'

export type ActionResolverId =
  | 'respiration' | 'stabilize'
  | 'preservation' | 'focalisation' | 'resolution' | 'meditation'

export interface CustomActionResolver {
  /** DC formula (reads live state for dynamic values). */
  getDC:   (actor: CombatantState) => number
  /** Effect resolution — self-targeted: no opponent involved. */
  resolve: (outcome: OutcomeFlags, actor: CombatantState) => { effects: CombatEffect[]; notes: string[] }
}

export const ACTION_RESOLVERS: Record<ActionResolverId, CustomActionResolver> = {

  // ── Respiration — retrait d'Essoufflé inconditionnel, récupération dynamique
  //    (1 + Endurance), DD = fatigue actuelle.
  respiration: {
    getDC: (actor) => actor.fatigue,
    resolve({ hit, critical, flaw }, actor) {
      const o: Fx = { fx: [], notes: [] }
      // ⚠️ avant l'effet : le marqueur 😩 relève le plancher de fatigue AVANT que
      // la récupération ne s'y heurte — un souffle mal repris récupère moins.
      if (flaw) exhaust(o, actor.id, 1, '⚠️ Souffle coupé — +1 😩 Épuisé (plancher de fatigue)')

      o.fx.push({ targetId: actor.id, kind: 'remove-status', status: 'winded' })
      const amount = (hit ? 1 + actor.skills.endurance : 1) + (critical ? 1 : 0)
      o.fx.push({ targetId: actor.id, kind: 'remove-fatigue', amount })
      note(o, hit ? `✅ Récupération — retire ${amount}💧${critical ? ' (✴️ +1)' : ''}`
                  : '❌ Partiel — retire 1💧')
      return { effects: o.fx, notes: o.notes }
    },
  },

  // ── Stabiliser — retrait d'Hémorragie inconditionnel, soin dynamique
  //    (1 + Récupération), DD = 8 + blessures graves.
  stabilize: {
    getDC: (actor) => 8 + actor.heavyWounds,
    resolve({ hit, critical, flaw }, actor) {
      const o: Fx = { fx: [], notes: [] }
      // ⚠️ puis ✴️ avant l'effet : la plaie gicle d'abord, et le soin qui suit
      // doit en éponger une partie.
      if (flaw)     reopenWound(o, actor, '⚠️ La plaie se rouvre — hémorragie résolue immédiatement (1💢)')
      if (critical) gainReaction(o, actor.id, 1, '✴️ Critique — gagne 1⚡')

      o.fx.push({ targetId: actor.id, kind: 'remove-status', status: 'hemorrhage' })
      const healed = hit ? 1 + actor.skills.recovery : 1
      o.fx.push({ targetId: actor.id, kind: 'heal-wounds', amount: healed })
      note(o, hit ? `✅ Stabilisation — soigne ${healed}💢` : `❌ Partiel — soigne ${healed}💢`)
      return { effects: o.fx, notes: o.notes }
    },
  },

  // ── Consolidation mentale (§ attribute_actions.md) ─────────────────────────
  //
  // Les trois se ressemblent sans être interchangeables : leur ⚠️ Défaut diffère,
  // et surtout il n'INTERAGIT pas de la même façon avec le déplacement (celui de
  // la Focalisation lui est étranger, celui des deux autres s'y ajoute). Elles
  // sont donc écrites en clair, chacune dans l'ordre de sa carte.
  //
  // Ordre commun : ⚠️ Défaut · déplacement · ◇ EN DERNIER — le jeton accordé par
  // l'action ne peut pas amortir le décalage infligé par son propre Défaut.
  // Variantes ⚒️ (Précaution/Incantation/Militant/Tranquillité) différées.

  // Préservation — 🔻 vers Prudent, jamais en dessous.
  preservation: {
    getDC: (a) => 8 + mentalDegree(a.mentalState),
    resolve({ hit, critical, flaw }, actor) {
      const o: Fx = { fx: [], notes: [] }
      if (flaw) shiftMental(o, actor.id, 'toward-terror', '⚠️ Décalage subi — 🔻')
      if (hit) stepMental(o, actor.id, 'cautious', critical ? 2 : 1,
                          `✅ Préservation — 🔻${critical ? ' ×2 (✴️)' : ''}, +1 ◇`)
      else note(o, '◐ Préservation partielle — +1 ◇')
      gainStability(o, actor.id)
      return { effects: o.fx, notes: o.notes }
    },
  },

  // Focalisation — recentre vers Concentré, depuis l'un ou l'autre bord.
  focalisation: {
    getDC: (a) => 8 + mentalDegree(a.mentalState),
    resolve({ hit, critical, flaw }, actor) {
      const o: Fx = { fx: [], notes: [] }
      if (flaw) loseReaction(o, actor.id, '⚠️ Concentration mal placée — perd 1 ⚡')
      if (hit) stepMental(o, actor.id, 'focused', critical ? 2 : 1,
                          `✅ Focalisation — ↔ Concentré${critical ? ' ×2 (✴️)' : ''}, +1 ◇`)
      else note(o, '◐ Focalisation partielle — +1 ◇')
      gainStability(o, actor.id)
      return { effects: o.fx, notes: o.notes }
    },
  },

  // Résolution — 🔺 vers Agressif, jamais au-dessus.
  resolution: {
    getDC: (a) => 8 + mentalDegree(a.mentalState),
    resolve({ hit, critical, flaw }, actor) {
      const o: Fx = { fx: [], notes: [] }
      if (flaw) shiftMental(o, actor.id, 'toward-rage', '⚠️ Décalage subi — 🔺')
      if (hit) stepMental(o, actor.id, 'aggressive', critical ? 2 : 1,
                          `✅ Résolution — 🔺${critical ? ' ×2 (✴️)' : ''}, +1 ◇`)
      else note(o, '◐ Résolution partielle — +1 ◇')
      gainStability(o, actor.id)
      return { effects: o.fx, notes: o.notes }
    },
  },

  // Méditation — fait le plein de ◇ (1 par Résilience), sans décalage.
  meditation: {
    getDC: (a) => 8 + mentalDegree(a.mentalState),
    resolve({ hit, flaw }, actor) {
      const o: Fx = { fx: [], notes: [] }
      if (flaw) slowNextAction(o, actor.id, 2, '⚠️ Remontée lente — prochaine action à +2 initiative')

      const gain = hit ? Math.max(1, actor.skills.resilience) : 1
      gainStability(o, actor.id, gain,
                    hit ? `✅ Méditation — +${gain} ◇` : '◐ Méditation partielle — +1 ◇')
      return { effects: o.fx, notes: o.notes }
    },
  },
}

/**
 * ── Effets élémentaires, partagés par les résolveurs ────────────────────────
 *
 * Chacun décrit une MÉCANIQUE, pas une issue. Le texte de log est un paramètre
 * (avec une description neutre par défaut), de sorte que le même effet serve
 * indifféremment un ⚠️ Défaut, un ✴️ Critique ou un ▶️ Effet, sans être réécrit
 * — c'est l'appelant qui dit à quel titre il l'applique.
 *
 * Une note vide n'écrit rien : un effet peut être silencieux quand l'issue le
 * mentionne déjà (le « +1 ◇ » des consolidations vit dans leur ligne ✅/◐).
 */
type Fx = { fx: CombatEffect[]; notes: string[] }

const note = ({ notes }: Fx, text: string) => { if (text) notes.push(text) }

/** 😩 Marqueurs d'épuisement — plancher de fatigue, persiste hors combat. */
function exhaust(o: Fx, actorId: string, amount = 1, text = `+${amount} 😩 Épuisé (plancher de fatigue)`): void {
  o.fx.push({ targetId: actorId, kind: 'add-exhaustion', amount })
  note(o, text)
}

/**
 * 🩸 Résout l'hémorragie SUR-LE-CHAMP au lieu d'attendre la fin de manche,
 * plafonnée à une blessure. Sans jeton en stock, il n'y a rien à rouvrir : la
 * garde interne évite à chaque appelant de la répéter.
 */
function reopenWound(o: Fx, actor: CombatantState, text = 'hémorragie résolue immédiatement (1💢)'): void {
  if (actor.bleed <= 0) return
  o.fx.push({ targetId: actor.id, kind: 'light-wound', amount: 1 })
  note(o, text)
}

/** ⚡ Réaction perdue (plancher 0). */
function loseReaction(o: Fx, actorId: string, text = 'perd 1 ⚡'): void {
  o.fx.push({ targetId: actorId, kind: 'spend-reaction' })
  note(o, text)
}

/** ⚡ Réaction gagnée. */
function gainReaction(o: Fx, actorId: string, amount = 1, text = `gagne ${amount}⚡`): void {
  o.fx.push({ targetId: actorId, kind: 'add-reaction', amount })
  note(o, text)
}

/** Initiative de la PROCHAINE action décalée, puis consommée. */
function slowNextAction(o: Fx, actorId: string, amount = 2, text = `prochaine action à +${amount} initiative`): void {
  o.fx.push({ targetId: actorId, kind: 'delay-next-action', amount })
  note(o, text)
}

/** 🔻/🔺 Décalage SUBI de la piste mentale — absorbable par un ◇. */
function shiftMental(
  o: Fx, actorId: string, direction: 'toward-terror' | 'toward-rage',
  text = direction === 'toward-terror' ? '🔻' : '🔺',
): void {
  o.fx.push({ targetId: actorId, kind: 'shift-mental', direction })
  note(o, text)
}

/**
 * 🔻/🔺 Déplacement VOLONTAIRE et relatif vers `toward`, sans le dépasser et
 * sans passer par le ◇. Relatif, donc calculé à l'application : il s'ajoute à
 * ce qu'un défaut a déjà fait au lieu de l'effacer.
 */
function stepMental(o: Fx, actorId: string, toward: MentalState, steps: number, text = ''): void {
  o.fx.push({ targetId: actorId, kind: 'step-mental', toward, steps })
  note(o, text)
}

/** ◇ Stabilité gagnée (plafonnée au pool à l'application). */
function gainStability(o: Fx, actorId: string, amount = 1, text = ''): void {
  o.fx.push({ targetId: actorId, kind: 'add-stability', amount })
  note(o, text)
}

