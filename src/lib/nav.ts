/**
 * src/lib/nav.ts
 *
 * Source de vérité pour la navigation et la structure des livres.
 *
 * Les données de contenu (sections + titres) vivent dans src/data/books.json.
 * Ce fichier JSON est importable à la fois par TypeScript (Next.js active
 * resolveJsonModule) et par les scripts Node.js (readFileSync).
 *
 * Pour ajouter une section :
 *   1. Créer le fichier Markdown dans rules/fr/<section>.md
 *   2. Ajouter l'entrée { slug, title } dans le bon livre de src/data/books.json
 *
 * Pour activer la locale anglaise :
 *   1. Créer les fichiers Markdown dans rules/en/
 *   2. Passer enabled:true pour 'en' dans LOCALES ci-dessous
 *   3. node scripts/generate-content-index.mjs en
 */

import booksData from "@/data/books.json";

// ─── Localisation ─────────────────────────────────────────────────────────────

export type Locale = "fr" | "en";

export interface LocaleDef {
  id: Locale;
  /** Label court affiché dans le sélecteur (ex : "FR", "EN"). */
  label: string;
  /** false = contenu non encore disponible → bouton désactivé dans le switcher. */
  enabled: boolean;
}

/**
 * Liste des locales supportées par le site.
 * C'est le seul endroit à modifier pour activer une nouvelle langue.
 */
export const LOCALES: LocaleDef[] = [
  { id: "fr", label: "FR", enabled: true  },
  { id: "en", label: "EN", enabled: false },
];

export const DEFAULT_LOCALE: Locale = "fr";

/** Valide qu'une chaîne est une locale connue ; retourne la locale par défaut sinon. */
export function resolveLocale(value: string): Locale {
  return LOCALES.find((l) => l.id === value)?.id ?? DEFAULT_LOCALE;
}

// ─── Localisation des chaînes ─────────────────────────────────────────────────

/**
 * Champ texte disponible dans toutes les locales supportées.
 * Partial : les nouvelles locales peuvent n'avoir qu'une traduction partielle
 * avant que tout le contenu soit prêt — on tombe alors sur le fallback 'fr'.
 */
export type LocalizedString = Partial<Record<Locale, string>>;

/**
 * Retourne la chaîne dans la locale demandée.
 * Fallback : 'fr' si la locale cible n'est pas encore traduite.
 */
export function localize(field: LocalizedString, locale: string): string {
  return field[locale as Locale] ?? field.fr ?? "";
}

// ─── Structure des livres ─────────────────────────────────────────────────────

export interface BookSection {
  slug: string;
  /** Titre de la section dans chaque locale. */
  title: LocalizedString;
}

export interface BookDef {
  id: string;
  title: LocalizedString;
  subtitle: LocalizedString;
  description: LocalizedString;
  /** Sections ordonnées du livre, avec leur titre d'affichage. */
  sections: BookSection[];
}

/** Livres — dérivés de src/data/books.json (source unique de vérité). */
export const BOOKS: BookDef[] = booksData as BookDef[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retourne la définition d'un livre par son id, ou undefined si inconnu. */
export function getBookById(id: string): BookDef | undefined {
  return BOOKS.find((b) => b.id === id);
}

/** Retourne le livre auquel appartient un slug, ou undefined si orphelin. */
export function getBookForSlug(slug: string): BookDef | undefined {
  return BOOKS.find((b) => b.sections.some((s) => s.slug === slug));
}

/**
 * Retourne le titre d'une section pour un slug donné.
 * Utilise la locale spécifiée avec fallback sur 'fr'.
 */
export function getTitleForSlug(slug: string, locale = "fr"): string {
  for (const book of BOOKS) {
    const section = book.sections.find((s) => s.slug === slug);
    if (section) return localize(section.title, locale);
  }
  return slug;
}
