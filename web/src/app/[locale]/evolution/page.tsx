import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LOCALES, resolveLocale } from "@/lib/nav";
import { getCladogram } from "@/lib/cladogram";
import { getAllAdversaries } from "@/lib/bestiary";
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
 * Les YAML (data/cladogram.yaml + data/mutations.yaml) sont lus et normalisés au build,
 * puis passés au composant client CladogramView (pan/zoom, repli, filtres).
 *
 * Les fiches d'adversaires portent le `from` (uid du nœud dont elles dérivent) : on en
 * dresse la table uid → id de fiche, qui remplace l'ancien champ « status » de l'arbre
 * (une feuille est « peuplée » ssi une fiche la cible).
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
  const adversaryByUid = Object.fromEntries(
    getAllAdversaries(locale)
      .filter((a) => a.from)
      .map((a) => [a.from as string, a.id])
  );

  return <CladogramView data={data} locale={locale} adversaryByUid={adversaryByUid} />;
}
