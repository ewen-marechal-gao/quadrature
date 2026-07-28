import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LOCALES, resolveLocale } from "@/lib/nav";
import { getAllCards } from "@/lib/cards";
import { getDisciplineCards } from "@/lib/discipline-cards";
import { CardBrowser } from "@/components/CardBrowser";

export function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const label = locale === "fr" ? "Cartes d'action" : "Action Cards";
  return { title: `${label} — Quadrature` };
}

/**
 * Rubrique Cartes : recherche, affichage et impression des cartes d'action.
 * Les données YAML (rules/{locale}/cartes/*.yaml) sont chargées au build
 * et passées au composant client CardBrowser.
 */
export default async function CardsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!LOCALES.find((l) => l.id === localeParam)) notFound();
  const locale = resolveLocale(localeParam);

  // Cartes du vault + cartes des disciplines (Électromancie…), converties.
  const cards = [...getAllCards(locale), ...getDisciplineCards(locale)];

  return <CardBrowser cards={cards} locale={locale} />;
}
