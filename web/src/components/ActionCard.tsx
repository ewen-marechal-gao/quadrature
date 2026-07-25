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
import type { ActionCard as Card, CardOption, CardSection, CardUpgrade } from "@/lib/cards";
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

/** Amélioration ⚒️ — ce qu'un Trait débloque sur la section qu'elle modifie. */
function Upgrade({ up }: { up: CardUpgrade }) {
  return (
    <div className="ac-field ac-upgrade">
      <span className="ac-field-icon">⚒️</span>
      <span
        dangerouslySetInnerHTML={{
          __html: `<strong>${mdLite(up.nom)} :</strong> ${mdLite(up.effet)}`,
        }}
      />
    </div>
  );
}

/**
 * Une OPTION d'une carte à effets multiples : condition + issue, groupées.
 *
 * Ce n'est PAS une amélioration — ⚒️ désigne ce qu'un Trait débloque. C'est un
 * effet ALTERNATIF : on choisit l'un des blocs au moment de jouer. Son surcoût
 * et son initiative se lisent dans sa prose, ce qui laisse la partie haute de la
 * carte à son action de base.
 */
function Option({ option }: { option: CardOption }) {
  return (
    <div className="ac-choice">
      <Field icon="🔒" text={option.condition} />
      <Field icon="▶️" text={option.effet} />
      <Field icon="✅" text={option.succes} />
      <Field icon="❌" text={option.echec} />
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

/** Une section de carte : ce qu'elle affiche, et si elle a quoi que ce soit à dire. */
interface Section {
  /** Vraie quand la DONNÉE existe. À ne pas déduire des éléments : un <Field>
   *  vide rend `null` mais reste un objet truthy — il ferait apparaître un
   *  séparateur fantôme autour d'une section pourtant muette. */
  has:   boolean;
  nodes: React.ReactNode;
}

/**
 * Assemble les sections d'une carte, en n'insérant un séparateur qu'entre celles
 * qui portent réellement quelque chose. Une section vide ne laisse pas de trace.
 */
function Sections({ blocks }: { blocks: Section[] }) {
  const filled = blocks.filter(b => b.has);
  return (
    <>
      {filled.map((block, i) => (
        <Fragment key={i}>
          {i > 0 && <Separator />}
          {block.nodes}
        </Fragment>
      ))}
    </>
  );
}

export function ActionCard({ card }: { card: Card }) {
  /** Les ⚒️ d'une section. Défaut « jet » : la place historique de toutes. */
  const ups = (section: CardSection) =>
    (card.ameliorations ?? [])
      .filter(a => (a.section ?? "jet") === section)
      .map(a => <Upgrade key={a.nom} up={a} />);

  // Deux grammaires de carte :
  //  · classique       — le séparateur découpe le DÉROULÉ d'une action :
  //                      déclencheur/condition › cible › jet › effet.
  //  · effets multiples — la tête est commune (déclencheur, jet, défaut,
  //                      critique), puis le séparateur départage des OPTIONS
  //                      concurrentes, chacune groupant sa condition et son issue.
  const options = card.options?.length ? card.options : null;

  const hasRoll = !!(
    card.jet || card.contre || card.sacrifices?.length ||
    card.defaut || card.critique || ups("jet").length
  );
  const rollNodes = [
    <Field key="jet" icon="🎲" text={card.jet} />,
    <Field key="contre" icon="🆚" text={card.contre} />,
    ...(card.sacrifices ?? []).map((s, i) => (
      <div key={`s${i}`} className="ac-field ac-upgrade">
        <span className="ac-field-icon">⛞{s.des}</span>
        <span
          dangerouslySetInnerHTML={{
            __html: s.nom
              ? `<strong>${mdLite(s.nom)} :</strong> ${mdLite(s.effet)}`
              : mdLite(s.effet),
          }}
        />
      </div>
    )),
    <Field key="defaut" icon="⚠️" text={card.defaut} />,
    <Field key="critique" icon="✴️" text={card.critique} />,
    ...ups("jet"),
  ];
  const rollBlock: Section = { has: hasRoll, nodes: rollNodes };

  return (
    <div
      className="action-card"
      data-categorie={card.categorie}
      data-type={card.type}
      data-bande={card.initiative !== undefined ? bandOf(card.initiative) ?? undefined : undefined}
    >
      {card.initiative !== undefined && (
        <span className="ac-initiative" title={`Initiative ${card.initiative}`}>
          {card.initiative}
        </span>
      )}

      <header className="ac-header">
        <span className="ac-name">{card.nom}</span>
        {card.cout && <Cost cout={card.cout} />}
      </header>

      {/* La bande grise est TOUJOURS là : sans elle, la pastille déborde sur le
          corps et décale la première ligne. Le repli n'est pas un pis-aller —
          les seules cartes sans prérequis ni bandeau sont précisément les
          universelles (vérifié : 15 sur 15), d'où le libellé. Il suit le type :
          les gardes sont des réactions, pas des actions. */}
      {card.prerequis && (
        <div className="ac-prereq">Prérequis : {card.prerequis}</div>
      )}
      {card.bandeau && <div className="ac-prereq">{card.bandeau}</div>}
      {!card.prerequis && !card.bandeau && (
        <div className="ac-prereq">
          {card.type === "reaction" ? "Réaction universelle" : "Action universelle"}
        </div>
      )}

      <div className="ac-body">
        {options ? (
          // Effets multiples : tête commune, puis les options concurrentes.
          <Sections
            blocks={[
              {
                has: !!(card.declencheur || card.mental || card.cible) || hasRoll,
                nodes: [
                  <Field key="d" icon="⚡" text={card.declencheur} />,
                  <Field key="m" icon="🧠" text={card.mental} />,
                  <Field key="c" icon="🎯" text={card.cible} />,
                  ...rollNodes,
                ],
              },
              {
                has: true,
                nodes: [
                  <div key="lbl" className="ac-choice-label">Choisissez l&apos;un :</div>,
                  ...options.map((o, i) => (
                    <Fragment key={o.id}>
                      {i > 0 && <Separator />}
                      <Option option={o} />
                    </Fragment>
                  )),
                ],
              },
            ]}
          />
        ) : (
          // Classique : le séparateur découpe le déroulé de l'action.
          <Sections
            blocks={[
              {
                has: !!(card.declencheur || card.condition || card.mental) || !!ups("condition").length,
                nodes: [
                  <Field key="d" icon="⚡" text={card.declencheur} />,
                  <Field key="c" icon="🔒" text={card.condition} />,
                  <Field key="m" icon="🧠" text={card.mental} />,
                  ...ups("condition"),
                ],
              },
              {
                has: !!card.cible || !!ups("cible").length,
                nodes: [<Field key="t" icon="🎯" text={card.cible} />, ...ups("cible")],
              },
              rollBlock,
              {
                has: !!(
                  card.repere || card.effet || card.effet_duree || card.succes ||
                  card.echec || card.table || card.concession || card.contrecoup ||
                  ups("effet").length
                ),
                nodes: [
                  <Field key="r" icon="⭐" text={card.repere} />,
                  <Field key="e" icon="▶️" text={card.effet} />,
                  <Field key="du" icon="⏳" text={card.effet_duree} />,
                  <Field key="s" icon="✅" text={card.succes} />,
                  <Field key="x" icon="❌" text={card.echec} />,
                  // Gardes : la Concession et le Contrecoup décrivent l'APRÈS-jet,
                  // pas le jet — d'où leur place en fin de bloc effet.
                  // ‼️ est PROVISOIRE — un bouclier brisé viendra avec les icônes custom.
                  <Field key="concession" icon="‼️" text={card.concession} />,
                  <Field key="contrecoup" icon="↩️" text={card.contrecoup} />,
                  ...ups("effet"),
                  card.table ? (
                    <div key="tbl" className="ac-table">
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
                  ) : null,
                ],
              },
            ]}
          />
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
