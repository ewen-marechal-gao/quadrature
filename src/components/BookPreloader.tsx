"use client";

/**
 * BookPreloader — précharge les sections du livre courant puis les autres livres
 * silencieusement en arrière-plan.
 *
 * Pourquoi pas un Web Worker ?
 *   Paged.js manipule directement le DOM (window, document, MutationObserver…).
 *   Ces APIs n'existent pas dans un Worker. Le rendu doit rester sur le thread
 *   principal. La "silenciosité" vient du fait que les rendus se font dans des
 *   containers off-screen (opacity:0, position:fixed hors écran).
 *
 * Phases :
 * 1. Fetch /content-index-{locale}.json → stocke dans le contexte (contentIndex)
 * 2. Passe A — rendu séquentiel des sections du livre courant (bookSlugs)
 *    en sautant celles déjà en cache (rendues par BookViewer)
 * 3. Passe B — re-rendu des sections skippées qui sont retournées au vault
 * 4. Passe C — rendu des autres livres en arrière-plan (toutes les sections
 *    qui ne sont pas dans bookSlugs)
 * 5. Passe finale — patch universel des numéros de page et des références
 *    croisées pour TOUTES les sections rendues.
 */

import { useEffect, useRef } from "react";
import { useBook } from "@/lib/context";
import { BOOKS } from "@/lib/nav";
import { loadPagedScript, computeOffset, applyGlobalPageNumbers, applyPageRefs, getPagedPreviewer, fixColumnBreaks } from "@/lib/pagedjs";
import { renderCache, getVault, type CachedRender } from "@/lib/pagedCache";

interface Props {
  /** Slugs ordonnés du livre courant — chargés en priorité. */
  slugs: string[];
  /** Locale active — détermine quel content-index charger (ex : "fr", "en"). */
  locale: string;
}

export function BookPreloader({ slugs: bookSlugs, locale }: Props) {
  const { setPageCount, setContentIndex, setBookSlugs } = useBook();

  // Ref vers bookSlugs stable entre les renders
  const bookSlugsRef = useRef(bookSlugs);
  useEffect(() => { bookSlugsRef.current = bookSlugs; }, [bookSlugs]);

  useEffect(() => {
    // Synchroniser bookSlugs dans le contexte (pour getOffset, prev/next)
    setBookSlugs(bookSlugs);
  }, [bookSlugs, setBookSlugs]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Attendre que le navigateur soit idle
      await idlePromise();
      if (cancelled) return;

      // ── Chargement du content-index (par locale) ─────────────────────────
      let content: Record<string, string>;
      try {
        const res = await fetch(`/content-index-${locale}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        content = await res.json();
      } catch (e) {
        console.warn(`[BookPreloader] Impossible de charger content-index-${locale}.json :`, e);
        return;
      }

      setContentIndex(content);
      if (cancelled) return;

      await loadPagedScript();
      if (cancelled) return;

      // ── Passe A : livre courant ───────────────────────────────────────────
      const skipped: string[] = [];
      let offset = 0;

      for (const slug of bookSlugsRef.current) {
        if (cancelled) return;

        if (renderCache.has(slug)) {
          skipped.push(slug);
          offset += renderCache.get(slug)!.total;
          continue;
        }

        const html = content[slug];
        if (!html) continue;

        const result = await renderAndCache(slug, html, offset);
        if (!cancelled && result !== null) {
          setPageCount(slug, result.total);
          offset += result.total;
        }
      }

      if (cancelled) return;

      // ── Passe B : re-rendu des sections skippées (maintenant dans le vault) ─
      for (const slug of skipped) {
        if (cancelled) return;

        const cached = renderCache.get(slug);
        if (!cached || cached.pagesArea.parentElement !== getVault()) continue;

        const html = content[slug];
        if (!html) continue;

        getVault().removeChild(cached.pagesArea);
        renderCache.delete(slug);

        // Recalculer l'offset de cette section dans le livre courant
        const slugOffset = computeOffsetInList(slug, bookSlugsRef.current, renderCache);
        const result = await renderAndCache(slug, html, slugOffset);
        if (!cancelled && result !== null) {
          setPageCount(slug, result.total);
        }
      }

      if (cancelled) return;

      // ── Passe C : autres livres en arrière-plan ───────────────────────────
      const currentSet = new Set(bookSlugsRef.current);
      const otherSlugs = BOOKS
        .flatMap((b) => b.sections.map((s) => s.slug))
        .filter((s) => !currentSet.has(s) && !renderCache.has(s));

      for (const slug of otherSlugs) {
        if (cancelled) return;
        const html = content[slug];
        if (!html) continue;
        // offset=0 : numérotation interne au livre de la section — corrigée dans
        // la passe finale. Pas besoin de précision ici.
        await renderAndCache(slug, html, 0);
      }

      if (cancelled) return;

      // ── Passe finale : patch numéros de page + références croisées ────────
      // Chaque livre est paginé indépendamment (page 1 de chaque livre = 1).
      // On patch livre par livre pour que les cross-refs pointent vers les
      // numéros relatifs au livre cible.
      for (const book of BOOKS) {
        const bookCounts: Record<string, number> = {};
        for (const { slug } of book.sections) {
          const c = renderCache.get(slug);
          if (c) bookCounts[slug] = c.total;
        }

        let off = 0;
        for (const { slug } of book.sections) {
          const cached = renderCache.get(slug);
          if (cached && cached.total > 0) {
            applyGlobalPageNumbers(cached.pagesArea, off);
            applyPageRefs(cached.pagesArea, bookCounts);
            off += cached.total;
          }
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function idlePromise(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(() => resolve(), { timeout: 5000 });
    } else {
      setTimeout(resolve, 800);
    }
  });
}

/**
 * Calcule l'offset d'un slug dans une liste ordonnée en cumulant les totaux
 * des sections précédentes depuis renderCache.
 */
function computeOffsetInList(
  slug: string,
  slugList: string[],
  cache: typeof renderCache,
): number {
  let offset = 0;
  for (const s of slugList) {
    if (s === slug) break;
    offset += cache.get(s)?.total ?? 0;
  }
  return offset;
}

/**
 * Rend le HTML via Paged.js dans un div off-screen, applique la numérotation,
 * et stocke le résultat dans le vault + renderCache.
 * Retourne null en cas d'échec.
 */
async function renderAndCache(
  slug: string,
  html: string,
  offset: number,
): Promise<CachedRender | null> {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-99999px;top:0;opacity:0;pointer-events:none";
  document.body.appendChild(container);

  try {
    const PreviewerClass = getPagedPreviewer();
    if (!PreviewerClass) return null;

    const paged = new PreviewerClass();

    // Éviter le clignotement causé par la ré-injection des baseStyles Paged.js
    const alreadySetUp = !!document.querySelector("style[data-pagedjs-inserted-styles]");
    if (alreadySetUp) {
      paged.polisher.setup = function(this: { styleEl: HTMLStyleElement; styleSheet: CSSStyleSheet | null }) {
        this.styleEl = document.createElement("style");
        document.head.appendChild(this.styleEl);
        this.styleSheet = this.styleEl.sheet;
        return this.styleSheet;
      };
    }

    const flow  = await paged.preview(html, ["/book.css"], container);
    const total: number = flow?.total ?? 0;

    const pagesArea = container.querySelector(".pagedjs_pages") as HTMLElement | null;
    const firstPage = container.querySelector(".pagedjs_page")  as HTMLElement | null;

    if (!pagesArea || !firstPage || total === 0) {
      return { pagesArea: document.createElement("div"), total, pageWidth: 0, pageHeight: 0 };
    }

    // Sauts de colonne (fallback Firefox) — mesure valide tant que le
    // container off-screen est encore dans le DOM.
    fixColumnBreaks(container);

    applyGlobalPageNumbers(container, offset);

    const entry: CachedRender = {
      pagesArea,
      total,
      pageWidth:  firstPage.offsetWidth,
      pageHeight: firstPage.offsetHeight,
    };

    getVault().appendChild(pagesArea);
    renderCache.set(slug, entry);

    return entry;
  } catch (e) {
    console.warn(`[BookPreloader] ${slug} :`, e);
    return null;
  } finally {
    container.remove();
  }
}
