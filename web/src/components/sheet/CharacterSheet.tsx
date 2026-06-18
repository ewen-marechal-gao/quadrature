"use client";

/**
 * CharacterSheet — composant client racine de la feuille de personnage.
 *
 * Orchestre le store multi-personnages (useCharacter), fournit le contexte aux
 * pages et assemble le chrome (barre d'outils + menu). Rend un squelette tant que
 * l'hydratation localStorage n'est pas faite (1er rendu identique au SSR → pas de
 * mismatch), et un état vide si plus aucun personnage n'existe.
 *
 * UX écran : les 2 pages A4 sont EMPILÉES (l'active devant, l'autre dépasse en
 * bas-droite) et mises à l'échelle pour tenir dans l'espace dispo sans scroll ;
 * un clic sur la page arrière (ou un onglet) bascule l'affichage. À l'impression,
 * cette mise en scène est neutralisée (cf. sheet.css) → les 2 pages sortent en A4.
 *
 * Importe sheet.css ici (et non dans globals.css) pour que les règles @page /
 * @media print restent cantonnées à la route /personnage.
 */

import "@/app/sheet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCharacter } from "@/lib/character/useCharacter";
import { localize, type Locale, type LocalizedString } from "@/lib/nav";
import { CharacterMenu } from "./CharacterMenu";
import { SHEET_LABELS } from "./labels";
import { PageBody } from "./PageBody";
import { PageInventory } from "./PageInventory";
import { SheetProvider } from "./SheetContext";
import { SheetToolbar } from "./SheetToolbar";

/** Marge (px) entre la page arrière qui dépasse et la page avant. */
const PEEK = 36;
/** Marge de respiration (px) autour de la pile dans le stage. */
const STAGE_PAD = 24;

export function CharacterSheet({ locale }: { locale: Locale }) {
  const {
    ready,
    characters,
    current,
    update,
    selectCharacter,
    createCharacter,
    duplicateCurrent,
    deleteCharacter,
    exportCurrent,
    importFile,
  } = useCharacter();

  const t = useCallback((field: LocalizedString) => localize(field, locale), [locale]);

  // Page affichée au premier plan (1 = corps, 2 = inventaire).
  const [activePage, setActivePage] = useState<1 | 2>(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Calcule l'échelle pour faire tenir la pile (page + dépassement) dans le stage,
  // sans scroll. Recalculé au redimensionnement (ResizeObserver + resize fenêtre).
  useEffect(() => {
    const stage = stageRef.current;
    const page = pageRef.current;
    if (!stage || !page) return;
    const compute = () => {
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      const pw = page.offsetWidth; // taille naturelle (non affectée par le scale ancêtre)
      const ph = page.offsetHeight;
      if (!sw || !sh || !pw || !ph) return;
      const s = Math.min((sw - STAGE_PAD) / (pw + PEEK), (sh - STAGE_PAD) / (ph + PEEK));
      setScale(Math.max(0.2, Math.min(2, s)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(stage);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [ready, current?.id]);

  if (!ready) {
    return (
      <div className="sheet-tool flex min-h-screen items-center justify-center">
        <p className="font-antiqua text-parchment/70">{t(SHEET_LABELS.loading)}</p>
      </div>
    );
  }

  return (
    <div className="sheet-tool flex min-h-screen flex-col">
      <SheetToolbar
        locale={locale}
        name={current?.name ?? ""}
        hasCharacter={!!current}
        onNew={createCharacter}
        onDuplicate={duplicateCurrent}
        onExport={exportCurrent}
        onImport={(file) => void importFile(file)}
      />

      <div className="sheet-body flex flex-1 overflow-hidden">
        <div className="sheet-viewport flex-1 overflow-hidden">
          {current ? (
            <div className="sheet-root">
              <SheetProvider value={{ c: current, update, locale, t }}>
                <div className="sheet-stage" ref={stageRef}>
                  <div className="sheet-page-tabs sheet-chrome">
                    {([1, 2] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`sheet-page-tab ${activePage === n ? "active" : ""}`}
                        aria-label={`Page ${n}`}
                        onClick={() => setActivePage(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  <div className="sheet-stack" style={{ "--sheet-scale": scale } as React.CSSProperties}>
                    <div
                      ref={pageRef}
                      className={`sheet-page-holder ${activePage === 1 ? "is-front" : "is-back"}`}
                      onClick={activePage === 1 ? undefined : () => setActivePage(1)}
                    >
                      <PageBody />
                    </div>
                    <div
                      className={`sheet-page-holder ${activePage === 2 ? "is-front" : "is-back"}`}
                      onClick={activePage === 2 ? undefined : () => setActivePage(2)}
                    >
                      <PageInventory />
                    </div>
                  </div>
                </div>
              </SheetProvider>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="font-antiqua text-lg text-parchment/85">{t(SHEET_LABELS.emptyTitle)}</p>
              <p className="text-sm text-parchment/60">{t(SHEET_LABELS.emptyHint)}</p>
            </div>
          )}
        </div>

        <CharacterMenu
          locale={locale}
          characters={characters}
          currentId={current?.id ?? null}
          onSelect={selectCharacter}
          onDelete={deleteCharacter}
        />
      </div>
    </div>
  );
}
