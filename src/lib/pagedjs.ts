/**
 * Utilitaires Paged.js partagés entre BookViewer et BookPreloader.
 *
 * Paged.js expose window.Paged (pas window.PagedJS).
 * On charge le script une seule fois via une balise <script> injectée dans <head>.
 * Turbopack ne peut pas bundler le fichier ESM de Paged.js correctement,
 * donc on utilise cette approche de script tag.
 */

import { NAV_FLAT } from "./nav";

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
 * Calcule le nombre de pages cumulées avant `slug` dans NAV_FLAT.
 * Retourne 0 si slug est la première section ou si les comptes ne sont pas connus.
 */
export function computeOffset(slug: string, pageCounts: Record<string, number>): number {
  let offset = 0;
  for (const item of NAV_FLAT) {
    if (item.slug === slug) break;
    offset += pageCounts[item.slug] ?? 0;
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
