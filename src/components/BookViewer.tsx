"use client";

/**
 * BookViewer — rendu Paged.js avec double-buffer et cache vault.
 *
 * Stratégie de navigation fluide :
 * 1. CACHE HIT  → déplacement O(1) du vault vers visible (DOM déjà rendu)
 * 2. CACHE MISS → render off-screen dans staging, swap atomique staging → visible
 *
 * Numérotation globale :
 * Paged.js réinitialise le compteur `page` à 1 pour chaque section.
 * Après chaque rendu, applyGlobalPageNumbers() patch les pieds de page
 * avec le numéro global correct (offset + index + 1).
 *
 * Responsive :
 * Un ResizeObserver sur le container extérieur recalcule le scale dès que
 * l'espace disponible change (redimensionnement fenêtre, sidebar togglée, etc.).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useBook } from "@/lib/context";
import { loadPagedScript, computeOffset, applyGlobalPageNumbers } from "@/lib/pagedjs";
import { renderCache, getVault } from "@/lib/pagedCache";

/** Padding (px) autour de la page dans le viewer (espace pour l'ombre + respiration). */
const V_PADDING  = 16;
const TRANSITION = "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)";

function carouselCss(scale: number, page: number, pageW: number, total: number, pageH: number) {
  return `
    display:flex!important;flex-direction:row!important;
    align-items:flex-start;padding:0!important;gap:0!important;
    background:transparent!important;
    transform-origin:top left;
    transform:scale(${scale}) translateX(${-page * pageW}px);
    width:${pageW * total}px;height:${pageH}px;
    will-change:transform;
  `;
}

function containerCss(pageW: number, pageH: number, scale: number) {
  // clip-path: inset(0 0 -80px 0) — clip strict gauche/droite (empêche la page
  // suivante de saigner) mais autorise 80px en bas pour l'ombre de la page.
  // overflow:hidden seul ne clippe pas les enfants sur un compositor layer séparé
  // (will-change:transform dans carouselCss crée une couche GPU indépendante).
  return `width:${Math.round(pageW * scale)}px;height:${Math.round(pageH * scale)}px;overflow:hidden;position:relative;clip-path:inset(0 0 -80px 0);`;
}

interface Props {
  html: string;
  slug?: string;
}

export function BookViewer({ html, slug }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const pagedRef = useRef<HTMLDivElement>(null);


  const { setPageCount, pageCounts, bookSlugs, navigateTo } = useBook();

  // Ref vers pageCounts — lu dans l'effet sans être dans ses dépendances
  // (évite de re-rendre à chaque comptage du preloader).
  const pageCountsRef = useRef(pageCounts);
  useEffect(() => { pageCountsRef.current = pageCounts; }, [pageCounts]);

  const [status, setStatus]           = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMsg, setErrorMsg]       = useState("");
  const [totalPages, setTotalPages]   = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  const pagesAreaRef  = useRef<HTMLElement | null>(null);
  const pageWidthRef  = useRef(0);
  const pageHeightRef = useRef(0);   // nécessaire pour le ResizeObserver
  const scaleRef      = useRef(1);
  const totalRef      = useRef(0);
  const hasRendered   = useRef(false);

  // Sections adjacentes dans le livre courant (bookSlugs depuis le contexte)
  const sectionIdx = slug ? bookSlugs.indexOf(slug) : -1;
  const prevSlug   = sectionIdx > 0 ? bookSlugs[sectionIdx - 1] : null;
  const nextSlug   =
    sectionIdx >= 0 && sectionIdx < bookSlugs.length - 1
      ? bookSlugs[sectionIdx + 1]
      : null;

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goToPage = useCallback((index: number) => {
    const area  = pagesAreaRef.current;
    const total = totalRef.current;
    if (!area) return;
    const clamped = Math.max(0, Math.min(index, total - 1));
    area.style.transform =
      `scale(${scaleRef.current}) translateX(${-clamped * pageWidthRef.current}px)`;
    setCurrentPage(clamped);
  }, []);

  const currentPageRef = useRef(0);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  const prev = useCallback(() => {
    const page = currentPageRef.current;
    if (page === 0 && prevSlug) navigateTo(prevSlug);
    else goToPage(page - 1);
  }, [goToPage, prevSlug, navigateTo]);

  const next = useCallback(() => {
    const page  = currentPageRef.current;
    const total = totalRef.current;
    if (page >= total - 1 && nextSlug) navigateTo(nextSlug);
    else goToPage(page + 1);
  }, [goToPage, nextSlug, navigateTo]);

  // ── Clavier ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next();
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, next, prev]);

  // ── Intercepteur de liens internes ──────────────────────────────────────────
  // Les <a href="/rules/..."> sont des éléments HTML bruts insérés par Paged.js.
  // On intercepte en phase capture (avant tout handler Paged.js éventuel) et on
  // navigue via navigateTo() — navigation client-side pure, sans changement d'URL
  // et sans risque de rechargement complet de la page.
  useEffect(() => {
    const container = pagedRef.current;
    if (!container) return;

    const handleLinkClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a[href^="/rules/"]');
      if (!anchor) return;
      e.preventDefault();
      e.stopPropagation();
      const href = anchor.getAttribute("href")!;
      // /rules/core/etats/ → core/etats
      const slug = href.replace(/^\/rules\//, "").replace(/\/+$/, "");
      navigateTo(slug);
    };

    container.addEventListener("click", handleLinkClick, true /* capture */);
    return () => container.removeEventListener("click", handleLinkClick, true);
  }, [navigateTo]);

  // ── ResizeObserver — recalcule le scale quand l'espace change ───────────────
  useEffect(() => {
    const outer   = outerRef.current;
    const visible = pagedRef.current;
    if (!outer || !visible) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new ResizeObserver(() => {
      const area  = pagesAreaRef.current;
      const pageW = pageWidthRef.current;
      const pageH = pageHeightRef.current;
      const total = totalRef.current;
      if (!area || !pageW || !pageH || !total) return;

      // Désactiver la transition le temps du redimensionnement
      area.style.transition = "none";

      const availW = outer.offsetWidth  - V_PADDING * 2;
      const availH = outer.offsetHeight - V_PADDING * 2;
      const scale  = Math.min(availW / pageW, availH / pageH);
      const page   = currentPageRef.current;

      area.style.transform = `scale(${scale}) translateX(${-page * pageW}px)`;
      area.style.width     = `${pageW * total}px`;
      area.style.height    = `${pageH}px`;
      visible.style.width  = `${Math.round(pageW * scale)}px`;
      visible.style.height = `${Math.round(pageH * scale)}px`;
      scaleRef.current     = scale;

      // Réactiver la transition une fois le resize stabilisé
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (pagesAreaRef.current) pagesAreaRef.current.style.transition = TRANSITION;
      }, 150);
    });

    observer.observe(outer);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []); // refs stables — pas de deps

  // ── Paged.js avec double-buffer ─────────────────────────────────────────────
  useEffect(() => {
    if (!html) return;

    const visible = pagedRef.current;
    const outer   = outerRef.current;
    if (!visible || !outer) return;

    // La navigation est désormais client-side (pas de changement d'URL).
    // startFromEnd n'est plus utilisé — la section cible démarre toujours page 1.
    const startFromEnd = false;

    let cancelled   = false;
    let stagingEl: HTMLElement | null = null;

    const availW = outer.offsetWidth  - V_PADDING * 2;
    const availH = outer.offsetHeight - V_PADDING * 2;

    // ── CAS 1 : Cache hit → affichage instantané ──────────────────────────────
    const cached = slug ? renderCache.get(slug) : null;

    if (cached) {
      const { pagesArea, total, pageWidth: pageW, pageHeight: pageH } = cached;

      const scale     = Math.min(availW / pageW, availH / pageH);
      const startPage = startFromEnd ? Math.max(0, total - 1) : 0;

      pagesArea.style.cssText = carouselCss(scale, startPage, pageW, total, pageH);

      visible.innerHTML     = "";
      visible.style.cssText = containerCss(pageW, pageH, scale);
      visible.appendChild(pagesArea);

      requestAnimationFrame(() => {
        if (!cancelled) pagesArea.style.transition = TRANSITION;
      });

      pagesAreaRef.current  = pagesArea;
      pageWidthRef.current  = pageW;
      pageHeightRef.current = pageH;
      scaleRef.current      = scale;
      totalRef.current      = total;

      if (slug) setPageCount(slug, total);
      setTotalPages(total);
      setCurrentPage(startPage);
      setStatus("ready");
      hasRendered.current = true;

      return () => {
        if (pagesArea.parentElement === visible) {
          getVault().appendChild(pagesArea);
        }
      };
    }

    // ── CAS 2 : Cache miss → render dans staging, puis swap atomique ──────────
    const staging = document.createElement("div");
    staging.style.cssText =
      "position:fixed;left:-99999px;top:0;opacity:0;pointer-events:none";
    document.body.appendChild(staging);
    stagingEl = staging;

    if (!hasRendered.current) {
      setStatus("loading");
      visible.innerHTML = "";
      visible.removeAttribute("style");
      pagesAreaRef.current = null;
      totalRef.current     = 0;
    }

    (async () => {
      try {
        await loadPagedScript();
        if (cancelled) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Paged = (window as any).Paged;
        if (!Paged?.Previewer) throw new Error("window.Paged.Previewer introuvable");

        const paged = new Paged.Previewer();
        const flow  = await paged.preview(html, ["/book.css"], staging);
        if (cancelled) return;

        const total: number = flow?.total ?? 0;
        const pagesArea = staging.querySelector(".pagedjs_pages") as HTMLElement | null;
        const firstPage = staging.querySelector(".pagedjs_page")  as HTMLElement | null;

        if (!pagesArea || !firstPage || total === 0) {
          if (slug) setPageCount(slug, total);
          visible.innerHTML = "";
          while (staging.firstChild) visible.appendChild(staging.firstChild);
          visible.removeAttribute("style");
          totalRef.current = total;
          setTotalPages(total);
          setStatus("ready");
          hasRendered.current = true;
          return;
        }

        // Corriger la numérotation globale AVANT d'afficher
        const offset = slug ? computeOffset(slug, pageCountsRef.current) : 0;
        applyGlobalPageNumbers(staging, offset);

        const pageW = firstPage.offsetWidth;
        const pageH = firstPage.offsetHeight;
        const scale     = Math.min(availW / pageW, availH / pageH);
        const startPage = startFromEnd ? Math.max(0, total - 1) : 0;

        pagesArea.style.cssText  = carouselCss(scale, startPage, pageW, total, pageH);
        staging.style.cssText    = containerCss(pageW, pageH, scale);

        // SWAP ATOMIQUE
        visible.innerHTML     = "";
        visible.style.cssText = staging.style.cssText;
        while (staging.firstChild) visible.appendChild(staging.firstChild);
        staging.style.cssText = "";

        const newPagesArea = visible.querySelector(".pagedjs_pages") as HTMLElement;

        requestAnimationFrame(() => {
          if (!cancelled && newPagesArea) newPagesArea.style.transition = TRANSITION;
        });

        if (slug) {
          renderCache.set(slug, { pagesArea: newPagesArea, total, pageWidth: pageW, pageHeight: pageH });
          setPageCount(slug, total);
        }

        pagesAreaRef.current  = newPagesArea;
        pageWidthRef.current  = pageW;
        pageHeightRef.current = pageH;
        scaleRef.current      = scale;
        totalRef.current      = total;

        setTotalPages(total);
        setCurrentPage(startPage);
        setStatus("ready");
        hasRendered.current = true;

      } catch (err) {
        console.error("[BookViewer]", err);
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : String(err));
          if (visible) visible.innerHTML = html;
          setStatus("error");
          hasRendered.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (stagingEl) stagingEl.remove();
      const pa = pagesAreaRef.current;
      if (pa && pa.parentElement === visible) {
        getVault().appendChild(pa);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={outerRef} className="book-outer">

      <button
        className="book-arrow book-arrow--prev"
        onClick={prev}
        disabled={status !== "ready" || (currentPage === 0 && !prevSlug)}
        aria-label="Page précédente"
      >
        ‹
      </button>

      <div className="book-center">
        {status === "loading" && (
          <div className="book-status">Composition en cours…</div>
        )}
        {status === "error" && (
          <div className="book-status book-status--error">
            <strong>Erreur Paged.js</strong>
            <code>{errorMsg}</code>
          </div>
        )}
        <div ref={pagedRef} />
      </div>

      <button
        className="book-arrow book-arrow--next"
        onClick={next}
        disabled={status !== "ready" || (currentPage >= totalPages - 1 && !nextSlug)}
        aria-label="Page suivante"
      >
        ›
      </button>

    </div>
  );
}
