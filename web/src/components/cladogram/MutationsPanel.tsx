"use client";

/**
 * MutationsPanel — encart superposé (repliable) listant le registre des
 * mutations d'Aeonir. Numéro = ordre d'apparition dans l'arbre (calculé au
 * chargement) ; clou plein = placée, contour pointillé = différée (sans numéro).
 * Clic sur une mutation placée = centre le graphe sur sa pastille ; si la
 * mutation est convergente (plusieurs pastilles), les clics successifs cyclent
 * d'une occurrence à l'autre (compteur ×N affiché).
 *
 * Marqué data-interactive pour que le viewport ne démarre pas un pan (et ne
 * capture pas le pointeur) au clic — sinon le `click` ne parviendrait jamais
 * aux boutons.
 */

import type { Mutation } from "@/lib/cladogram";

export interface MutationsPanelProps {
  mutations: Mutation[];
  /** clé de mutation → nombre de pastilles sur l'arbre. */
  counts: Map<string, number>;
  focusMut: string | null;
  onPick: (key: string) => void;
  onClose: () => void;
}

export function MutationsPanel({ mutations, counts, focusMut, onPick, onClose }: MutationsPanelProps) {
  return (
    <aside className="clado-mutpanel" data-interactive aria-label="Registre des mutations d'Aeonir">
      <div className="clado-mutpanel-head">
        <span className="clado-mutpanel-title">Mutations d'Aeonir</span>
        <button className="tool-btn tool-btn--icon" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </div>
      <div className="clado-mutpanel-list">
        {mutations.map((m) => {
          const placed = m.n != null;
          const count = counts.get(m.key) ?? 0;
          const title =
            count > 1 && m.description
              ? `${m.description}\n(${count} occurrences — cliquer pour cycler)`
              : m.description || undefined;
          return (
            <button
              key={m.key}
              className={`clado-mutrow ${focusMut === m.key ? "is-on" : ""}`}
              disabled={!placed}
              onClick={() => onPick(m.key)}
              title={title}
            >
              <span className={`clado-mutnum ${placed ? "clado-mutnum--placed" : "clado-mutnum--deferred"}`}>
                {m.n ?? ""}
              </span>
              <span>{m.label}</span>
              {count > 1 && <span className="clado-mutcount">×{count}</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
