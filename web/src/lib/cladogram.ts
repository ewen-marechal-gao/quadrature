/**
 * src/lib/cladogram.ts
 *
 * Couche d'accès au cladogramme de la faune d'Aeonir.
 * DEUX fichiers à la racine du dépôt (source de vérité) :
 *   - data/cladogram.yaml — l'arbre (title, rootNote, backlog, root) ;
 *   - data/mutations.yaml — les mutations : clé → { label:{i18n}, description:{i18n}, kit? }.
 * Utilisée côté serveur (Server Component, generateStaticParams).
 *
 * Schéma :
 *   - les nœuds référencent une mutation par sa **clé** (champ `mut`) ;
 *   - la **numérotation d'affichage n'est PAS dans le YAML** : on la calcule ici,
 *     par **ordre d'apparition dans l'arbre** (parcours pré-ordre — la 1ʳᵉ mutation
 *     rencontrée porte le n° 1, etc.). Les mutations qui n'apparaissent sur aucun
 *     nœud sont « différées » (sans numéro).
 *   - le champ `kit` des mutations (brique de fiche d'adversaire) est ignoré ici.
 *
 * Les libellés/descriptions sont **résolus dans la locale demandée au chargement**
 * (fallback fr) → le composant client reçoit des chaînes simples.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { localize, type LocalizedString } from "@/lib/nav";

// ─── Types bruts (forme YAML) ─────────────────────────────────────────────────

/** Lettre de biome : N Nord · L Levant · C Couchant · S Sud. */
export type BiomeLetter = "N" | "L" | "C" | "S";
export type NodeStatus = "done" | "todo";

interface RawMutation {
  label?: LocalizedString;
  description?: LocalizedString;
  /** Brique de fiche d'adversaire — ignorée par le visualiseur. */
  kit?: unknown;
}

/** Nœud tel qu'écrit dans le YAML (clade interne ou feuille). */
interface RawNode {
  name?: string;
  ref?: string;
  tip?: string;
  cd?: string;
  branchNote?: string;
  /** Clé d'une mutation du dictionnaire `mutations`. */
  mut?: string;
  /** Sous-ensemble de "NLCS". */
  biome?: string;
  status?: NodeStatus;
  star?: boolean;
  children?: RawNode[];
}

interface RawCladogram {
  title?: string;
  rootNote?: string;
  backlog?: string[];
  mutations?: Record<string, RawMutation>;
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
  /** Clé de la mutation portée par ce nœud (cf. mutationByKey). */
  mut?: string;
  biome?: string;
  status?: NodeStatus;
  star?: boolean;

  children: CladoNode[];
}

export interface Mutation {
  /** Clé stable (référencée par les nœuds). */
  key: string;
  /** Numéro d'affichage (ordre d'apparition dans l'arbre) ; null si différée. */
  n: number | null;
  label: string;
  description: string;
}

export interface CladogramData {
  title: string;
  rootNote: string;
  /** Mutations placées (numérotées, ordre d'apparition) puis différées. */
  mutations: Mutation[];
  /** Accès direct clé → mutation. */
  mutationByKey: Record<string, Mutation>;
  /** Racine synthétique (id "root"). */
  root: CladoNode;
  /** Accès direct id → nœud (inclut la racine). */
  nodeIndex: Record<string, CladoNode>;
}

// ─── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Convertit la forme YAML en {@link CladogramData}, libellés résolus dans `locale`.
 * Pure : aucun accès disque.
 */
export function normalizeCladogram(raw: RawCladogram, locale = "fr"): CladogramData {
  const nodeIndex: Record<string, CladoNode> = {};
  // Clés de mutation dans l'ordre de première apparition (parcours pré-ordre).
  const appearance: string[] = [];
  const seen = new Set<string>();

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
    if (typeof src.mut === "string" && !seen.has(src.mut)) {
      seen.add(src.mut);
      appearance.push(src.mut);
    }
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
  root.children = (raw.root?.children ?? []).map((child, i) =>
    build(child, `root.${i}`, 1, i, "root")
  );

  // Numérotation = ordre d'apparition dans l'arbre.
  const numberByKey = new Map<string, number>();
  appearance.forEach((key, i) => numberByKey.set(key, i + 1));

  const rawMuts = raw.mutations ?? {};
  const loc = (f?: LocalizedString) => (f ? localize(f, locale) : "");
  const toMutation = (key: string, n: number | null): Mutation => {
    const m = rawMuts[key];
    return { key, n, label: loc(m?.label) || key, description: loc(m?.description) };
  };

  // Placées (numérotées, dans l'ordre d'apparition) puis différées (dict, hors arbre).
  const placed = appearance.map((key) => toMutation(key, numberByKey.get(key)!));
  const deferred = Object.keys(rawMuts)
    .filter((key) => !numberByKey.has(key))
    .map((key) => toMutation(key, null));
  const mutations = [...placed, ...deferred];

  const mutationByKey: Record<string, Mutation> = {};
  for (const m of mutations) mutationByKey[m.key] = m;

  return {
    title: raw.title ?? "",
    rootNote: raw.rootNote ?? "",
    mutations,
    mutationByKey,
    root,
    nodeIndex,
  };
}

// ─── Chargement (serveur) ──────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "..", "data");

/** Charge et normalise le cladogramme (arbre + mutations), libellés résolus dans `locale`. */
export function getCladogram(locale = "fr"): CladogramData {
  const tree = yaml.load(fs.readFileSync(path.join(DATA_DIR, "cladogram.yaml"), "utf-8")) as RawCladogram;
  const mutDoc = yaml.load(fs.readFileSync(path.join(DATA_DIR, "mutations.yaml"), "utf-8")) as {
    mutations?: Record<string, RawMutation>;
  };
  const raw: RawCladogram = { ...tree, mutations: mutDoc.mutations ?? {} };
  return normalizeCladogram(raw, locale);
}
