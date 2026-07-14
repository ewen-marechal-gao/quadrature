"use client";

/**
 * Faces d'une fiche d'adversaire.
 *
 * Source : rules/{locale}/adversaires/bestiaire/*.card.yaml (cf. lib/bestiary.ts,
 * qui résout la locale). Le schéma et les règles sont documentés dans
 * rules/fr/adversaires/regles_adversaires.md.
 *
 * Exporte :
 *   - AdversaryStatBlock — recto : feuille A5 paysage (stats + parties du corps)
 *   - AdversaryVerso     — verso : illustration de la créature (ou placeholder)
 *   - AdversaryDeck      — deck d'actions (composant ActionCard partagé)
 *   - AdversarySheet     — composition écran (recto + deck)
 *
 * Tout est scopé sous les classes `.adv-*` pour ne pas fuiter dans le site.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Adversary, AdversaryDie, AdversaryTrait, BlockResource, BodyPart } from "@/lib/bestiary";
import { adversaryCardToPlayerCard, conferringBlocks } from "@/lib/adversary-card";
import { ActionCard } from "@/components/ActionCard";
import "@/app/adversaries.css";

// useLayoutEffect côté client (mesure avant peinture) ; useEffect au rendu serveur.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Scale-to-fit : compare le contenu naturel de la fiche au cadre A5 fixe et
 * renvoie un facteur ≤ 1 pour que TOUT tienne (aucun clipping), quelle que soit
 * la densité de la créature. En mode fluide (étroit, aspect auto) le cadre suit
 * le contenu → facteur 1 (pas de mise à l'échelle).
 */
function useFitScale() {
  const frameRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useIsoLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;
    const measure = () => {
      const cw = content.scrollWidth;
      const ch = content.scrollHeight; // taille NATURELLE (le transform n'affecte pas le layout)
      if (!cw || !ch) return;
      const s = Math.min(1, frame.clientWidth / cw, frame.clientHeight / ch);
      setScale((prev) => (Math.abs(prev - s) > 0.004 ? s : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    ro.observe(content);
    return () => ro.disconnect();
  }, []);
  return { frameRef, contentRef, scale };
}

/** Glyphe d'un dé d'adversaire. */
export const DIE_GLYPH: Record<AdversaryDie, string> = {
  nuisance: "🟧",
  threat: "⬜",
  danger: "🟫",
};

/** Ressources conférées « au début de la manche » : icône + libellé + ordre. */
const RES_META: Record<BlockResource, { icon: string; label: string }> = {
  endurance: { icon: "🫁", label: "Respiration" },
  evasion: { icon: "🍀", label: "Évasion" },
  stability: { icon: "◇", label: "Stabilité" },
};
const RES_ORDER: BlockResource[] = ["endurance", "evasion", "stability"];

/** Une contribution de ressource, adossée à son bloc source (destructible). */
interface ResSource { label: string; amount: number }
interface ResGroup { resource: BlockResource; sources: ResSource[] }

/**
 * Agrège, par ressource, les points conférés au début de chaque manche par les
 * blocs intacts (parties + armes). CHAQUE contribution garde son bloc source :
 * le rendu affiche un jeton par point, de sorte que le total se lise comme la
 * SOMME de contributions destructibles (détruire le bloc en retire d'autant).
 */
function summarizeResources(parts: BodyPart[]): ResGroup[] {
  const groups = new Map<BlockResource, ResSource[]>();
  for (const p of parts) {
    for (const b of p.blocks) {
      if (!b.resource || !b.amount) continue;
      const list = groups.get(b.resource) ?? [];
      list.push({ label: b.name ? `${p.name} · ${b.name}` : p.name, amount: b.amount });
      groups.set(b.resource, list);
    }
  }
  return RES_ORDER.filter((r) => groups.has(r)).map((r) => ({ resource: r, sources: groups.get(r)! }));
}

/**
 * Encadré « Phase d'entretien » (pleine largeur, en tête) : ressources régénérées
 * au début du tour. Chaque point est un jeton adossé à son bloc source — le total
 * se lit comme une somme de contributions destructibles, pas une valeur figée.
 */
function MaintenancePanel({ groups }: { groups: ResGroup[] }) {
  return (
    <section className="adv-maintenance">
      <div className="adv-section-label">Phase d'entretien</div>
      <div className="adv-maintenance-body">
        <ul className="adv-roundstart-list">
          {groups.map((g) => (
            <li key={g.resource} className="adv-res">
              <span className="adv-res-icon" aria-hidden>{RES_META[g.resource].icon}</span>
              <span className="adv-res-pips">
                {g.sources.flatMap((s, si) =>
                  Array.from({ length: s.amount }, (_, k) => (
                    <span key={`${si}-${k}`} className="adv-res-pip" title={s.label} />
                  ))
                )}
              </span>
              <span className="adv-res-name">{RES_META[g.resource].label}</span>
            </li>
          ))}
        </ul>        
      </div>
    </section>
  );
}

/** Glyphe d'un type de trait (♾️ passif / ⚒️ actif). */
const KIND_GLYPH: Record<AdversaryTrait["kind"], string> = {
  passive: "♾️",
  active: "⚒️",
};

/** Rangée de cases ▢ vides. */
function Boxes({ count }: { count: number }) {
  return (
    <span className="adv-boxes" aria-label={`${count} cases`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="adv-box" />
      ))}
    </span>
  );
}

/**
 * Fatigue : ligne étiquetée (même format que la Ténacité) — toutes les cases sur
 * UNE ligne, coupée en deux groupes. Chaque groupe se termine par l'icône du
 * seuil qu'il fait franchir :
 *   - fin du 1ᵉʳ groupe → 😮‍💨 Essoufflé (au-delà de la moitié : −1 ⚫, plancher 1)
 *   - fin du 2ᵉ groupe  → 😵‍💫 Inconscient (piste pleine : hors de combat)
 */
function FatigueTrack({ total }: { total: number }) {
  const first = Math.floor(total / 2);
  const second = total - first;
  return (
    <div className="adv-fatigue">
      <span className="adv-fatigue-label">💧 Fatigue</span>
      <div className="adv-fatigue-groups">
        <span className="adv-fatigue-group">
          <Boxes count={first} />
          <span className="adv-fatigue-milestone" title="Essoufflé : −1 ⚫ (jamais moins de 1)">
            😮‍💨
          </span>
        </span>
        <span className="adv-fatigue-group">
          <Boxes count={second} />
          <span className="adv-fatigue-milestone" title="Inconscient : hors de combat">
            😵‍💫
          </span>
        </span>
      </div>
    </div>
  );
}

/** Encadré « Défenses » : la garde — seuil fixe que l'attaquant doit atteindre. */
function DefensePanel({ guard }: { guard: Adversary["guard"] }) {
  return (
    <div className="adv-defense">
      <div className="adv-section-label">Défenses</div>
      <div className="adv-defense-row">
        <span className="adv-defense-name">Garde</span>
        <strong className="adv-defense-value">{guard.value}</strong>
        <span className="adv-defense-kind">({guard.label.toLowerCase()})</span>
      </div>
    </div>
  );
}

/** ⚫ Points d'action par manche — valeur PLATE (une fiche peut la surcharger). */
const DEFAULT_ACTIONS = 2;

/** Les quatre états de la piste mentale (colère → peur), § règles adversaires. */
const MENTAL_STATES: { icon: string; name: string; effect: string }[] = [
  { icon: "😡", name: "Enragé", effect: "⬆ menace · garde −2" },
  { icon: "😠", name: "Agressif", effect: "⬆ menace" },
  { icon: "😟", name: "Prudent", effect: "garde +1" },
  { icon: "😱", name: "Paniqué", effect: "⬇⬇ menace · garde +1" },
];

/**
 * Encadré « État mental » : les 4 états (sans centre neutre — le meneur pose la
 * disposition de départ Agressif/Prudent), chacun avec un slot où poser le jeton
 * (l'état bouge en jeu), + la barre 🧠 Ténacité (◇, régénérée chaque manche).
 * Chaque 🔺/🔻 subi est d'abord absorbé par un ◇ ; la piste ne bascule qu'une
 * fois le ◇ épuisé.
 */
function MentalPanel({ tenacity }: { tenacity: number }) {
  return (
    <div className="adv-mental">
      <div className="adv-section-label">État mental</div>
      <div className="adv-mental-tenacity">
        <span className="adv-mental-tenacity-label">🧠 Ténacité</span>
        <Boxes count={tenacity} />
      </div>
      <ul className="adv-mental-track">
        {MENTAL_STATES.map((s) => (
          <li key={s.name} className="adv-mental-state">
            <span className="adv-mental-slot" aria-hidden />
            <span className="adv-mental-icon">{s.icon}</span>
            <span className="adv-mental-name">{s.name}</span>
            <span className="adv-mental-effect">{s.effect}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Rendu COMPACT de ce que confère un bloc, depuis les ops structurées :
 *   - ressource → « 🫁 +2 » (jeton régénéré chaque manche)
 *   - carte     → « → Morsure » (sauf si le nom de carte double le nom du bloc)
 *   - sinon     → prose courte de repli (grants).
 * La prose longue « au début de la manche » est portée par le bandeau Chaque manche.
 */
function BlockGrant({ block, cardNames }: { block: BodyPart["blocks"][number]; cardNames: Record<string, string> }) {
  if (block.resource && block.amount != null) {
    return (
      <span className="adv-grant-chip">
        {RES_META[block.resource].icon} +{block.amount}
      </span>
    );
  }
  // Garde conférée : détruire le bloc la fait perdre (la créature devient plus facile à toucher).
  if (block.guard != null) {
    return (
      <span className="adv-grant-chip" title="Garde conférée tant que le bloc est intact">
        🛡️ Garde {block.guard >= 0 ? `+${block.guard}` : block.guard}
      </span>
    );
  }
  if (block.grantsCard) {
    const cardName = cardNames[block.grantsCard];
    if (cardName && cardName !== block.name) return <span className="adv-grant-chip">→ {cardName}</span>;
    if (!cardName) return <span className="adv-grant-chip">→ {block.grants}</span>;
    return null; // le nom du bloc dit déjà tout (ex. bloc « Charge » → carte Charge)
  }
  return <span className="adv-bloc-text">{block.grants}</span>;
}

/** Une partie du corps : nom, armure, blocs (cases + capacité conférée). */
function PartCard({ part, cardNames }: { part: BodyPart; cardNames: Record<string, string> }) {
  return (
    <div className="adv-part">
      <div className="adv-part-head">
        <span className="adv-part-name">{part.name}</span>
        <span className="adv-part-armor" title="Armure">
          🛡️ {part.armor}
        </span>
      </div>
      <ul className="adv-blocs">
        {part.blocks.map((block, i) => (
          <li key={i} className="adv-bloc">
            <Boxes count={block.cases} />
            <span className="adv-bloc-confere">
              {block.name && <strong className="adv-bloc-name">{block.name}</strong>}
              <BlockGrant block={block} cardNames={cardNames} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Recto : feuille A5 paysage (stats + parties du corps). */
export function AdversaryStatBlock({ adversary }: { adversary: Adversary }) {
  const a = adversary;
  const { frameRef, contentRef, scale } = useFitScale();
  const fitStyle = scale < 1 ? { transform: `scale(${scale})` } : undefined;
  const cardNames = Object.fromEntries(a.cards.map((c) => [c.id, c.name]));
  const resources = summarizeResources([...a.parts, ...a.weapons]);
  return (
    <article className="adv-sheet" ref={frameRef} aria-label={`Fiche : ${a.name}`}>
      <div className="adv-sheet-fit" ref={contentRef} style={fitStyle}>
      <header className="adv-header">
        <div className="adv-title">
          <h1 className="adv-name">{a.name}</h1>
        </div>
        <div className="adv-header-stats">
          <span className="adv-dice" title="Dés d'adversaire">
            {a.dice.map((d, i) => (
              <span key={i}>{DIE_GLYPH[d]}</span>
            ))}
          </span>
          <span className="adv-actions" title="Points d'action par manche (Essoufflé en retire 1, plancher 1)">
            {"⚫".repeat(a.actions ?? DEFAULT_ACTIONS)}
          </span>
          <span className="adv-size" title="Palier de taille">
            📏 {a.size ?? "normal"}
          </span>
          <span className="adv-speed">
            🚶 {a.speed.walk} &nbsp; 🏃 {a.speed.run}
          </span>
        </div>
      </header>

      <div className="adv-body">
        {/* Rangée 1 de la grille : les deux encadrés hauts, étirés à la même hauteur. */}
        {resources.length > 0 && <MaintenancePanel groups={resources} />}
        <DefensePanel guard={a.guard} />

        {/* Rangée 2 : le corps de la fiche. */}
        <section className="adv-parts adv-physical">
          <div className="adv-section-label">État physique</div>
          <FatigueTrack total={a.fatigue} />

          <div className="adv-parts-grid">
            {a.parts.map((p) => (
              <PartCard key={p.type} part={p} cardNames={cardNames} />
            ))}
          </div>

          {a.weapons.length > 0 && (
            <>
              <div className="adv-section-label adv-weapons-label">Armes et Outils</div>
              <div className="adv-parts-grid">
                {a.weapons.map((w) => (
                  <PartCard key={w.type} part={w} cardNames={cardNames} />
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="adv-aside">
          {a.tenacity != null && <MentalPanel tenacity={a.tenacity} />}

          {a.traits.length > 0 && (
            <div className="adv-traits">
              <div className="adv-section-label">Traits</div>
              <ul>
                {a.traits.map((t) => (
                  <li key={`${t.name}-${t.source ?? ""}`} className="adv-trait">
                    <span className="adv-trait-type">{KIND_GLYPH[t.kind]}</span>{" "}
                    <strong>{t.name} :</strong> {t.effect}
                    {t.source && <em className="adv-trait-source"> ({t.source})</em>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
      </div>
    </article>
  );
}

/**
 * Verso : illustration de la créature (ou placeholder), surmontée d'un cartouche
 * nom + description (déplacée depuis le recto pour libérer l'espace mécanique).
 */
export function AdversaryVerso({ adversary }: { adversary: Adversary }) {
  const a = adversary;
  return (
    <div className={`adv-verso${a.image ? " adv-verso--illustrated" : ""}`} aria-label={`Verso : ${a.name}`}>
      {a.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.image} alt={a.name} className="adv-verso-img" />
      ) : (
        <div className="adv-verso-placeholder">
          <span className="adv-verso-kicker">Adversaire</span>
          <span className="adv-verso-name">{a.name}</span>
        </div>
      )}
      {a.description && (
        <div className="adv-verso-caption">
          {a.image && <span className="adv-verso-caption-name">{a.name}</span>}
          <p className="adv-verso-desc">{a.description}</p>
        </div>
      )}
    </div>
  );
}

/** Verso à l'écran : même cadre A5 que le recto (pour un swap en place net). */
function AdversaryScreenVerso({ adversary }: { adversary: Adversary }) {
  return (
    <article className="adv-sheet adv-sheet--verso" aria-label={`Verso : ${adversary.name}`}>
      <AdversaryVerso adversary={adversary} />
    </article>
  );
}

/** Deck d'actions (composant ActionCard partagé). */
export function AdversaryDeck({ adversary }: { adversary: Adversary }) {
  const conferredBy = conferringBlocks(adversary);
  return (
    <section className="adv-deck" aria-label="Deck d'actions">
      <h2 className="adv-deck-title">Deck d'actions</h2>
      <div className="adv-deck-cards">
        {adversary.cards.map((c) => (
          <ActionCard key={c.id} card={adversaryCardToPlayerCard(c, conferredBy[c.id])} />
        ))}
      </div>
    </section>
  );
}

/** Composition écran : fiche (bascule recto ⇄ verso, comme /personnage) + deck. */
export function AdversarySheet({ adversary }: { adversary: Adversary }) {
  const [face, setFace] = useState<"recto" | "verso">("recto");
  // Retour au recto quand on change de créature (sinon on resterait bloqué au verso).
  useEffect(() => setFace("recto"), [adversary.id]);
  return (
    <div className="adv-content">
      <div className="adv-stage">
        <div className="adv-face-tabs" role="group" aria-label="Face de la fiche">
          {(["recto", "verso"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`adv-face-tab${face === f ? " adv-face-tab--on" : ""}`}
              aria-pressed={face === f}
              onClick={() => setFace(f)}
            >
              {f === "recto" ? "Recto" : "Verso"}
            </button>
          ))}
        </div>
        {face === "recto" ? (
          <AdversaryStatBlock adversary={adversary} />
        ) : (
          <AdversaryScreenVerso adversary={adversary} />
        )}
      </div>
      <AdversaryDeck adversary={adversary} />
    </div>
  );
}
