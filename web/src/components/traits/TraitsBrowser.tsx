"use client";

/**
 * TraitsBrowser — la liste des traits de personnage, structurée.
 *
 * Rangement : caractéristique → compétence, l'ordre de la fiche de personnage.
 * C'est celui dans lequel un joueur cherche un trait, puisqu'un trait s'achète
 * en montant une compétence (rangs 3 et 5).
 *
 * Deux couches distinctes, jamais mélangées :
 *  · la PROSE (`effect`) — ce qui est imprimé, tel quel ;
 *  · la MÉCANIQUE (`grants`) — le bloc structuré que le simulateur lit vraiment.
 * Un trait sans mécanique est affiché comme tel : ce n'est pas un manque
 * d'affichage, c'est l'état réel du branchement moteur, et c'est une information.
 *
 * Les données arrivent lues côté serveur ; ce composant n'ajoute que le filtrage.
 */

import { useMemo, useState } from "react";
import type {
  TraitCharGroup, TraitEntry, ReactiveModeGrant, CostDeltaGrant,
} from "@/lib/traits";
import type { Locale } from "@/lib/nav";
import { TopBar } from "@/components/TopBar";
import {
  ToolBar, ToolChip, ToolGroup, ToolSearch, ToolSpacer, ToolToggle, ToolValue,
} from "@/components/ToolBar";
import "@/app/traits.css";

/** Déclencheurs ⚡ — mêmes libellés que le visualiseur de combat. */
const TRIGGER_LABEL: Record<string, string> = {
  "movement-initiated": "déplacement initié",
  "heavy-wound-taken": "blessure grave reçue",
  "phase-start": "avant la Bande I",
  "targeted-vs-guard": "ciblé contre la Garde",
};

const SCOPE_LABEL: Record<string, string> = {
  reach: "à portée de l'action",
  adjacent: "au contact (1 case)",
  self: "sur soi-même",
};

type KindFilter = "all" | "active" | "passive";

/** Coût en pictogrammes : 2⚫ 1⚡ 1💧. Vide si le coût est nul. */
function costPills(cost: { actions?: number; reactions?: number; fatigue?: number }): string[] {
  const out: string[] = [];
  if (cost.actions) out.push(`${cost.actions}⚫`);
  if (cost.reactions) out.push(`${cost.reactions}⚡`);
  if (cost.fatigue) out.push(`${cost.fatigue}💧`);
  return out.length > 0 ? out : ["gratuit"];
}

/** Delta signé : −1💧, +2⚫. */
function deltaPills(delta: CostDeltaGrant): string[] {
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const out: string[] = [];
  if (delta.actions) out.push(`${sign(delta.actions)}⚫`);
  if (delta.reactions) out.push(`${sign(delta.reactions)}⚡`);
  if (delta.fatigue) out.push(`${sign(delta.fatigue)}💧`);
  return out;
}

/** Recherche : nom, prose, action visée, compétence. */
function matches(t: TraitEntry, needle: string): boolean {
  if (!needle) return true;
  const hay = `${t.name} ${t.effect} ${t.actionName ?? ""} ${t.id}`.toLowerCase();
  return hay.includes(needle);
}

export function TraitsBrowser({
  groups, total, locale,
}: {
  groups: TraitCharGroup[];
  total: number;
  locale: Locale;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [wiredOnly, setWiredOnly] = useState(false);

  // Filtrage : on reconstruit l'arbre en élaguant les branches devenues vides.
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const keep = (t: TraitEntry) =>
      matches(t, needle)
      && (kind === "all" || t.kind === kind)
      && (!wiredOnly || Boolean(t.grants));

    return groups
      .map((c) => ({
        ...c,
        skills: c.skills
          .map((s) => ({ ...s, traits: s.traits.filter(keep) }))
          .filter((s) => s.traits.length > 0),
      }))
      .filter((c) => c.skills.length > 0);
  }, [groups, query, kind, wiredOnly]);

  const shownCount = useMemo(
    () => shown.flatMap((g) => g.skills).flatMap((s) => s.traits).length,
    [shown],
  );

  return (
    <div className="book-app">
      <TopBar locale={locale} page="Traits" />

      <ToolBar ariaLabel="Filtres des traits">
        <ToolSearch
          value={query}
          onChange={setQuery}
          placeholder="Rechercher un trait, une action, un effet…"
          ariaLabel="Rechercher un trait"
        />

        <ToolGroup label="Type" ariaLabel="Type de trait">
          {([
            ["all", "Tous"],
            ["active", "⚒️ Actifs"],
            ["passive", "♾️ Passifs"],
          ] as const).map(([id, label]) => (
            <ToolChip key={id} on={kind === id} onClick={() => setKind(id)}>
              {label}
            </ToolChip>
          ))}
        </ToolGroup>

        <ToolGroup>
          <ToolToggle checked={wiredOnly} onChange={setWiredOnly}>
            Simulés seulement
          </ToolToggle>
        </ToolGroup>

        <ToolSpacer />
        <ToolValue>{shownCount} / {total}</ToolValue>
      </ToolBar>

      <main className="trt">
        <div className="trt-inner">
      {shown.length > 1 && (
        <nav className="trt-jump" aria-label="Aller à une caractéristique">
          {shown.map((c) => (
            <a key={c.characteristic} href={`#trt-${c.characteristic}`} className="trt-jump__link">
              {c.charLabel}
            </a>
          ))}
        </nav>
      )}

      {shown.length === 0 ? (
        <p className="trt-empty">Aucun trait ne correspond à ces critères.</p>
      ) : (
        shown.map((c) => (
          <section key={c.characteristic} id={`trt-${c.characteristic}`} className="trt-char">
            <h2 className="trt-char__title">
              {c.charLabel}
              <span className={`trt-char__group trt-char__group--${c.group}`}>{c.group}</span>
            </h2>
            {c.skills.map((s) => (
              <div key={s.skill} className="trt-skill">
                <h3 className="trt-skill__title">
                  {s.skillLabel}
                  <span className="trt-skill__hint">rangs 3 et 5</span>
                </h3>
                <ul className="trt-list">
                  {s.traits.map((t) => (
                    <TraitCard key={t.id} trait={t} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
        </div>
      </main>
    </div>
  );
}

function TraitCard({ trait }: { trait: TraitEntry }) {
  const glyph = trait.kind === "active" ? "⚒️" : "♾️";
  return (
    <li className={trait.grants ? "trt-card is-wired" : "trt-card"}>
      <div className="trt-card__head">
        <span className="trt-card__glyph" title={trait.kind === "active" ? "Trait actif" : "Trait passif"}>
          {glyph}
        </span>
        <span className="trt-card__name">{trait.name}</span>
        {trait.actionName ? (
          <span className="trt-card__action">
            modifie <strong>{trait.actionName}</strong>
          </span>
        ) : trait.action ? (
          <span className="trt-card__action trt-card__action--unknown">
            modifie <strong>{trait.action}</strong>
          </span>
        ) : null}
      </div>

      <p className="trt-card__effect">{trait.effect}</p>

      {trait.grants?.reactiveMode && <ReactiveBlock mode={trait.grants.reactiveMode} />}
      {trait.grants?.costDelta && <CostBlock delta={trait.grants.costDelta} />}

      {!trait.grants && (
        <p className="trt-card__todo">
          Texte seul — pas encore branché dans le simulateur.
        </p>
      )}
    </li>
  );
}

/** Mode réactif ⚒️ : l'action gagne un déclencheur et un coût de réaction. */
function ReactiveBlock({ mode }: { mode: ReactiveModeGrant }) {
  return (
    <dl className="trt-mech">
      <div className="trt-mech__row">
        <dt>Mode</dt>
        <dd>
          <span className="trt-tag trt-tag--reaction">Réaction ⚡</span>
          <span className="trt-mech__note">
            s&apos;ajoute à l&apos;action, qui reste jouable normalement
          </span>
        </dd>
      </div>
      <div className="trt-mech__row">
        <dt>Déclencheur</dt>
        <dd>{TRIGGER_LABEL[mode.on] ?? mode.on}</dd>
      </div>
      <div className="trt-mech__row">
        <dt>Portée</dt>
        <dd>{SCOPE_LABEL[mode.scope ?? "reach"] ?? mode.scope}</dd>
      </div>
      <div className="trt-mech__row">
        <dt>Coût</dt>
        <dd>
          {costPills(mode.cost).map((p) => (
            <span key={p} className="trt-pill">{p}</span>
          ))}
        </dd>
      </div>
    </dl>
  );
}

/** Ajustement de coût ⚒️ : même action, autre prix. */
function CostBlock({ delta }: { delta: CostDeltaGrant }) {
  return (
    <dl className="trt-mech">
      <div className="trt-mech__row">
        <dt>Coût</dt>
        <dd>
          {deltaPills(delta).map((p) => (
            <span key={p} className="trt-pill trt-pill--delta">{p}</span>
          ))}
          <span className="trt-mech__note">sur le coût de base de l&apos;action</span>
        </dd>
      </div>
    </dl>
  );
}
