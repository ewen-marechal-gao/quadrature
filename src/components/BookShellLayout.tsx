"use client";

/**
 * BookShellLayout — shell applicatif permanent, monté une seule fois dans le RootLayout.
 *
 * Ce composant ne se démonte JAMAIS entre les navigations Next.js.
 * BookViewerLoader est donc toujours monté, ce qui permet le double-buffer :
 * l'ancienne section reste visible pendant le rendu Paged.js de la nouvelle.
 *
 * Architecture de navigation :
 *   1. L'utilisateur clique un lien → Next.js charge la route /rules/[slug]
 *   2. page.tsx rend un <PageInitializer slug html /> (invisible, null return)
 *   3. PageInitializer appelle setCurrentContent() dans le BookContext
 *   4. BookShellLayout lit currentHtml/currentSlug depuis le contexte et
 *      passe le nouveau `html` à BookViewer
 *   5. BookViewer réutilise le rendu Paged.js depuis le cache vault (O(1))
 *      ou lance un nouveau rendu en staging avant un swap atomique
 */

import { useState } from "react";
import Link from "next/link";
import { NAV, NAV_FLAT } from "@/lib/nav";
import { useBook } from "@/lib/context";
import { BookViewer } from "@/components/BookViewerLoader";

interface Props {
  children: React.ReactNode;
}

export function BookShellLayout({ children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const { currentSlug, currentHtml, pageCounts, getOffset } = useBook();

  const index   = NAV_FLAT.findIndex((item) => item.slug === currentSlug);
  const current = index >= 0 ? NAV_FLAT[index] : null;

  return (
    <div className="book-app">
      {/* ── PageInitializer (invisible) ───────────────────────── */}
      {children}

      {/* ── Top bar ──────────────────────────────────────────── */}
      <header className="top-bar">
        <button
          className="top-bar-collapse"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Ouvrir le sommaire" : "Réduire le sommaire"}
          title={collapsed ? "Ouvrir le sommaire" : "Réduire le sommaire"}
        >
          {collapsed ? "›" : "‹"}
        </button>

        <Link href="/" className="top-bar-logo">
          Quadrature
        </Link>

        {current && (
          <>
            <span className="top-bar-sep">—</span>
            <span className="top-bar-title">{current.title}</span>
          </>
        )}

        <a
          href="/quadrature.pdf"
          download="Quadrature.pdf"
          className="top-bar-download"
          title="Télécharger le PDF"
          aria-label="Télécharger le document en PDF"
        >
          ⬇ PDF
        </a>
      </header>

      {/* ── Body : sidebar + book area ───────────────────────── */}
      <div className="book-body">
        {/* Sidebar */}
        <nav
          className={`book-sidebar${collapsed ? " book-sidebar--collapsed" : ""}`}
          aria-label="Sommaire"
        >
          <div className="sidebar-inner">
            {NAV.map((section) => (
              <div key={section.id} className="sidebar-section">
                <span className="sidebar-section-title">{section.title}</span>
                <ul className="sidebar-items">
                  {section.items.map((item) => {
                    const href    = `/rules/${item.slug}`;
                    const isActive = item.slug === currentSlug;

                    const count  = pageCounts[item.slug] ?? 0;
                    const offset = count > 0 ? getOffset(item.slug) : null;
                    const pageLabel =
                      offset !== null
                        ? count === 1
                          ? `p. ${offset + 1}`
                          : `p. ${offset + 1}–${offset + count}`
                        : null;

                    return (
                      <li key={item.slug}>
                        <Link
                          href={href}
                          className={`sidebar-link${isActive ? " sidebar-link--active" : ""}`}
                        >
                          <span className="sidebar-link-title">{item.title}</span>
                          {pageLabel && (
                            <span className="sidebar-link-pages">{pageLabel}</span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Book area — BookViewer ne se démonte jamais */}
        <main className="book-area">
          {currentHtml ? (
            <BookViewer
              html={currentHtml}
              slug={currentSlug || undefined}
            />
          ) : (
            <div className="book-outer">
              <button className="book-arrow book-arrow--prev" disabled aria-label="Page précédente">‹</button>
              <div className="book-center">
                <div className="book-status">Sélectionnez une section…</div>
              </div>
              <button className="book-arrow book-arrow--next" disabled aria-label="Page suivante">›</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
