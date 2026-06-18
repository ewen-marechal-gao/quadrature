"use client";

/** Barre d'outils (chrome) de la feuille : navigation + actions personnage. */

import Link from "next/link";
import { useRef } from "react";
import { localize, type Locale } from "@/lib/nav";
import { SHEET_LABELS } from "./labels";

const BTN =
  "rounded border border-brass/40 bg-brass/10 px-3 py-1 text-sm text-parchment transition-colors hover:bg-brass/20";
const BTN_PRIMARY =
  "rounded border border-brass/60 bg-brass px-3 py-1 text-sm font-semibold text-on-brass transition-colors hover:bg-brass-bright";

interface Props {
  locale: Locale;
  name: string;
  /** false quand le store est vide → masque les actions liées au perso courant. */
  hasCharacter: boolean;
  onNew: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function SheetToolbar({ locale, name, hasCharacter, onNew, onDuplicate, onExport, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const t = (field: Parameters<typeof localize>[0]) => localize(field, locale);

  return (
    <div className="sheet-chrome sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-brass/30 bg-book-bg/95 px-4 py-2 backdrop-blur">
      <Link href={`/${locale}/`} className={BTN}>
        {t(SHEET_LABELS.home)}
      </Link>
      <span className="font-antiqua text-parchment/90 truncate" title={name || t(SHEET_LABELS.unnamed)}>
        {name || t(SHEET_LABELS.unnamed)}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button type="button" className={BTN_PRIMARY} onClick={onNew}>
          {t(SHEET_LABELS.newCharacter)}
        </button>
        {hasCharacter && (
          <button type="button" className={BTN} onClick={onDuplicate}>
            {t(SHEET_LABELS.duplicate)}
          </button>
        )}
        <button type="button" className={BTN} onClick={() => fileRef.current?.click()}>
          {t(SHEET_LABELS.importJson)}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
            e.target.value = ""; // permet de ré-importer le même fichier
          }}
        />
        {hasCharacter && (
          <button type="button" className={BTN} onClick={onExport}>
            {t(SHEET_LABELS.exportJson)}
          </button>
        )}
        {hasCharacter && (
          <button type="button" className={BTN} onClick={() => window.print()}>
            {t(SHEET_LABELS.print)}
          </button>
        )}
      </div>
    </div>
  );
}
