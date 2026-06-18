"use client";

/** Page 2 — Inventaire / Description / Traits & Disciplines. */

import { InventoryColumn } from "./blocks/Inventory";
import { TraitsList } from "./blocks/TraitsList";
import { SHEET_LABELS } from "./labels";
import { useSheet } from "./SheetContext";

export function PageInventory() {
  const { c, update, t } = useSheet();
  return (
    <div className="character-sheet-page page-2">
      {/* Colonne gauche — Inventaire */}
      <div className="left-column">
        <InventoryColumn />
      </div>

      {/* Colonne centrale — Description / Historique / Notes */}
      <div className="center-column">
        <div className="card p2-center-card">
          <h2>{t(SHEET_LABELS.description)}</h2>
          <textarea
            className="p2-textarea"
            style={{ flex: 1.2 }}
            placeholder={t(SHEET_LABELS.descPlaceholder)}
            value={c.page2.description}
            onChange={(e) => update((d) => { d.page2.description = e.target.value; })}
          />
          <h2 style={{ marginTop: 6 }}>{t(SHEET_LABELS.history)}</h2>
          <textarea
            className="p2-textarea"
            style={{ flex: 2 }}
            placeholder={t(SHEET_LABELS.historyPlaceholder)}
            value={c.page2.background}
            onChange={(e) => update((d) => { d.page2.background = e.target.value; })}
          />
          <h2 style={{ marginTop: 6 }}>{t(SHEET_LABELS.notes)}</h2>
          <textarea
            className="p2-textarea"
            style={{ flex: 1 }}
            placeholder={t(SHEET_LABELS.notesPlaceholder)}
            value={c.page2.notes}
            onChange={(e) => update((d) => { d.page2.notes = e.target.value; })}
          />
        </div>
      </div>

      {/* Colonne droite — Traits & Disciplines */}
      <div className="right-column">
        <TraitsList />
      </div>
    </div>
  );
}
