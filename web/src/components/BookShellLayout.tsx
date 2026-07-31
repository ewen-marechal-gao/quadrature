"use client";

/**
 * BookShellLayout — shell applicatif permanent pour un livre donné.
 *
 * Reçoit le bookId depuis le layout serveur. Affiche :
 *   - La top bar (logo, titre de section, lien retour bibliothèque, PDF)
 *   - La sidebar avec tous les livres (groupes repliables), les sections de
 *     chaque livre, et les titres h2 de la section active
 *   - La zone livre où BookViewer est toujours monté (double-buffer)
 *
 * La navigation entre sections se fait via navigateTo() (contexte) :
 * pas de changement d'URL, pas de rechargement de page.
 *
 * Architecture :
 *   layout.tsx (serveur) → BookShell (client, key={bookId}) → BookShellLayout
 *   page.tsx   (serveur) → PageInitializer (client) → setCurrentContent → BookViewer
 */

import { useState, useEffect } from "react";
import { type Locale, getBookById, getTitleForSlug, localize, BOOKS, getBookForSlug } from "@/lib/nav";
import { useBook } from "@/lib/context";
import { BookViewer } from "@/components/BookViewerLoader";
import { BookViewerSkeleton } from "@/components/BookViewerSkeleton";
import { TopBar } from "@/components/TopBar";

interface Props {
  bookId: string;
  /** Locale active (ex : "fr") — utilisée pour les liens retour et le switcher. */
  locale: Locale;
  children: React.ReactNode;
}

export function BookShellLayout({ bookId, locale, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // Livres déplié dans la sidebar — le livre courant est ouvert par défaut.
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(
    () => new Set([bookId])
  );

  const { currentSlug, currentHtml, pageCounts, getOffset, navigateTo, tocs, requestPage } = useBook();

  const book     = getBookById(bookId);
  const sections = book?.sections ?? [];
  const current  = currentSlug ? getTitleForSlug(currentSlug, locale) : null;

  // Sommaire (h2 → page locale) de la section courante, extrait du rendu
  // Paged.js par BookViewer — disponible dès que la section est composée.
  const currentToc = tocs[currentSlug] ?? [];

  // Quand on navigue vers une section d'un autre livre, on l'ouvre automatiquement.
  useEffect(() => {
    if (!currentSlug) return;
    const ownerBook = getBookForSlug(currentSlug);
    if (!ownerBook) return;
    setExpandedBooks(prev => {
      if (prev.has(ownerBook.id)) return prev;
      const next = new Set(prev);
      next.add(ownerBook.id);
      return next;
    });
  }, [currentSlug]);

  const toggleBook = (id: string) => {
    setExpandedBooks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="book-app">
      {/* PageInitializer (invisible) — injecté par page.tsx */}
      {children}

      {/* ── Top bar ──────────────────────────────────────────── */}
      <TopBar
        locale={locale}
        page={book ? localize(book.title, locale) : "Bibliothèque"}
        // La première section porte le titre du livre : le répéter n'apprend rien.
        section={
          current && currentSlug !== sections[0]?.slug ? current : undefined
        }
        collapse={{
          collapsed,
          onToggle: () => setCollapsed((c) => !c),
          labelOpen: "Ouvrir le sommaire",
          labelClose: "Réduire le sommaire",
        }}
        bookId={bookId}
        actions={
          <a
            href="/quadrature.pdf"
            download="Quadrature.pdf"
            className="top-bar-download"
            title="Télécharger le PDF complet"
            aria-label="Télécharger le document en PDF"
          >
            ⬇ PDF
          </a>
        }
      />

      {/* ── Body : sidebar + book area ───────────────────────── */}
      <div className="book-body">
        {/* Sidebar */}
        <nav
          className={`book-sidebar${collapsed ? " book-sidebar--collapsed" : ""}`}
          aria-label="Sommaire"
        >
          <div className="sidebar-inner">
            {/* Tous les livres */}
            {BOOKS.map(bookDef => {
              const isCurrentBook = bookDef.id === bookId;
              const isExpanded    = expandedBooks.has(bookDef.id);

              return (
                <div key={bookDef.id} className="sidebar-book">
                  {/* En-tête cliquable du livre */}
                  <button
                    className={`sidebar-book-header${
                      isCurrentBook ? " sidebar-book-header--active" : ""
                    }`}
                    onClick={() => toggleBook(bookDef.id)}
                    aria-expanded={isExpanded}
                  >
                    <span className="sidebar-book-header-title">
                      {localize(bookDef.title, locale)}
                    </span>
                    <span className="sidebar-book-header-line" aria-hidden="true" />
                    <span className="sidebar-book-header-chevron" aria-hidden="true">
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </button>

                  {/* Sections du livre (visible si déplié) */}
                  {isExpanded && (
                    <ul className="sidebar-items">
                      {bookDef.sections.map(({ slug, title }) => {
                        const isActive = slug === currentSlug;
                        const count    = pageCounts[slug] ?? 0;

                        // Les numéros de page globaux ne sont disponibles que
                        // pour le livre courant (bookSlugs en contexte = livre courant).
                        const offset = count > 0 && isCurrentBook
                          ? getOffset(slug)
                          : null;
                        const pageLabel =
                          offset !== null
                            ? count === 1
                              ? `p. ${offset + 1}`
                              : `p. ${offset + 1}–${offset + count}`
                            : null;

                        return (
                          <li key={slug}>
                            <button
                              onClick={() => navigateTo(slug)}
                              className={`sidebar-link${
                                isActive ? " sidebar-link--active" : ""
                              }`}
                            >
                              <span className="sidebar-link-title">
                                {localize(title, locale)}
                              </span>
                              {pageLabel && (
                                <span className="sidebar-link-pages">{pageLabel}</span>
                              )}
                            </button>

                            {/* h2 sous-items — uniquement pour la section active */}
                            {isActive && currentToc.length > 0 && (
                              <ul
                                className="sidebar-h2-list"
                                aria-label="Sous-sections"
                              >
                                {currentToc.map((entry, i) => (
                                  <li key={`${entry.text}-${i}`}>
                                    <button
                                      className="sidebar-h2-item"
                                      onClick={() => requestPage(slug, entry.page)}
                                    >
                                      <span className="sidebar-link-title">
                                        {entry.text}
                                      </span>
                                      {offset !== null && (
                                        <span className="sidebar-link-pages">
                                          p. {offset + entry.page + 1}
                                        </span>
                                      )}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* Book area — BookViewer ne se démonte jamais */}
        <main className="book-area">
          {currentHtml ? (
            <BookViewer html={currentHtml} slug={currentSlug || undefined} />
          ) : (
            <BookViewerSkeleton />
          )}
        </main>
      </div>
    </div>
  );
}
