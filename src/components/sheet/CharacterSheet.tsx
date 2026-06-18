"use client";

/**
 * CharacterSheet — composant client racine de la feuille de personnage.
 *
 * Orchestre le store multi-personnages (useCharacter), fournit le contexte aux
 * pages et assemble le chrome (barre d'outils + menu). Rend un squelette tant que
 * l'hydratation localStorage n'est pas faite (1er rendu identique au SSR → pas de
 * mismatch), et un état vide si plus aucun personnage n'existe.
 *
 * Importe sheet.css ici (et non dans globals.css) pour que les règles @page /
 * @media print restent cantonnées à la route /personnage.
 */

import "@/app/sheet.css";
import { useCallback } from "react";
import { useCharacter } from "@/lib/character/useCharacter";
import { localize, type Locale, type LocalizedString } from "@/lib/nav";
import { CharacterMenu } from "./CharacterMenu";
import { SHEET_LABELS } from "./labels";
import { PageBody } from "./PageBody";
import { PageInventory } from "./PageInventory";
import { SheetProvider } from "./SheetContext";
import { SheetToolbar } from "./SheetToolbar";

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

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {current ? (
            <div className="sheet-root">
              <SheetProvider value={{ c: current, update, locale, t }}>
                <PageBody />
                <PageInventory />
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
