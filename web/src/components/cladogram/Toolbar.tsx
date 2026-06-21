"use client";

/**
 * Toolbar — barre d'outils du cladogramme : retour, filtres biome/statut,
 * bascule du registre des mutations, contrôles de zoom.
 */

import Link from "next/link";
import type { BiomeLetter, NodeStatus } from "@/lib/cladogram";
import { BIOME_LETTERS, BIOME_NAMES } from "./shared";

export interface ToolbarProps {
  locale: string;
  biomeFilter: ReadonlySet<BiomeLetter>;
  onToggleBiome: (l: BiomeLetter) => void;
  statusFilter: NodeStatus | null;
  onSetStatus: (s: NodeStatus | null) => void;
  showMut: boolean;
  onToggleMut: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function Toolbar({
  locale,
  biomeFilter,
  onToggleBiome,
  statusFilter,
  onSetStatus,
  showMut,
  onToggleMut,
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
}: ToolbarProps) {
  return (
    <header className="clado-bar">
      <Link href={`/${locale}/`} className="clado-back" title="Retour à l'accueil" aria-label="Retour à l'accueil">
        ←
      </Link>
      <span className="clado-title">Évolution — la vie d'Aeonir</span>

      <span className="clado-bar-spacer" />

      <div className="clado-group" role="group" aria-label="Filtre biome">
        <span className="clado-label">Biome</span>
        {BIOME_LETTERS.map((L) => (
          <button
            key={L}
            className={`clado-chip ${biomeFilter.has(L) ? "clado-chip--on" : ""}`}
            onClick={() => onToggleBiome(L)}
            title={BIOME_NAMES[L]}
          >
            {L}
          </button>
        ))}
      </div>

      <div className="clado-group" role="group" aria-label="Filtre statut">
        <button
          className={`clado-chip ${statusFilter === "done" ? "clado-chip--on" : ""}`}
          onClick={() => onSetStatus(statusFilter === "done" ? null : "done")}
        >
          ✓ Peuplé
        </button>
        <button
          className={`clado-chip ${statusFilter === "todo" ? "clado-chip--on" : ""}`}
          onClick={() => onSetStatus(statusFilter === "todo" ? null : "todo")}
        >
          ☐ À venir
        </button>
      </div>

      <div className="clado-group">
        <button
          className={`clado-btn ${showMut ? "clado-chip--on" : ""}`}
          onClick={onToggleMut}
          aria-pressed={showMut}
        >
          Mutations
        </button>
      </div>

      <div className="clado-group" role="group" aria-label="Zoom">
        <button className="clado-btn clado-iconbtn" onClick={onZoomOut} aria-label="Dézoomer">
          −
        </button>
        <span className="clado-zoom-val">{Math.round(zoom * 100)}%</span>
        <button className="clado-btn clado-iconbtn" onClick={onZoomIn} aria-label="Zoomer">
          +
        </button>
        <button className="clado-btn" onClick={onFit}>
          Ajuster
        </button>
      </div>
    </header>
  );
}
