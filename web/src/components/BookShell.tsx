"use client";

/**
 * BookShell — wrapper client qui force le remontage complet du contexte
 * quand l'utilisateur change de livre.
 *
 * Problème : en Next.js App Router, les layouts avec segments dynamiques ([book])
 * sont préservés (pas remontés) lors de la navigation entre /volumen/core/ et
 * /volumen/martial/. Sans `key`, BookProvider garderait son état (pageCounts,
 * renderCache côté contexte, etc.) du livre précédent.
 *
 * Solution : passer key={bookId} sur BookProvider force React à démonter et
 * remonter l'arbre entier quand le livre change.
 */

import { type Locale } from "@/lib/nav";
import { BookProvider } from "@/lib/context";
import { BookPreloader } from "@/components/BookPreloader";
import { BookShellLayout } from "@/components/BookShellLayout";

interface Props {
  bookId: string;
  slugs: string[];
  /** Locale active (ex : "fr", "en") — transmise au preloader et au layout. */
  locale: Locale;
  children: React.ReactNode;
}

export function BookShell({ bookId, slugs, locale, children }: Props) {
  return (
    <BookProvider key={bookId}>
      <BookPreloader slugs={slugs} locale={locale} />
      <BookShellLayout bookId={bookId} locale={locale}>
        {children}
      </BookShellLayout>
    </BookProvider>
  );
}
