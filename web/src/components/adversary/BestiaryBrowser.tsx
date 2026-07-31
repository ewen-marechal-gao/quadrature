"use client";

/**
 * BestiaryBrowser — rubrique Bestiaire : chrome applicatif + sélection + impression.
 *
 * Réutilise le shell du site (TopBar + sidebar, cf. shell.css) :
 *   - TopBar : rubrique « Bestiaire » · créature sélectionnée
 *   - sidebar : champ de recherche + liste des créatures (filtrable)
 *   - zone principale : fiche de la créature + panneau d'impression
 *
 * L'impression passe par un DOM dédié (BestiaryPrint), masqué à l'écran et
 * révélé par window.print() — sur le modèle de la rubrique /cartes.
 */

import { useEffect, useMemo, useState } from "react";
import type { Adversary } from "@/lib/bestiary";
import { type Locale } from "@/lib/nav";
import { TopBar } from "@/components/TopBar";
import { AdversarySheet, DIE_GLYPH } from "@/components/adversary/AdversarySheet";
import { BestiaryPrint } from "@/components/adversary/BestiaryPrint";
import "@/app/adversaries.css";

const MAX_PER_CARD = 8;

/** Seuil « affichage étroit » (px) : sous ce point, fiche en 1 colonne + impression bloquée. */
const NARROW_BREAKPOINT = 860;

/** True quand la fenêtre est trop étroite pour la mise en page A5 2 colonnes. */
function useIsNarrow(maxWidth = NARROW_BREAKPOINT): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [maxWidth]);
  return narrow;
}

/** Texte agrégé d'une créature pour la recherche plein texte. */
function searchableText(a: Adversary): string {
  return [a.name, a.description, ...a.parts.map((p) => p.name)]
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
  const narrow = useIsNarrow();

  // Lien profond depuis le cladogramme (/evolution) : `/fr/adversaires/#faucheur`.
  useEffect(() => {
    const applyHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id && adversaries.some((a) => a.id === id)) setSelectedId(id);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [adversaries]);

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
        <TopBar
          locale={locale}
          page="Bestiaire"
          section={selected?.name}
          collapse={{
            collapsed,
            onToggle: () => setCollapsed((c) => !c),
            labelOpen: "Ouvrir la liste",
            labelClose: "Réduire la liste",
          }}
        />

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
                        <span className="sidebar-link-pages adv-sidebar-dice" title="Dés de menace">
                          {a.dice.map((d, i) => (
                            <span key={i}>{DIE_GLYPH[d]}</span>
                          ))}
                        </span>
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
                      {narrow ? (
                        <em className="adv-print-narrow">
                          Fenêtre trop étroite — élargissez pour imprimer.
                        </em>
                      ) : (
                        <>
                          {totalPages} page{totalPages > 1 ? "s" : ""} A4
                          {sheetPages > 0 && ` · fiche ${sheetPages}`}
                          {deckPages > 0 && ` · deck ${deckPages}`}
                        </>
                      )}
                    </span>
                    <button
                      className="adv-print-btn"
                      onClick={() => window.print()}
                      disabled={totalPages === 0 || narrow}
                      title={narrow ? "Impression indisponible sur écran étroit" : undefined}
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
