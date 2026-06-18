"use client";

/**
 * CardBrowser — rubrique Cartes : recherche, filtres, sélection, impression.
 *
 * Écran : galerie filtrable + panneau de sélection.
 * Impression : window.print() — seules les planches .cards-print sont rendues,
 * en A4 paysage, 8 cartes par page (2 rangées × 4 colonnes), voir globals.css.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ActionCard as Card, CardFamily, CardType } from "@/lib/cards";
import { ActionCard } from "@/components/ActionCard";

const FAMILY_LABELS: Record<CardFamily, string> = {
  melee:      "Mêlée",
  distance:   "Distance",
  mouvement:  "Mouvement",
  tempo:      "Tempo",
  mental:     "Mental",
  physique:   "Physique",
  sociale:    "Sociale",
  utilitaire: "Utilitaire",
  garde:      "Garde",
};

const TYPE_LABELS: Record<CardType, string> = {
  action:   "Actions",
  reaction:  "Réactions ⚡",
};

const CARDS_PER_PAGE = 8;

/** Texte agrégé d'une carte pour la recherche plein texte. */
function searchableText(card: Card): string {
  return [
    card.nom, card.description, card.prerequis, card.bandeau, card.declencheur,
    card.condition, card.mental, card.cible, card.jet, card.contre,
    card.defaut, card.critique, card.effet, card.effet_duree,
    card.succes, card.echec, card.notes,
    ...(card.ameliorations?.flatMap((a) => [a.nom, a.effet]) ?? []),
    ...(card.sacrifices?.flatMap((s) => [s.nom ?? "", s.effet]) ?? []),
    ...(card.table?.lignes.map((l) => l.effet) ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Découpe la sélection (avec quantités) en planches de 8 cartes. */
function buildSheets(cards: Card[], selection: Map<string, number>): Card[][] {
  const flat: Card[] = [];
  for (const card of cards) {
    const qty = selection.get(card.id) ?? 0;
    for (let i = 0; i < qty; i++) flat.push(card);
  }
  const sheets: Card[][] = [];
  for (let i = 0; i < flat.length; i += CARDS_PER_PAGE) {
    sheets.push(flat.slice(i, i + CARDS_PER_PAGE));
  }
  return sheets;
}

export function CardBrowser({ cards, locale }: { cards: Card[]; locale: string }) {
  const [query, setQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState<CardFamily | null>(null);
  const [typeFilter, setTypeFilter] = useState<CardType | null>(null);
  /** true = uniquement les actions universelles (sans prérequis). */
  const [universalOnly, setUniversalOnly] = useState(false);
  /** Mode économique : fond des cartes blanc (économise l'encre). */
  const [ecoMode, setEcoMode] = useState(false);
  const [selection, setSelection] = useState<Map<string, number>>(new Map());

  const families = useMemo(
    () => [...new Set(cards.map((c) => c.famille))],
    [cards]
  );

  const searchIndex = useMemo(
    () => new Map(cards.map((c) => [c.id, searchableText(c)])),
    [cards]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (familyFilter && c.famille !== familyFilter) return false;
      if (typeFilter && c.type !== typeFilter) return false;
      if (universalOnly && c.prerequis) return false;
      if (q && !searchIndex.get(c.id)?.includes(q)) return false;
      return true;
    });
  }, [cards, query, familyFilter, typeFilter, universalOnly, searchIndex]);

  const totalSelected = [...selection.values()].reduce((a, b) => a + b, 0);
  const pageCount = Math.ceil(totalSelected / CARDS_PER_PAGE);

  function add(id: string, delta: number) {
    setSelection((prev) => {
      const next = new Map(prev);
      const qty = (next.get(id) ?? 0) + delta;
      if (qty <= 0) next.delete(id);
      else next.set(id, qty);
      return next;
    });
  }

  const sheets = useMemo(() => buildSheets(cards, selection), [cards, selection]);

  return (
    <>
      {/* ── Interface écran ─────────────────────────────────────────────── */}
      <div className="cards-app" data-eco={ecoMode || undefined}>
        <header className="cards-bar">
          <Link href={`/${locale}/`} className="cards-back" title="Retour à l'accueil">
            ←
          </Link>
          <span className="cards-title">Cartes d'action</span>

          <input
            type="search"
            className="cards-search"
            placeholder="Rechercher une carte…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher une carte"
          />

          <div className="cards-print-summary">
            {totalSelected > 0 ? (
              <>
                <span>
                  {totalSelected} carte{totalSelected > 1 ? "s" : ""} ·{" "}
                  {pageCount} page{pageCount > 1 ? "s" : ""} A4
                </span>
                <label
                  className="cards-eco-toggle"
                  title="Fond des cartes blanc — économise l'encre"
                >
                  <input
                    type="checkbox"
                    checked={ecoMode}
                    onChange={(e) => setEcoMode(e.target.checked)}
                  />
                  Mode éco
                </label>
                <button
                  className="cards-btn cards-btn-clear"
                  onClick={() => setSelection(new Map())}
                >
                  Vider
                </button>
                <button className="cards-btn" onClick={() => window.print()}>
                  🖨 Imprimer
                </button>
              </>
            ) : (
              <span className="cards-hint">
                Sélectionnez des cartes pour les imprimer (8 par page A4)
              </span>
            )}
          </div>
        </header>

        <div className="cards-filters">
          {(Object.keys(TYPE_LABELS) as CardType[]).map((t) => (
            <button
              key={t}
              className={`cards-chip ${typeFilter === t ? "cards-chip--on" : ""}`}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
          <button
            className={`cards-chip ${universalOnly ? "cards-chip--on" : ""}`}
            onClick={() => setUniversalOnly(!universalOnly)}
            title="Actions accessibles sans prérequis de compétence"
          >
            Universel
          </button>
          <span className="cards-filter-sep" />
          {families.map((f) => (
            <button
              key={f}
              className={`cards-chip ${familyFilter === f ? "cards-chip--on" : ""}`}
              onClick={() => setFamilyFilter(familyFilter === f ? null : f)}
            >
              {FAMILY_LABELS[f] ?? f}
            </button>
          ))}
        </div>

        <main className="cards-gallery">
          {visible.map((card) => {
            const qty = selection.get(card.id) ?? 0;
            return (
              <div key={card.id} className="cards-cell">
                <ActionCard card={card} />
                <div className="cards-cell-actions">
                  <button
                    className="cards-qty-btn"
                    onClick={() => add(card.id, -1)}
                    disabled={qty === 0}
                    aria-label={`Retirer ${card.nom}`}
                  >
                    −
                  </button>
                  <span className={`cards-qty ${qty > 0 ? "cards-qty--on" : ""}`}>
                    {qty}
                  </span>
                  <button
                    className="cards-qty-btn"
                    onClick={() => add(card.id, 1)}
                    aria-label={`Ajouter ${card.nom}`}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="cards-empty">Aucune carte ne correspond à la recherche.</p>
          )}
        </main>
      </div>

      {/* ── Planches d'impression (visibles uniquement en @media print) ──── */}
      <div className="cards-print" data-eco={ecoMode || undefined} aria-hidden="true">
        {sheets.map((sheet, i) => (
          <div key={i} className="print-page">
            {sheet.map((card, j) => (
              <ActionCard key={`${card.id}-${j}`} card={card} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
