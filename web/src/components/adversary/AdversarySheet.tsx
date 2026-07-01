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

import type { Adversary, AdversaryDie, AdversaryTrait, BodyPart } from "@/lib/bestiary";
import { adversaryCardToPlayerCard } from "@/lib/adversary-card";
import { ActionCard } from "@/components/ActionCard";
import "@/app/adversaries.css";

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

/** Fatigue : rangées de 5 cases. */
function FatigueTrack({ total }: { total: number }) {
  const rows: number[] = [];
  let left = total;
  while (left > 0) {
    rows.push(Math.min(5, left));
    left -= 5;
  }
  return (
    <div className="adv-fatigue">
      <div className="adv-section-label">💧 Fatigue</div>
      <div className="adv-fatigue-rows">
        {rows.map((n, i) => (
          <Boxes key={i} count={n} />
        ))}
      </div>
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
            <span className="adv-bloc-confere">{block.grants}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Recto : feuille A5 paysage (stats + parties du corps). */
export function AdversaryStatBlock({ adversary }: { adversary: Adversary }) {
  const a = adversary;
  return (
    <article className="adv-sheet" aria-label={`Fiche : ${a.name}`}>
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
        <aside className="adv-left">
          <FatigueTrack total={a.fatigue} />

          {a.traits.length > 0 && (
            <div className="adv-traits">
              <div className="adv-section-label">Traits</div>
              <ul>
                {a.traits.map((t) => (
                  <li key={t.name} className="adv-trait">
                    <span className="adv-trait-type">{KIND_GLYPH[t.kind]}</span>{" "}
                    <strong>{t.name} :</strong> {t.effect}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <section className="adv-parts">
          <div className="adv-section-label">Parties du corps</div>
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
