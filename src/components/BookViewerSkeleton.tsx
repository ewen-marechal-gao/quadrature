/**
 * BookViewerSkeleton — placeholder affiché pendant que Paged.js initialise.
 *
 * Partagé entre :
 *   - BookViewerLoader — prop `loading` de next/dynamic (avant hydration)
 *   - BookShellLayout  — fallback quand currentHtml n'est pas encore disponible
 */

export function BookViewerSkeleton() {
  return (
    <div className="book-outer">
      <button
        className="book-arrow book-arrow--prev"
        disabled
        aria-label="Page précédente"
      >
        ‹
      </button>
      <div className="book-center">
        <div className="book-status">Composition en cours…</div>
      </div>
      <button
        className="book-arrow book-arrow--next"
        disabled
        aria-label="Page suivante"
      >
        ›
      </button>
    </div>
  );
}
