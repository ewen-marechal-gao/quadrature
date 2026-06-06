"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  html: string;
}

export function BookViewer({ html }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    container.innerHTML = "";
    setPageCount(null);
    setError(false);

    // Paged.js is DOM-only, must be dynamically imported (no SSR)
    import("pagedjs")
      .then(async (mod) => {
        if (cancelled || !container) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Previewer = (mod as any).Previewer ?? (mod as any).default?.Previewer;
        if (!Previewer) throw new Error("Paged.js Previewer not found");

        const paged = new Previewer();

        const flow = await paged.preview(html, ["/book.css"], container);

        if (!cancelled) {
          setPageCount(flow?.total ?? null);
        }
      })
      .catch((err) => {
        console.error("[BookViewer] Paged.js error:", err);
        if (!cancelled) {
          // Graceful fallback: render raw HTML
          if (container) container.innerHTML = html;
          setError(true);
        }
      });

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
  }, [html]);

  return (
    <div className="book-outer">
      {pageCount === null && !error && (
        <div className="book-loading">
          <span>Composition en cours…</span>
        </div>
      )}
      {error && (
        <div className="book-error">
          Erreur de composition — rendu alternatif affiché.
        </div>
      )}
      <div ref={containerRef} className="book-container" />
    </div>
  );
}
