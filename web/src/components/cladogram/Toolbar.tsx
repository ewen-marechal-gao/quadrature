"use client";

/**
 * Toolbar — barre d'outils du cladogramme : filtre biome, bascule du registre
 * des mutations, contrôles de zoom.
 *
 * Elle portait aussi une flèche de retour et le titre « Évolution — la vie
 * d'Aeonir » : les deux doublaient la TopBar juste au-dessus, qui nomme la
 * rubrique et ramène à l'accueil. Une barre d'outils ne dit pas où l'on est.
 */

import type { BiomeLetter } from "@/lib/cladogram";
import {
  ToolBar, ToolButton, ToolChip, ToolGroup, ToolSpacer, ToolValue,
} from "@/components/ToolBar";
import { BIOME_LETTERS, BIOME_NAMES } from "./shared";

export interface ToolbarProps {
  biomeFilter: ReadonlySet<BiomeLetter>;
  onToggleBiome: (l: BiomeLetter) => void;
  showMut: boolean;
  onToggleMut: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function Toolbar({
  biomeFilter,
  onToggleBiome,
  showMut,
  onToggleMut,
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
}: ToolbarProps) {
  return (
    <ToolBar ariaLabel="Outils du cladogramme">
      <ToolGroup label="Biome" ariaLabel="Filtre biome">
        {BIOME_LETTERS.map((L) => (
          <ToolChip
            key={L}
            on={biomeFilter.has(L)}
            onClick={() => onToggleBiome(L)}
            title={BIOME_NAMES[L]}
          >
            {L}
          </ToolChip>
        ))}
      </ToolGroup>

      <ToolGroup>
        <ToolChip on={showMut} onClick={onToggleMut}>
          Mutations
        </ToolChip>
      </ToolGroup>

      <ToolSpacer />

      <ToolGroup label="Zoom" first>
        <ToolButton variant="icon" onClick={onZoomOut} ariaLabel="Dézoomer">
          −
        </ToolButton>
        <ToolValue>{Math.round(zoom * 100)}%</ToolValue>
        <ToolButton variant="icon" onClick={onZoomIn} ariaLabel="Zoomer">
          +
        </ToolButton>
        <ToolButton onClick={onFit}>Ajuster</ToolButton>
      </ToolGroup>
    </ToolBar>
  );
}
