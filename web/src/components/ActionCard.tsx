"use client";

/**
 * ActionCard — rendu visuel d'une carte d'action.
 *
 * Utilisé en deux contextes :
 *   - galerie de la rubrique Cartes (taille écran)
 *   - planches d'impression A4 (dimensionnée en mm via .print-page)
 *
 * Le code couleur suit universal_actions.md §Code couleur des cartes :
 *   mouvement cyan · offensive rouge · defensive bleu · guerison vert ·
 *   amelioration violet · réactions = liseré jaune (attribut data-type).
 */

import { Fragment } from "react";
import type { ActionCard as Card, CardMode } from "@/lib/cards";
import { bandOf, bandOfMoon, type Band } from "@/lib/bands";

/**
 * Convertit le balisage léger (**gras**, *italique*) en HTML, après
 * échappement. Les valeurs YAML ne contiennent jamais de HTML brut.
 */
function mdLite(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/** Ligne de champ préfixée par son symbole normalisé. */
function Field({ icon, text }: { icon: string; text?: string }) {
  if (!text) return null;
  return (
    <div className="ac-field">
      <span className="ac-field-icon">{icon}</span>
      <span dangerouslySetInnerHTML={{ __html: mdLite(text) }} />
    </div>
  );
}

const BAND_LABEL: Record<Band, string> = {
  I: "Bande I — lune croissante",
  II: "Bande II — pleine lune",
  III: "Bande III — lune décroissante",
};

/**
 * Lune de bande, en SVG laiton : un point d'action, joué dans la bande que la
 * phase désigne. Dessinée plutôt qu'écrite en emoji — le rendu des emojis
 * dépend de la police système et passe mal sur les cinq teintes d'en-tête.
 */
function MoonGlyph({ band }: { band: Band }) {
  return (
    <svg className="ac-moon" viewBox="0 0 16 16" role="img" aria-label={BAND_LABEL[band]}>
      {band === "II" ? (
        <circle cx="8" cy="8" r="6" />
      ) : (
        <>
          <circle className="ac-moon-ring" cx="8" cy="8" r="6" />
          {/* Moitié éclairée : à droite quand la lune croît, à gauche quand elle décroît. */}
          <path d={band === "I" ? "M8 2 A6 6 0 0 1 8 14 Z" : "M8 2 A6 6 0 0 0 8 14 Z"} />
        </>
      )}
    </svg>
  );
}

/** Coût : les lunes (PA) deviennent des glyphes dessinés, le reste (💧/⚡) reste du texte. */
function Cost({ cout }: { cout: string }) {
  return (
    <span className="ac-cost">
      {[...cout].map((ch, i) => {
        const band = bandOfMoon(ch);
        return band
          ? <MoonGlyph key={i} band={band} />
          : <Fragment key={i}>{ch}</Fragment>;
      })}
    </span>
  );
}

/**
 * Une VARIANTE de la carte : une autre façon de la jouer, qui décale son
 * initiative et son coût.
 *
 * La carte garde son identité en tête (pastille, coût, condition, effet de
 * base) — c'est elle qu'on tient en main. La variante ne la redéfinit pas, elle
 * l'infléchit, et se lit donc comme une amélioration ⚒️ : mêmes codes, avec en
 * plus la pastille et le coût qui changent.
 */
function Mode({ mode }: { mode: CardMode }) {
  return (
    <div className="ac-field ac-upgrade ac-mode" data-bande={bandOf(mode.initiative) ?? undefined}>
      <span className="ac-field-icon">⚒️</span>
      <span>
        <span className="ac-mode-head">
          <strong>{mode.nom}</strong>
          <span className="ac-mode-init" title={`Initiative ${mode.initiative}`}>
            {mode.initiative}
          </span>
          {mode.cout && <Cost cout={mode.cout} />}
        </span>
        {mode.effet && (
          <span dangerouslySetInnerHTML={{ __html: ` — ${mdLite(mode.effet)}` }} />
        )}
        {mode.condition && (
          <span
            className="ac-mode-cond"
            dangerouslySetInnerHTML={{ __html: `🔒 ${mdLite(mode.condition)}` }}
          />
        )}
      </span>
    </div>
  );
}

/** Séparateur de sections : trait sur la moitié de la largeur, losange central. */
function Separator() {
  return (
    <div className="ac-sep" aria-hidden="true">
      <span className="ac-sep-diamond" />
    </div>
  );
}

export function ActionCard({ card }: { card: Card }) {
  // Sections du corps de carte, séparées visuellement :
  //   A. mise en place — déclencheur, condition, état mental, cible
  //   B. jet — jet, contre, améliorations, sacrifices, défaut, critique
  //   C. résolution — effet, succès, échec, table
  const hasSetup =
    !!(card.declencheur || card.condition || card.mental || card.cible);
  const hasRoll = !!(
    card.jet || card.contre || card.ameliorations?.length ||
    card.sacrifices?.length || card.defaut || card.critique
  );
  const hasOutcome = !!(
    card.repere || card.effet || card.effet_duree || card.succes || card.echec ||
    card.table || card.modes?.length
  );

  return (
    <div
      className="action-card"
      data-categorie={card.categorie}
      data-type={card.type}
      // Une carte à modes n'a pas UNE bande : chaque mode porte la sienne.
      data-bande={card.initiative !== undefined ? bandOf(card.initiative) ?? undefined : undefined}
    >
      {card.initiative !== undefined && (
        <span className="ac-initiative" title={`Initiative ${card.initiative}`}>
          {card.initiative}
        </span>
      )}

      <header className="ac-header" data-modes={card.modes ? "" : undefined}>
        <span className="ac-name">{card.nom}</span>
        {card.cout && <Cost cout={card.cout} />}
      </header>

      {card.prerequis && (
        <div className="ac-prereq">Prérequis : {card.prerequis}</div>
      )}
      {card.bandeau && <div className="ac-prereq">{card.bandeau}</div>}

      <div className="ac-body">
        <Field icon="⚡" text={card.declencheur} />
        <Field icon="🔒" text={card.condition} />
        <Field icon="🧠" text={card.mental} />
        <Field icon="🎯" text={card.cible} />

        {hasSetup && (hasRoll || hasOutcome) && <Separator />}

        <Field icon="🎲" text={card.jet} />
        <Field icon="🆚" text={card.contre} />

        {card.ameliorations?.map((a) => (
          <div key={a.nom} className="ac-field ac-upgrade">
            <span className="ac-field-icon">⚒️</span>
            <span
              dangerouslySetInnerHTML={{
                __html: `<strong>${mdLite(a.nom)} :</strong> ${mdLite(a.effet)}`,
              }}
            />
          </div>
        ))}

        {card.sacrifices?.map((s, i) => (
          <div key={i} className="ac-field ac-upgrade">
            <span className="ac-field-icon">⛞{s.des}</span>
            <span
              dangerouslySetInnerHTML={{
                __html: s.nom
                  ? `<strong>${mdLite(s.nom)} :</strong> ${mdLite(s.effet)}`
                  : mdLite(s.effet),
              }}
            />
          </div>
        ))}

        <Field icon="⚠️" text={card.defaut} />
        <Field icon="✴️" text={card.critique} />

        {hasRoll && hasOutcome && <Separator />}

        <Field icon="⭐" text={card.repere} />
        <Field icon="▶️" text={card.effet} />
        <Field icon="⏳" text={card.effet_duree} />
        <Field icon="✅" text={card.succes} />
        <Field icon="❌" text={card.echec} />

        {/* Les variantes se lisent APRÈS l'effet de base : on infléchit ce qui
            précède, on ne le remplace pas. */}
        {card.modes?.map((m) => <Mode key={m.id} mode={m} />)}

        {card.table && (
          <div className="ac-table">
            {card.table.titre && (
              <div
                className="ac-table-title"
                dangerouslySetInnerHTML={{ __html: mdLite(card.table.titre) }}
              />
            )}
            {card.table.lignes.map((row, i) => (
              <div key={i} className="ac-table-row">
                <span className="ac-table-cost">{row.cout}</span>
                <span dangerouslySetInnerHTML={{ __html: mdLite(row.effet) }} />
              </div>
            ))}
          </div>
        )}

        {(card.description || card.notes) && (
          <div className="ac-bottom">
            {card.description && (
              <p
                className="ac-desc"
                dangerouslySetInnerHTML={{ __html: mdLite(card.description) }}
              />
            )}
            {card.notes && (
              <p
                className="ac-notes"
                dangerouslySetInnerHTML={{ __html: mdLite(card.notes) }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
