/**
 * src/lib/cladogram.ts
 *
 * Couche d'accès au cladogramme de la faune d'Aeonir
 * (rules/{locale}/univers/cladogram.yaml — source de vérité).
 * Utilisée côté serveur (Server Component, generateStaticParams).
 *
 * Le YAML est lu et *normalisé* en une structure sérialisable :
 *   - chaque nœud reçoit un `id` stable (chemin), sa `depth`, son `kingdom`
 *     (index du règne racine dont il descend) et son `parentId` ;
 *   - `nodeIndex` (id → nœud) et `usedMut` (mutations placées) sont pré-calculés.
 *
 * La normalisation est volontairement *pure* (pas de fs) afin de pouvoir être
 * rejouée côté client si besoin ; seule getCladogram() touche au disque.
 *
 * Schéma source : cf. en-tête de cladogram.yaml et tools/gen-faune-arbre.mjs.
 * Fallback : si la locale n'a pas le fichier, on sert le fr.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

// ─── Types bruts (forme YAML) ─────────────────────────────────────────────────

/** Lettre de biome : N Nord · L Levant · C Couchant · S Sud. */
export type BiomeLetter = "N" | "L" | "C" | "S";
export type NodeStatus = "done" | "todo";

/** Nœud tel qu'écrit dans le YAML (clade interne ou feuille). */
interface RawNode {
  /** Clade interne : nom (majuscules). */
  name?: string;
  /** Clade interne : glose / analogue terrestre entre parenthèses. */
  ref?: string;
  /** Feuille : nom de l'espèce/grade. */
  tip?: string;
  /** Feuille : glose (analogue terrestre, références). */
  cd?: string;
  /** Étiquette de branche sans nom de clade (ex. « sessiles à dispersion »). */
  branchNote?: string;
  /** N° de mutation d'Aeonir apparaissant sur ce nœud (pastille). */
  mut?: number;
  /** Sous-ensemble de "NLCS". */
  biome?: string;
  status?: NodeStatus;
  /** Espèce-clé (étoile). */
  star?: boolean;
  children?: RawNode[];
}

interface RawCladogram {
  title?: string;
  rootNote?: string;
  mutations?: string[];
  root: { children: RawNode[] };
}

// ─── Types normalisés (sérialisables) ─────────────────────────────────────────

export interface CladoNode {
  /** Identifiant stable dérivé du chemin, ex. "root.1.0.2". */
  id: string;
  /** Profondeur (root = 0, ses enfants = 1, …). */
  depth: number;
  /** Index du règne racine dont descend le nœud (-1 pour la racine). */
  kingdom: number;
  /** Identifiant du parent (undefined pour la racine). */
  parentId?: string;
  /** true si le nœud n'a pas d'enfants. */
  isLeaf: boolean;

  name?: string;
  ref?: string;
  tip?: string;
  cd?: string;
  branchNote?: string;
  mut?: number;
  biome?: string;
  status?: NodeStatus;
  star?: boolean;

  children: CladoNode[];
}

export interface Mutation {
  /** Numéro (1-based) tel qu'affiché. */
  n: number;
  label: string;
}

export interface CladogramData {
  title: string;
  rootNote: string;
  mutations: Mutation[];
  /** Racine synthétique (id "root"). */
  root: CladoNode;
  /** Accès direct id → nœud (inclut la racine). */
  nodeIndex: Record<string, CladoNode>;
  /** Numéros de mutations effectivement placées sur l'arbre. */
  usedMut: number[];
}

// ─── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Convertit la forme YAML en {@link CladogramData}.
 * Pure : aucun accès disque, pour être rejouable côté client si nécessaire.
 */
export function normalizeCladogram(raw: RawCladogram): CladogramData {
  const nodeIndex: Record<string, CladoNode> = {};
  const usedMut = new Set<number>();

  function build(
    src: RawNode,
    id: string,
    depth: number,
    kingdom: number,
    parentId: string | undefined
  ): CladoNode {
    const node: CladoNode = {
      id,
      depth,
      kingdom,
      parentId,
      isLeaf: !(src.children && src.children.length > 0),
      name: src.name,
      ref: src.ref,
      tip: src.tip,
      cd: src.cd,
      branchNote: src.branchNote,
      mut: src.mut,
      biome: src.biome,
      status: src.status,
      star: src.star,
      children: [],
    };
    nodeIndex[id] = node;
    if (typeof src.mut === "number") usedMut.add(src.mut);
    if (src.children) {
      node.children = src.children.map((child, i) =>
        build(child, `${id}.${i}`, depth + 1, kingdom, id)
      );
    }
    return node;
  }

  const root: CladoNode = {
    id: "root",
    depth: 0,
    kingdom: -1,
    isLeaf: false,
    children: [],
  };
  nodeIndex.root = root;
  // Chaque enfant direct de la racine définit un « règne » (Pourpres, Zoïdes…).
  root.children = (raw.root?.children ?? []).map((child, i) =>
    build(child, `root.${i}`, 1, i, "root")
  );

  const mutations: Mutation[] = (raw.mutations ?? []).map((label, i) => ({
    n: i + 1,
    label,
  }));

  return {
    title: raw.title ?? "",
    rootNote: raw.rootNote ?? "",
    mutations,
    root,
    nodeIndex,
    usedMut: [...usedMut].sort((a, b) => a - b),
  };
}

// ─── Chargement (serveur) ──────────────────────────────────────────────────────

function getCladogramPath(locale: string): string {
  const p = path.join(
    process.cwd(),
    "..",
    "rules",
    locale,
    "univers",
    "cladogram.yaml"
  );
  if (!fs.existsSync(p) && locale !== "fr") {
    return path.join(
      process.cwd(),
      "..",
      "rules",
      "fr",
      "univers",
      "cladogram.yaml"
    );
  }
  return p;
}

/** Charge et normalise le cladogramme de la locale (fallback fr). */
export function getCladogram(locale = "fr"): CladogramData {
  const file = getCladogramPath(locale);
  const raw = yaml.load(fs.readFileSync(file, "utf-8")) as RawCladogram;
  return normalizeCladogram(raw);
}
