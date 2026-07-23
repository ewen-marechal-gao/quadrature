import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LOCALES, resolveLocale } from "@/lib/nav";
import { reportIds, loadReport } from "@/lib/combat-report";
import { resolveCombatCards } from "@/lib/combat-cards";
import { CombatViewer } from "@/components/combat/CombatViewer";

/**
 * Une page statique par (locale × rapport). Route DYNAMIQUE compatible export
 * statique : `generateStaticParams` énumère tout ce que la route peut servir,
 * lu au build directement dans `simulator/combatReports/`. Un rapport ajouté
 * plus tard nécessite un rebuild — compromis assumé (choix créateur).
 */
export function generateStaticParams() {
  const ids = reportIds();
  return LOCALES.flatMap((l) => ids.map((report) => ({ locale: l.id, report })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; report: string }>;
}): Promise<Metadata> {
  const { report } = await params;
  const log = loadReport(report);
  const title = log
    ? log.combatants.map((c) => c.charName).join(" contre ")
    : "Rejeu de combat";
  return { title: `${title} — Quadrature` };
}

export default async function CombatReportPage({
  params,
}: {
  params: Promise<{ locale: string; report: string }>;
}) {
  const { locale: localeParam, report } = await params;
  if (!LOCALES.find((l) => l.id === localeParam)) notFound();
  const locale = resolveLocale(localeParam);

  const log = loadReport(report);
  if (!log) notFound();

  const cards = resolveCombatCards(log, locale);

  return <CombatViewer log={log} locale={locale} cards={cards} />;
}
