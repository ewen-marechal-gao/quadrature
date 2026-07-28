/**
 * src/lib/combat-cards.ts — résout les CARTES réelles jouées dans un rapport.
 *
 * ⚠️ MODULE CÔTÉ SERVEUR (fs via getAllCards / getAdversary). À n'importer QUE
 * depuis des Server Components — le résultat (données de carte pures) est ensuite
 * passé en prop au CombatViewer client.
 *
 * Deux ponts, une carte par le même composant `ActionCard` (exigence créateur) :
 *  · actions JOUEUR   — id d'action → `vaultCard` (data/player_actions.yaml) → carte
 *                       du vault (rules/{locale}/cartes/*.yaml).
 *  · cartes ADVERSAIRE — id de carte → deck de l'adversaire (data/bestiary) →
 *                       `adversaryCardToPlayerCard`.
 *
 * Deux tables SÉPARÉES car les espaces d'id se chevauchent (`charge` est à la fois
 * une action joueur ET une carte du Faucheur) : le viewer choisit selon le camp.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { getAllCards, type ActionCard } from "@/lib/cards";
import { getDisciplineCards } from "@/lib/discipline-cards";
import { getAdversary } from "@/lib/bestiary";
import { adversaryCardToPlayerCard, conferringBlocks } from "@/lib/adversary-card";
import type { CombatLog } from "@/lib/combat-report";
import type { Locale } from "@/lib/nav";

export interface CombatCards {
  /** id d'action joueur → carte du vault. */
  player: Record<string, ActionCard>;
  /** id de carte d'adversaire → carte adaptée. */
  adversary: Record<string, ActionCard>;
}

/** id d'action joueur → id de carte du vault (`vaultCard:` de player_actions.yaml). */
function playerActionToVaultId(): Record<string, string> {
  const file = join(process.cwd(), "..", "data", "player_actions.yaml");
  try {
    const doc = load(readFileSync(file, "utf-8")) as
      | { actions?: Record<string, { vaultCard?: unknown }> }
      | undefined;
    const map: Record<string, string> = {};
    for (const [id, a] of Object.entries(doc?.actions ?? {})) {
      if (typeof a?.vaultCard === "string") map[id] = a.vaultCard;
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Construit les tables de cartes pour un rapport donné. Ne charge que les
 * adversaires réellement présents (repérés via `adversariesEndOfRound`).
 */
export function resolveCombatCards(log: CombatLog, locale: Locale): CombatCards {
  const player: Record<string, ActionCard> = {};
  const adversary: Record<string, ActionCard> = {};

  // ── Joueur : actionId → vaultCard → carte ──
  const cardsById = new Map(getAllCards(locale).map((c) => [c.id, c]));
  for (const [actionId, vaultId] of Object.entries(playerActionToVaultId())) {
    const card = cardsById.get(vaultId);
    if (card) player[actionId] = card;
  }

  // ── Joueur : actions de DISCIPLINE (Électromancie…) — l'id d'action EST l'id
  // de carte (spark, cathodic-focus, discharge), pas de pont `vaultCard`. ──
  for (const c of getDisciplineCards(locale)) player[c.id] = c;

  // ── Adversaire : deck de chaque adversaire du combat ──
  const advIds = new Set<string>();
  for (const round of log.rounds)
    for (const s of round.adversariesEndOfRound ?? []) advIds.add(s.id);

  for (const id of advIds) {
    const adv = getAdversary(id, locale);
    if (!adv) continue;
    const conferred = conferringBlocks(adv);
    for (const c of adv.cards) {
      adversary[c.id] = adversaryCardToPlayerCard(c, conferred[c.id]);
    }
  }

  return { player, adversary };
}
