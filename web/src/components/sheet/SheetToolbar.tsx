"use client";

/**
 * Barre d'outils de la feuille : les actions sur le personnage courant.
 *
 * Elle portait aussi un bouton « Accueil » et le nom du personnage : les deux
 * doublaient la TopBar juste au-dessus, qui ramène à l'accueil et affiche le nom
 * en section. Une barre d'outils ne dit pas où l'on est.
 *
 * Elle utilisait par ailleurs ses propres classes Tailwind là où les autres
 * rubriques avaient chacune les leurs ; tout passe par les primitives communes
 * (components/ToolBar.tsx).
 */

import { useRef } from "react";
import { localize, type Locale } from "@/lib/nav";
import { ToolBar, ToolButton, ToolGroup, ToolSpacer } from "@/components/ToolBar";
import { SHEET_LABELS } from "./labels";

interface Props {
  locale: Locale;
  /** false quand le store est vide → masque les actions liées au perso courant. */
  hasCharacter: boolean;
  onNew: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function SheetToolbar({
  locale, hasCharacter, onNew, onDuplicate, onExport, onImport,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const t = (field: Parameters<typeof localize>[0]) => localize(field, locale);

  return (
    /* `sheet-chrome` reste posé : c'est la classe que sheet.css masque à
       l'impression, avec les onglets de page. */
    <div className="sheet-chrome">
      <ToolBar ariaLabel="Actions du personnage">
        <ToolGroup>
          <ToolButton variant="primary" onClick={onNew}>
            {t(SHEET_LABELS.newCharacter)}
          </ToolButton>
          {hasCharacter && (
            <ToolButton onClick={onDuplicate}>{t(SHEET_LABELS.duplicate)}</ToolButton>
          )}
        </ToolGroup>

        <ToolSpacer />

        <ToolGroup first>
          <ToolButton onClick={() => fileRef.current?.click()}>
            {t(SHEET_LABELS.importJson)}
          </ToolButton>
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
            <ToolButton onClick={onExport}>{t(SHEET_LABELS.exportJson)}</ToolButton>
          )}
          {hasCharacter && (
            <ToolButton onClick={() => window.print()}>{t(SHEET_LABELS.print)}</ToolButton>
          )}
        </ToolGroup>
      </ToolBar>
    </div>
  );
}
