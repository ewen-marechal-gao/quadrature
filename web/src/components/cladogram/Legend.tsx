"use client";

/** Legend — rappel statique des symboles, en bas à gauche du viewport. */
export function Legend() {
  return (
    <div className="clado-legend">
      <span><b>★</b> espèce-clé · <b>✓</b> peuplé · <b>☐</b> à venir</span>
      <span><span className="clado-legend-dot">n</span> mutation (sur l'arête)</span>
      <span>Biome : <b>N</b> Nord · <b>L</b> Levant · <b>C</b> Couchant · <b>S</b> Sud</span>
      <span>Glisser pour déplacer · molette pour zoomer · clic sur un clade pour replier</span>
    </div>
  );
}
