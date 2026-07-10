"use client";

/**
 * NodeView — rendu d'un nœud positionné du cladogramme.
 *
 * Trois formes :
 *   - feuille      → glyphes de biome + nom (+ ★) + glose `cd` (2ᵉ ligne) ;
 *   - clade replié → chevron ▸ + nom (ou note) + compteur d'enfants ;
 *   - clade déplié → chevron ▾ + nom, posé au-dessus du point de branche.
 *
 * Une feuille dont `href` est défini possède une fiche d'adversaire : elle est
 * rendue en <a> (le bouton d'une feuille n'a de toute façon aucun onClick), ce qui
 * remplace l'ancien marqueur « ✓ peuplé » par un lien vers la fiche.
 *
 * Le champ `ref` (glose du clade) n'est volontairement PAS affiché ici (les
 * textes longs débordaient sur le nœud voisin) — il reste dans la carte de survol.
 */

import { BIOME_LETTERS, lettersOf } from "./shared";
import type { PositionedNode } from "@/lib/cladogram-layout";

export interface NodeViewProps {
  p: PositionedNode;
  dimmed: boolean;
  /** Lien vers la fiche d'adversaire de cette feuille, si elle en a une. */
  href?: string;
  onEnter: (id: string, el: HTMLElement) => void;
  onLeave: () => void;
  onToggleCollapse: (id: string) => void;
}

export function NodeView({ p, dimmed, href, onEnter, onLeave, onToggleCollapse }: NodeViewProps) {
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

    if (collapsedClade) {
      return (
        <button
          type="button"
          data-interactive
          className={`${cls} clado-tip`}
          style={{ left: p.x, top: p.y }}
          onClick={() => onToggleCollapse(n.id)}
          {...hover}
        >
          <span className="clado-chevron">▸</span>
          <span className="clado-tip-body">
            <span className={n.name ? "clado-clade-name" : "clado-tip-cd"}>
              {n.name ?? n.branchNote}
            </span>
          </span>
          <span className="clado-count">{n.children.length}</span>
        </button>
      );
    }

    const lit = lettersOf(n.biomes); // biomes DÉRIVÉS (graine + transitions de l'ascendance)
    const leafBody = (
      <>
        <span className="clado-glyphs" aria-hidden="true">
          {BIOME_LETTERS.map((L) => {
            const on = lit.has(L);
            return (
              <span key={L} className={`clado-glyph ${on ? "clado-glyph--on" : "clado-glyph--off"}`}>
                {L}
              </span>
            );
          })}
        </span>
        {n.star && <span className="clado-star">★</span>}
        <span className="clado-tip-body">
          <span className="clado-tip-name">{n.tip}</span>
          {n.cd && <span className="clado-tip-cd">{n.cd}</span>}
        </span>
      </>
    );

    // Feuille avec fiche d'adversaire → lien ; sinon bouton inerte (survol seul).
    return href ? (
      <a
        data-interactive
        className={`${cls} clado-tip clado-tip--linked`}
        style={{ left: p.x, top: p.y }}
        href={href}
        title={`Voir la fiche : ${n.tip}`}
        {...hover}
      >
        {leafBody}
      </a>
    ) : (
      <button
        type="button"
        data-interactive
        className={`${cls} clado-tip`}
        style={{ left: p.x, top: p.y }}
        {...hover}
      >
        {leafBody}
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
