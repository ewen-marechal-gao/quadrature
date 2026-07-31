"use client";

/**
 * ToolBar — la bande de contrôles commune, SOUS la top bar.
 *
 * Division du travail entre les deux barres :
 *  · la TopBar dit OÙ l'on est — identité, rubrique, retour à l'accueil ;
 *  · la ToolBar dit ce qu'on peut FAIRE ici — filtrer, zoomer, imprimer.
 *
 * D'où deux règles que ce composant fait respecter par construction : une barre
 * d'outils ne porte NI titre de page NI bouton de retour. Les deux existaient
 * (la feuille de personnage avait son bouton « Accueil », le cladogramme sa
 * flèche et son titre) et doublaient la top bar située trois pixels au-dessus.
 *
 * Les primitives ci-dessous sont volontairement peu nombreuses : c'est ce qui
 * garantit qu'une rubrique nouvelle ressemble aux autres sans avoir à recopier
 * une classe. Styles dans app/toolbar.css.
 */

import "@/app/toolbar.css";

// ─── Conteneur ────────────────────────────────────────────────────────────────

export function ToolBar({
  children,
  ariaLabel,
}: {
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <div
      className="tool-bar"
      role="toolbar"
      aria-label={ariaLabel ?? "Barre d'outils"}
    >
      {children}
    </div>
  );
}

/** Groupe de contrôles, séparé du précédent par un filet, avec libellé optionnel. */
export function ToolGroup({
  label,
  children,
  ariaLabel,
  first,
}: {
  label?: string;
  children: React.ReactNode;
  ariaLabel?: string;
  /** Force l'absence de filet (groupe placé après un espaceur). */
  first?: boolean;
}) {
  return (
    <div
      className={first ? "tool-group tool-group--first" : "tool-group"}
      role="group"
      aria-label={ariaLabel ?? label}
    >
      {label && <span className="tool-label">{label}</span>}
      {children}
    </div>
  );
}

/** Pousse vers la droite tout ce qui le suit. */
export function ToolSpacer() {
  return <span className="tool-spacer" aria-hidden="true" />;
}

// ─── Contrôles ────────────────────────────────────────────────────────────────

/** Bascule : actif ou non. `aria-pressed` est posé pour que l'état soit lisible. */
export function ToolChip({
  on, onClick, title, children,
}: {
  on: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={on ? "tool-chip is-on" : "tool-chip"}
      onClick={onClick}
      aria-pressed={on}
      title={title}
    >
      {children}
    </button>
  );
}

/** Action : elle FAIT quelque chose, elle n'a pas d'état. */
export function ToolButton({
  onClick, children, variant, title, ariaLabel,
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "primary" | "icon";
  title?: string;
  ariaLabel?: string;
}) {
  const cls = variant ? `tool-btn tool-btn--${variant}` : "tool-btn";
  return (
    <button type="button" className={cls} onClick={onClick} title={title} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

export function ToolSearch({
  value, onChange, placeholder, ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <input
      type="search"
      className="tool-search"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
    />
  );
}

export function ToolToggle({
  checked, onChange, children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="tool-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** Valeur en lecture seule : compteur de résultats, niveau de zoom. */
export function ToolValue({ children }: { children: React.ReactNode }) {
  return <span className="tool-value">{children}</span>;
}
