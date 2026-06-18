import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LOCALES, resolveLocale } from "@/lib/nav";
import { CharacterSheet } from "@/components/sheet/CharacterSheet";

export function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const label = locale === "fr" ? "Personnage" : "Character";
  return { title: `${label} — Quadrature` };
}

/**
 * Rubrique Personnage : feuille interactive (création, édition, persistance
 * localStorage, export/import JSON, impression PDF). Tout l'état vit côté client
 * dans le composant CharacterSheet.
 */
export default async function PersonnagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!LOCALES.find((l) => l.id === localeParam)) notFound();
  const locale = resolveLocale(localeParam);

  return <CharacterSheet locale={locale} />;
}
