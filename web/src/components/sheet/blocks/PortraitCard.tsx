"use client";

/**
 * Colonne centrale de la page 1 : portrait (upload data URL), nom du personnage
 * et biographie. Le bouton « Imprimer » vit dans la barre d'outils (chrome).
 */

import { useId } from "react";
import { SHEET_LABELS } from "../labels";
import { useSheet } from "../SheetContext";

export function PortraitCard() {
  const { c, update, t } = useSheet();
  const fileId = useId();

  function onPickPortrait(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      // stocke l'image en data URL directement dans le personnage
      if (typeof result === "string") update((d) => { d.portrait = result; });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="portrait-card">
      {c.portrait ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.portrait} alt={t(SHEET_LABELS.portraitAlt)} />
      ) : (
        <div className="portrait-placeholder">{t(SHEET_LABELS.portraitAlt)}</div>
      )}

      <div className="header-fields">
        <div className="header-fields-inputs">
          <div className="header-field-group full-width">
            <label htmlFor={`${fileId}-name`}>{t(SHEET_LABELS.charName)}</label>
            <input
              id={`${fileId}-name`}
              type="text"
              placeholder={t(SHEET_LABELS.namePlaceholder)}
              value={c.name}
              onChange={(e) => update((d) => { d.name = e.target.value; })}
            />
          </div>
        </div>
      </div>

      <div className="bottom-fields">
        <div className="portrait-actions">
          <input id={fileId} type="file" accept="image/*" style={{ display: "none" }} onChange={onPickPortrait} />
          <label htmlFor={fileId}>{t(SHEET_LABELS.changePortrait)}</label>
          {c.portrait && (
            <button type="button" onClick={() => update((d) => { d.portrait = undefined; })}>
              {t(SHEET_LABELS.removePortrait)}
            </button>
          )}
        </div>

        <div className="bio-field-group">
          <label htmlFor={`${fileId}-bio`}>{t(SHEET_LABELS.biography)}</label>
          <textarea
            id={`${fileId}-bio`}
            placeholder={t(SHEET_LABELS.bioPlaceholder)}
            value={c.bio}
            onChange={(e) => update((d) => { d.bio = e.target.value; })}
          />
        </div>
      </div>
    </div>
  );
}
