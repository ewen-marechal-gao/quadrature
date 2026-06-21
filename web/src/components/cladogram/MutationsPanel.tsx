"use client";

/**
 * MutationsPanel — encart superposé (repliable) listant le registre des
 * mutations d'Aeonir. Pastille pleine = placée sur l'arbre, contour = différée.
 * Clic sur une mutation placée = focus du nœud porteur (déplié + recentré).
 */

import type { Mutation } from "@/lib/cladogram";

export interface MutationsPanelProps {
  mutations: Mutation[];
  usedMut: number[];
  focusMut: number | null;
  onPick: (n: number) => void;
  onClose: () => void;
}

export function MutationsPanel({ mutations, usedMut, focusMut, onPick, onClose }: MutationsPanelProps) {
  return (
    <aside className="clado-mutpanel" aria-label="Registre des mutations d'Aeonir">
      <div className="clado-mutpanel-head">
        <span className="clado-mutpanel-title">Mutations d'Aeonir</span>
        <button className="clado-btn clado-iconbtn" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </div>
      <div className="clado-mutpanel-list">
        {mutations.map((m) => {
          const placed = usedMut.includes(m.n);
          return (
            <button
              key={m.n}
              className={`clado-mutrow ${focusMut === m.n ? "is-on" : ""}`}
              disabled={!placed}
              onClick={() => onPick(m.n)}
            >
              <span className={`clado-mutnum ${placed ? "clado-mutnum--placed" : "clado-mutnum--deferred"}`}>
                {m.n}
              </span>
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
