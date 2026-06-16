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

import type { ActionCard as Card } from "@/lib/cards";

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
  const hasOutcome =
    !!(card.effet || card.effet_duree || card.succes || card.echec || card.table);

  return (
    <div className="action-card" data-categorie={card.categorie} data-type={card.type}>
      <span className="ac-initiative" title={`Initiative ${card.initiative}`}>
        {card.initiative}
      </span>

      <header className="ac-header">
        <span className="ac-name">{card.nom}</span>
        {card.cout && <span className="ac-cost">{card.cout}</span>}
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

        <Field icon="▶️" text={card.effet} />
        <Field icon="⏳" text={card.effet_duree} />
        <Field icon="✅" text={card.succes} />
        <Field icon="❌" text={card.echec} />

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
