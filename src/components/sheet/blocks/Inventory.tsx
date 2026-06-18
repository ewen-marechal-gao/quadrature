"use client";

/**
 * Page 2 — Inventaire : 12 grands emplacements (6 zones corporelles) avec
 * sélecteur de type + jauge de poches, puis emplacements rapides 🔸 et petits ▫️.
 */

import {
  INVENTORY_ZONES,
  QUICK_SLOTS,
  SLOT_PIP_CAPACITY,
  SLOT_TYPES,
  SMALL_SLOTS,
} from "@/lib/character/constants";
import {
  chargeMax,
  quickCapacity,
  quickUsed,
  smallCapacity,
  smallUsed,
  usedSlots,
} from "@/lib/character/derive";
import { clickSlotPip, setSlotType } from "@/lib/character/mutators";
import type { SlotId, SlotType } from "@/lib/character/types";
import { SHEET_LABELS } from "../labels";
import { useSheet } from "../SheetContext";

function SlotRow({ slotId }: { slotId: SlotId }) {
  const { c, update, t } = useSheet();
  const slot = c.inventory.slots[slotId];
  const capacity = SLOT_PIP_CAPACITY[slot.type] ?? 0; // 0 = pas de jauge (type non contenant)
  const pipIcon = slot.type === "pocket" ? "🔸" : "▫️";

  return (
    <div className="inv-slot-row">
      <select
        className="inv-type-select"
        title={t(SHEET_LABELS.slotTypeTitle)}
        value={slot.type}
        onChange={(e) => update((d) => setSlotType(d, slotId, e.target.value as SlotType))}
      >
        {[...SLOT_TYPES].map(([value, def]) => (
          <option key={value || "none"} value={value}>
            {def.icon}
          </option>
        ))}
      </select>
      <span className="inv-slot-print-icon">🔳</span>
      <input
        className="inv-item-input"
        type="text"
        placeholder={t(SHEET_LABELS.itemPlaceholder)}
        value={slot.item?.itemText ?? ""}
        // texte vide → item null (emplacement vide), sinon { itemText }
        onChange={(e) =>
          update((d) => {
            const text = e.target.value;
            d.inventory.slots[slotId].item = text ? { itemText: text } : null;
          })
        }
      />
      {capacity > 0 && (
        <div className="inv-pocket-count" style={{ display: "flex" }}>
          {Array.from({ length: capacity }, (_, p) => (
            <button
              key={p}
              type="button"
              className={`inv-pip ${p < slot.pips ? "active" : ""}`}
              onClick={() => update((d) => clickSlotPip(d, slotId, p))}
            >
              {pipIcon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function InventoryColumn() {
  const { c, update, t } = useSheet();
  return (
    <div className="card column-body">
      <h2>{t(SHEET_LABELS.inventoryTitle)}</h2>

      <h3 className="inv-section-header">
        {t(SHEET_LABELS.largeSlots)}
        <span className="inv-charge">
          {/* charge utilisée / charge max dérivée (2 + Force + Robustesse) */}
          <span className="inv-charge-value">{usedSlots(c)}</span>
          &thinsp;/&thinsp;
          <span className="inv-charge-value">{chargeMax(c)}</span>
        </span>
        <span className="inv-charge-print">{t(SHEET_LABELS.chargeFormula)}</span>
      </h3>

      {[...INVENTORY_ZONES.values()].map((zone) => (
        <div className="inv-zone" key={zone.slots[0]}>
          <div className="inv-zone-label">{t(zone.label)}</div>
          <div className="inv-slots">
            {zone.slots.map((slotId) => (
              <SlotRow key={slotId} slotId={slotId} />
            ))}
          </div>
        </div>
      ))}

      <h3 className="inv-section-header">
        {t(SHEET_LABELS.quickSlots)}{" "}
        <span className="inv-charge">
          {/* poches remplies / capacité offerte par les contenants 🔸 */}
          <span>{quickUsed(c)}</span>&thinsp;/&thinsp;<span>{quickCapacity(c)}</span>
        </span>
      </h3>
      <div className="inv-quick-section">
        {Array.from({ length: QUICK_SLOTS }, (_, i) => (
          <div className="inv-quick-row" key={i}>
            <span className="inv-quick-icon">🔸</span>
            <input
              className="inv-quick-input"
              type="text"
              placeholder={t(SHEET_LABELS.itemPlaceholder)}
              value={c.inventory.quick[i]}
              onChange={(e) => update((d) => { d.inventory.quick[i] = e.target.value; })}
            />
          </div>
        ))}
      </div>

      <div className="inv-small-section">
        <h3 className="inv-section-header">
          {t(SHEET_LABELS.smallSlots)}{" "}
          <span className="inv-charge">
            <span>{smallUsed(c)}</span>&thinsp;/&thinsp;<span>{smallCapacity(c)}</span>
          </span>
        </h3>
        {Array.from({ length: SMALL_SLOTS }, (_, i) => (
          <div className="inv-quick-row" key={i}>
            <span className="inv-quick-icon">▫️</span>
            <input
              className="inv-quick-input"
              type="text"
              placeholder={t(SHEET_LABELS.itemPlaceholder)}
              value={c.inventory.small[i]}
              onChange={(e) => update((d) => { d.inventory.small[i] = e.target.value; })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
