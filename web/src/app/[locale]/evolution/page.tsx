import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LOCALES, resolveLocale } from "@/lib/nav";
import { getCladogram } from "@/lib/cladogram";
import { CladogramView } from "@/components/cladogram/CladogramView";

export function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const label = locale === "fr" ? "Évolution" : "Evolution";
  return { title: `${label} — Quadrature` };
}

/**
 * Rubrique Évolution : cladogramme interactif de la faune d'Aeonir.
 * Le YAML (rules/{locale}/univers/cladogram.yaml) est lu et normalisé au build,
 * puis passé au composant client CladogramView (pan/zoom, repli, filtres).
 */
export default async function EvolutionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!LOCALES.find((l) => l.id === localeParam)) notFound();
  const locale = resolveLocale(localeParam);

  const data = getCladogram(locale);

  return <CladogramView data={data} locale={locale} />;
}
