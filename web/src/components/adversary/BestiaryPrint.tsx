"use client";

/**
 * BestiaryPrint — DOM d'impression (caché à l'écran, rendu via window.print()).
 *
 * Compose deux types de planches, sur le modèle de /cartes :
 *   - Fiche A5 : pages A4 PORTRAIT, jusqu'à 2 fiches A5 paysage empilées.
 *     On émet une page RECTO (stat-blocks) puis une page VERSO (illustrations),
 *     dans le même ordre haut→bas. En recto/verso « bord long » (réglage usuel),
 *     la moitié haute du verso se retrouve derrière la moitié haute du recto :
 *     les faces coïncident, une coupe au milieu de l'A4 donne des fiches A5
 *     recto/verso prêtes à l'emploi. (Les copies étant identiques, l'alignement
 *     reste correct même en retournement « bord court ».)
 *   - Deck : pages A4 PAYSAGE, jusqu'à 8 cartes (4 × 2) aux dimensions exactes.
 *
 * L'orientation par planche est fixée via des @page nommées (cf. adversaries.css).
 */

import type { Adversary } from "@/lib/bestiary";
import { adversaryCardToPlayerCard } from "@/lib/adversary-card";
import { ActionCard } from "@/components/ActionCard";
import {
  AdversaryStatBlock,
  AdversaryVerso,
} from "@/components/adversary/AdversarySheet";

const DECK_PER_PAGE = 8;

export interface PrintConfig {
  /** Nombre de fiches A5 (0, 1 ou 2). */
  sheetCopies: number;
  /** Nombre de copies par carte de deck, indexé par id de carte. */
  deckCopies: Record<string, number>;
}

/** Découpe une liste en groupes de taille `size`. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function BestiaryPrint({
  adversary,
  config,
}: {
  adversary: Adversary;
  config: PrintConfig;
}) {
  const sheetCopies = Math.max(0, Math.min(2, config.sheetCopies));

  // Deck aplati selon les quantités, puis découpé en planches de 8.
  const flatDeck = adversary.cards.flatMap((c) =>
    Array.from({ length: Math.max(0, config.deckCopies[c.id] ?? 0) }, () => c)
  );
  const deckPlanches = chunk(flatDeck, DECK_PER_PAGE);

  const copies = Array.from({ length: sheetCopies }, (_, i) => i);

  return (
    <div className="adv-print" aria-hidden="true">
      {sheetCopies > 0 && (
        <>
          {/* Page RECTO — fiches A5 (portrait, 2 max empilées) */}
          <div className="adv-print-page adv-print-page--sheet">
            {copies.map((i) => (
              <div key={i} className="adv-a5 adv-a5--recto">
                <AdversaryStatBlock adversary={adversary} />
              </div>
            ))}
          </div>

          {/* Page VERSO — illustrations, mêmes positions haut→bas */}
          <div className="adv-print-page adv-print-page--sheet">
            {copies.map((i) => (
              <div key={i} className="adv-a5 adv-a5--verso">
                <AdversaryVerso adversary={adversary} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Planches de deck — A4 paysage, 8 cartes par page */}
      {deckPlanches.map((cards, i) => (
        <div key={i} className="adv-print-page adv-print-page--deck">
          {cards.map((c, j) => (
            <ActionCard key={`${c.id}-${j}`} card={adversaryCardToPlayerCard(c)} />
          ))}
        </div>
      ))}
    </div>
  );
}
