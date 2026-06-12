import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBookById, resolveLocale, localize } from "@/lib/nav";
import { getPageBySlug } from "@/lib/content";
import { PageInitializer } from "@/components/PageInitializer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; book: string }>;
}): Promise<Metadata> {
  const { locale: localeParam, book: bookId } = await params;
  const locale = resolveLocale(localeParam);
  const book = getBookById(bookId);
  if (!book) return {};
  return { title: `${localize(book.title, locale)} — Quadrature` };
}

/**
 * Page d'entrée d'un livre.
 * Charge le HTML de la première section (Server Component) et le passe à
 * PageInitializer, qui met à jour le BookContext pour que BookViewer affiche
 * immédiatement la première section.
 */
export default async function BookPage({
  params,
}: {
  params: Promise<{ locale: string; book: string }>;
}) {
  const { locale: localeParam, book: bookId } = await params;
  const locale = resolveLocale(localeParam);

  const book = getBookById(bookId);
  if (!book) notFound();

  const firstSlug = book.sections[0].slug;
  const page = await getPageBySlug(firstSlug.split("/"), locale);
  if (!page) notFound();

  return <PageInitializer slug={firstSlug} html={page.htmlContent} />;
}
