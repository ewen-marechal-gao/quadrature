"use client";

/** Menu latéral droit (chrome) : liste des personnages, sélection, suppression. */

import { localize, type Locale } from "@/lib/nav";
import type { Character } from "@/lib/character/types";
import { SHEET_LABELS } from "./labels";

interface Props {
  locale: Locale;
  characters: Character[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function CharacterMenu({ locale, characters, currentId, onSelect, onDelete }: Props) {
  const t = (field: Parameters<typeof localize>[0]) => localize(field, locale);
  const unnamed = t(SHEET_LABELS.unnamed);

  return (
    <aside className="sheet-chrome flex w-56 shrink-0 flex-col gap-3 border-l border-brass/30 bg-book-bg/95 p-3">
      <h2 className="font-antiqua text-sm uppercase tracking-wider text-parchment/80">
        {t(SHEET_LABELS.charactersHeading)}
      </h2>

      <ul className="flex flex-col gap-1">
        {characters.map((ch) => {
          const active = ch.id === currentId;
          return (
            <li key={ch.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(ch.id)}
                className={`flex-1 truncate rounded px-2 py-1 text-left text-sm transition-colors ${
                  active ? "bg-brass text-on-brass" : "text-parchment/85 hover:bg-brass/15"
                }`}
                title={ch.name || unnamed}
              >
                {ch.name || unnamed}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t(SHEET_LABELS.confirmDelete))) onDelete(ch.id);
                }}
                aria-label={t(SHEET_LABELS.deleteCharacter)}
                className="rounded px-2 py-1 text-sm text-parchment/50 transition-colors hover:bg-red-900/40 hover:text-parchment"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
