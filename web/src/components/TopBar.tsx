"use client";

/**
 * TopBar — la barre d'identité, commune à TOUTES les rubriques du site.
 *
 * Un seul gabarit, celui du Bestiaire :
 *
 *   [‹ repli]  QUADRATURE — Rubrique · Section   [contrôles de la page]  [FR EN]
 *
 *  · le repli n'apparaît que si la rubrique a un panneau latéral ;
 *  · « Quadrature » ramène toujours à l'accueil de la locale — c'est la seule
 *    sortie de secours du site, elle doit être au même endroit partout ;
 *  · la Rubrique peut être un lien (retour à son index) quand on est descendu
 *    dans un détail — un combat rejoué, une créature ;
 *  · `actions` porte ce qu'on FAIT de la page — imprimer, télécharger — calé à
 *    droite. Filtrer et rechercher n'y sont PAS : ces contrôles agissent sur ce
 *    qu'on regarde, donc ils vivent dans la barre d'outils (ToolBar) ;
 *  · le sélecteur de langue est TOUJOURS le dernier élément. C'est ce que les
 *    rubriques ne faisaient pas pareil (le livre le plaçait avant son bouton
 *    PDF), et c'est le genre d'écart qui se voit en passant d'une page à l'autre.
 *
 * Les styles vivent dans shell.css, sous `.top-bar*` — inchangés : ce composant
 * ne fait qu'en centraliser le balisage.
 */

import Link from "next/link";
import type { Locale } from "@/lib/nav";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

/** Bouton de repli du panneau latéral. Absent = la rubrique n'en a pas. */
export interface TopBarCollapse {
  collapsed: boolean;
  onToggle: () => void;
  /** Ce que le bouton FERA au clic — « Ouvrir le sommaire », « Réduire la liste ». */
  labelOpen: string;
  labelClose: string;
}

interface Props {
  locale: Locale;
  /** Nom de la rubrique : « Bestiaire », « Équipement », titre du livre… */
  page: string;
  /** Rend le nom de rubrique cliquable — vers son index. */
  pageHref?: string;
  /** Détail courant, affiché après un « · » : créature, section, combat. */
  section?: string;
  collapse?: TopBarCollapse;
  /** Passé au sélecteur de langue, qui bascule alors vers le même livre. */
  bookId?: string;
  /** Barre qui suit le défilement (rubriques dont la page entière défile). */
  sticky?: boolean;
  /** Contrôles calés à droite : imprimer, télécharger — ce qu'on FAIT de la page. */
  actions?: React.ReactNode;
}

export function TopBar({
  locale, page, pageHref, section, collapse, bookId, sticky, actions,
}: Props) {
  return (
    <header className={sticky ? "top-bar top-bar--sticky" : "top-bar"}>
      {collapse && (
        <button
          className="top-bar-collapse"
          onClick={collapse.onToggle}
          aria-label={collapse.collapsed ? collapse.labelOpen : collapse.labelClose}
          title={collapse.collapsed ? collapse.labelOpen : collapse.labelClose}
        >
          {collapse.collapsed ? "›" : "‹"}
        </button>
      )}

      <Link href={`/${locale}/`} className="top-bar-logo">
        Quadrature
      </Link>

      <span className="top-bar-sep">—</span>
      {pageHref ? (
        <Link href={pageHref} className="top-bar-book">{page}</Link>
      ) : (
        <span className="top-bar-book">{page}</span>
      )}

      {section && (
        <>
          <span className="top-bar-sep">·</span>
          <span className="top-bar-title">{section}</span>
        </>
      )}

      {/* Espaceur : il mange toute la place libre, donc tout ce qui suit est
          calé à droite — quelle que soit la présence d'une section ou de
          contrôles. C'est ce qui manquait : chaque rubrique s'en remettait à un
          `margin-left: auto` sur l'un de ses propres éléments, et le bouton PDF
          du livre, seul à n'en pas avoir, restait collé au titre. */}
      <span className="top-bar-spacer" aria-hidden="true" />

      {actions}

      <LocaleSwitcher locale={locale} bookId={bookId} />
    </header>
  );
}
