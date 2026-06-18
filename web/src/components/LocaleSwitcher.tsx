"use client";

/**
 * LocaleSwitcher — sélecteur de langue FR / EN.
 *
 * FR est actif et navigue vers la version française du contenu courant.
 * EN est désactivé tant que la traduction n'est pas disponible (enabled:false
 * dans LOCALES). Quand enabled sera true, EN deviendra un lien cliquable.
 *
 * Props :
 *   locale   — locale actuellement active (ex: "fr")
 *   bookId   — si fourni, switche vers /{locale}/volumen/{bookId}/
 *              sinon, switche vers /{locale}/
 */

import Link from "next/link";
import { type Locale, LOCALES } from "@/lib/nav";

interface Props {
  locale: Locale;
  bookId?: string;
}

export function LocaleSwitcher({ locale, bookId }: Props) {
  return (
    <div className="locale-switcher" aria-label="Langue">
      {LOCALES.map((loc) => {
        const href = bookId
          ? `/${loc.id}/volumen/${bookId}/`
          : `/${loc.id}/`;
        const isActive = loc.id === locale;

        if (!loc.enabled) {
          return (
            <span
              key={loc.id}
              className="locale-btn locale-btn--disabled"
              title="Bientôt disponible"
              aria-disabled="true"
              role="button"
            >
              {loc.label}
            </span>
          );
        }

        return (
          <Link
            key={loc.id}
            href={href}
            className={`locale-btn${isActive ? " locale-btn--active" : ""}`}
            aria-current={isActive ? "true" : undefined}
          >
            {loc.label}
          </Link>
        );
      })}
    </div>
  );
}
