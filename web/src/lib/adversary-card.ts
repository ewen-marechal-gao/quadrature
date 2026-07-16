/**
 * src/lib/adversary-card.ts
 *
 * Adaptation d'une carte d'adversaire au format des cartes d'action des joueurs,
 * afin de la rendre avec le même composant `ActionCard` (mêmes proportions de
 * carte à jouer, même code couleur).
 *
 * Module SANS dépendance `fs` (contrairement à bestiary.ts) : il peut donc être
 * importé par les composants client. Les types n'arrivent qu'en `import type`
 * (effacés à la compilation), ce qui n'entraîne aucune dépendance runtime.
 */

import type { ActionCard as PlayerCard } from "@/lib/cards";
import type { AdversaryCard, Adversary } from "@/lib/bestiary";
import { BAND_MOON, bandOf } from "@/lib/bands";

/**
 * Pour chaque carte du deck, la partie du corps et le bloc qui la confèrent
 * (« Partie · Bloc ») : ce bloc doit rester intact pour que la carte reste
 * jouable. Retourne un dictionnaire cardId → libellé (cartes non conférées par
 * un bloc — innées — sont absentes).
 */
export function conferringBlocks(adversary: Adversary): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of [...adversary.parts, ...adversary.weapons]) {
    for (const block of part.blocks) {
      if (block.grantsCard) {
        map[block.grantsCard] = block.name ? `${part.name} · ${block.name}` : part.name;
      }
    }
  }
  return map;
}

/**
 * Coût d'une carte d'adversaire : la lune de sa **bande** répétée autant de fois
 * qu'elle coûte de points d'action, suivie de sa fatigue 💧. Les fiches ne
 * stockent qu'un coût numérique — la bande se dérive donc de l'initiative, comme
 * pour les cartes joueur (§ combat.md). Une carte hors-bande (initiative 0 ou 10)
 * retombe sur le pip générique ⚫.
 */
function moonCost(card: AdversaryCard): string {
  const band = bandOf(card.initiative);
  const pip  = band ? BAND_MOON[band] : "⚫";
  return pip.repeat(card.cost) + "💧".repeat(card.fatigueCost ?? 0);
}

/**
 * Les actions d'adversaires sont offensives par défaut et n'ont pas de
 * Défaut ⚠️ ; le « Repérez X 5 » passe par le champ `repere` (⭐).
 *
 * La carte d'adversaire est en anglais (chaînes déjà résolues dans la locale) ;
 * on la traduit vers la forme (française) du composant `ActionCard` des joueurs.
 *
 * `conferredBy` (optionnel) : « Partie · Bloc » qui confère la carte (le bloc
 * doit rester intact pour qu'elle reste au deck) — affiché en Prérequis.
 */
export function adversaryCardToPlayerCard(card: AdversaryCard, conferredBy?: string): PlayerCard {
  return {
    id: card.id,
    nom: card.name,
    type: "action",
    famille: "melee",
    categorie: "offensive",
    initiative: card.initiative,
    cout: moonCost(card),
    ...(conferredBy && { prerequis: conferredBy }),
    repere: card.onFives,
    succes: card.onSuccess,
    echec: card.onFailure,
    notes: card.note,
  };
}
