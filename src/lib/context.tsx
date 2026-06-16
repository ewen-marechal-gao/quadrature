"use client";

/**
 * src/lib/context.tsx
 *
 * Contexte React partagé entre BookShellLayout, BookViewer et BookPreloader.
 *
 * Contient trois domaines d'état :
 *
 *   pageCounts   — nombre de pages par section (slug → count), alimenté par
 *                  BookViewer (section courante) et BookPreloader (toutes sections).
 *                  Permet d'afficher les numéros de page dans la sidebar.
 *
 *   currentSlug / currentHtml — section actuellement affichée dans le viewer.
 *                  Mis à jour par PageInitializer à chaque navigation Next.js.
 *                  BookShellLayout lit ces valeurs pour passer le bon HTML au viewer.
 *
 *   contentIndex — cache de tous les HTML de section, chargé depuis
 *                  /content-index-{locale}.json par BookPreloader. Permet au preloader
 *                  de rendre toutes les sections sans requêtes individuelles.
 *
 * BookProvider doit envelopper le shell entier pour que tous ces composants
 * partagent la même instance du contexte.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { TocEntry } from "./pagedjs";

/** Demande de navigation vers une page précise d'une section. */
export interface PageRequest {
  slug: string;
  page: number;
  /** Discriminant pour re-déclencher la même demande deux fois de suite. */
  nonce: number;
}

export interface BookContextValue {
  // ── Livre courant ───────────────────────────────────────────────────────────
  /** Slugs ordonnés des sections du livre en cours. Alimenté par BookShell. */
  bookSlugs: string[];
  setBookSlugs: (slugs: string[]) => void;

  // ── Pagination (relative au livre courant) ──────────────────────────────────
  pageCounts: Record<string, number>;
  setPageCount: (slug: string, count: number) => void;
  /** Offset (en pages) d'un slug dans le livre courant. */
  getOffset: (slug: string) => number;

  // ── Contenu courant (section affichée) ─────────────────────────────────────
  currentSlug: string;
  currentHtml: string;
  setCurrentContent: (slug: string, html: string) => void;

  // ── Navigation client-side (sans changement d'URL) ─────────────────────────
  /**
   * Navigue vers une section en lisant son HTML dans contentIndex.
   * Utilisé par la sidebar, les flèches et les liens de cross-référence.
   */
  navigateTo: (slug: string) => void;

  // ── Index de contenu (chargé par BookPreloader) ─────────────────────────────
  contentIndex: Record<string, string>;
  setContentIndex: (index: Record<string, string>) => void;

  // ── Sommaires de section (h2 → page locale) ─────────────────────────────────
  /** slug → entrées h2 extraites du rendu Paged.js (alimenté par BookViewer). */
  tocs: Record<string, TocEntry[]>;
  setToc: (slug: string, toc: TocEntry[]) => void;

  // ── Navigation vers une page précise de la section courante ────────────────
  pageRequest: PageRequest | null;
  /** Demande à BookViewer d'afficher la page locale `page` de `slug`. */
  requestPage: (slug: string, page: number) => void;
}

const BookCtx = createContext<BookContextValue | null>(null);

export function BookProvider({ children }: { children: ReactNode }) {
  const [bookSlugs, setBookSlugsState]    = useState<string[]>([]);
  const [pageCounts, setPageCountsState]  = useState<Record<string, number>>({});
  const [currentSlug, setCurrentSlug]     = useState("");
  const [currentHtml, setCurrentHtml]     = useState("");
  const [contentIndex, setContentIndexState] = useState<Record<string, string>>({});
  const [tocs, setTocsState]                 = useState<Record<string, TocEntry[]>>({});
  const [pageRequest, setPageRequest]        = useState<PageRequest | null>(null);

  // Ref synchrone sur contentIndex — utilisé par navigateTo sans dépendance React.
  const contentIndexRef = useRef<Record<string, string>>({});

  const setBookSlugs = useCallback((slugs: string[]) => {
    setBookSlugsState(slugs);
  }, []);

  const setPageCount = useCallback((slug: string, count: number) => {
    setPageCountsState((prev) =>
      prev[slug] === count ? prev : { ...prev, [slug]: count }
    );
  }, []);

  const getOffset = useCallback(
    (slug: string) => {
      let offset = 0;
      for (const s of bookSlugs) {
        if (s === slug) break;
        offset += pageCounts[s] ?? 0;
      }
      return offset;
    },
    [bookSlugs, pageCounts]
  );

  const setCurrentContent = useCallback((slug: string, html: string) => {
    setCurrentSlug(slug);
    setCurrentHtml(html);
  }, []);

  const setContentIndex = useCallback((index: Record<string, string>) => {
    contentIndexRef.current = index;
    setContentIndexState(index);
  }, []);

  const setToc = useCallback((slug: string, toc: TocEntry[]) => {
    setTocsState((prev) => {
      const existing = prev[slug];
      if (
        existing &&
        existing.length === toc.length &&
        existing.every((e, i) => e.text === toc[i].text && e.page === toc[i].page)
      ) {
        return prev;
      }
      return { ...prev, [slug]: toc };
    });
  }, []);

  const requestPage = useCallback((slug: string, page: number) => {
    setPageRequest({ slug, page, nonce: Date.now() });
  }, []);

  /**
   * Navigation client-side vers une section sans changement d'URL.
   * Le HTML est lu depuis contentIndexRef (synchrone, pas de re-render).
   */
  const navigateTo = useCallback((slug: string) => {
    const html = contentIndexRef.current[slug];
    if (html) {
      setCurrentSlug(slug);
      setCurrentHtml(html);
    }
  }, []);

  return (
    <BookCtx.Provider
      value={{
        bookSlugs, setBookSlugs,
        pageCounts, setPageCount, getOffset,
        currentSlug, currentHtml, setCurrentContent,
        navigateTo,
        contentIndex, setContentIndex,
        tocs, setToc,
        pageRequest, requestPage,
      }}
    >
      {children}
    </BookCtx.Provider>
  );
}

export function useBook(): BookContextValue {
  const ctx = useContext(BookCtx);
  if (!ctx) throw new Error("useBook doit être utilisé dans <BookProvider>");
  return ctx;
}
