"use client";

/**
 * BookPreloader — précharge toutes les sections et corrige la numérotation globale.
 *
 * Phases :
 * 1. Fetch /content-index.json → stocke contentIndex dans le contexte
 * 2. Passe 1 — rendu séquentiel de chaque section (sauf celles déjà en cache)
 *    avec applyGlobalPageNumbers(offset initial via countsRef)
 * 3. Passe 2 — re-rendu des sections skippées qui sont maintenant dans le vault
 * 4. Passe finale — patch universel : parcourt renderCache dans l'ordre NAV_FLAT,
 *    calcule les offsets cumulatifs depuis cached.total (indépendant du state React),
 *    et corrige les pieds de page de TOUTES les sections — y compris celles rendues
 *    tôt par BookViewer (avec offset=0). Le patch s'applique en live sur le DOM,
 *    qu'il soit dans le vault ou actuellement affiché dans le viewport.
 */

import { useEffect, useRef } from "react";
import { useBook } from "@/lib/context";
import { NAV_FLAT } from "@/lib/nav";
import { loadPagedScript, computeOffset, applyGlobalPageNumbers } from "@/lib/pagedjs";
import { renderCache, getVault, type CachedRender } from "@/lib/pagedCache";

export function BookPreloader() {
  const { setPageCount, pageCounts, setContentIndex } = useBook();

  const countsRef = useRef(pageCounts);
  useEffect(() => { countsRef.current = pageCounts; }, [pageCounts]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Attendre que le navigateur soit idle (render initial terminé)
      await idlePromise();
      if (cancelled) return;

      // Charger le content-index généré au build
      let content: Record<string, string>;
      try {
        const res = await fetch("/content-index.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        content = await res.json();
      } catch (e) {
        console.warn("[BookPreloader] Impossible de charger content-index.json :", e);
        return;
      }

      // Rendre le contentIndex disponible pour la navigation cliente
      setContentIndex(content);
      if (cancelled) return;

      await loadPagedScript();
      if (cancelled) return;

      // Passe 1 : rendre et mettre en cache chaque section séquentiellement.
      // – Si la section est déjà en cache (rendue par BookViewer) : skip.
      // – Sinon : rendre avec l'offset global correct calculé à partir de countsRef.
      const skipped: string[] = [];

      for (const item of NAV_FLAT) {
        if (cancelled) return;

        if (renderCache.has(item.slug)) {
          // Déjà en cache (rendu par BookViewer avant le preloader).
          // On mémorise les slugs skippés pour la passe 2.
          skipped.push(item.slug);
          continue;
        }

        const html = content[item.slug];
        if (!html) continue;

        const offset = computeOffset(item.slug, countsRef.current);
        const result = await renderAndCache(item.slug, html, offset);
        if (!cancelled && result !== null) {
          setPageCount(item.slug, result.total);
        }
      }

      if (cancelled) return;

      // Passe 2 : re-rendre les sections skippées qui sont maintenant dans le vault
      // (l'utilisateur a navigué ailleurs). Cela leur donne un rendu propre.
      for (const slug of skipped) {
        if (cancelled) return;

        const cached = renderCache.get(slug);
        if (!cached) continue;
        // Si encore affiché (pagesArea pas dans le vault), on ne peut pas remplacer.
        if (cached.pagesArea.parentElement !== getVault()) continue;

        const html = content[slug];
        if (!html) continue;

        // Retirer l'ancienne entrée du vault et du cache
        getVault().removeChild(cached.pagesArea);
        renderCache.delete(slug);

        const offset = computeOffset(slug, countsRef.current);
        const result = await renderAndCache(slug, html, offset);
        if (!cancelled && result !== null) {
          setPageCount(slug, result.total);
        }
      }

      if (cancelled) return;

      // ── Passe finale : correction universelle de la numérotation globale ────────
      // Toutes les sections sont maintenant en cache (preloader ou BookViewer).
      // On recalcule les offsets cumulatifs depuis cached.total (valeur certaine,
      // sans dépendre du timing des mises à jour React state) et on patch les pieds
      // de page de chaque section. Le patch est instantané (textContent uniquement).
      {
        let offset = 0;
        for (const item of NAV_FLAT) {
          const cached = renderCache.get(item.slug);
          if (cached && cached.total > 0) {
            applyGlobalPageNumbers(cached.pagesArea, offset);
            offset += cached.total;
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
 * Rend le HTML via Paged.js dans un div off-screen, applique la numérotation
 * globale (applyGlobalPageNumbers), stocke le .pagedjs_pages dans le vault.
 * Retourne null en cas d'échec.
 */
async function renderAndCache(
  slug: string,
  html: string,
  offset: number,
): Promise<CachedRender | null> {
  const container = document.createElement("div");
  // opacity:0 plutôt que visibility:hidden : l'opacité d'un parent ne peut pas
  // être outrepassée par un enfant (contrairement à visibility), ce qui garantit
  // l'invisibilité même si Paged.js set visibility:visible sur ses éléments internes.
  container.style.cssText =
    "position:fixed;left:-99999px;top:0;opacity:0;pointer-events:none";
  document.body.appendChild(container);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Paged = (window as any).Paged;
    if (!Paged?.Previewer) return null;

    const paged = new Paged.Previewer();

    // ── Patch polisher.setup() pour éviter le clignotement ────────────────────
    // Paged.js insère à chaque preview() une balise <style> avec les valeurs par
    // défaut (8.5in × 11in Letter US) dans <head> — AVANT d'insérer les valeurs
    // corrigées depuis book.css (A4 297mm × 210mm).
    // Pendant ce laps de temps (~1 frame), toutes les .pagedjs_page visibles se
    // redimensionnent vers 8.5in, ce qui décale le carousel et provoque un
    // clignotement visible. Si des styles Paged.js sont déjà présents (rendu
    // précédent), on saute l'insertion des baseStyles et on crée uniquement la
    // feuille de style vide dont les handlers ont besoin.
    const alreadySetUp = !!document.querySelector("style[data-pagedjs-inserted-styles]");
    if (alreadySetUp) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paged.polisher.setup = function(this: any) {
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

    // Corriger la numérotation globale AVANT de déplacer dans le vault
    applyGlobalPageNumbers(container, offset);

    const entry: CachedRender = {
      pagesArea,
      total,
      pageWidth:  firstPage.offsetWidth,
      pageHeight: firstPage.offsetHeight,
    };

    // Déplacer pagesArea dans le vault (container devient vide)
    getVault().appendChild(pagesArea);
    renderCache.set(slug, entry);

    return entry;
  } catch (e) {
    console.warn(`[BookPreloader] ${slug} :`, e);
    return null;
  } finally {
    container.remove(); // vide (pagesArea déjà déplacé)
  }
}
