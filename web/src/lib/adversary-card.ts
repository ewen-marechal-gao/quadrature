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
    cout: "⚫".repeat(card.cost),
    ...(conferredBy && { prerequis: conferredBy }),
    repere: card.onFives,
    succes: card.onSuccess,
    echec: card.onFailure,
    notes: card.note,
  };
}
