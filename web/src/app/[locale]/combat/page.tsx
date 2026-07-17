import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { LOCALES } from "@/lib/nav";
import { listReports } from "@/lib/combat-report";

export function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const label = locale === "fr" ? "Rejeu de combat" : "Combat replay";
  return { title: `${label} — Quadrature` };
}

/** Verdict lisible d'un combat, du point de vue de la liste. */
function outcomeLabel(
  outcome: { kind: string; victorId?: string; rounds: number },
): string {
  if (outcome.kind === "victor") return `Victoire — ${outcome.victorId}`;
  if (outcome.kind === "mutual-incapacitation") return "Double incapacitation";
  return "Limite de manches atteinte";
}

/** "20260717-201918-…" → "17/07/2026 20:19". */
function formatStamp(id: string, iso: string): string {
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return id;
}

/**
 * Rubrique Rejeu de combat — la LISTE. Outil LOCAL : les rapports vivent dans
 * `simulator/combatReports/` (gitignoré), lus au build. Sans ce dossier (build
 * déployé), la liste est vide. Pas dans la navigation publique à dessein.
 */
export default async function CombatListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!LOCALES.find((l) => l.id === locale)) notFound();

  const reports = listReports();

  return (
    <main className="combat-list">
      <header className="combat-list__head">
        <h1>Rejeu de combat</h1>
        <p className="combat-list__sub">
          {reports.length === 0
            ? "Aucun rapport 1-run dans simulator/combatReports/. Lancez une simulation à un seul run pour en générer un."
            : `${reports.length} combat${reports.length > 1 ? "s" : ""} rejouable${reports.length > 1 ? "s" : ""}.`}
        </p>
      </header>

      <ul className="combat-list__items">
        {reports.map((r) => {
          const title = r.combatants.map((c) => c.charName).join(" contre ");
          return (
            <li key={r.id}>
              <Link href={`/${locale}/combat/${r.id}/`} className="combat-card">
                <div className="combat-card__title">{title}</div>
                <div className="combat-card__meta">
                  <span>{formatStamp(r.id, r.timestamp)}</span>
                  <span>·</span>
                  <span>{r.roundCount} manches</span>
                  {r.board && (
                    <>
                      <span>·</span>
                      <span className="combat-card__board">plateau {r.board.width}×{r.board.height}</span>
                    </>
                  )}
                </div>
                <div className="combat-card__outcome">{outcomeLabel(r.outcome)}</div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
