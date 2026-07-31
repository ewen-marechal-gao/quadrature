"use client";

/**
 * ItemCard — un objet du catalogue, en carte MINI.
 *
 * Format 44 × 63 mm : la moitié d'une carte d'action (63,5 × 88,9), prise dans
 * le sens portrait — c'est aussi le standard « mini américaine », pour lequel
 * des protège-cartes existent, et il pave un A4 sans reste (16 par planche).
 * Le ratio est donc fixé ici même si la planche d'impression viendra plus tard.
 *
 * Toutes les mesures internes sont en `cqw` ou en `em` : la carte se dimensionne
 * sur la largeur de son conteneur (`container-type: inline-size` posé sur
 * `.eqp-slot`), donc le même balisage rend à 190 px à l'écran et à 44 mm au
 * papier, sans seconde feuille de style.
 *
 * Deux registres, comme sur la page des traits :
 *  · les champs STRUCTURÉS (portée, attaques, protection, provides…) — ce que le
 *    moteur lit vraiment ;
 *  · la ligne `mechanic` — la prose du vault, que le moteur ne lit jamais.
 *
 * D'où le libellé « texte seul » et non « non branché » : la phrase du bas n'est
 * pas appliquée, mais son EFFET l'est parfois déjà, par un champ structuré
 * affiché juste au-dessus (le Katar « peut frapper puissamment » parce que
 * `attacks` le dit ; le Fourreau donne accès à l'arme parce que `carries` le
 * dit). Marquer la carte entière comme non branchée serait faux.
 */

import type { EquipmentItem } from "@/lib/equipment";
import {
  ATTACK_LABELS,
  CARRIES_LABELS,
  CATEGORY_LABELS,
  FAMILY_LABELS,
  KIND_LABELS,
  ZONE_LABELS,
  skillLabel,
} from "@/lib/equipment-labels";

/**
 * Convertit le balisage léger (**gras**, *italique*) des mécaniques du vault,
 * après échappement. Même fonction que sur les cartes d'action — les valeurs
 * YAML ne contiennent jamais de HTML brut.
 */
function mdLite(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/** Une ligne de caractéristique : pictogramme + valeur. */
function Stat({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="eqp-stat">
      <span className="eqp-stat__icon">{icon}</span>
      <span className="eqp-stat__val">{children}</span>
    </div>
  );
}

/**
 * Coût d'encombrement, dans le vocabulaire du vault : 🔳 par grand emplacement,
 * ▫️ par petit objet.
 *
 * Répété plutôt que chiffré — c'est ainsi que le vault l'écrit (« Fournit ▫️▫️▫️ »)
 * et que la fiche de personnage le coche : quatre cases se comptent d'un coup
 * d'œil, là où « 4 🔳 » demande de traduire. Un objet à 0 emplacement (aucun
 * aujourd'hui) n'aurait rien à cocher, d'où le tiret.
 */
function slotCost(item: EquipmentItem): string {
  const pip = item.size === "small" ? "▫️" : "🔳";
  return item.slots > 0 ? pip.repeat(item.slots) : "—";
}

/** Sous-titre : identité du vault, puis nature ou famille d'arme. */
function subtitle(item: EquipmentItem): string {
  const nature =
    item.family
      ? FAMILY_LABELS[item.family]
      : KIND_LABELS[item.kind];
  const category = item.category ? CATEGORY_LABELS[item.category] : null;
  return [item.identity, category ?? nature].filter(Boolean).join(" · ");
}

/** Portée d'une arme, en cases, avec sa distance minimale s'il y en a une. */
function reachText(item: EquipmentItem): string {
  const cases = item.reach === 1 ? "au contact" : `${item.reach} cases`;
  return item.minRange ? `${cases} · pas sous ${item.minRange + 1}` : cases;
}

/** Ce qu'un conteneur fournit : « 🔸🔸 accessibles » ou « ▫️▫️▫️ rangés ». */
function provisionText(item: EquipmentItem): string | null {
  const p = item.provides;
  if (!p) return null;
  const pip = p.accessible ? "🔸" : "▫️";
  return `${pip.repeat(p.count)} ${p.accessible ? "en combat" : "hors combat"}`;
}

export function ItemCard({ item }: { item: EquipmentItem }) {
  return (
    <div className="eqp-slot">
      <article className="eqp-card" data-kind={item.kind}>
        <header className="eqp-card__head">
          <span className="eqp-card__name">{item.name}</span>
          <span
            className="eqp-card__cost"
            title={`${item.slots} emplacement${item.slots > 1 ? "s" : ""}`}
          >
            {slotCost(item)}
          </span>
        </header>

        <div className="eqp-card__sub">{subtitle(item)}</div>

        <div className="eqp-card__zones">
          {item.zones.map((z) => (
            <span key={z} className="eqp-zone">{ZONE_LABELS[z]}</span>
          ))}
        </div>

        <div className="eqp-card__body">
          {/* Arme */}
          {item.reach !== undefined && <Stat icon="📏">{reachText(item)}</Stat>}
          {item.attacks && (
            <Stat icon="⚔️">
              {item.attacks.map((a) => ATTACK_LABELS[a]).join(", ")}
            </Stat>
          )}
          {item.canParry !== undefined && (
            <Stat icon="🤺">{item.canParry ? "Parade ⚡" : "Pas de parade"}</Stat>
          )}
          {item.reloadDC !== undefined && (
            <Stat icon="⚙️">Rechargement DD {item.reloadDC}</Stat>
          )}

          {/* Protections — le stock qui se vide, et la protection qui revient. */}
          {item.protection !== undefined && (
            <Stat icon="🛡️">
              Protection {item.protection}
              <span className="eqp-stat__note">stock, ne se recharge pas</span>
            </Stat>
          )}
          {item.protectionPerRound !== undefined && (
            <Stat icon="🛡️">
              {item.protectionPerRound} par manche
              <span className="eqp-stat__note">regagnée à chaque manche</span>
            </Stat>
          )}
          {item.canBlock && <Stat icon="🛑">Blocage ⚡</Stat>}
          {item.pockets !== undefined && (
            <Stat icon="🔸">{"🔸".repeat(item.pockets)} fournies</Stat>
          )}

          {/* Conteneur */}
          {item.provides && <Stat icon="🎒">{provisionText(item)}</Stat>}
          {item.carries && <Stat icon="🪝">{CARRIES_LABELS[item.carries]}</Stat>}

          {/* Consommable et divers */}
          {item.usage && <Stat icon="⏳">Jet d&apos;usage : {item.usage}</Stat>}
          {item.advantageOn?.map((s) => (
            <Stat key={s} icon="🟩">Avantage en {skillLabel(s)}</Stat>
          ))}

          {item.description && <p className="eqp-card__desc">{item.description}</p>}
        </div>

        {item.mechanic && (
          <footer className={item.wired ? "eqp-card__mech is-wired" : "eqp-card__mech"}>
            <span
              dangerouslySetInnerHTML={{ __html: mdLite(item.mechanic) }}
            />
            {!item.wired && (
              <span
                className="eqp-card__unwired"
                title="Prose du vault : le moteur ne lit pas cette phrase. Ce qu'il applique figure dans les caractéristiques au-dessus."
              >
                ✎ texte seul
              </span>
            )}
          </footer>
        )}
      </article>
    </div>
  );
}
