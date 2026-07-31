/**
 * src/lib/traits.ts — les TRAITS de personnage (§ rules/fr/core/traits.md).
 *
 * ⚠️ MODULE CÔTÉ SERVEUR (node:fs). À n'importer QUE depuis un Server Component.
 *
 * Source : `data/traits.yaml`, la même que le simulateur lit
 * (simulator/src/character/traits.ts). Pas de copie de contenu ici : la prose
 * `effect` reste l'affichage MJ, et le bloc `grants` — le seul branchement
 * moteur — est projeté tel quel pour être RENDU structurellement plutôt que lu.
 * Un trait sans `grants` est du texte : la page le dit explicitement, c'est une
 * information utile (elle montre ce qui reste à brancher).
 *
 * Les noms d'actions viennent de `data/player_actions.yaml` — l'autre source
 * structurée — plutôt que d'un dictionnaire de libellés à entretenir.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { localize, type LocalizedString } from "@/lib/nav";
import { CHARACTERISTICS } from "@/lib/character/constants";
import type { CharId, SkillId } from "@/lib/character/types";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * La grammaire des grants vient du SIMULATEUR (`@sim/*`, cf. tsconfig.json), pas
 * d'une copie locale : c'est elle que `data/traits.yaml` remplit et que le moteur
 * applique. Seuls des TYPES sont importés — ils s'effacent à la compilation, donc
 * rien du simulateur n'entre dans le bundle. Ré-exportés ici pour que les
 * composants n'aient qu'une porte d'entrée.
 */
export type {
  ReactiveModeGrant, CostDeltaGrant, TraitGrants,
} from "@sim/character/grants";

import type { TraitGrants } from "@sim/character/grants";

export interface TraitEntry {
  id: string;
  name: string;
  /** ⚒️ actif (modifie une action nommée) ou ♾️ passif. */
  kind: "active" | "passive";
  /** Id de compétence, dans le vocabulaire WEB (cf. SKILL_ALIASES). */
  skill: SkillId;
  /** Caractéristique parente, dérivée de la compétence. */
  characteristic: CharId;
  /** Nom FR de l'action modifiée, quand le sim la connaît. */
  actionName?: string;
  /** Id de l'action modifiée (peut désigner une action absente du simulateur). */
  action?: string;
  effect: string;
  /** Absent = trait prose seule, sans branchement moteur. */
  grants?: TraitGrants;
}

/** Un bloc d'affichage : une compétence et ses traits. */
export interface TraitSkillGroup {
  skill: SkillId;
  skillLabel: string;
  traits: TraitEntry[];
}

/** Un bloc d'affichage : une caractéristique et ses compétences pourvues. */
export interface TraitCharGroup {
  characteristic: CharId;
  charLabel: string;
  group: "corps" | "esprit";
  skills: TraitSkillGroup[];
}

// ─── Vocabulaire ──────────────────────────────────────────────────────────────

/**
 * Le simulateur et le web ne nomment pas encore les mêmes compétences de la même
 * façon (chantier « fusion des structures de personnage » : le vocabulaire web
 * fait foi). On traduit ici, au point d'entrée, plutôt que de laisser fuiter deux
 * vocabulaires dans les composants.
 */
const SKILL_ALIASES: Record<string, SkillId> = {
  robustness: "toughness",
  composure: "presence",
  foresight: "clairvoyance",
};

const CHAR_OF_SKILL = new Map<SkillId, CharId>(
  CHARACTERISTICS.flatMap((c) => c.skills.map((s) => [s.id, c.id] as const)),
);

// ─── Chargement ───────────────────────────────────────────────────────────────

interface RawTrait {
  name: LocalizedString;
  kind: "active" | "passive";
  skill: string;
  action?: string;
  effect: LocalizedString;
  grants?: TraitGrants;
}

const DATA_DIR = join(process.cwd(), "..", "data");

function readYaml<T>(file: string): T | null {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) return null;
  return load(readFileSync(path, "utf-8")) as T;
}

/** Nom FR de chaque action du simulateur, lu à la source. */
function actionNames(locale: string): Record<string, string> {
  const doc = readYaml<{ actions?: Record<string, { name: LocalizedString }> }>("player_actions.yaml");
  return Object.fromEntries(
    Object.entries(doc?.actions ?? {}).map(([id, a]) => [id, localize(a.name, locale)]),
  );
}

/** Tous les traits, à plat, dans l'ordre du fichier (qui suit celui du vault). */
export function getAllTraits(locale = "fr"): TraitEntry[] {
  const doc = readYaml<{ traits?: Record<string, RawTrait> }>("traits.yaml");
  if (!doc?.traits) return [];
  const names = actionNames(locale);

  return Object.entries(doc.traits).map(([id, t]) => {
    const skill = (SKILL_ALIASES[t.skill] ?? t.skill) as SkillId;
    return {
      id,
      name: localize(t.name, locale),
      kind: t.kind,
      skill,
      characteristic: CHAR_OF_SKILL.get(skill) as CharId,
      ...(t.action && { action: t.action }),
      ...(t.action && names[t.action] && { actionName: names[t.action] }),
      effect: localize(t.effect, locale),
      ...(t.grants && { grants: t.grants }),
    };
  });
}

/**
 * Les traits regroupés pour l'affichage : caractéristique → compétence, dans
 * l'ordre canonique de la fiche de personnage (Corps puis Esprit). Les
 * compétences sans trait sont omises.
 */
export function groupTraits(traits: TraitEntry[], locale = "fr"): TraitCharGroup[] {
  return CHARACTERISTICS.map((c) => ({
    characteristic: c.id,
    charLabel: localize(c.label, locale),
    group: c.group,
    skills: c.skills
      .map((s) => ({
        skill: s.id,
        skillLabel: localize(s.label, locale),
        traits: traits.filter((t) => t.skill === s.id),
      }))
      .filter((g) => g.traits.length > 0),
  })).filter((g) => g.skills.length > 0);
}
