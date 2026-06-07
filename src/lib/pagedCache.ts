/**
 * Cache des rendus Paged.js entre les navigations.
 *
 * Les éléments DOM (.pagedjs_pages) sont conservés dans un vault off-screen
 * au lieu d'être détruits. Quand on revisite une section, l'élément est
 * simplement déplacé du vault vers le container visible — navigation instantanée.
 *
 * Cycle de vie d'un pagesArea :
 *   staging (render initial) → visible (affiché) → vault (section quittée) → visible (revisitée)
 */

export interface CachedRender {
  pagesArea: HTMLElement;
  total: number;
  pageWidth: number;
  pageHeight: number;
}

/** slug → CachedRender */
export const renderCache = new Map<string, CachedRender>();

let _vault: HTMLElement | null = null;

/** Conteneur off-screen persistant où dorment les pages des sections non affichées. */
export function getVault(): HTMLElement {
  if (!_vault) {
    _vault = document.createElement("div");
    _vault.id = "__paged-vault";
    _vault.style.cssText =
      "position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0";
    document.body.appendChild(_vault);
  }
  return _vault;
}
