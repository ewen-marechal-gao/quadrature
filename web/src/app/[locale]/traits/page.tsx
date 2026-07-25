import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LOCALES, resolveLocale } from "@/lib/nav";
import { getAllTraits, groupTraits } from "@/lib/traits";
import { TraitsBrowser } from "@/components/traits/TraitsBrowser";

export function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const label = locale === "fr" ? "Traits" : "Traits";
  return { title: `${label} — Quadrature` };
}

/**
 * Rubrique Traits — les traits de personnage (§ rules/fr/core/traits.md),
 * rangés comme sur la fiche : caractéristique → compétence.
 *
 * Les données viennent de `data/traits.yaml`, la source que le simulateur lit
 * lui-même : la page montre donc l'état RÉEL du branchement moteur, y compris
 * les traits qui n'ont encore que leur prose. Lecture au build (contenu
 * versionné, comme les cartes) — pas de rendu dynamique nécessaire.
 */
export default async function TraitsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!LOCALES.find((l) => l.id === localeParam)) notFound();
  const locale = resolveLocale(localeParam);

  const traits = getAllTraits(locale);

  return <TraitsBrowser groups={groupTraits(traits, locale)} total={traits.length} />;
}
