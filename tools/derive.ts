// Noyau de dérivation PARTAGÉ : applique les kits de mutation (racine→feuille) pour
// construire l'état d'une fiche. SOURCE UNIQUE d'`applyKit`, utilisée par :
//   - tools/consolidate-bestiary.ts    (génération des fiches)
//   - tools/cladogram.ts               (commande `derive`)
// Pur : ne lit aucun fichier, ne dépend que des données passées en argument.
//
// TypeScript « effaçable » (erasable-only) : chargé tel quel par Node ≥ 22.18 via
// le type-stripping natif, y compris depuis un importateur .mjs (import "./derive.ts").
// Pas de tsconfig, pas d'étape de build : garder le code sans enum/namespace.

// ─── Types du domaine ─────────────────────────────────────────────────────────

/** Chaîne localisée { fr, en?… } telle qu'elle apparaît dans les YAML. */
export interface Localized {
  [locale: string]: string | undefined;
}

/** Palier de taille : décale le nombre de cases de chaque bloc (cf. applySize). */
export type Size = "minuscule" | "petit" | "normal" | "grand" | "enorme" | "colossal";

/** Ressource conférée « au début de la manche » par un bloc intact. */
export type BlockResource = "endurance" | "evasion" | "stability";

/** Ce que confère un bloc : prose d'affichage + ops mécaniques. */
export interface Grant {
  text?: Localized | "auto";
  grantsCard?: string;
  cardCost?: { card: string; cost: number };
  resource?: BlockResource;
  amount?: number;
  immunity?: string;
  armorAll?: number;
  /**
   * Bonus de GARDE conféré tant que le bloc est intact (s'ajoute à la garde de
   * base de la fiche). Détruire le bloc fait donc chuter la garde : c'est le
   * levier « aveugler/désarticuler la bête pour la toucher plus facilement ».
   */
  guard?: number;
  trait?: { name?: Localized; effect?: Localized };
  [key: string]: unknown;
}

/** Un bloc de cases d'une partie (confère une capacité tant qu'il est intact). */
export interface Block {
  cases: number;
  name?: Localized;
  grants?: Grant;
}

/** Une partie du corps, identifiée par `type`. */
export interface Part {
  type: string;
  name?: Localized;
  tag?: string;
  group?: string;
  armor?: number;
  description?: Localized;
  blocks: Block[];
}

/** Un trait (♾️ passif / ⚒️ actif). */
export interface Trait {
  id?: string;
  name?: Localized;
  kind?: string;
  effect?: Localized;
  source?: Localized;
}

/** Vitesse de déplacement (marche / course). */
export interface Speed {
  walk: number;
  run: number;
}

/** État accumulé pendant la dérivation racine→feuille. */
export interface State {
  parts: Part[];
  traits: Trait[];
  appearance: Localized[];
  fatigue: number;
  speed: Speed | null;
  grantActions: string[];
  size: Size | null;
}

/**
 * Modification d'un bloc HÉRITÉ, sélectionné par son NOM (la clé d'auteur, en fr).
 * Le nom est stable dans la chaîne de dérivation, contrairement à un index que
 * toute mutation intermédiaire décalerait.
 */
export interface BlockMod {
  /** Nom (fr) du bloc à modifier — erreur s'il est absent. */
  match: string;
  /** Remplace le nombre de cases. */
  cases?: number;
  /** Décale le nombre de cases (plancher 1). */
  casesAdd?: number;
  /** Renomme le bloc. */
  name?: Localized;
  /** REMPLACE intégralement ce que le bloc confère. */
  grants?: Grant;
  /** FUSIONNE dans le grant existant (ajoute / écrase des clés, garde le reste). */
  grantsMerge?: Grant;
}

/** Modification d'une partie existante portée par un kit. */
export interface PartMod {
  type: string;
  armor_set?: number;
  armor_add?: number;
  tag?: string;
  group?: string | null;
  name?: Localized;
  description?: Localized;
  descriptionAppend?: Localized;
  blocksModify?: BlockMod[];
  blocksAdd?: Block[];
  blocksPrepend?: Block[];
  blocksRemove?: number[];
}

/** Kit d'une mutation : ensemble d'opérations appliquées à l'état. */
export interface Kit {
  body?: Localized;
  fatigue?: number;
  speed?: Speed;
  size?: Size;
  /**
   * Ajoute cette valeur à l'armure de CHAQUE partie présente (celles héritées ET
   * celles ajoutées par ce même kit). STATIQUE et bake-in : agit sur les deux
   * canaux (réduit les 💢 ET encaisse une 💔), et n'est PAS perdue si une partie
   * cède — contrairement au grant runtime `armorAll`. Ex. : cuirasse généralisée.
   */
  armor_add_all?: number;
  addParts?: Part[];
  modifyPart?: PartMod;
  modifyParts?: PartMod[];
  removeParts?: string[];
  grant_action?: string | string[];
  traits?: Trait[];
}

/** Une mutation du cladogramme (seul le kit est utilisé ici). */
export interface Mutation {
  kit?: Kit;
  [key: string]: unknown;
}

/** Un nœud du cladogramme (feuille = `tip`, clade = `name`). */
export interface CladeNode {
  uid: string;
  mut?: string;
  name?: string;
  tip?: string;
  [key: string]: unknown;
}

/** Entrée du plan (mise à plat du cladogramme). */
export interface AncestryEntry {
  node: CladeNode;
  parent: string | null;
}

/** Cladogramme mis à plat : uid → { node, parent }. */
export type AncestryMap = Map<string, AncestryEntry>;

// ─── Noyau ────────────────────────────────────────────────────────────────────

export function newState(): State {
  return { parts: [], traits: [], appearance: [], fatigue: 0, speed: null, grantActions: [], size: null };
}

// ── Taille : décale le nombre de cases [ ] de CHAQUE bloc (encaissement à la blessure).
//    minuscule −2 · petit −1 · normal 0 · grand +1 · énorme +2 · colossal +3 (plancher 1 case).
//    C'est un axe PROPRE : indépendant de la puissance (facteur d'équilibrage) et de la fatigue.
export const SIZE_CASES: Record<Size, number> = {
  minuscule: -2, petit: -1, normal: 0, grand: 1, enorme: 2, colossal: 3,
};

export function applySize(parts: Part[], size: Size | string | null | undefined): void {
  const d = SIZE_CASES[size as Size] ?? 0;
  if (!d) return;
  for (const p of parts) for (const b of p.blocks || []) b.cases = Math.max(1, (b.cases || 0) + d);
}

function appendDescription(part: Part, add: Localized): void {
  part.description = part.description || {};
  for (const [loc, val] of Object.entries(add)) part.description[loc] = (part.description[loc] || "") + (val ?? "");
}

export function applyKit(state: State, key: string, kit: Kit | undefined): void {
  if (!kit) return;
  if (kit.body) state.appearance.push(kit.body);
  if (kit.fatigue) state.fatigue += kit.fatigue; // corps → s'additionne
  if (kit.speed) state.speed = structuredClone(kit.speed); // membres → la plus dérivée fixe
  if (kit.size) state.size = kit.size; // taille → la plus dérivée fixe (cf. applySize)
  for (const p of kit.addParts || []) {
    if (state.parts.some((x) => x.type === p.type)) throw new Error(`${key}: partie déjà présente : ${p.type}`);
    state.parts.push(structuredClone(p));
  }
  const mods: PartMod[] = [...(kit.modifyPart ? [kit.modifyPart] : []), ...(kit.modifyParts || [])];
  for (const m of mods) {
    const part = state.parts.find((x) => x.type === m.type);
    if (!part) throw new Error(`${key}: modifyPart d'une partie absente : ${m.type}`);
    if (m.armor_set !== undefined) part.armor = m.armor_set;
    if (m.armor_add !== undefined) part.armor = (part.armor ?? 0) + m.armor_add;
    if (m.tag) part.tag = m.tag;
    if ("group" in m) part.group = m.group || undefined; // group:null → sort du groupe
    if (m.name) part.name = structuredClone(m.name);
    if (m.description) part.description = structuredClone(m.description);
    if (m.descriptionAppend) appendDescription(part, m.descriptionAppend);
    // Modifie les blocs HÉRITÉS (par nom) AVANT tout ajout/suppression : la
    // sélection reste stable quelles que soient les mutations intermédiaires.
    for (const bm of m.blocksModify || []) {
      const block = part.blocks.find((b) => b.name?.fr === bm.match);
      if (!block) throw new Error(`${key}: blocksModify d'un bloc absent : « ${bm.match} » (partie ${m.type})`);
      if (bm.cases !== undefined) block.cases = bm.cases;
      if (bm.casesAdd !== undefined) block.cases = Math.max(1, (block.cases || 0) + bm.casesAdd);
      if (bm.name) block.name = structuredClone(bm.name);
      if (bm.grants) block.grants = structuredClone(bm.grants);
      if (bm.grantsMerge) block.grants = { ...(block.grants || {}), ...structuredClone(bm.grantsMerge) };
    }
    if (m.blocksAdd) part.blocks.push(...structuredClone(m.blocksAdd));
    if (m.blocksPrepend) part.blocks.unshift(...structuredClone(m.blocksPrepend));
    if (m.blocksRemove) for (const i of [...m.blocksRemove].sort((a, b) => b - a)) part.blocks.splice(i, 1);
  }
  for (const t of kit.removeParts || []) {
    const i = state.parts.findIndex((x) => x.type === t);
    if (i === -1) throw new Error(`${key}: removeParts d'une partie absente : ${t}`);
    state.parts.splice(i, 1);
  }
  // Après addParts/removeParts : la cuirasse générale couvre toutes les parties survivantes.
  if (kit.armor_add_all) for (const p of state.parts) p.armor = (p.armor ?? 0) + kit.armor_add_all;
  if (kit.grant_action) {
    const ids = Array.isArray(kit.grant_action) ? kit.grant_action : [kit.grant_action];
    state.grantActions.push(...ids);
  }
  if (kit.traits) state.traits.push(...structuredClone(kit.traits));
}

/** Remonte l'ascendance (racine → uid) et retourne les clés de mutation, dans l'ordre. */
export function ancestryMutations(map: AncestryMap, fromUid: string): string[] {
  let entry = map.get(fromUid);
  if (!entry) throw new Error(`from: uid introuvable dans le cladogramme : ${fromUid}`);
  const keys: string[] = [];
  while (entry) {
    if (entry.node.mut) keys.push(entry.node.mut);
    entry = entry.parent ? map.get(entry.parent) : undefined;
  }
  return keys.reverse();
}

/** Applique les kits de l'ascendance (+ extraMutations) et retourne { keys, withKit, state }. */
export function deriveState(
  map: AncestryMap,
  mutations: Record<string, Mutation | undefined>,
  fromUid: string,
  extraMutations: string[] = [],
): { keys: string[]; withKit: string[]; state: State } {
  const keys = [...ancestryMutations(map, fromUid), ...extraMutations];
  const state = newState();
  for (const key of keys) applyKit(state, key, mutations[key]?.kit);
  const withKit = keys.filter((k) => mutations[k]?.kit);
  return { keys, withKit, state };
}

/** Rendu texte d'une fiche dérivée (inspection en console). */
export function formatDerived(
  node: CladeNode,
  keys: string[],
  withKit: string[],
  state: State,
  actionLibrary: Record<string, { name?: Localized } | undefined> = {},
): string {
  const traits: Array<{ name?: Localized; source?: Localized }> = [...state.traits];
  for (const p of state.parts) for (const b of p.blocks || []) {
    if (b.grants && b.grants.trait) traits.push({ name: b.grants.trait.name, source: p.name });
  }
  const ids = [...new Set([
    ...state.grantActions,
    ...state.parts.flatMap((p) => (p.blocks || []).filter((b) => b.grants?.grantsCard).map((b) => b.grants!.grantsCard!)),
  ])];
  const out = [`\n━━━ ${node.tip || node.name} [${node.uid}] ━━━`];
  out.push(`ascendance : ${keys.length} mutations · avec kit (${withKit.length}) : ${withKit.join(", ") || "—"}`);
  out.push(`parties (${state.parts.length}) :`);
  for (const p of state.parts) {
    const blocks = (p.blocks || []).map((b) => {
      const g = b.grants || {};
      const eff = g.grantsCard ? `→${g.grantsCard}` : g.resource ? `+${g.amount} ${g.resource}`
        : g.trait ? `trait ${g.trait.name?.fr}` : g.armorAll ? `armorAll+${g.armorAll}` : "";
      return `${(b.name?.fr) || "?"}(${b.cases}${eff ? " " + eff : ""})`;
    });
    out.push(`  · ${(p.name?.fr) || p.type}${p.armor ? ` [🛡${p.armor}]` : ""} : ${blocks.join(" | ") || "—"}`);
  }
  out.push(`fatigue : ${state.fatigue}   vitesse : ${state.speed ? `${state.speed.walk}/${state.speed.run}` : "—"}`);
  out.push(`actions (${ids.length}) : ${ids.map((id) => actionLibrary[id]?.name?.fr || id).join(" · ") || "AUCUNE"}`);
  out.push(`traits (${traits.length}) : ${traits.map((t) => (t.name?.fr) || t.name).join(" · ") || "AUCUN"}`);
  out.push(`apparence : ${state.appearance.map((b) => b.fr).filter(Boolean).join(" · ") || "—"}`);
  return out.join("\n");
}
