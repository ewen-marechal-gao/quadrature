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
 *                  /content-index.json par BookPreloader. Permet au preloader
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
  type ReactNode,
} from "react";
import { NAV_FLAT } from "@/lib/nav";

export interface BookContextValue {
  // ── Pagination globale ──────────────────────────────────────────────────────
  pageCounts: Record<string, number>;
  setPageCount: (slug: string, count: number) => void;
  getOffset: (slug: string) => number;
  totalKnown: number;
  isFullyLoaded: boolean;

  // ── Contenu courant (section affichée) ─────────────────────────────────────
  currentSlug: string;
  currentHtml: string;
  setCurrentContent: (slug: string, html: string) => void;

  // ── Index de contenu (chargé par BookPreloader) ─────────────────────────────
  contentIndex: Record<string, string>;
  setContentIndex: (index: Record<string, string>) => void;
}

const BookCtx = createContext<BookContextValue | null>(null);

export function BookProvider({ children }: { children: ReactNode }) {
  const [pageCounts, setPageCountsState] = useState<Record<string, number>>({});
  const [currentSlug, setCurrentSlug]   = useState("");
  const [currentHtml, setCurrentHtml]   = useState("");
  const [contentIndex, setContentIndexState] = useState<Record<string, string>>({});

  const setPageCount = useCallback((slug: string, count: number) => {
    setPageCountsState((prev) =>
      prev[slug] === count ? prev : { ...prev, [slug]: count }
    );
  }, []);

  const getOffset = useCallback(
    (slug: string) => {
      let offset = 0;
      for (const item of NAV_FLAT) {
        if (item.slug === slug) break;
        offset += pageCounts[item.slug] ?? 0;
      }
      return offset;
    },
    [pageCounts]
  );

  const setCurrentContent = useCallback((slug: string, html: string) => {
    setCurrentSlug(slug);
    setCurrentHtml(html);
  }, []);

  const setContentIndex = useCallback((index: Record<string, string>) => {
    setContentIndexState(index);
  }, []);

  const totalKnown = NAV_FLAT.reduce(
    (sum, item) => sum + (pageCounts[item.slug] ?? 0),
    0
  );

  const isFullyLoaded = NAV_FLAT.every((item) => (pageCounts[item.slug] ?? 0) > 0);

  return (
    <BookCtx.Provider
      value={{
        pageCounts, setPageCount, getOffset, totalKnown, isFullyLoaded,
        currentSlug, currentHtml, setCurrentContent,
        contentIndex, setContentIndex,
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
