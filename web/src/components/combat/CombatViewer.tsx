"use client";

/**
 * CombatViewer — rejeu pas à pas d'un rapport de combat 1-run.
 *
 * L'unité de pas est la PHASE (un groupe d'initiative révélé) : c'est le grain
 * vraiment simultané du moteur. On avance phase après phase ; le plateau se
 * redessine à partir des `positions` que le log porte pour CHAQUE phase (le
 * visualiseur reste bête, aucune règle rejouée ici). Les vitaux affichés sont
 * ceux de FIN DE MANCHE (seule granularité enregistrée — décision assumée) ; le
 * journal de phase, lui, montre au pas fin ce qui vient de se passer.
 *
 * Reçoit le log déjà parsé en prop (le Server Component l'a lu au build). Ce
 * fichier n'importe QUE des types depuis combat-report (import type → aucun
 * node:fs ne fuit dans le bundle client).
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/nav";
import type {
  CombatLog, PhaseLog, Position, ActionLogEntry, RoundLog,
} from "@/lib/combat-report";
import { actionLabel, statusLabel, describeEffect, mentalIcon } from "@/lib/combat-labels";
import "@/app/combat.css";

// ─── Palette par faction ──────────────────────────────────────────────────────

const FACTION_COLORS = ["#c49a45", "#a03a2a", "#2e5f8f", "#3e7f44"];

const GUARD_LABELS: Record<string, string> = {
  absorb: "Encaisser", dodge: "Esquive", parry: "Parade", block: "Blocage",
};

// ─── Modèle de pas ────────────────────────────────────────────────────────────

interface Step {
  roundIdx: number;
  round: RoundLog;
  phase: PhaseLog;
  /** Positions à afficher pour ce pas (repli sur la dernière phase connue). */
  positions: Record<string, Position>;
  /** Positions au pas précédent — origine des trajectoires. */
  prev: Record<string, Position>;
}

function buildSteps(log: CombatLog): Step[] {
  const steps: Step[] = [];
  let last: Record<string, Position> = log.startPositions ?? {};
  for (let ri = 0; ri < log.rounds.length; ri++) {
    const round = log.rounds[ri];
    for (const phase of round.phases) {
      if (phase.actions.length === 0) continue;
      const positions = phase.positions ?? last;
      steps.push({ roundIdx: ri, round, phase, positions, prev: last });
      last = positions;
    }
  }
  return steps;
}

// ─── Plateau ──────────────────────────────────────────────────────────────────

function Board({
  log, step, colorOf,
}: {
  log: CombatLog;
  step: Step;
  colorOf: (id: string) => string;
}) {
  const board = log.board!;
  const acted = new Set(step.phase.actions.map((a) => a.actorId));
  const cx = (p: Position) => p.x + 0.5;
  const cy = (p: Position) => p.y + 0.5;

  // Trajectoires de cette phase : de la position précédente à travers le chemin.
  const trails: Array<{ id: string; pts: Position[] }> = [];
  for (const a of step.phase.actions) {
    for (const e of a.effects) {
      if (e.kind === "move" && Array.isArray(e.path) && e.path.length) {
        const from = step.prev[a.actorId];
        trails.push({ id: a.actorId, pts: from ? [from, ...e.path] : e.path });
      }
    }
  }

  const lines = [];
  for (let x = 0; x <= board.width; x++)
    lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={board.height} className="cbv-grid" />);
  for (let y = 0; y <= board.height; y++)
    lines.push(<line key={`h${y}`} x1={0} y1={y} x2={board.width} y2={y} className="cbv-grid" />);

  return (
    <svg
      className="cbv-board"
      viewBox={`-0.1 -0.1 ${board.width + 0.2} ${board.height + 0.2}`}
      role="img"
      aria-label={`Plateau ${board.width}×${board.height}`}
    >
      <rect x={0} y={0} width={board.width} height={board.height} className="cbv-board-bg" />
      {lines}

      {trails.map((t, i) => (
        <polyline
          key={`t${i}`}
          points={t.pts.map((p) => `${cx(p)},${cy(p)}`).join(" ")}
          className="cbv-trail"
          style={{ stroke: colorOf(t.id) }}
        />
      ))}

      {Object.entries(step.positions).map(([id, p]) => {
        const name = log.combatants.find((c) => c.id === id)?.charName ?? id;
        return (
          <g key={id} className={acted.has(id) ? "cbv-token cbv-token--acted" : "cbv-token"}>
            <title>{name}</title>
            {acted.has(id) && <circle cx={cx(p)} cy={cy(p)} r={0.46} className="cbv-token-ring" />}
            <circle cx={cx(p)} cy={cy(p)} r={0.38} style={{ fill: colorOf(id) }} />
            <text x={cx(p)} y={cy(p)} className="cbv-token-label">
              {name.slice(0, 1).toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Journal d'une action ─────────────────────────────────────────────────────

function ActionRow({
  entry, log, colorOf,
}: {
  entry: ActionLogEntry;
  log: CombatLog;
  colorOf: (id: string) => string;
}) {
  const actor = log.combatants.find((c) => c.id === entry.actorId)?.charName ?? entry.actorId;
  const target = entry.targetId
    ? log.combatants.find((c) => c.id === entry.targetId)?.charName ?? entry.targetId
    : null;

  const roll = entry.checkRoll ?? entry.adversaryRoll;
  const total = roll?.total;
  const crit = entry.checkRoll?.critical;
  const flaw = entry.checkRoll?.flaw;

  const chips = entry.effects
    .map(describeEffect)
    .filter((s): s is string => !!s && s !== "move-toward");

  return (
    <li className="cbv-act">
      <div className="cbv-act__head">
        <span className="cbv-act__actor" style={{ color: colorOf(entry.actorId) }}>{actor}</span>
        <span className="cbv-act__verb">{actionLabel(entry.action)}</span>
        {target && entry.targetId !== entry.actorId && (
          <span className="cbv-act__target">
            → {target}{entry.targetPart ? ` (${entry.targetPart})` : ""}
          </span>
        )}
        <span className={`cbv-act__result ${entry.hit ? "is-hit" : "is-miss"}`}>
          {entry.hit ? "touche" : "manque"}
        </span>
      </div>

      <div className="cbv-act__rolls">
        {typeof total === "number" && (
          <span className="cbv-roll">
            🎲 {total}
            {crit && <span className="cbv-flag is-crit"> ✦</span>}
            {flaw && <span className="cbv-flag is-flaw"> ✖</span>}
            {typeof entry.threshold === "number" && entry.threshold > 0 && (
              <span className="cbv-vs"> / seuil {entry.threshold}</span>
            )}
          </span>
        )}
        {entry.guardId && (
          <span className="cbv-guard">
            {GUARD_LABELS[entry.guardId] ?? entry.guardId}
            {typeof entry.guardRoll?.total === "number" && ` 🎲 ${entry.guardRoll.total}`}
          </span>
        )}
      </div>

      {chips.length > 0 && (
        <div className="cbv-act__chips">
          {chips.map((c, i) => <span key={i} className="cbv-chip">{c}</span>)}
        </div>
      )}

      {entry.notes.length > 0 && (
        <ul className="cbv-act__notes">
          {entry.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </li>
  );
}

// ─── Vitaux (fin de manche) ───────────────────────────────────────────────────

function Vitals({ log, round, colorOf }: { log: CombatLog; round: RoundLog; colorOf: (id: string) => string }) {
  const pc = new Map(round.endOfRound.map((s) => [s.id, s]));
  const adv = new Map((round.adversariesEndOfRound ?? []).map((s) => [s.id, s]));

  return (
    <div className="cbv-vitals">
      {log.combatants.map((c) => {
        const p = pc.get(c.id);
        const a = adv.get(c.id);
        return (
          <div key={c.id} className="cbv-vital">
            <div className="cbv-vital__name" style={{ color: colorOf(c.id) }}>{c.charName}</div>
            {p && (
              <div className="cbv-vital__row">
                {p.heavyWounds > 0 && <span title="blessures graves">{p.heavyWounds}💔</span>}
                <span title="blessures légères">{p.lightWounds}💢</span>
                <span title="fatigue">{p.fatigue}💧</span>
                {p.bleed > 0 && <span title="hémorragie">{p.bleed}🩸</span>}
                {mentalIcon(p.mentalState) && <span title={p.mentalState}>{mentalIcon(p.mentalState)}</span>}
                {p.status.map((s) => <span key={s} className="cbv-vital__status">{statusLabel(s)}</span>)}
              </div>
            )}
            {a && (
              <div className="cbv-vital__row">
                <span title="fatigue">{a.fatigue}/{a.fatigueMax}💧</span>
                {(() => {
                  const destroyed = a.parts.filter((pt) => pt.destroyed).length;
                  return destroyed > 0 ? <span title="parties détruites">{destroyed}✖</span> : null;
                })()}
                {a.bleed > 0 && <span title="hémorragie">{a.bleed}🩸</span>}
                {a.winded && <span title="essoufflé">😮‍💨</span>}
                {a.stunned && <span title="sonné">💫</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Composant racine ─────────────────────────────────────────────────────────

export function CombatViewer({ log, locale }: { log: CombatLog; locale: Locale }) {
  const steps = useMemo(() => buildSteps(log), [log]);
  const [i, setI] = useState(0);

  const colorOf = useMemo(() => {
    const factions: string[] = [];
    for (const c of log.combatants) {
      const f = c.faction ?? c.id;
      if (!factions.includes(f)) factions.push(f);
    }
    const byId = new Map<string, string>();
    for (const c of log.combatants) {
      const idx = factions.indexOf(c.faction ?? c.id);
      byId.set(c.id, FACTION_COLORS[idx % FACTION_COLORS.length]);
    }
    return (id: string) => byId.get(id) ?? "#888";
  }, [log]);

  const clamp = useCallback((n: number) => Math.max(0, Math.min(steps.length - 1, n)), [steps.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((v) => clamp(v + 1));
      else if (e.key === "ArrowLeft") setI((v) => clamp(v - 1));
      else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(steps.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clamp, steps.length]);

  const title = log.combatants.map((c) => c.charName).join(" contre ");

  if (steps.length === 0) {
    return (
      <main className="cbv">
        <Link href={`/${locale}/combat/`} className="cbv-back">← Tous les combats</Link>
        <h1>{title}</h1>
        <p className="cbv-empty">Ce rapport ne contient aucune phase jouée.</p>
      </main>
    );
  }

  const step = steps[i];
  const band = step.phase.band;

  return (
    <main className="cbv">
      <Link href={`/${locale}/combat/`} className="cbv-back">← Tous les combats</Link>
      <header className="cbv-head">
        <h1>{title}</h1>
        <div className="cbv-locus">
          <span className="cbv-locus__round">Manche {step.round.round}</span>
          {band && <span className="cbv-locus__band">Bande {band}</span>}
          <span className="cbv-locus__init">init {step.phase.initiative}</span>
        </div>
      </header>

      <div className="cbv-stage">
        {log.board ? (
          <div className="cbv-boardwrap">
            <Board log={log} step={step} colorOf={colorOf} />
          </div>
        ) : (
          <div className="cbv-noboard">Combat sans plateau — aucun modèle spatial.</div>
        )}

        <section className="cbv-side">
          <ul className="cbv-acts">
            {step.phase.actions.map((a, k) => (
              <ActionRow key={k} entry={a} log={log} colorOf={colorOf} />
            ))}
          </ul>
          <div className="cbv-vitals-head">Bilan — fin de la manche {step.round.round}</div>
          <Vitals log={log} round={step.round} colorOf={colorOf} />
        </section>
      </div>

      <nav className="cbv-controls">
        <button onClick={() => setI(0)} disabled={i === 0} aria-label="Début">⏮</button>
        <button onClick={() => setI(clamp(i - 1))} disabled={i === 0} aria-label="Précédent">◀</button>
        <input
          type="range" min={0} max={steps.length - 1} value={i}
          onChange={(e) => setI(Number(e.target.value))}
          className="cbv-scrub" aria-label="Curseur de phase"
        />
        <button onClick={() => setI(clamp(i + 1))} disabled={i === steps.length - 1} aria-label="Suivant">▶</button>
        <button onClick={() => setI(steps.length - 1)} disabled={i === steps.length - 1} aria-label="Fin">⏭</button>
        <span className="cbv-counter">{i + 1} / {steps.length}</span>
      </nav>
    </main>
  );
}
