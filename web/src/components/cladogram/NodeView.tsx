"use client";

/**
 * NodeView — rendu d'un nœud positionné du cladogramme.
 *
 * Trois formes :
 *   - feuille      → glyphes de biome + nom (+ ✓/☐, ★) + glose `cd` (2ᵉ ligne) ;
 *   - clade replié → chevron ▸ + nom (ou note) + compteur d'enfants ;
 *   - clade déplié → chevron ▾ + nom, posé au-dessus du point de branche.
 *
 * Le champ `ref` (glose du clade) n'est volontairement PAS affiché ici (les
 * textes longs débordaient sur le nœud voisin) — il reste dans la carte de survol.
 */

import { BIOME_LETTERS } from "./shared";
import type { PositionedNode } from "@/lib/cladogram-layout";

export interface NodeViewProps {
  p: PositionedNode;
  dimmed: boolean;
  onEnter: (id: string, el: HTMLElement) => void;
  onLeave: () => void;
  onToggleCollapse: (id: string) => void;
}

export function NodeView({ p, dimmed, onEnter, onLeave, onToggleCollapse }: NodeViewProps) {
  const n = p.node;
  if (n.id === "root") return null;

  const cls = `clado-node ${dimmed ? "is-dim" : ""}`;
  const hover = {
    onPointerEnter: (e: React.PointerEvent) => onEnter(n.id, e.currentTarget as HTMLElement),
    onPointerLeave: onLeave,
    onFocus: (e: React.FocusEvent) => onEnter(n.id, e.currentTarget as HTMLElement),
    onBlur: onLeave,
  };

  // ── Terminal : feuille (pointes alignées) ou clade replié (à sa profondeur).
  if (p.terminal) {
    const collapsedClade = !n.isLeaf;
    return (
      <button
        type="button"
        data-interactive
        className={`${cls} clado-tip`}
        style={{ left: p.x, top: p.y }}
        onClick={() => (collapsedClade ? onToggleCollapse(n.id) : undefined)}
        {...hover}
      >
        {collapsedClade ? (
          <>
            <span className="clado-chevron">▸</span>
            <span className="clado-tip-body">
              <span className={n.name ? "clado-clade-name" : "clado-tip-cd"}>
                {n.name ?? n.branchNote}
              </span>
            </span>
            <span className="clado-count">{n.children.length}</span>
          </>
        ) : (
          <>
            <span className="clado-glyphs" aria-hidden="true">
              {BIOME_LETTERS.map((L) => {
                const on = (n.biome ?? "").toUpperCase().includes(L);
                return (
                  <span key={L} className={`clado-glyph ${on ? "clado-glyph--on" : "clado-glyph--off"}`}>
                    {L}
                  </span>
                );
              })}
            </span>
            {n.star && <span className="clado-star">★</span>}
            <span className="clado-tip-body">
              <span className="clado-tip-name">
                {n.tip}
                {n.status === "done" && <span className="clado-mark clado-mark--done"> ✓</span>}
                {n.status === "todo" && <span className="clado-mark"> ☐</span>}
              </span>
              {n.cd && <span className="clado-tip-cd">{n.cd}</span>}
            </span>
          </>
        )}
      </button>
    );
  }

  // ── Clade interne déplié : libellé au-dessus du point de branche.
  const isNote = !n.name && !!n.branchNote;
  return (
    <button
      type="button"
      data-interactive
      className={`${cls} clado-clade ${isNote ? "is-note" : ""}`}
      style={{ left: p.x, top: p.y }}
      onClick={() => onToggleCollapse(n.id)}
      title="Replier / déplier"
      {...hover}
    >
      <span className="clado-chevron">▾</span>
      <span className="clado-clade-name">{n.name ?? n.branchNote}</span>
    </button>
  );
}
