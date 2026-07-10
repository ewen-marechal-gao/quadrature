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
import type { Adversary, AdversaryDie, AdversaryTrait, BodyPart } from "@/lib/bestiary";
import { adversaryCardToPlayerCard } from "@/lib/adversary-card";
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
const DIE_GLYPH: Record<AdversaryDie, string> = {
  nuisance: "🟧",
  threat: "⬜",
  danger: "🟫",
};

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
 * UNE ligne, coupée en deux groupes. La césure (floor/ceil) tombe sur le seuil
 * Essoufflé : entrer dans le 2ᵉ groupe = past half the clock (−1 ⚫).
 */
function FatigueTrack({ total }: { total: number }) {
  const first = Math.floor(total / 2);
  const second = total - first;
  return (
    <div className="adv-fatigue">
      <span className="adv-fatigue-label">💧 Fatigue</span>
      <div className="adv-fatigue-groups">
        <Boxes count={first} />
        <Boxes count={second} />
      </div>
    </div>
  );
}

/** Les trois états de la piste mentale simplifiée (universels, § règles adversaires). */
const MENTAL_STATES: { icon: string; name: string; effect: string }[] = [
  { icon: "😠", name: "Enragé", effect: "+1 💀 att · −1 💀 déf" },
  { icon: "😐", name: "Concentré", effect: "amélioration ciblée" },
  { icon: "😬", name: "Paniqué", effect: "+1 💀 déf · −1 💀 att" },
];

/**
 * Encadré « État mental » : les 3 états, chacun avec un slot ~8×8 mm où poser un
 * jeton cubique (l'état bouge en jeu), + la barre 🧠 Ténacité (▢, tampon final).
 * Ordre du tampon (§ règles) : 🔺🔻 → retire ◇ → déplace l'état → coche ▢.
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

/** Une partie du corps : nom, armure, blocs (cases + capacité conférée). */
function PartCard({ part }: { part: BodyPart }) {
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
              {block.name && <strong className="adv-bloc-name">{block.name} — </strong>}
              {block.grants}
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
  return (
    <article className="adv-sheet" ref={frameRef} aria-label={`Fiche : ${a.name}`}>
      <div className="adv-sheet-fit" ref={contentRef} style={fitStyle}>
      <header className="adv-header">
        <div className="adv-title">
          <h1 className="adv-name">{a.name}</h1>
          <span className="adv-power">{a.powerLabel}</span>
        </div>
        <div className="adv-header-stats">
          <span className="adv-dice" title="Dés d'adversaire">
            {a.dice.map((d, i) => (
              <span key={i}>{DIE_GLYPH[d]}</span>
            ))}
          </span>
          <span className="adv-guard">
            Garde · {a.guard.label} <strong>{a.guard.value}</strong>
          </span>
          <span className="adv-speed">
            🚶 {a.speed.walk} &nbsp; 🏃 {a.speed.run}
          </span>
        </div>
      </header>

      {a.description && <p className="adv-desc">{a.description}</p>}

      <div className="adv-body">
        <section className="adv-parts adv-physical">
          <div className="adv-section-label">État physique</div>
          <FatigueTrack total={a.fatigue} />

          <div className="adv-parts-grid">
            {a.parts.map((p) => (
              <PartCard key={p.type} part={p} />
            ))}
          </div>

          {a.weapons.length > 0 && (
            <>
              <div className="adv-section-label adv-weapons-label">Armes et Outils</div>
              <div className="adv-parts-grid">
                {a.weapons.map((w) => (
                  <PartCard key={w.type} part={w} />
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

/** Verso : illustration de la créature, ou placeholder texte si absente. */
export function AdversaryVerso({ adversary }: { adversary: Adversary }) {
  const a = adversary;
  return (
    <div className="adv-verso" aria-label={`Verso : ${a.name}`}>
      {a.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.image} alt={a.name} className="adv-verso-img" />
      ) : (
        <div className="adv-verso-placeholder">
          <span className="adv-verso-kicker">Adversaire</span>
          <span className="adv-verso-name">{a.name}</span>
        </div>
      )}
    </div>
  );
}

/** Deck d'actions (composant ActionCard partagé). */
export function AdversaryDeck({ adversary }: { adversary: Adversary }) {
  return (
    <section className="adv-deck" aria-label="Deck d'actions">
      <h2 className="adv-deck-title">Deck d'actions</h2>
      <div className="adv-deck-cards">
        {adversary.cards.map((c) => (
          <ActionCard key={c.id} card={adversaryCardToPlayerCard(c)} />
        ))}
      </div>
    </section>
  );
}

/** Composition écran : recto + deck. */
export function AdversarySheet({ adversary }: { adversary: Adversary }) {
  return (
    <div className="adv-content">
      <AdversaryStatBlock adversary={adversary} />
      <AdversaryDeck adversary={adversary} />
    </div>
  );
}
