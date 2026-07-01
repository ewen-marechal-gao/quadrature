"use client";

/**
 * MutationBadge — pastille numérotée d'une mutation, posée au *milieu de l'arête*
 * entrante du nœud. Au survol (ou focus clavier), affiche le libellé de la
 * mutation dans une infobulle en espace écran (non zoomée).
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { clamp } from "./shared";

export interface MutationBadgeProps {
  n: number;
  /** Nom de la mutation. */
  label?: string;
  /** Description (affichée sous le nom dans l'infobulle). */
  description?: string;
  /** Coordonnées « monde » du milieu de l'arête. */
  x: number;
  y: number;
}

export function MutationBadge({ n, label, description, x, y }: MutationBadgeProps) {
  const [tip, setTip] = useState<{ cx: number; top: number } | null>(null);

  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({
      cx: clamp(r.left + r.width / 2, 70, window.innerWidth - 70),
      top: r.top,
    });
  };

  return (
    <>
      <button
        type="button"
        data-interactive
        className="clado-mut"
        style={{ left: x, top: y }}
        onPointerEnter={(e) => show(e.currentTarget)}
        onPointerLeave={() => setTip(null)}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={() => setTip(null)}
        aria-label={`Mutation ${n}${label ? ` : ${label}` : ""}`}
      >
        {n}
      </button>
      {/* L'infobulle est portée vers <body> : sinon, étant rendue dans la scène
          transformée (.clado-stage), un position:fixed se positionnerait par
          rapport à cette scène (et suivrait le zoom). Au body, elle est bien
          relative au viewport, indépendamment de la taille d'affichage. */}
      {tip &&
        createPortal(
          <div className="clado-muttip" style={{ left: tip.cx, top: tip.top }} role="tooltip">
            <span className="clado-muttip-n">{n}</span>
            <span className="clado-muttip-body">
              <span className="clado-muttip-label">{label ?? `Mutation ${n}`}</span>
              {description && <span className="clado-muttip-desc">{description}</span>}
            </span>
          </div>,
          document.body
        )}
    </>
  );
}
