"use client";

/**
 * CladogramView — exploration interactive du cladogramme de la faune d'Aeonir.
 *
 * Orchestrateur : détient l'état (repli, filtres, survol, focus), calcule le
 * layout (cladogram-layout.ts, pur, recalculé au repli) et assemble les
 * sous-composants (Toolbar, NodeView, MutationBadge, HoverCard, MutationsPanel,
 * Legend). La navigation pan/zoom est déléguée au hook usePanZoom.
 *
 * Forme : dendrogramme horizontal à pointes alignées. Les nœuds sont du DOM
 * HTML (accessibles, stylables) ; les connecteurs en équerre une couche SVG.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@/app/cladogram.css";
import type { BiomeLetter, CladoNode, CladogramData } from "@/lib/cladogram";
import { ancestryOf, computeLayout } from "@/lib/cladogram-layout";
import { type Anchor, lettersOf } from "./shared";
import { usePanZoom, type StageSize } from "./usePanZoom";
import { Toolbar } from "./Toolbar";
import { NodeView } from "./NodeView";
import { MutationBadge } from "./MutationBadge";
import { HoverCard } from "./HoverCard";
import { MutationsPanel } from "./MutationsPanel";
import { Legend } from "./Legend";

export function CladogramView({
  data,
  locale,
  adversaryByUid,
}: {
  data: CladogramData;
  locale: string;
  /** uid du nœud → id de la fiche d'adversaire qui en dérive. */
  adversaryByUid: Record<string, string>;
}) {
  // ── État ──────────────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [hovered, setHovered] = useState<{ id: string; anchor: Anchor } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [biomeFilter, setBiomeFilter] = useState<ReadonlySet<BiomeLetter>>(() => new Set());
  const [showMut, setShowMut] = useState(false);
  const [focusMut, setFocusMut] = useState<string | null>(null);

  // ── Layout (recalculé au repli) + taille pour le pan/zoom ───────────────────
  const layout = useMemo(() => computeLayout(data, collapsed), [data, collapsed]);
  const sizeRef = useRef<StageSize>({ width: layout.width, height: layout.height });
  sizeRef.current = { width: layout.width, height: layout.height };
  const { view, viewportRef, panning, fit, zoomBy, centerOn, handlers } = usePanZoom(sizeRef);

  // ── Surlignage d'ascendance (survol ou focus mutation) ──────────────────────
  const highlightId = hovered?.id ?? focusId;
  const litIds = useMemo(
    () => (highlightId ? new Set(ancestryOf(data, highlightId)) : null),
    [data, highlightId]
  );

  // ── Filtres → ensemble actif (null = aucun filtre) ──────────────────────────
  const activeIds = useMemo(() => {
    if (biomeFilter.size === 0) return null;
    const set = new Set<string>();
    const rec = (n: CladoNode): boolean => {
      if (n.isLeaf || n.children.length === 0) {
        const letters = lettersOf(n.biomes);
        const active = [...biomeFilter].some((L) => letters.has(L));
        if (active) set.add(n.id);
        return active;
      }
      let any = false;
      for (const c of n.children) any = rec(c) || any;
      if (any) set.add(n.id);
      return any;
    };
    data.root.children.forEach(rec);
    return set;
  }, [data, biomeFilter]);

  // clé de mutation → ids de TOUS les nœuds porteurs (ordre pré-fixe) ; counts dérivé.
  const mutToIds = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const node of Object.values(data.nodeIndex)) {
      if (typeof node.mut === "string") {
        const arr = m.get(node.mut) ?? [];
        arr.push(node.id);
        m.set(node.mut, arr);
      }
    }
    return m;
  }, [data]);
  const mutCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const [key, ids] of mutToIds) m.set(key, ids.length);
    return m;
  }, [mutToIds]);
  /** Index de cyclage par clé de mutation (pastilles convergentes). */
  const mutCycle = useRef<{ key: string; i: number }>({ key: "", i: 0 });

  // ── Actions ──────────────────────────────────────────────────────────────────
  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const revealAndFocus = useCallback(
    (id: string) => {
      const chain = ancestryOf(data, id);
      setCollapsed((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const a of chain) if (next.delete(a)) changed = true;
        return changed ? next : prev;
      });
      setFocusId(id);
    },
    [data]
  );

  // Recentre sur la PASTILLE (milieu d'arête) du nœud focalisé, après layout.
  useEffect(() => {
    if (!focusId) return;
    const p = layout.nodes.find((n) => n.node.id === focusId);
    if (!p) return;
    const bx = p.parentX !== undefined ? (p.parentX + p.x) / 2 : p.x;
    centerOn(bx, p.y);
  }, [focusId, layout, centerOn]);

  const onEnter = useCallback((id: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setHovered({ id, anchor: { top: r.top, right: r.right, left: r.left, bottom: r.bottom } });
  }, []);
  const onLeave = useCallback(() => setHovered(null), []);

  const toggleBiome = (L: BiomeLetter) =>
    setBiomeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(L)) next.delete(L);
      else next.add(L);
      return next;
    });

  // ── Rendu ──────────────────────────────────────────────────────────────────
  const hoveredNode = hovered ? data.nodeIndex[hovered.id] : null;
  const rootPos = layout.nodes.find((n) => n.node.id === "root");

  return (
    <div className="clado-app">
      <Toolbar
        locale={locale}
        biomeFilter={biomeFilter}
        onToggleBiome={toggleBiome}
        showMut={showMut}
        onToggleMut={() => setShowMut((s) => !s)}
        zoom={view.zoom}
        onZoomIn={() => zoomBy(1.2)}
        onZoomOut={() => zoomBy(1 / 1.2)}
        onFit={fit}
      />

      <div
        ref={viewportRef}
        className="clado-viewport"
        data-panning={panning || undefined}
        {...handlers}
      >
        <div
          className="clado-stage"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          }}
        >
          {/* Connecteurs */}
          <svg className="clado-links" width={layout.width} height={layout.height}>
            {layout.links.map((l, i) => {
              const lit = litIds?.has(l.nodeId);
              const dim = activeIds !== null && !activeIds.has(l.nodeId);
              return (
                <path
                  key={i}
                  className={`clado-link ${lit ? "is-lit" : ""} ${dim && !lit ? "is-dim" : ""}`}
                  d={l.d}
                />
              );
            })}
          </svg>

          {/* Note de la racine */}
          {rootPos && data.rootNote && (
            <div className="clado-rootnote" style={{ left: rootPos.x, top: rootPos.y }}>
              {data.rootNote}
            </div>
          )}

          {/* Nœuds */}
          {layout.nodes.map((p) => {
            const lit = litIds?.has(p.node.id);
            const dimmed = activeIds !== null && !activeIds.has(p.node.id) && !lit;
            const advId = p.node.uid ? adversaryByUid[p.node.uid] : undefined;
            return (
              <NodeView
                key={p.node.id}
                p={p}
                dimmed={dimmed}
                href={advId ? `/${locale}/adversaires/#${advId}` : undefined}
                onEnter={onEnter}
                onLeave={onLeave}
                onToggleCollapse={toggleCollapse}
              />
            );
          })}

          {/* Pastilles de mutation (au milieu de l'arête entrante) */}
          {layout.nodes.map((p) => {
            const key = p.node.mut;
            if (typeof key !== "string") return null;
            const m = data.mutationByKey[key];
            return (
              <MutationBadge
                key={`m-${p.node.id}`}
                n={m?.n ?? 0}
                label={m?.label ?? key}
                description={m?.description}
                x={p.parentX !== undefined ? (p.parentX + p.x) / 2 : p.x}
                y={p.y}
              />
            );
          })}
        </div>

        {/* Carte de survol (espace écran) */}
        {hovered && hoveredNode && <HoverCard node={hoveredNode} data={data} anchor={hovered.anchor} />}

        {/* Encart des mutations */}
        {showMut && (
          <MutationsPanel
            mutations={data.mutations}
            counts={mutCounts}
            focusMut={focusMut}
            onPick={(key) => {
              const ids = mutToIds.get(key);
              if (!ids || ids.length === 0) return;
              // Même mutation → on avance dans le cycle ; sinon on repart à 0.
              const i = mutCycle.current.key === key ? (mutCycle.current.i + 1) % ids.length : 0;
              mutCycle.current = { key, i };
              setFocusMut(key);
              revealAndFocus(ids[i]);
            }}
            onClose={() => setShowMut(false)}
          />
        )}

        <Legend />
      </div>
    </div>
  );
}
