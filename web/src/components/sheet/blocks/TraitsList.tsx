"use client";

/**
 * Colonne droite de la page 2 : « Traits & Disciplines » — liste unique.
 * Affiche toujours au moins 6 lignes + une ligne vierge en fin pour ajouter.
 */

import { SHEET_LABELS } from "../labels";
import { useSheet } from "../SheetContext";

const MIN_ROWS = 6;

export function TraitsList() {
  const { c, update, t } = useSheet();
  // une ligne vierge supplémentaire après la dernière entrée, min. 6 lignes
  const rowCount = Math.max(MIN_ROWS, c.traits.length + 1);

  function setField(i: number, field: "name" | "desc", value: string) {
    update((d) => {
      // étend la liste jusqu'à l'index édité (remplit les trous avec des entrées vides)
      while (d.traits.length <= i) d.traits.push({ name: "", desc: "" });
      d.traits[i] = { ...d.traits[i], [field]: value };
    });
  }

  return (
    <div className="card column-mind">
      <h2>{t(SHEET_LABELS.traitsTitle)}</h2>
      <div className="p2-col-headers">
        <span className="w2">{t(SHEET_LABELS.traitColHeader)}</span>
        <span className="w4">{t(SHEET_LABELS.descColHeader)}</span>
      </div>
      <div className="p2-section">
        {Array.from({ length: rowCount }, (_, i) => {
          const entry = c.traits[i] ?? { name: "", desc: "" };
          return (
            <div className="p2-row" key={i}>
              <input
                className="p2-input w2"
                type="text"
                placeholder={t(SHEET_LABELS.itemPlaceholder)}
                value={entry.name}
                onChange={(e) => setField(i, "name", e.target.value)}
              />
              <input
                className="p2-input w4"
                type="text"
                value={entry.desc}
                onChange={(e) => setField(i, "desc", e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
