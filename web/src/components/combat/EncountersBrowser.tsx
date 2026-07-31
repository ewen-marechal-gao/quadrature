"use client";

/**
 * EncountersBrowser — navigateur maître/détail des rencontres du simulateur.
 *
 * Gauche : la liste des rencontres (scénarios YAML), avec le nombre de logs.
 * Droite : les logs de la rencontre sélectionnée — sélection multiple + suppression
 * (via le route handler DELETE /api/combat-reports), chaque log ouvrant le viewer
 * `/[locale]/encounters/[id]`.
 *
 * Rendu HYBRIDE : les données arrivent déjà lues côté serveur (page.tsx) ; ce
 * composant n'ajoute que l'interactivité (sélection, suppression) et déclenche un
 * `router.refresh()` après suppression pour re-lire le disque côté serveur.
 */

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/nav";
import type { EncounterGroup, ReportSummary, CombatOutcome } from "@/lib/combat-report";
import { TopBar } from "@/components/TopBar";
import "@/app/combat.css";

const ORPHAN_KEY = "__orphans__";
const keyOf = (g: EncounterGroup) => g.encounter.file || ORPHAN_KEY;

/** Verdict lisible d'un combat. */
function outcomeLabel(outcome: CombatOutcome): string {
  if (outcome.kind === "victor") return `Victoire — ${outcome.victorId}`;
  if (outcome.kind === "mutual-incapacitation") return "Double incapacitation";
  return "Limite de manches atteinte";
}

/** "20260717-201918-…" + ISO → "17/07/2026 20:19". */
function formatStamp(id: string, iso: string): string {
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return id;
}

/** Octets → "12 Ko" / "1,3 Mo". */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

export function EncountersBrowser({
  groups, locale,
}: {
  groups: EncounterGroup[];
  locale: Locale;
}) {
  const router = useRouter();

  // Clé de la rencontre active : la première avec des logs, sinon la première.
  const defaultKey = useMemo(() => {
    const withLogs = groups.find((g) => g.reports.length > 0);
    return keyOf(withLogs ?? groups[0] ?? { encounter: { file: "" } } as EncounterGroup);
  }, [groups]);

  const [activeKey, setActiveKey] = useState<string>(defaultKey);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const active = useMemo(
    () => groups.find((g) => keyOf(g) === activeKey) ?? groups.find((g) => keyOf(g) === defaultKey) ?? null,
    [groups, activeKey, defaultKey],
  );
  const reports = active?.reports ?? [];

  const totalLogs = useMemo(() => groups.reduce((n, g) => n + g.reports.length, 0), [groups]);

  const selectEncounter = useCallback((key: string) => {
    setActiveKey(key);
    setSelected(new Set()); // la sélection ne vaut que dans la liste visible
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allShownSelected = reports.length > 0 && reports.every((r) => selected.has(r.id));
  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (reports.length > 0 && reports.every((r) => prev.has(r.id))) return new Set();
      return new Set(reports.map((r) => r.id));
    });
  }, [reports]);

  const handleDelete = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0 || busy) return;
    if (!window.confirm(
      `Supprimer ${ids.length} log${ids.length > 1 ? "s" : ""} ? Cette action est irréversible.`,
    )) return;

    setBusy(true);
    try {
      const res = await fetch("/api/combat-reports", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelected(new Set());
      router.refresh(); // re-rend le Server Component → liste à jour
    } catch (e) {
      window.alert(`Échec de la suppression : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [selected, busy, router]);

  return (
    <>
      <TopBar locale={locale} page="Rencontres" />

    <main className="enc">
      <header className="enc-head">
        <p className="enc-sub">
          {groups.length === 0
            ? "Aucune rencontre dans simulator/encounters/."
            : `${groups.filter((g) => g.encounter.file).length} rencontre(s) · ${totalLogs} log(s) rejouable(s).`}
        </p>
      </header>

      <div className="enc-stage">
        {/* ── Maître : liste des rencontres ── */}
        <aside className="enc-master" aria-label="Rencontres">
          <ul className="enc-master__list">
            {groups.map((g) => {
              const k = keyOf(g);
              return (
                <li key={k}>
                  <button
                    className={k === activeKey ? "enc-item is-active" : "enc-item"}
                    onClick={() => selectEncounter(k)}
                    aria-current={k === activeKey}
                  >
                    <span className="enc-item__name">{g.encounter.name}</span>
                    <span className="enc-item__meta">
                      {g.encounter.board && (
                        <span className="enc-item__board">
                          {g.encounter.board.width}×{g.encounter.board.height}
                        </span>
                      )}
                      <span className={g.reports.length ? "enc-item__count" : "enc-item__count is-zero"}>
                        {g.reports.length}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── Détail : logs de la rencontre active ── */}
        <section className="enc-detail">
          {!active ? (
            <p className="enc-empty">Sélectionnez une rencontre.</p>
          ) : (
            <>
              <div className="enc-detail__head">
                <h2>{active.encounter.name}</h2>
                {active.encounter.description && (
                  <p className="enc-detail__desc">{active.encounter.description}</p>
                )}
                <div className="enc-detail__facts">
                  {active.encounter.factions.length > 0 && (
                    <span>{active.encounter.factions.join(" vs ")}</span>
                  )}
                  {active.encounter.board && (
                    <span>· plateau {active.encounter.board.width}×{active.encounter.board.height}</span>
                  )}
                  {active.encounter.maxRounds != null && (
                    <span>· max {active.encounter.maxRounds} manches</span>
                  )}
                </div>
              </div>

              {reports.length === 0 ? (
                <p className="enc-empty">
                  Aucun log pour cette rencontre. Lancez une simulation à un seul run pour en générer un.
                </p>
              ) : (
                <>
                  <div className="enc-actions">
                    <label className="enc-selall">
                      <input type="checkbox" checked={allShownSelected} onChange={toggleAll} />
                      Tout sélectionner
                    </label>
                    <button
                      className="enc-delete"
                      onClick={handleDelete}
                      disabled={selected.size === 0 || busy}
                    >
                      {busy ? "Suppression…" : `Supprimer la sélection (${selected.size})`}
                    </button>
                  </div>

                  <ul className="enc-logs">
                    {reports.map((r) => (
                      <LogRow
                        key={r.id}
                        report={r}
                        locale={locale}
                        checked={selected.has(r.id)}
                        onToggle={() => toggle(r.id)}
                      />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
    </>
  );
}

function LogRow({
  report, locale, checked, onToggle,
}: {
  report: ReportSummary;
  locale: Locale;
  checked: boolean;
  onToggle: () => void;
}) {
  const title = report.combatants.map((c) => c.charName).join(" contre ");
  return (
    <li className={checked ? "enc-log is-checked" : "enc-log"}>
      <input
        type="checkbox"
        className="enc-log__check"
        checked={checked}
        onChange={onToggle}
        aria-label={`Sélectionner ${title}`}
      />
      <Link href={`/${locale}/encounters/${report.id}/`} className="enc-log__link">
        <span className="enc-log__title">{title}</span>
        <span className="enc-log__meta">
          <span>{formatStamp(report.id, report.timestamp)}</span>
          <span>·</span>
          <span>{report.roundCount} manches</span>
          <span>·</span>
          <span>{outcomeLabel(report.outcome)}</span>
          <span>·</span>
          <span className="enc-log__size">{formatSize(report.sizeBytes)}</span>
        </span>
      </Link>
    </li>
  );
}
