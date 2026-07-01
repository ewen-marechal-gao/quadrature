"use client";

/**
 * HoverCard — carte de détail au survol d'un nœud, rendue en espace écran
 * (position fixe, non zoomée) avec anti-débordement.
 *
 * En-tête : titre + glose (ref/cd) + biome + statut du nœud survolé.
 * Chemin : l'ascendance, du **parent direct (en haut)** vers l'**origine de
 * l'arbre (en bas)** — on remonte ainsi la lignée, avec la mutation acquise à
 * chaque étape le cas échéant. Le nœud survolé lui-même n'y figure pas.
 */

import { useLayoutEffect, useRef, useState } from "react";
import type { BiomeLetter, CladoNode, CladogramData } from "@/lib/cladogram";
import { ancestryOf } from "@/lib/cladogram-layout";
import { type Anchor, BIOME_NAMES, placeCard, STATUS_LABEL } from "./shared";

export interface HoverCardProps {
  node: CladoNode;
  data: CladogramData;
  anchor: Anchor;
}

export function HoverCard({ node, data, anchor }: HoverCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos(placeCard(anchor, { w: width, h: height }));
  }, [anchor, node]);

  const isTip = node.isLeaf;
  const title = node.name ?? node.tip ?? node.branchNote ?? "—";
  const sub = node.ref ?? node.cd;
  const biomes = (node.biome ?? "")
    .toUpperCase()
    .split("")
    .filter((c): c is BiomeLetter => c in BIOME_NAMES)
    .map((c) => BIOME_NAMES[c]);

  // Lignée parent direct → origine (haut en bas) ; nœud courant et racine exclus.
  const lineage = ancestryOf(data, node.id)
    .slice(1)
    .map((id) => data.nodeIndex[id])
    .filter((n) => n && n.id !== "root");

  return (
    <div
      ref={ref}
      className="clado-hovercard"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      role="tooltip"
    >
      <div className={`clado-hc-title ${isTip ? "is-tip" : ""}`}>{title}</div>
      {sub && <div className="clado-hc-sub">{sub}</div>}
      {biomes.length > 0 && (
        <div className="clado-hc-row">
          <b>Biome :</b> {biomes.join(" · ")}
        </div>
      )}
      {node.status && (
        <div className="clado-hc-row">
          <b>Statut :</b> {STATUS_LABEL[node.status]}
        </div>
      )}

      {lineage.length > 0 && (
        <ol className="clado-hc-path">
          {lineage.map((n) => {
            const m = n.mut ? data.mutationByKey[n.mut] : null;
            return (
              <li key={n.id} className="clado-hc-step">
                <span className="clado-hc-step-name">
                  {n.name ?? n.branchNote ?? n.tip}
                </span>
                {m && (
                  <span className="clado-hc-step-mut">
                    <span className="clado-hc-dot">{m.n}</span>
                    {m.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
