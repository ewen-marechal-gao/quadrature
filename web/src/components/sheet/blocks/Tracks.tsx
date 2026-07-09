"use client";

/**
 * Pistes à cases : Résistance (♥), Stabilité (◇), Fatigue (💧) et Protection (🛡️).
 * Reproduit le comportement du prototype : cases actives bornées par la valeur
 * dérivée, jauge de fatigue cumulative, protection en jauge « tap-to-level ».
 */

import {
  FATIGUE_EXHAUSTION,
  FATIGUE_KO,
  PROTECTION_BOXES,
  RESISTANCE_BOXES,
  STABILITY_BOXES,
} from "@/lib/character/constants";
import { resistanceMax, stabilityMax } from "@/lib/character/derive";
import { SHEET_LABELS } from "../labels";
import { useSheet } from "../SheetContext";

/** Résistance ♥ = Vigueur. */
export function ResistanceBlock() {
  const { c, update, t } = useSheet();
  const max = resistanceMax(c); // cases actives (au-delà → grisé/désactivé)
  return (
    <div className="health-block">
      <div className="health-header">
        <span className="health-title">{t(SHEET_LABELS.resistanceTitle)}</span>
        <span className="health-subtext">{t(SHEET_LABELS.resistanceFormula)}</span>
      </div>
      <div className="hearts-container">
        {Array.from({ length: RESISTANCE_BOXES }, (_, i) => {
          const active = i < max;
          return (
            <div key={i} className={`heart-box ${active ? "active" : "inactive"}`}>
              <input
                type="checkbox"
                id={`health-${i + 1}`}
                checked={active && c.resistance[i]}
                disabled={!active}
                // bascule l'état coché de la case i (blessure légère encaissée)
                onChange={() => update((d) => { d.resistance[i] = !d.resistance[i]; })}
              />
              <label htmlFor={`health-${i + 1}`}>
                <span className="box-num">{i + 1}</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Stabilité ◇ = Ténacité + ✫ Discipline. */
export function StabilityBlock() {
  const { c, update, t } = useSheet();
  const max = stabilityMax(c);
  return (
    <div className="stability-block">
      <div className="stability-header">
        <span className="stability-title">{t(SHEET_LABELS.stabilityTitle)}</span>
        <span className="stability-subtext">{t(SHEET_LABELS.stabilityFormula)}</span>
      </div>
      <div className="stability-container">
        {Array.from({ length: STABILITY_BOXES }, (_, i) => {
          const active = i < max;
          return (
            <div key={i} className={`stability-box ${active ? "active" : "inactive"}`}>
              <input
                type="checkbox"
                id={`stability-${i + 1}`}
                checked={active && c.stability[i]}
                disabled={!active}
                onChange={() => update((d) => { d.stability[i] = !d.stability[i]; })}
              />
              <label htmlFor={`stability-${i + 1}`}>
                <span className="box-num">{i + 1}</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Jauge de fatigue 1→20 (sélection unique, remplit 1..N). */
export function FatigueBlock() {
  const { c, update, t } = useSheet();
  const rows = [
    Array.from({ length: 10 }, (_, i) => i + 1),
    Array.from({ length: 10 }, (_, i) => i + 11),
  ];
  return (
    <div className="fatigue-block">
      <div className="fatigue-header">
        <span className="fatigue-title">{t(SHEET_LABELS.fatigueTitle)}</span>
        <span className="fatigue-subtext">{t(SHEET_LABELS.fatigueSubtext)}</span>
      </div>
      <div className="fatigue-grid">
        {rows.map((row, r) => (
          <div className="fatigue-row" key={r}>
            {row.map((n) => {
              const filled = n <= c.fatigue; // jauge : toutes les cases 1..fatigue sont pleines
              const cls = [
                "fatigue-box",
                n === 1 ? "active-start" : "",
                n === FATIGUE_EXHAUSTION ? "alert-threshold" : "",
                n === FATIGUE_KO ? "danger-threshold" : "",
                filled ? "gauge-filled" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div className={cls} key={n}>
                  <input
                    type="radio"
                    name="fatigue"
                    id={`f-${n}`}
                    checked={c.fatigue === n}
                    // sélectionne le niveau de fatigue n
                    onChange={() => update((d) => { d.fatigue = n; })}
                  />
                  <label htmlFor={`f-${n}`}>
                    <span className="box-num">{n}</span>
                  </label>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Protection 🛡️ — jauge « tap-to-level » (cliquer le niveau N le pose ou l'efface). */
export function ProtectionBlock() {
  const { c, update, t } = useSheet();
  return (
    <div className="protection-block">
      <div className="protection-header">
        <span className="protection-title">{t(SHEET_LABELS.protectionTitle)}</span>
        <span className="protection-subtext">{t(SHEET_LABELS.protectionSubtext)}</span>
      </div>
      <div className="protection-container">
        {Array.from({ length: PROTECTION_BOXES }, (_, i) => {
          const filled = i < c.protection;
          return (
            <div key={i} className={`protection-box ${filled ? "filled" : ""}`}>
              <input
                type="checkbox"
                id={`protection-${i + 1}`}
                checked={filled}
                // clic sur le niveau i+1 : l'efface si déjà atteint, sinon le pose
                onChange={() => update((d) => { d.protection = d.protection === i + 1 ? i : i + 1; })}
              />
              <label htmlFor={`protection-${i + 1}`}>🛡️</label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
