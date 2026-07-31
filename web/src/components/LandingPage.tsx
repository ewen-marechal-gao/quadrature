"use client";

/**
 * LandingPage — page d'accueil de Quadrature.
 *
 * Fond : carte d'Aeonir avec dérive lente (animation CSS). On sert `map-web.jpg`,
 * la version allégée dérivée de l'original 8 Mo au build (scripts/generate-web-images.mjs).
 * Contenu : titre, sous-titre, grille de 5 livres cliquables.
 *
 * Si la locale n'est pas activée (enabled:false dans LOCALES), les cartes
 * de livres sont affichées en mode désactivé + bannière "traduction en cours".
 */

import Link from "next/link";
import { type Locale, BOOKS, LOCALES, localize } from "@/lib/nav";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { IS_PUBLIC_BUILD } from "@/lib/build-mode";

/**
 * Année de la mention de copyright. Constante littérale et non `new Date()` :
 * ce composant est rendu au build ET réhydraté dans le navigateur, et une date
 * calculée des deux côtés diverge au passage à la nouvelle année.
 */
const FOOTER_YEAR = 2026;

/** Licence du CONTENU du jeu (cf. LICENSE-CONTENT à la racine du dépôt). */
const CC_LICENSE_URL = "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr";

interface Props {
  locale: Locale;
}

export function LandingPage({ locale }: Props) {
  const localeEnabled = LOCALES.find((l) => l.id === locale)?.enabled ?? false;

  return (
    <div className="landing">
      {/* Fond carte en dérive lente */}
      <div className="landing-map" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/map-web.jpg" alt="" className="landing-map-img" />
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
              La traduction anglaise est en cours de préparation.
              Revenez bientôt !
            </span>
          </div>
        )}

        <nav className="landing-books" aria-label="Bibliothèque">
          {localeEnabled && (
            <Link href={`/${locale}/cartes/`} className="landing-book-card">
              <span className="landing-book-title">Cartes d'action</span>
              <span className="landing-book-subtitle">Outil de table</span>
              <span className="landing-book-desc">
                Recherchez les cartes d'action, composez votre sélection et
                imprimez-la sur des planches A4 (8 cartes par page).
              </span>
              <span className="landing-book-arrow">→</span>
            </Link>
          )}
          {localeEnabled && (
            <Link href={`/${locale}/personnage/`} className="landing-book-card">
              <span className="landing-book-title">Personnage</span>
              <span className="landing-book-subtitle">Outil de table</span>
              <span className="landing-book-desc">
                Créez et gérez vos personnages : feuille interactive, sauvegarde
                automatique, export JSON et impression PDF.
              </span>
              <span className="landing-book-arrow">→</span>
            </Link>
          )}
          {localeEnabled && (
            <Link href={`/${locale}/traits/`} className="landing-book-card">
              <span className="landing-book-title">Traits</span>
              <span className="landing-book-subtitle">Outil de table</span>
              <span className="landing-book-desc">
                Parcourez les traits débloqués aux rangs 3 et 5 des compétences :
                effet imprimé, action modifiée et mécanique de jeu.
              </span>
              <span className="landing-book-arrow">→</span>
            </Link>
          )}
          {localeEnabled && (
            <Link href={`/${locale}/equipement/`} className="landing-book-card">
              <span className="landing-book-title">Équipement</span>
              <span className="landing-book-subtitle">Outil de table</span>
              <span className="landing-book-desc">
                Parcourez le catalogue d&apos;objets : armes, armures, conteneurs
                et consommables, en cartes prêtes à consulter.
              </span>
              <span className="landing-book-arrow">→</span>
            </Link>
          )}
          {localeEnabled && (
            <Link href={`/${locale}/evolution/`} className="landing-book-card">
              <span className="landing-book-title">Évolution</span>
              <span className="landing-book-subtitle">Le monde d'Aeonir</span>
              <span className="landing-book-desc">
                Explorez le cladogramme de la faune d'Aeonir : arbre interactif
                des espèces, mutations et biomes, à parcourir et filtrer.
              </span>
              <span className="landing-book-arrow">→</span>
            </Link>
          )}
          {localeEnabled && (
            <Link href={`/${locale}/adversaires/`} className="landing-book-card">
              <span className="landing-book-title">Bestiaire</span>
              <span className="landing-book-subtitle">Outil de table</span>
              <span className="landing-book-desc">
                Consultez les fiches d'adversaires d'Aeonir : profil de menace,
                parties du corps et deck d'actions, prêts à imprimer.
              </span>
              <span className="landing-book-arrow">→</span>
            </Link>
          )}
          {/* Outil LOCAL : la route n'existe pas dans le build public
              (cf. next.config.ts), donc pas de lien vers elle non plus. */}
          {localeEnabled && !IS_PUBLIC_BUILD && (
            <Link href={`/${locale}/encounters/`} className="landing-book-card">
              <span className="landing-book-title">Rencontres</span>
              <span className="landing-book-subtitle">Outil local</span>
              <span className="landing-book-desc">
                Rejouez les combats du simulateur : choisissez une rencontre, puis
                un de ses logs pour le suivre manche par manche.
              </span>
              <span className="landing-book-arrow">→</span>
            </Link>
          )}
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

        <footer className="landing-footer">
          {locale === "fr" ? (
            <p>
              Quadrature — jeu de rôle original d&apos;Ewen Maréchal, © {FOOTER_YEAR}.
              Univers, règles et illustrations sous licence{" "}
              <a href={CC_LICENSE_URL} rel="license noopener" target="_blank">
                CC BY-NC-SA 4.0
              </a>{" "}
              : partage et adaptation libres, usage non commercial, partage à
              l&apos;identique. Projet en cours d&apos;écriture : les règles publiées ici
              évoluent.
            </p>
          ) : (
            <p>
              Quadrature — an original tabletop RPG by Ewen Maréchal, © {FOOTER_YEAR}.
              Setting, rules and artwork licensed under{" "}
              <a href={CC_LICENSE_URL} rel="license noopener" target="_blank">
                CC BY-NC-SA 4.0
              </a>
              : share and adapt freely, non-commercial, share alike. A work in
              progress: the rules published here are subject to change.
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
