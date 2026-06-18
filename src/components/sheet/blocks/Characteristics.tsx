"use client";

/**
 * Bloc Caractéristiques & Compétences. Une ligne par caractéristique :
 *  - 5 cercles « valeur courante » (charCurrent / valeur dérivée) ;
 *  - 2 compétences, chacune avec 5 étoiles cumulatives (rang 0–5).
 */

import { CHARACTERISTICS, type CharDef } from "@/lib/character/constants";
import { characteristicValue, skillRank } from "@/lib/character/derive";
import { clickCharCircle, setSkillRank } from "@/lib/character/mutators";
import type { CharId, SkillId } from "@/lib/character/types";
import { useSheet } from "../SheetContext";

/** 5 étoiles cumulatives pour une compétence. */
function SkillStars({ charId, skillId }: { charId: CharId; skillId: SkillId }) {
  const { c, update } = useSheet();
  const rank = skillRank(c, skillId);
  return (
    <div className="skill-dice">
      {Array.from({ length: 5 }, (_, i) => (
        <input
          key={i}
          type="checkbox"
          checked={i < rank}
          // clic sur l'étoile i : si i+1 est déjà le rang (sommet), on redescend à i
          // (désélection de la dernière) ; sinon on monte le rang à i+1.
          onChange={() => update((d) => setSkillRank(d, charId, skillId, rank === i + 1 ? i : i + 1))}
        />
      ))}
    </div>
  );
}

/** 5 cercles : actifs jusqu'à la valeur, pleins jusqu'à la valeur courante. */
function AttributeDice({ charId }: { charId: CharId }) {
  const { c, update } = useSheet();
  const value = characteristicValue(c, charId); // borne haute = valeur dérivée
  const fill = c.charCurrent[charId];
  return (
    <div className="attribute-dice">
      {Array.from({ length: 5 }, (_, i) => {
        const active = i < value;
        const cls = [active ? "active" : "", active && i < fill ? "filled" : ""].filter(Boolean).join(" ");
        return (
          <input
            key={i}
            type="checkbox"
            className={cls}
            checked={active && i < fill}
            disabled={!active}
            // clic sur le cercle i : ajuste la valeur courante (jauge de blessures)
            onChange={() => update((d) => clickCharCircle(d, charId, i))}
          />
        );
      })}
    </div>
  );
}

function CharacteristicRow({ def }: { def: CharDef }) {
  const { c, t } = useSheet();
  return (
    <div className="row-attribute">
      <div className="attribute-header">
        <span className="attribute-value">{characteristicValue(c, def.id)}</span>
        <span>{t(def.label)}</span>
        <AttributeDice charId={def.id} />
      </div>
      <div className="skills-container">
        {def.skills.map((s) => (
          <div className="skill-item" key={s.id}>
            <span>✫ {t(s.label)}</span>
            <SkillStars charId={def.id} skillId={s.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lignes d'un groupe (corps/esprit). */
export function CharacteristicsGroup({ group }: { group: "corps" | "esprit" }) {
  return (
    <div className="features-group">
      {CHARACTERISTICS.filter((c) => c.group === group).map((def) => (
        <CharacteristicRow def={def} key={def.id} />
      ))}
    </div>
  );
}
