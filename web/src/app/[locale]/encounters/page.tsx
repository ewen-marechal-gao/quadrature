import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LOCALES, resolveLocale } from "@/lib/nav";
import { groupReportsByEncounter } from "@/lib/combat-report";
import { EncountersBrowser } from "@/components/combat/EncountersBrowser";

// Lecture du système de fichiers en direct (rencontres + rapports locaux) : la
// page doit être rendue à la demande, jamais figée au build.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const label = locale === "fr" ? "Rencontres" : "Encounters";
  return { title: `${label} — Quadrature` };
}

/**
 * Rubrique Rencontres — point d'entrée du rejeu de combat, groupé par scénario.
 * Outil LOCAL : les rencontres (`simulator/encounters/*.yaml`) sont versionnées,
 * mais leurs logs (`simulator/combatReports/`) sont gitignorés → hors machine
 * locale la liste des rencontres s'affiche, sans logs (dégradation propre).
 */
export default async function EncountersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!LOCALES.find((l) => l.id === locale)) notFound();

  const groups = groupReportsByEncounter();

  return <EncountersBrowser groups={groups} locale={resolveLocale(locale)} />;
}
