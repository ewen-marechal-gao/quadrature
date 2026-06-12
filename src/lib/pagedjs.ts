/**
 * Utilitaires Paged.js partagés entre BookViewer et BookPreloader.
 *
 * Paged.js expose window.Paged (pas window.PagedJS).
 * On charge le script une seule fois via une balise <script> injectée dans <head>.
 * Turbopack ne peut pas bundler le fichier ESM de Paged.js correctement,
 * donc on utilise cette approche de script tag.
 */

import { BOOKS, getBookForSlug } from "./nav";

// ─── window.Paged — types ────────────────────────────────────────────────────

interface PagedPolisherCtx {
  styleEl: HTMLStyleElement;
  styleSheet: CSSStyleSheet | null;
}

/** Interface minimale pour une instance window.Paged.Previewer. */
export interface PagedPreviewer {
  preview(
    html: string,
    stylesheets: string[],
    container: HTMLElement,
  ): Promise<{ total: number }>;
  polisher: {
    setup: (this: PagedPolisherCtx) => CSSStyleSheet | null;
  };
}

declare global {
  interface Window {
    Paged?: { Previewer: new () => PagedPreviewer };
  }
}

/**
 * Retourne le constructeur `window.Paged.Previewer` après chargement du script.
 * À appeler uniquement après `await loadPagedScript()`.
 * Retourne null si Paged.js n'est pas encore disponible.
 */
export function getPagedPreviewer(): (new () => PagedPreviewer) | null {
  return window.Paged?.Previewer ?? null;
}

const PAGED_SCRIPT_SRC = "/pagedjs/paged.js";

let state: "idle" | "loading" | "ready" = "idle";
let promise: Promise<void> | null = null;

export function loadPagedScript(): Promise<void> {
  if (state === "ready") return Promise.resolve();
  if (state === "loading") return promise!;

  state = "loading";
  promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PAGED_SCRIPT_SRC;
    script.onload = () => {
      state = "ready";
      resolve();
    };
    script.onerror = () =>
      reject(new Error(`Impossible de charger ${PAGED_SCRIPT_SRC}`));
    document.head.appendChild(script);
  });
  return promise;
}

// ─── Numérotation globale ─────────────────────────────────────────────────────

/**
 * Calcule le nombre de pages cumulées avant `slug` dans son livre.
 * Retourne 0 si slug est la première section du livre ou si les comptes
 * ne sont pas connus.
 */
export function computeOffset(slug: string, pageCounts: Record<string, number>): number {
  const book = getBookForSlug(slug);
  if (!book) return 0;
  let offset = 0;
  for (const section of book.sections) {
    if (section.slug === slug) break;
    offset += pageCounts[section.slug] ?? 0;
  }
  return offset;
}

/**
 * Corrige la numérotation globale après un rendu Paged.js.
 *
 * Paged.js réinitialise le compteur `page` à 1 pour chaque section rendue ;
 * `counter-reset` via CSS est ignoré (Paged.js le surcharge en interne).
 * On post-traite directement le DOM : on trouve chaque `.pagedjs_margin-bottom-center
 * .pagedjs_margin-content` et on y écrit le numéro global = offset + index + 1.
 *
 * @param container  Élément racine du rendu (staging ou pagedjs_pages)
 * @param offset     Nombre de pages avant cette section dans le livre global
 */
export function applyGlobalPageNumbers(container: Element, offset: number): void {
  const pages = container.querySelectorAll(".pagedjs_page");
  pages.forEach((page, index) => {
    const content = page.querySelector(
      ".pagedjs_margin-bottom-center .pagedjs_margin-content"
    );
    if (content) {
      content.textContent = String(offset + index + 1);
    }
  });
}

/**
 * Injecte les numéros de page globaux dans les liens de cross-référence.
 *
 * Remplace le mécanisme CSS `target-counter` — qui ne fonctionne que pour
 * des références #id dans un rendu Paged.js unifié — par des <span> injectés
 * directement dans le DOM.
 *
 * Pour chaque <a href="/rules/..."> dans container, ajoute ou met à jour un
 * <span class="cross-ref-page"> avec le numéro de la première page de la
 * section cible (calculé depuis allCounts + BOOKS).
 *
 * Idempotent : peut être appelé plusieurs fois (le span existant est retiré
 * avant d'en insérer un nouveau).
 *
 * @param container  Élément racine du rendu (pagesArea d'une section)
 * @param allCounts  Record<slug, nombre de pages> pour les sections du livre courant
 */
export function applyPageRefs(
  container: Element,
  allCounts: Record<string, number>,
): void {
  // Précalculer les offsets cumulatifs section par section, livre par livre.
  // Les sections absentes de allCounts contribuent 0 à l'offset (autre livre).
  const offsets: Record<string, number> = {};
  for (const book of BOOKS) {
    let offset = 0;
    for (const section of book.sections) {
      offsets[section.slug] = offset;
      offset += allCounts[section.slug] ?? 0;
    }
  }

  // Patcher chaque lien interne
  const links = container.querySelectorAll("a[href^=\"/rules/\"]");
  links.forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    // /rules/core/etats  →  core/etats
    const slug = href.replace(/^\/rules\//, "").replace(/\/+$/, "");

    const pageOffset = offsets[slug];
    if (pageOffset === undefined || !(allCounts[slug] > 0)) return;

    // Idempotent : supprimer l'ancien span si présent
    link.querySelector(".cross-ref-page")?.remove();

    const span = document.createElement("span");
    span.className = "cross-ref-page";
    span.textContent = ` (p. ${pageOffset + 1})`;
    link.appendChild(span);
  });
}
