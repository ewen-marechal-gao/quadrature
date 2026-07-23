/**
 * src/lib/encounters.ts — liste des RENCONTRES (scénarios) du simulateur.
 *
 * ⚠️ MODULE CÔTÉ SERVEUR (utilise node:fs). À n'importer QUE depuis des Server
 * Components / route handlers — jamais depuis un composant client.
 *
 * Les rencontres vivent dans `simulator/encounters/*.yaml` (VERSIONNÉES, contrairement
 * aux rapports `combatReports/` qui sont gitignorés). La liste est donc toujours
 * disponible, même dans un build déployé ; seuls les logs manquent hors machine locale.
 *
 * Rattachement log → rencontre : un id de rapport a la forme
 *   `${YYYYMMDD}-${HHMMSS}-${slug(nomRencontre)}-${slug(f1)}-vs-${slug(f2)}`
 * (cf. `makeReportId` dans simulator/src/simulate.ts). On reproduit EXACTEMENT la
 * même fonction de slug pour rattacher chaque rapport à sa rencontre par préfixe.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

export interface EncounterMeta {
  /** Nom de fichier sans extension (ex. "duel-arme"). */
  file: string;
  /** `name:` du YAML (ex. "Duel à l'épée"). */
  name: string;
  /** Slug du `name`, identique à celui encodé dans les ids de rapport. */
  slug: string;
  description?: string;
  maxRounds?: number;
  board?: { width: number; height: number };
  /** Noms des factions, pour l'affichage. */
  factions: string[];
}

/**
 * Slug identique à `makeReportId` (simulator/src/simulate.ts) : NFD, suppression
 * des diacritiques, minuscules, tout ce qui n'est pas [a-z0-9] → "-", trim des "-".
 */
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** `simulator/encounters/`, relatif à la racine du projet web (cwd au build/dev). */
function encountersDir(): string {
  return join(process.cwd(), "..", "simulator", "encounters");
}

/** Forme brute d'un YAML de rencontre — champs qu'on lit, tout est optionnel. */
interface RawEncounter {
  name?: unknown;
  description?: unknown;
  maxRounds?: unknown;
  board?: { width?: unknown; height?: unknown };
  factions?: Array<{ name?: unknown }>;
}

/** Toutes les rencontres, triées par nom. Silencieux sur les fichiers illisibles. */
export function listEncounters(): EncounterMeta[] {
  const dir = encountersDir();
  if (!existsSync(dir)) return [];

  const metas: EncounterMeta[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
    let raw: RawEncounter;
    try {
      raw = (load(readFileSync(join(dir, file), "utf-8")) ?? {}) as RawEncounter;
    } catch {
      continue;
    }
    const name = typeof raw.name === "string" ? raw.name : file.replace(/\.ya?ml$/, "");
    const board =
      raw.board && typeof raw.board.width === "number" && typeof raw.board.height === "number"
        ? { width: raw.board.width, height: raw.board.height }
        : undefined;
    metas.push({
      file: file.replace(/\.ya?ml$/, ""),
      name,
      slug: slugify(name),
      description: typeof raw.description === "string" ? raw.description.trim() : undefined,
      maxRounds: typeof raw.maxRounds === "number" ? raw.maxRounds : undefined,
      board,
      factions: (raw.factions ?? [])
        .map((f) => (typeof f?.name === "string" ? f.name : null))
        .filter((n): n is string => !!n),
    });
  }
  metas.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return metas;
}
