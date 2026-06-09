"use client";

/**
 * LandingPage — page d'accueil de Quadrature.
 *
 * Fond : carte d'Aeonir (map.jpg) avec dérive lente (animation CSS).
 * Contenu : titre, sous-titre, grille de 5 livres cliquables.
 *
 * Si la locale n'est pas activée (enabled:false dans LOCALES), les cartes
 * de livres sont affichées en mode désactivé + bannière "traduction en cours".
 */

import Link from "next/link";
import { BOOKS, LOCALES, localize } from "@/lib/nav";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

interface Props {
  locale: string;
}

export function LandingPage({ locale }: Props) {
  const localeEnabled = LOCALES.find((l) => l.id === locale)?.enabled ?? false;

  return (
    <div className="landing">
      {/* Fond carte en dérive lente */}
      <div className="landing-map" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/map.jpg" alt="" className="landing-map-img" />
        <div className="landing-map-overlay" />
      </div>

      {/* Sélecteur de langue — coin supérieur droit */}
      <div className="landing-locale">
        <LocaleSwitcher locale={locale} />
      </div>

      {/* Contenu centré */}
      <div className="landing-content">
        <header className="landing-header">
          <h1 className="landing-title">Quadrature</h1>
          <p className="landing-subtitle">Le monde d'Aeonir — Règles du jeu de rôle</p>
        </header>

        {/* Bannière "traduction en cours" pour les locales désactivées */}
        {!localeEnabled && (
          <div className="landing-locale-notice">
            <span>
              🌐 La traduction anglaise est en cours de préparation.
              Revenez bientôt !
            </span>
          </div>
        )}

        <nav className="landing-books" aria-label="Bibliothèque">
          {BOOKS.map((book) =>
            localeEnabled ? (
              <Link
                key={book.id}
                href={`/${locale}/volumen/${book.id}/`}
                className="landing-book-card"
              >
                <span className="landing-book-title">{localize(book.title, locale)}</span>
                <span className="landing-book-subtitle">{localize(book.subtitle, locale)}</span>
                <span className="landing-book-desc">{localize(book.description, locale)}</span>
                <span className="landing-book-arrow">→</span>
              </Link>
            ) : (
              <div
                key={book.id}
                className="landing-book-card landing-book-card--disabled"
                aria-disabled="true"
              >
                <span className="landing-book-title">{localize(book.title, locale)}</span>
                <span className="landing-book-subtitle">{localize(book.subtitle, locale)}</span>
                <span className="landing-book-desc">{localize(book.description, locale)}</span>
                <span className="landing-book-arrow">—</span>
              </div>
            )
          )}
        </nav>
      </div>
    </div>
  );
}
