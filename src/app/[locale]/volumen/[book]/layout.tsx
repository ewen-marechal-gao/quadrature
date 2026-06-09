import { notFound } from "next/navigation";
import { LOCALES, BOOKS, getBookById, resolveLocale } from "@/lib/nav";
import { BookShell } from "@/components/BookShell";

/**
 * Génère les routes statiques uniquement pour les locales activées.
 * Quand EN sera prêt : passer enabled:true dans LOCALES → les routes /en/volumen/…
 * seront automatiquement générées au prochain build.
 */
export function generateStaticParams() {
  return LOCALES
    .filter((l) => l.enabled)
    .flatMap((l) =>
      BOOKS.map((b) => ({ locale: l.id, book: b.id }))
    );
}

export default async function BookLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; book: string }>;
}) {
  const { locale: localeParam, book: bookId } = await params;
  const locale = resolveLocale(localeParam);

  // Vérifier que la locale est activée (sécurité si quelqu'un tape /en/volumen/…)
  const localeDef = LOCALES.find((l) => l.id === locale);
  if (!localeDef?.enabled) notFound();

  const book = getBookById(bookId);
  if (!book) notFound();

  return (
    <BookShell bookId={bookId} slugs={book.sections.map((s) => s.slug)} locale={locale}>
      {children}
    </BookShell>
  );
}
