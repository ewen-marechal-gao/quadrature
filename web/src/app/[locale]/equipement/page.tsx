import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LOCALES, resolveLocale } from "@/lib/nav";
import { getAllItems, groupItems } from "@/lib/equipment";
import { EquipmentBrowser } from "@/components/equipment/EquipmentBrowser";

export function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const label = locale === "fr" ? "Équipement" : "Equipment";
  return { title: `${label} — Quadrature` };
}

/**
 * Rubrique Équipement — le catalogue d'objets (§ rules/fr/core/equipement.md),
 * rangé par nature : armes (par famille), armures, conteneurs, consommables,
 * divers.
 *
 * Les données viennent de `data/equipment/*.yaml`, la source que le simulateur
 * lit lui-même : la page montre l'état RÉEL de la donnée, ses familles encore
 * absentes comprises. Lecture au build (contenu versionné, comme les traits) —
 * pas de rendu dynamique nécessaire.
 */
export default async function EquipmentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!LOCALES.find((l) => l.id === localeParam)) notFound();
  const locale = resolveLocale(localeParam);

  const items = getAllItems(locale);

  return (
    <EquipmentBrowser
      sections={groupItems(items)}
      total={items.length}
      locale={locale}
    />
  );
}
