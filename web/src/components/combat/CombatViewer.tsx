"use client";

/**
 * CombatViewer — rejeu d'un rapport de combat 1-run, MANCHE par MANCHE.
 *
 * Navigation par boutons de manche (précédés d'un bouton « Rencontre » = état
 * initial). La manche sélectionnée se lit comme un LOG vertical façon chat : PJ
 * à droite, adversaires à gauche, ses trois bandes séparées par un trait nommé
 * (Ouverture / Manœuvre / Fermeture). Le plateau, à gauche, montre l'état en FIN
 * de manche + les trajectoires ; la liste des acteurs (vitaux, physique | mental)
 * est posée dessous.
 *
 * Le visualiseur reste bête : positions, chemins et MAXES viennent du log (les
 * snapshots sont auto-suffisants). Reçoit le log déjà parsé ; n'importe QUE des
 * types de combat-report (import type → aucun node:fs dans le bundle client).
 */

import { useEffect, useMemo, useState, useCallback, useRef, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/nav";
import type {
  CombatLog, Position, ActionLogEntry, RoundLog,
  CombatantSnapshot, AdversarySnapshot, PlanningEntry,
} from "@/lib/combat-report";
import type { CombatCards } from "@/lib/combat-cards";
import type { ActionCard as CardData } from "@/lib/cards";
import { actionLabel, statusLabel, describeEffect, mentalIcon } from "@/lib/combat-labels";
import { ActionCard } from "@/components/ActionCard";
import "@/app/combat.css";
import "@/app/cards.css";

// ─── Constantes d'affichage ───────────────────────────────────────────────────

const FACTION_COLORS = ["#c49a45", "#a03a2a", "#2e5f8f", "#3e7f44"];

const GUARD_LABELS: Record<string, string> = {
  absorb: "Encaisser", dodge: "Esquive", parry: "Parade", block: "Blocage",
};

const BAND_NAME: Record<string, string> = {
  I: "Ouverture", II: "Manœuvre", III: "Fermeture", other: "Hors bande",
};
const BAND_ORDER = ["I", "II", "III", "other"];

/** "x / y", en omettant "/ y" quand le max est absent (vieux rapports). */
const overMax = (v: number, max?: number) => (max != null ? `${v}/${max}` : `${v}`);

// ─── Modèle par manche ────────────────────────────────────────────────────────

interface Entry { entry: ActionLogEntry; initiative: number }
interface BandGroup { key: string; name: string; entries: Entry[] }
interface Trail { id: string; pts: Position[] }
interface RoundView {
  round: RoundLog;
  groups: BandGroup[];
  endPos: Record<string, Position>;
  trails: Trail[];
}

function buildRounds(log: CombatLog): RoundView[] {
  const views: RoundView[] = [];
  let last: Record<string, Position> = log.startPositions ?? {};

  for (const round of log.rounds) {
    const byBand = new Map<string, Entry[]>();
    const trails: Trail[] = [];
    let pos: Record<string, Position> = last;

    for (const phase of round.phases) {
      for (const a of phase.actions) {
        const key = phase.band ?? "other";
        if (!byBand.has(key)) byBand.set(key, []);
        byBand.get(key)!.push({ entry: a, initiative: phase.initiative });
        for (const e of a.effects) {
          if (e.kind === "move" && Array.isArray(e.path) && e.path.length) {
            const from = pos[a.actorId];
            trails.push({ id: a.actorId, pts: from ? [from, ...e.path] : e.path });
          }
        }
      }
      if (phase.positions) pos = phase.positions;
    }
    last = pos;

    const groups = BAND_ORDER
      .filter((k) => byBand.has(k))
      .map((k) => ({ key: k, name: BAND_NAME[k], entries: byBand.get(k)! }));

    views.push({ round, groups, endPos: pos, trails });
  }
  return views;
}

// ─── Plateau ──────────────────────────────────────────────────────────────────

function Board({
  log, positions, trails, colorOf,
}: {
  log: CombatLog;
  positions: Record<string, Position>;
  trails: Trail[];
  colorOf: (id: string) => string;
}) {
  const board = log.board!;
  const cx = (p: Position) => p.x + 0.5;
  const cy = (p: Position) => p.y + 0.5;

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
      {Object.entries(positions).map(([id, p]) => {
        const name = log.combatants.find((c) => c.id === id)?.charName ?? id;
        return (
          <g key={id} className="cbv-token">
            <title>{name}</title>
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

// ─── Détail des dés (onOver) ──────────────────────────────────────────────────

function diceDetail(entry: ActionLogEntry): { line: string; values: string }[] | null {
  if (entry.checkRoll?.rolls) {
    const r = entry.checkRoll.rolls;
    const k = entry.checkRoll.kept;
    const all = [...(r.characteristic ?? []), ...(r.skill ?? []), ...(r.wild ?? [])];
    const keptVals = k
      ? [k.characteristic, ...(k.skill ?? []), k.wild].filter(Boolean).map((d) => d!.value)
      : [];
    return [
      { line: "Retenus", values: keptVals.join(" · ") },
      { line: "Lancés", values: all.map((d) => d.value).join(", ") },
    ];
  }
  if (entry.adversaryRoll?.values) {
    const faces = entry.adversaryRoll.dice ?? [];
    const vals = entry.adversaryRoll.values;
    return [{ line: "Dés", values: vals.map((v, i) => `${faces[i] ?? "?"} ${v}`).join(" · ") }];
  }
  return null;
}

/** Une valeur survolable : contenu principal + bulle de détail au survol. */
function Hint({ children, detail }: { children: ReactNode; detail: ReactNode }) {
  return (
    <span className="cbv-hint" tabIndex={0}>
      {children}
      <span className="cbv-hint__pop" role="tooltip">{detail}</span>
    </span>
  );
}

/**
 * Nom d'action survolable → carte réelle en médaillon (même composant que /cartes).
 * Le médaillon s'ouvre AU-DESSUS par défaut, mais bascule EN DESSOUS quand il n'y
 * a pas assez de place au-dessus (sinon la carte est rognée en haut d'écran).
 */
function CardPopover({ card, side, children }: {
  card: CardData; side: "pc" | "adv"; children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [place, setPlace] = useState<"top" | "bottom">("top");

  // Hauteur du médaillon = 240px × ratio carte (63.5/88.9) ≈ 336, + marge.
  const CARD_HEIGHT = 348;
  const decide = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPlace(r.top < CARD_HEIGHT ? "bottom" : "top");
  }, []);

  return (
    <span
      ref={ref}
      className={`cbv-cardwrap cbv-cardwrap--${side} cbv-cardwrap--${place}`}
      tabIndex={0}
      onMouseEnter={decide}
      onFocus={decide}
    >
      {children}
      <span className="cbv-cardpop" role="tooltip">
        <ActionCard card={card} />
      </span>
    </span>
  );
}

// ─── Un message (encadré d'action, aligné par faction) ────────────────────────

function ActionMessage({
  entry, initiative, log, colorOf, side, card,
}: {
  entry: ActionLogEntry;
  initiative: number;
  log: CombatLog;
  colorOf: (id: string) => string;
  side: "pc" | "adv";
  card?: CardData;
}) {
  const actor = log.combatants.find((c) => c.id === entry.actorId)?.charName ?? entry.actorId;
  const target = entry.targetId
    ? log.combatants.find((c) => c.id === entry.targetId)?.charName ?? entry.targetId
    : null;

  const roll = entry.checkRoll ?? entry.adversaryRoll;
  const total = roll?.total;
  const crit = entry.checkRoll?.critical;
  const flaw = entry.checkRoll?.flaw;
  const hasRoll = !!roll;
  const detail = diceDetail(entry);

  // On ÉCARTE `spend-reaction` : c'est la réaction ⚡ dépensée par le DÉFENSEUR
  // pour sa garde (déjà affichée sur la ligne de garde), pas un effet de l'action.
  const chips = entry.effects
    .filter((e) => e.kind !== "spend-reaction")
    .map(describeEffect)
    .filter((s): s is string => !!s && s !== "move-toward");

  return (
    <div className={`cbv-msg cbv-msg--${side}`}>
      <div className="cbv-act" style={{ "--accent": colorOf(entry.actorId) } as CSSProperties}>
        <div className="cbv-act__head">
          <span className="cbv-act__actor" style={{ color: colorOf(entry.actorId) }}>{actor}</span>
          {card ? (
            <CardPopover card={card} side={side}>
              {/* Nom de la CARTE réelle : évite d'entretenir un libellé séparé. */}
              <span className="cbv-act__verb cbv-act__verb--card">{card.nom}</span>
            </CardPopover>
          ) : (
            <span className="cbv-act__verb">{actionLabel(entry.action)}</span>
          )}
          {target && entry.targetId !== entry.actorId && (
            <span className="cbv-act__target">
              → {target}{entry.targetPart ? ` (${entry.targetPart})` : ""}
            </span>
          )}
          <span className="cbv-act__init" title="initiative">init {initiative}</span>
        </div>

        {(hasRoll || entry.guardId) && (
          <div className="cbv-act__rolls">
            {typeof total === "number" && (
              detail ? (
                <Hint detail={
                  <span className="cbv-dice">
                    {detail.map((d, i) => (
                      <span key={i}><b>{d.line} :</b> {d.values}</span>
                    ))}
                  </span>
                }>
                  <span className="cbv-roll cbv-roll--hint">
                    🎲 {total}
                    {crit && <span className="cbv-flag is-crit"> ✦</span>}
                    {flaw && <span className="cbv-flag is-flaw"> ✖</span>}
                  </span>
                </Hint>
              ) : (
                <span className="cbv-roll">🎲 {total}</span>
              )
            )}
            {typeof entry.threshold === "number" && entry.threshold > 0 && (
              <span className="cbv-vs">seuil {entry.threshold}</span>
            )}
            {entry.guardId && (
              <span className="cbv-guard">
                {GUARD_LABELS[entry.guardId] ?? entry.guardId}
                {typeof entry.guardRoll?.total === "number" && ` 🎲 ${entry.guardRoll.total}`}
              </span>
            )}
            {hasRoll && (
              <span className={`cbv-result ${entry.hit ? "is-hit" : "is-miss"}`}>
                {entry.hit ? "touche" : "manque"}
              </span>
            )}
          </div>
        )}

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
      </div>
    </div>
  );
}

// ─── Vitaux : une carte par acteur (physique | mental) ────────────────────────

function PcCard({ s }: { s: CombatantSnapshot }) {
  return (
    <>
      <div className="cbv-actor__cols">
        <div className="cbv-actor__col">
          <span className="cbv-actor__legend">physique</span>
          <span title="fatigue">{s.fatigue}💧</span>
          <span title="armure">{s.protection + s.tempProtection}🛡️</span>
          <span title="blessures légères / seuil de résistance">{overMax(s.lightWounds, s.resistance)}💢</span>
          <span title="blessures graves / capacité">{overMax(s.heavyWounds, s.heavyCapacity)}💔</span>
        </div>
        <div className="cbv-actor__col cbv-actor__col--mental">
          <span className="cbv-actor__legend">mental</span>
          <span title="stabilité ◇ / max">{overMax(s.stability, s.stabilityMax)}◇</span>
          <span title={s.mentalState}>{mentalIcon(s.mentalState)} {s.mentalState}</span>
          <span title="traumas / capacité">{overMax(s.mentalWounds ?? 0, s.mentalCapacity)} 🧠</span>
        </div>
      </div>
      {s.status.length > 0 && (
        <div className="cbv-actor__states">
          {s.status.map((st) => <span key={st} className="cbv-actor__status">{statusLabel(st)}</span>)}
        </div>
      )}
    </>
  );
}

function AdvCard({ s }: { s: AdversarySnapshot }) {
  const marked = s.parts.reduce((n, p) => n + p.marked, 0);
  const destroyed = s.parts.filter((p) => p.destroyed).length;
  return (
    <>
      <div className="cbv-actor__cols">
        <div className="cbv-actor__col">
          <span className="cbv-actor__legend">physique</span>
          <span title="endurance 🫁 / max">{overMax(s.endurance, s.enduranceMax)}🫁</span>
          <span title="fatigue / horloge">{s.fatigue}/{s.fatigueMax}💧</span>
          {s.armorTotal != null && <span title="armure totale">{s.armorTotal}🛡️</span>}
          <span title="blessures subies (cases)">{marked}💢</span>
          <span title="blocs détruits / total">{destroyed}/{s.parts.length}✖</span>
        </div>
        <div className="cbv-actor__col cbv-actor__col--mental">
          <span className="cbv-actor__legend">mental</span>
          <span title="stabilité ◇ / max">{overMax(s.stability, s.stabilityMax)}◇</span>
          <span title={s.mentalState}>{s.mentalState}</span>
        </div>
      </div>

      <div className="cbv-actor__parts">
        {s.parts.map((p) => (
          <Hint
            key={p.type}
            detail={
              <span className="cbv-parts-pop">
                <b>{p.type}</b> — {p.marked}/{p.total}
                {p.armor ? ` · ${p.armor}🛡️` : ""}
                {p.confers && p.confers.length > 0 && (
                  <><br />confère : {p.confers.join(", ")}</>
                )}
              </span>
            }
          >
            <span className={p.destroyed ? "cbv-part is-destroyed" : "cbv-part"}>{p.type}</span>
          </Hint>
        ))}
      </div>

      {(s.winded || s.stunned || s.destabilized) && (
        <div className="cbv-actor__states">
          {s.winded && <span className="cbv-actor__status">😮‍💨 essoufflé</span>}
          {s.stunned && <span className="cbv-actor__status">💫 sonné</span>}
          {s.destabilized && <span className="cbv-actor__status">déstabilisé</span>}
        </div>
      )}
    </>
  );
}

/** Nom lisible d'une action d'un plan : nom de carte réel si résolu, sinon libellé. */
function planActionName(action: string, side: "pc" | "adv", cards?: CombatCards): string {
  const map = side === "adv" ? cards?.adversary : cards?.player;
  return map?.[action]?.nom ?? actionLabel(action);
}

/**
 * Badge 🧠 (coin supérieur droit d'une fiche) : au survol, les 3 meilleurs plans
 * que le planificateur a pesés pour cet acteur, avec leur utilité ; le plan
 * retenu est mis en évidence.
 */
function PlanningBadge({
  entry, side, cards,
}: {
  entry: PlanningEntry;
  side: "pc" | "adv";
  cards?: CombatCards;
}) {
  return (
    <span className="cbv-plan-badge" tabIndex={0} aria-label="Plans du planificateur">
      🧠
      <span className="cbv-plan-pop" role="tooltip">
        <span className="cbv-plan-pop__title">Plans pesés — meilleure utilité</span>
        {entry.plans.map((p, i) => (
          <span key={i} className={p.chosen ? "cbv-plan is-chosen" : "cbv-plan"}>
            <span className="cbv-plan__util">{p.utility.toFixed(2)}</span>
            <span className="cbv-plan__acts">
              {p.actions.length === 0
                ? "— passe —"
                : p.actions.map((a) => planActionName(a.action, side, cards)).join(" → ")}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

function Actors({
  log, round, colorOf, isAdversary, cards,
}: {
  log: CombatLog;
  round: RoundLog | null;
  colorOf: (id: string) => string;
  isAdversary: (id: string) => boolean;
  cards?: CombatCards;
}) {
  const pc = new Map((round?.endOfRound ?? []).map((s) => [s.id, s]));
  const adv = new Map((round?.adversariesEndOfRound ?? []).map((s) => [s.id, s]));
  const plans = new Map((round?.planning ?? []).map((e) => [e.actorId, e]));

  return (
    <div className="cbv-actors">
      <div className="cbv-actors__head">
        {round ? `Acteurs — fin de la manche ${round.round}` : "Acteurs — état initial"}
      </div>
      {log.combatants.map((c) => {
        const p = pc.get(c.id);
        const a = adv.get(c.id);
        const plan = plans.get(c.id);
        return (
          <div key={c.id} className="cbv-actor">
            <div className="cbv-actor__name" style={{ color: colorOf(c.id) }}>{c.charName}</div>
            {plan && plan.plans.length > 0 && (
              <PlanningBadge entry={plan} side={isAdversary(c.id) ? "adv" : "pc"} cards={cards} />
            )}
            {p && <PcCard s={p} />}
            {a && <AdvCard s={a} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Composant racine ─────────────────────────────────────────────────────────

export function CombatViewer({
  log, locale, cards,
}: {
  log: CombatLog;
  locale: Locale;
  cards?: CombatCards;
}) {
  const views = useMemo(() => buildRounds(log), [log]);
  // r = -1 → « Rencontre » (état initial) ; 0..N-1 → manche.
  const [r, setR] = useState(0);

  const isAdversary = useMemo(() => {
    const ids = new Set<string>();
    for (const round of log.rounds)
      for (const s of round.adversariesEndOfRound ?? []) ids.add(s.id);
    return (id: string) => ids.has(id);
  }, [log]);

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

  const clamp = useCallback((n: number) => Math.max(-1, Math.min(views.length - 1, n)), [views.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setR((v) => clamp(v + 1));
      else if (e.key === "ArrowLeft") setR((v) => clamp(v - 1));
      else if (e.key === "Home") setR(-1);
      else if (e.key === "End") setR(views.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clamp, views.length]);

  const title = log.combatants.map((c) => c.charName).join(" contre ");

  if (views.length === 0) {
    return (
      <main className="cbv">
        <Link href={`/${locale}/combat/`} className="cbv-back">← Tous les combats</Link>
        <h1>{title}</h1>
        <p className="cbv-empty">Ce rapport ne contient aucune manche jouée.</p>
      </main>
    );
  }

  const atStart = r < 0;
  const view = atStart ? null : views[r];
  const boardPositions = view ? view.endPos : (log.startPositions ?? {});
  const boardTrails = view ? view.trails : [];

  const logBody = (
    <section className="cbv-log">
      {atStart ? (
        <p className="cbv-empty">La rencontre commence. Sélectionnez une manche pour la rejouer.</p>
      ) : (
        view!.groups.length === 0 ? <p className="cbv-empty">Manche sans action.</p> :
        view!.groups.map((g) => (
          <div key={g.key} className="cbv-band">
            <div className="cbv-bandsep"><span>{g.name}</span></div>
            {g.entries.map((e, i) => {
              const side = isAdversary(e.entry.actorId) ? "adv" : "pc";
              const card = side === "adv"
                ? cards?.adversary[e.entry.action]
                : cards?.player[e.entry.action];
              return (
                <ActionMessage
                  key={i}
                  entry={e.entry}
                  initiative={e.initiative}
                  log={log}
                  colorOf={colorOf}
                  side={side}
                  card={card}
                />
              );
            })}
          </div>
        ))
      )}
    </section>
  );

  const actors = (
    <Actors
      log={log}
      round={view ? view.round : null}
      colorOf={colorOf}
      isAdversary={isAdversary}
      cards={cards}
    />
  );

  return (
    <main className="cbv">
      <Link href={`/${locale}/combat/`} className="cbv-back">← Tous les combats</Link>
      <header className="cbv-head">
        <h1>{title}</h1>
      </header>

      <nav className="cbv-rounds" aria-label="Manches">
        <button
          className={atStart ? "cbv-round cbv-round--enc is-active" : "cbv-round cbv-round--enc"}
          onClick={() => setR(-1)}
          aria-current={atStart}
        >
          Rencontre
        </button>
        {views.map((v, idx) => (
          <button
            key={idx}
            className={idx === r ? "cbv-round is-active" : "cbv-round"}
            onClick={() => setR(idx)}
            aria-current={idx === r}
            aria-label={`Manche ${v.round.round}`}
          >
            {v.round.round}
          </button>
        ))}
      </nav>

      {log.board ? (
        <div className="cbv-stage">
          <aside className="cbv-left">
            <div className="cbv-boardwrap">
              <Board log={log} positions={boardPositions} trails={boardTrails} colorOf={colorOf} />
            </div>
            {actors}
          </aside>
          {logBody}
        </div>
      ) : (
        <div className="cbv-stage cbv-stage--noboard">
          {logBody}
          {actors}
        </div>
      )}
    </main>
  );
}
