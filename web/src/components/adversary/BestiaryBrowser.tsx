"use client";

/**
 * BestiaryBrowser — rubrique Bestiaire : chrome applicatif + sélection + impression.
 *
 * Réutilise le shell du site (top-bar + sidebar, cf. shell.css) :
 *   - top-bar : logo, titre « Bestiaire », sélecteur de langue
 *   - sidebar : champ de recherche + liste des créatures (filtrable)
 *   - zone principale : fiche de la créature + panneau d'impression
 *
 * L'impression passe par un DOM dédié (BestiaryPrint), masqué à l'écran et
 * révélé par window.print() — sur le modèle de la rubrique /cartes.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Adversary } from "@/lib/bestiary";
import { type Locale } from "@/lib/nav";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { AdversarySheet } from "@/components/adversary/AdversarySheet";
import { BestiaryPrint } from "@/components/adversary/BestiaryPrint";
import "@/app/adversaries.css";

const MAX_PER_CARD = 8;

/** Texte agrégé d'une créature pour la recherche plein texte. */
function searchableText(a: Adversary): string {
  return [a.name, a.powerLabel, a.description, ...a.parts.map((p) => p.name)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function BestiaryBrowser({
  adversaries,
  locale,
}: {
  adversaries: Adversary[];
  locale: Locale;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(adversaries[0]?.id ?? "");

  // ── Configuration d'impression ───────────────────────────────────────────
  const [sheetCopies, setSheetCopies] = useState(2);
  /** Copies par carte de deck (id → n). Défaut implicite : 1 (cf. getDeck). */
  const [deckCopies, setDeckCopies] = useState<Record<string, number>>({});

  const searchIndex = useMemo(
    () => new Map(adversaries.map((a) => [a.id, searchableText(a)])),
    [adversaries]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return adversaries;
    return adversaries.filter((a) => searchIndex.get(a.id)?.includes(q));
  }, [adversaries, query, searchIndex]);

  const selected =
    adversaries.find((a) => a.id === selectedId) ?? adversaries[0];

  const getDeck = (id: string) => deckCopies[id] ?? 1;
  const setDeck = (id: string, n: number) =>
    setDeckCopies((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(MAX_PER_CARD, n)),
    }));

  // Quantités résolues (défaut 1) pour la créature courante.
  const resolvedDeckCopies = useMemo(() => {
    const out: Record<string, number> = {};
    selected?.cards.forEach((c) => (out[c.id] = getDeck(c.id)));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, deckCopies]);

  // Décompte de pages A4 (2 pour la fiche recto/verso + planches de deck).
  const sheetPages = sheetCopies > 0 ? 2 : 0;
  const totalDeck = Object.values(resolvedDeckCopies).reduce((a, b) => a + b, 0);
  const deckPages = Math.ceil(totalDeck / 8);
  const totalPages = sheetPages + deckPages;

  return (
    <>
      <div className="book-app adv-app">
        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <header className="top-bar">
          <button
            className="top-bar-collapse"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Ouvrir la liste" : "Réduire la liste"}
            title={collapsed ? "Ouvrir la liste" : "Réduire la liste"}
          >
            {collapsed ? "›" : "‹"}
          </button>

          <Link href={`/${locale}/`} className="top-bar-logo">
            Quadrature
          </Link>
          <span className="top-bar-sep">—</span>
          <span className="top-bar-book">Bestiaire</span>
          {selected && (
            <>
              <span className="top-bar-sep">·</span>
              <span className="top-bar-title">{selected.name}</span>
            </>
          )}

          <LocaleSwitcher locale={locale} />
        </header>

        {/* ── Body : sidebar + fiche ─────────────────────────────────────── */}
        <div className="book-body">
          <nav
            className={`book-sidebar${collapsed ? " book-sidebar--collapsed" : ""}`}
            aria-label="Liste des créatures"
          >
            <div className="sidebar-inner">
              <div className="adv-search-wrap">
                <input
                  type="search"
                  className="adv-search"
                  placeholder="Rechercher une créature…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Rechercher une créature"
                />
              </div>

              <div className="sidebar-section">
                <div className="sidebar-section-title">Créatures</div>
                <ul className="sidebar-items">
                  {visible.map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={() => setSelectedId(a.id)}
                        className={`sidebar-link${
                          a.id === selected?.id ? " sidebar-link--active" : ""
                        }`}
                      >
                        <span className="sidebar-link-title">{a.name}</span>
                        <span className="sidebar-link-pages">{a.powerLabel}</span>
                      </button>
                    </li>
                  ))}
                  {visible.length === 0 && (
                    <li className="adv-empty">Aucune créature.</li>
                  )}
                </ul>
              </div>
            </div>
          </nav>

          <main className="adv-main">
            {selected ? (
              <>
                <AdversarySheet adversary={selected} />

                {/* ── Panneau d'impression ──────────────────────────────── */}
                <section className="adv-print-panel" aria-label="Impression">
                  <h2 className="adv-print-panel-title">Impression</h2>

                  <div className="adv-print-row">
                    <span className="adv-print-label">
                      Fiche A5
                      <small>recto / verso · {sheetCopies}/2 par page A4</small>
                    </span>
                    <div className="adv-seg" role="group">
                      {[0, 1, 2].map((n) => (
                        <button
                          key={n}
                          className={`adv-seg-btn${
                            sheetCopies === n ? " adv-seg-btn--on" : ""
                          }`}
                          onClick={() => setSheetCopies(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="adv-print-row adv-print-row--cards">
                    <span className="adv-print-label">
                      Cartes de deck
                      <small>jusqu'à 8 par page A4</small>
                    </span>
                    <ul className="adv-print-cards">
                      {selected.cards.map((c) => {
                        const v = getDeck(c.id);
                        return (
                          <li key={c.id} className="adv-print-card-row">
                            <span className="adv-print-card-name">{c.name}</span>
                            <div className="adv-stepper">
                              <button
                                className="adv-stepper-btn"
                                onClick={() => setDeck(c.id, v - 1)}
                                disabled={v === 0}
                                aria-label={`Retirer ${c.name}`}
                              >
                                −
                              </button>
                              <span className="adv-stepper-val">{v}</span>
                              <button
                                className="adv-stepper-btn"
                                onClick={() => setDeck(c.id, v + 1)}
                                disabled={v >= MAX_PER_CARD}
                                aria-label={`Ajouter ${c.name}`}
                              >
                                +
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="adv-print-actions">
                    <span className="adv-print-summary">
                      {totalPages} page{totalPages > 1 ? "s" : ""} A4
                      {sheetPages > 0 && ` · fiche ${sheetPages}`}
                      {deckPages > 0 && ` · deck ${deckPages}`}
                    </span>
                    <button
                      className="adv-print-btn"
                      onClick={() => window.print()}
                      disabled={totalPages === 0}
                    >
                      🖨 Imprimer
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <p className="adv-empty">Aucune fiche d'adversaire disponible.</p>
            )}
          </main>
        </div>
      </div>

      {/* ── DOM d'impression (caché à l'écran) ───────────────────────────── */}
      {selected && (
        <BestiaryPrint
          adversary={selected}
          config={{ sheetCopies, deckCopies: resolvedDeckCopies }}
        />
      )}
    </>
  );
}
