"use client";

/**
 * CladogramView — exploration interactive du cladogramme de la faune d'Aeonir.
 *
 * Forme : dendrogramme horizontal à pointes alignées (racine à gauche, terminaux
 * alignés à droite). Les nœuds sont du DOM HTML (boutons stylables, accessibles) ;
 * les connecteurs en équerre sont une fine couche SVG décorative posée derrière.
 *
 * Interactions :
 *   - pan (glisser le fond) + zoom (molette vers le curseur, boutons +/−, ajuster) ;
 *   - repli/dépli d'un clade (clic sur son libellé) → recalcul du layout ;
 *   - carte de survol (hover/focus) rendue en espace écran, donc non zoomée, avec
 *     surlignage du chemin d'ascendance jusqu'à la racine ;
 *   - filtres biome (N/L/C/S) et statut → estompage des nœuds hors-filtre ;
 *   - registre des mutations superposé (repliable) ; clic = focus du nœud porteur.
 *
 * Le layout (cladogram-layout.ts) est pur et recalculé à chaque repli (useMemo).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "@/app/cladogram.css";
import type { BiomeLetter, CladoNode, CladogramData, NodeStatus } from "@/lib/cladogram";
import { ancestryOf, computeLayout } from "@/lib/cladogram-layout";

const BIOME_LETTERS: BiomeLetter[] = ["N", "L", "C", "S"];
const BIOME_NAMES: Record<BiomeLetter, string> = {
  N: "Nord",
  L: "Levant",
  C: "Couchant",
  S: "Sud",
};
const STATUS_LABEL: Record<NodeStatus, string> = { done: "peuplé", todo: "à venir" };

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface View {
  zoom: number;
  x: number;
  y: number;
}

/** Anti-débordement : position fixe d'une carte ancrée à un nœud. */
function placeCard(
  anchor: { top: number; right: number; left: number; bottom: number },
  card: { w: number; h: number }
): { left: number; top: number } {
  const M = 12;
  let left = anchor.right + M;
  if (left + card.w > window.innerWidth - 8) left = anchor.left - card.w - M;
  if (left < 8) left = 8;
  const top = clamp(anchor.top, 8, Math.max(8, window.innerHeight - card.h - 8));
  return { left, top };
}

export function CladogramView({
  data,
  locale,
}: {
  data: CladogramData;
  locale: string;
}) {
  // ── État ──────────────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [view, setView] = useState<View>({ zoom: 1, x: 16, y: 16 });
  const [hovered, setHovered] = useState<{
    id: string;
    anchor: { top: number; right: number; left: number; bottom: number };
  } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [biomeFilter, setBiomeFilter] = useState<ReadonlySet<BiomeLetter>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState<NodeStatus | null>(null);
  const [showMut, setShowMut] = useState(false);
  const [focusMut, setFocusMut] = useState<number | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // ── Layout (recalculé au repli) ─────────────────────────────────────────────
  const layout = useMemo(() => computeLayout(data, collapsed), [data, collapsed]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // ── Surlignage d'ascendance (survol ou focus mutation) ──────────────────────
  const highlightId = hovered?.id ?? focusId;
  const litIds = useMemo(
    () => (highlightId ? new Set(ancestryOf(data, highlightId)) : null),
    [data, highlightId]
  );

  // ── Filtres → ensemble actif (null = aucun filtre) ──────────────────────────
  const activeIds = useMemo(() => {
    if (biomeFilter.size === 0 && !statusFilter) return null;
    const set = new Set<string>();
    const rec = (n: CladoNode): boolean => {
      if (n.isLeaf || n.children.length === 0) {
        const b = (n.biome ?? "").toUpperCase();
        const okBiome =
          biomeFilter.size === 0 || [...biomeFilter].some((L) => b.includes(L));
        const okStatus = !statusFilter || n.status === statusFilter;
        const active = okBiome && okStatus;
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
  }, [data, biomeFilter, statusFilter]);

  // mut → id du nœud porteur
  const mutToId = useMemo(() => {
    const m = new Map<number, string>();
    for (const node of Object.values(data.nodeIndex)) {
      if (typeof node.mut === "number" && !m.has(node.mut)) m.set(node.mut, node.id);
    }
    return m;
  }, [data]);

  // ── Pan / zoom ──────────────────────────────────────────────────────────────
  const centerOn = useCallback((wx: number, wy: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    setView((v) => ({ ...v, x: r.width / 2 - wx * v.zoom, y: r.height / 2 - wy * v.zoom }));
  }, []);

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const { width, height } = layoutRef.current;
    const zoom = clamp(Math.min((r.width - 32) / width, 1), ZOOM_MIN, ZOOM_MAX);
    const x = Math.max(16, (r.width - width * zoom) / 2);
    // Aligné en haut (lecture naturelle de l'arbre) ; le reste est accessible au pan.
    const y = 16;
    setView({ zoom, x, y });
  }, []);

  // Ajustement initial (une fois le viewport mesuré).
  useEffect(() => {
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
  }, [fit]);

  // Molette : zoom non-passif vers le curseur.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      setView((v) => {
        const z = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX);
        const k = z / v.zoom;
        return { zoom: z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      });
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (factor: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const cx = r.width / 2;
    const cy = r.height / 2;
    setView((v) => {
      const z = clamp(v.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      const k = z / v.zoom;
      return { zoom: z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-interactive]")) return;
    drag.current = { px: e.clientX, py: e.clientY, ox: view.x, oy: view.y };
    viewportRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    viewportRef.current?.releasePointerCapture(e.pointerId);
  };

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
      // Déplie tous les ancêtres repliés.
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

  // Recentre quand un focus (mutation) change, après recalcul du layout.
  useEffect(() => {
    if (!focusId) return;
    const p = layout.nodes.find((n) => n.node.id === focusId);
    if (p) centerOn(p.x, p.y);
  }, [focusId, layout, centerOn]);

  const onEnter = (id: string) => (e: React.PointerEvent | React.FocusEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHovered({ id, anchor: { top: r.top, right: r.right, left: r.left, bottom: r.bottom } });
  };
  const onLeave = () => setHovered(null);

  const toggleBiome = (L: BiomeLetter) =>
    setBiomeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(L)) next.delete(L);
      else next.add(L);
      return next;
    });

  // ── Rendu ──────────────────────────────────────────────────────────────────
  const dimNode = (id: string) => activeIds !== null && !activeIds.has(id);
  const hoveredNode = hovered ? data.nodeIndex[hovered.id] : null;

  return (
    <div className="clado-app">
      {/* Barre d'outils */}
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
              onClick={() => toggleBiome(L)}
              title={BIOME_NAMES[L]}
            >
              {L}
            </button>
          ))}
        </div>

        <div className="clado-group" role="group" aria-label="Filtre statut">
          <button
            className={`clado-chip ${statusFilter === "done" ? "clado-chip--on" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "done" ? null : "done")}
          >
            ✓ Peuplé
          </button>
          <button
            className={`clado-chip ${statusFilter === "todo" ? "clado-chip--on" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "todo" ? null : "todo")}
          >
            ☐ À venir
          </button>
        </div>

        <div className="clado-group">
          <button
            className={`clado-btn ${showMut ? "clado-chip--on" : ""}`}
            onClick={() => setShowMut((s) => !s)}
            aria-pressed={showMut}
          >
            Mutations
          </button>
        </div>

        <div className="clado-group" role="group" aria-label="Zoom">
          <button className="clado-btn clado-iconbtn" onClick={() => zoomBy(1 / 1.2)} aria-label="Dézoomer">
            −
          </button>
          <span className="clado-zoom-val">{Math.round(view.zoom * 100)}%</span>
          <button className="clado-btn clado-iconbtn" onClick={() => zoomBy(1.2)} aria-label="Zoomer">
            +
          </button>
          <button className="clado-btn" onClick={fit}>
            Ajuster
          </button>
        </div>
      </header>

      {/* Viewport */}
      <div
        ref={viewportRef}
        className="clado-viewport"
        data-panning={drag.current ? "true" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
          {(() => {
            const rp = layout.nodes.find((n) => n.node.id === "root");
            if (!rp || !data.rootNote) return null;
            return (
              <div className="clado-rootnote" style={{ left: rp.x, top: rp.y }}>
                {data.rootNote}
              </div>
            );
          })()}

          {/* Nœuds */}
          {layout.nodes.map((p) => {
            const n = p.node;
            if (n.id === "root") return null;
            const lit = litIds?.has(n.id);
            const dimmed = dimNode(n.id) && !lit;
            const cls = `clado-node ${dimmed ? "is-dim" : ""}`;

            if (p.terminal) {
              const collapsedClade = !n.isLeaf; // clade replié rendu comme pointe
              return (
                <button
                  key={n.id}
                  type="button"
                  data-interactive
                  className={`${cls} clado-tip`}
                  style={{ left: p.x, top: p.y }}
                  onPointerEnter={onEnter(n.id)}
                  onPointerLeave={onLeave}
                  onFocus={onEnter(n.id)}
                  onBlur={onLeave}
                  onClick={() => (collapsedClade ? toggleCollapse(n.id) : undefined)}
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

            // Clade interne déplié : libellé au-dessus du point de branche.
            const isNote = !n.name && !!n.branchNote;
            return (
              <button
                key={n.id}
                type="button"
                data-interactive
                className={`${cls} clado-clade ${isNote ? "is-note" : ""}`}
                style={{ left: p.x, top: p.y }}
                onPointerEnter={onEnter(n.id)}
                onPointerLeave={onLeave}
                onFocus={onEnter(n.id)}
                onBlur={onLeave}
                onClick={() => toggleCollapse(n.id)}
                title="Replier / déplier"
              >
                <span className="clado-chevron">▾</span>
                <span className="clado-clade-name">{n.name ?? n.branchNote}</span>
                {n.name && n.ref && <span className="clado-clade-ref">({n.ref})</span>}
              </button>
            );
          })}

          {/* Pastilles de mutation */}
          {layout.nodes.map((p) =>
            typeof p.node.mut === "number" ? (
              <span
                key={`m-${p.node.id}`}
                className="clado-mut"
                style={{ left: p.x, top: p.y }}
                title={data.mutations[p.node.mut - 1]?.label}
              >
                {p.node.mut}
              </span>
            ) : null
          )}
        </div>

        {/* Carte de survol (espace écran) */}
        {hovered && hoveredNode && (
          <HoverCard
            node={hoveredNode}
            data={data}
            anchor={hovered.anchor}
          />
        )}

        {/* Encart des mutations */}
        {showMut && (
          <aside className="clado-mutpanel" aria-label="Registre des mutations d'Aeonir">
            <div className="clado-mutpanel-head">
              <span className="clado-mutpanel-title">Mutations d'Aeonir</span>
              <button className="clado-btn clado-iconbtn" onClick={() => setShowMut(false)} aria-label="Fermer">
                ×
              </button>
            </div>
            <div className="clado-mutpanel-list">
              {data.mutations.map((m) => {
                const placed = data.usedMut.includes(m.n);
                const on = focusMut === m.n;
                return (
                  <button
                    key={m.n}
                    className={`clado-mutrow ${on ? "is-on" : ""}`}
                    disabled={!placed}
                    onClick={() => {
                      const id = mutToId.get(m.n);
                      if (!id) return;
                      setFocusMut(m.n);
                      revealAndFocus(id);
                    }}
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
        )}

        {/* Légende */}
        <div className="clado-legend">
          <span><b>★</b> espèce-clé · <b>✓</b> peuplé · <b>☐</b> à venir</span>
          <span><span className="clado-hc-dot" style={{ display: "inline-flex", width: 12, height: 12 }}>n</span> mutation</span>
          <span>Biome : <b>N</b> Nord · <b>L</b> Levant · <b>C</b> Couchant · <b>S</b> Sud</span>
          <span>Glisser pour déplacer · molette pour zoomer · clic sur un clade pour replier</span>
        </div>
      </div>
    </div>
  );
}

// ─── Carte de survol ────────────────────────────────────────────────────────────

function HoverCard({
  node,
  data,
  anchor,
}: {
  node: CladoNode;
  data: CladogramData;
  anchor: { top: number; right: number; left: number; bottom: number };
}) {
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
  const mut = typeof node.mut === "number" ? data.mutations[node.mut - 1] : null;

  // Ascendance (clades nommés, de la racine vers le nœud), nœud exclu.
  const path = ancestryOf(data, node.id)
    .slice(1)
    .reverse()
    .map((id) => data.nodeIndex[id])
    .filter((n) => n && (n.name || n.branchNote))
    .map((n) => n.name ?? n.branchNote!);

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
      {mut && (
        <div className="clado-hc-row clado-hc-mut">
          <span className="clado-hc-dot">{mut.n}</span>
          <span>{mut.label}</span>
        </div>
      )}
      {node.branchNote && node.name && (
        <div className="clado-hc-row">{node.branchNote}</div>
      )}
      {path.length > 0 && (
        <div className="clado-hc-path">
          {path.map((p, i) => (
            <span key={i}>
              {i > 0 && <span className="sep">›</span>}
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
