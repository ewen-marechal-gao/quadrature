/**
 * src/components/cladogram/usePanZoom.ts
 *
 * Hook de navigation pan/zoom pour la scène du cladogramme.
 * Possède le viewport (ref), l'état de vue {zoom,x,y} et les gestionnaires
 * (glisser pour déplacer, molette pour zoomer vers le curseur). `fit` et
 * `centerOn` lisent la taille de scène courante via `sizeRef` (mis à jour par
 * l'appelant à chaque rendu) → dépendances stables, pas de boucle d'effet.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { clamp, ZOOM_MAX, ZOOM_MIN } from "./shared";

export interface View {
  zoom: number;
  x: number;
  y: number;
}

export interface StageSize {
  width: number;
  height: number;
}

export function usePanZoom(sizeRef: React.RefObject<StageSize>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 16, y: 16 });
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

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
    const { width } = sizeRef.current;
    const zoom = clamp(Math.min((r.width - 32) / width, 1), ZOOM_MIN, ZOOM_MAX);
    const x = Math.max(16, (r.width - width * zoom) / 2);
    // Aligné en haut (lecture naturelle de l'arbre) ; le reste est accessible au pan.
    setView({ zoom, x, y: 16 });
  }, [sizeRef]);

  // Ajustement initial une fois le viewport mesuré.
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

  const zoomBy = useCallback((factor: number) => {
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
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-interactive]")) return;
    drag.current = { px: e.clientX, py: e.clientY, ox: view.x, oy: view.y };
    setPanning(true);
    viewportRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    setPanning(false);
    viewportRef.current?.releasePointerCapture(e.pointerId);
  };

  return {
    view,
    viewportRef,
    panning,
    fit,
    zoomBy,
    centerOn,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
