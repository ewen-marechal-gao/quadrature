"use client";

/** Piste des 7 états mentaux exclusifs (colonne Esprit). */

import { MENTAL_STATES } from "@/lib/character/constants";
import { useSheet } from "../SheetContext";

export function MentalTrack() {
  const { c, update, t } = useSheet();
  return (
    <div className="mental-track">
      {MENTAL_STATES.map((s) => (
        <label className={`mental-v-row ${s.className}`} key={s.id}>
          <input
            type="radio"
            name="mental-state"
            value={s.id}
            checked={c.mentalState === s.id}
            onChange={() => update((d) => { d.mentalState = s.id; })}
          />
          <span className="custom-check-v" />
          <span className="mental-v-name">{t(s.label)}</span>
          <span className="mental-v-rule">{t(s.rule)}</span>
        </label>
      ))}
    </div>
  );
}
