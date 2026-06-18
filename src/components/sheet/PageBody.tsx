"use client";

/**
 * Page 1 — Corps / Portrait / Esprit.
 * Modifs vs prototype : section Protection 🛡️ ajoutée sous la fatigue ; règles de
 * fatigue réduites à la seule ligne Épuisement (la ligne K.O. a été retirée) pour
 * que le contenu tienne dans la card-section.
 */

import { CharacteristicsGroup } from "./blocks/Characteristics";
import { MentalTrack } from "./blocks/MentalTrack";
import { PortraitCard } from "./blocks/PortraitCard";
import {
  FatigueBlock,
  ProtectionBlock,
  ResistanceBlock,
  StabilityBlock,
} from "./blocks/Tracks";
import { SHEET_LABELS } from "./labels";
import { useSheet } from "./SheetContext";

export function PageBody() {
  const { t } = useSheet();
  return (
    <div className="character-sheet-page page-1">
      {/* Colonne gauche — Corps */}
      <div className="left-column">
        <div className="card column-body">
          <h2>{t(SHEET_LABELS.bodyColumn)}</h2>
          <h3>{t(SHEET_LABELS.physicalCondition)}</h3>
          <div className="card-section">
            <ResistanceBlock />
            <FatigueBlock />
            <div className="fatigue-rules-list">
              <div className="fatigue-rule-item rule-orange">{t(SHEET_LABELS.exhaustionRule)}</div>
            </div>
            <ProtectionBlock />
          </div>

          <h3>{t(SHEET_LABELS.charsAndSkills)}</h3>
          <CharacteristicsGroup group="corps" />
        </div>
      </div>

      {/* Colonne centrale — Portrait / identité */}
      <div className="center-column">
        <PortraitCard />
      </div>

      {/* Colonne droite — Esprit */}
      <div className="right-column">
        <div className="card column-mind">
          <h2>{t(SHEET_LABELS.mindColumn)}</h2>
          <h3>{t(SHEET_LABELS.mentalCondition)}</h3>
          <div className="card-section">
            <StabilityBlock />
            <MentalTrack />
          </div>

          <h3>{t(SHEET_LABELS.charsAndSkills)}</h3>
          <CharacteristicsGroup group="esprit" />
        </div>
      </div>
    </div>
  );
}
