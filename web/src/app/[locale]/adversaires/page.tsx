import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LOCALES, resolveLocale } from "@/lib/nav";
import { getAllAdversaries } from "@/lib/bestiary";
import { BestiaryBrowser } from "@/components/adversary/BestiaryBrowser";

export function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const label = locale === "fr" ? "Bestiaire" : "Bestiary";
  return { title: `${label} — Quadrature` };
}

/**
 * Rubrique Bestiaire : fiches d'adversaires (format A5 paysage).
 * Les fiches (rules/{locale}/adversaires/bestiaire/*.card.yaml) sont chargées
 * au build, résolues dans la locale, puis rendues par le composant client AdversarySheet.
 */
export default async function AdversairesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!LOCALES.find((l) => l.id === localeParam)) notFound();
  const locale = resolveLocale(localeParam);

  const adversaries = getAllAdversaries(locale);

  return <BestiaryBrowser adversaries={adversaries} locale={locale} />;
}
