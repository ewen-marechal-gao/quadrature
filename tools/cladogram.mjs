// Utilitaire de manipulation du cladogramme d'Aeonir (source de vérité).
// DEUX fichiers de DONNÉES + une vue GÉNÉRÉE :
//   data/cladogram.yaml       — l'ARBRE en LISTE PLATE : un nœud/ligne, structure via `parent`.
//   data/cladogram.tree.yaml  — GÉNÉRÉ (uid/mut imbriqués) : vue de structure, ne pas éditer.
//   data/mutations.yaml       — les mutations : clé -> { label{Locale}, description{Locale}, kit? }.
// L'arbre est réémis par un émetteur plat fidèle ; `mutations.yaml` se modifie par PATCH TEXTUEL
// chirurgical (mut-*), qui préserve commentaires et mise en forme (pas de dump YAML destructeur).
//
// CLI :  node tools/cladogram.mjs <commande> [args]
//   validate                          contrôle (clés inconnues, uid en double, parent orphelin)
//   ecology [--list]                  biome/habitat dérivés : cohérence + inventaire des aires
//   derive <uid> [<uid> ...]          fiche DÉRIVÉE d'un nœud (parties/blocs/actions/traits)
//   sync                              régénère cladogram.tree.yaml depuis le plat (après édition main)
//   print                             arbre indenté + label de mutation par nœud
//   mut-add <clé> <labelFr> <descFr>  ajoute une mutation
//   mut-relabel <clé> <labelFr>       change le label fr
//   mut-describe <clé> <descFr>       change la description fr
//   node-mut <nom|tip> <clé>          pose une mutation sur un nœud
//   node-clear-mut <nom|tip>          retire la mutation d'un nœud
//   node-cd <tip> <texte>             change le cd d'une feuille
//   node-ref <nom> <texte>            change le ref d'un clade
//   node-rename <ancien> <nouveau>    renomme un clade
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { deriveState, formatDerived, applySize } from "./derive.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
export const TREE_FILE = path.join(REPO, "data/cladogram.yaml");        // SOURCE : liste plate
export const TREE_MIN_FILE = path.join(REPO, "data/cladogram.tree.yaml"); // GÉNÉRÉ : arbre minimal (uid/mut)
export const MUT_FILE = path.join(REPO, "data/mutations.yaml");
const ACTIONS_FILE = path.join(REPO, "data/adversary_actions.yaml");
const require = createRequire(path.join(REPO, "web", "package.json"));
const yaml = require("js-yaml");

// ---- IO ----
export function loadRaw() {
  const treeText = fs.readFileSync(TREE_FILE, "utf8");
  const tree = yaml.load(treeText); // { title, rootNote, backlog, rootBiome, rootHabitat, nodes }
  const mutations = yaml.load(fs.readFileSync(MUT_FILE, "utf8")).mutations;
  const lines = treeText.split("\n");
  const idx = lines.findIndex((l) => l.trim() === "nodes:");
  if (idx === -1) throw new Error('clé "nodes:" introuvable dans data/cladogram.yaml');
  const header = lines.slice(0, idx).join("\n") + "\n";
  const nodes = tree.nodes ?? [];
  const root = buildRoot(nodes); // vue arborescente pour les consommateurs (objets PARTAGÉS avec `nodes`)
  return { data: { ...tree, nodes, mutations, root }, header };
}

/**
 * Reconstruit l'arbre à partir de la liste plate : rattache à chaque nœud un `.children`
 * selon `parent`, dans l'ORDRE du fichier (= ordre des frères). Les objets sont PARTAGÉS
 * avec `nodes` (une édition via findByUid se reflète à l'émission). Un parent introuvable
 * laisse le nœud hors de l'arbre (signalé par `validate`, jamais silencieusement perdu :
 * l'émission se fait depuis `nodes`, pas depuis l'arbre).
 */
export function buildRoot(nodes) {
  const byUid = new Map();
  for (const n of nodes) { delete n.children; byUid.set(n.uid, n); }
  const rootChildren = [];
  for (const n of nodes) {
    if (n.parent === "root" || n.parent == null) { rootChildren.push(n); continue; }
    const p = byUid.get(n.parent);
    if (p) (p.children ??= []).push(n);
  }
  // La branche BASALE (nœud sans `mut`) passe en PREMIER, avant les nœuds issus de mutations.
  // Tri STABLE (l'ordre relatif dans chaque groupe = ordre du fichier). → l'ordre d'affichage ne
  // dépend plus de l'ordre de déclaration entre basal et dérivé.
  const basalFirst = (a, b) => (a.mut ? 1 : 0) - (b.mut ? 1 : 0);
  rootChildren.sort(basalFirst);
  for (const n of nodes) if (n.children) n.children.sort(basalFirst);
  return { children: rootChildren };
}

// ---- émetteurs ----
// (1) Liste PLATE (source de vérité) : une ligne flow par nœud, émise dans l'ordre de `nodes`.
const QSTR = ["tip", "cd", "name", "ref", "branchNote"];
const BARE = ["uid", "mut", "parent"];
const FLAT_ORDER = ["uid", "parent", "name", "tip", "ref", "cd", "mut", "star", "branchNote"];
const flowField = (k, v) =>
  QSTR.includes(k) ? `${k}: ${JSON.stringify(v)}`
  : k === "star" ? `star: ${v}`
  : BARE.includes(k) ? `${k}: ${v}`
  : `${k}: ${JSON.stringify(v)}`;
// Style BLOC (pas flow) : un formateur YAML (Prettier…) reflow les objets flow `{…}` trop longs
// mais laisse le bloc canonique tranquille → stabilité face au format-on-save.
export const emitFlat = (nodes) =>
  "nodes:\n" + nodes.map((n) =>
    FLAT_ORDER.filter((k) => n[k] !== undefined)
      .map((k, i) => (i === 0 ? "  - " : "    ") + flowField(k, n[k]))
      .join("\n")
  ).join("\n");

// (2) Arbre MINIMAL généré (uid + mut + children) : vue de structure pour lecture rapide.
const MIN_HEADER =
  "# GÉNÉRÉ depuis data/cladogram.yaml — structure minimale (uid, mut). NE PAS ÉDITER.\n" +
  "# Vue arborescente de lecture ; la source de vérité est le fichier plat.\n";
export function emitMinimalTree(root) {
  const out = [];
  for (const c of root.children) {
    (function emit(node, indent) {
      const ind = " ".repeat(indent);
      out.push(`${ind}- uid: ${node.uid}`);
      if (node.mut) out.push(`${ind}  mut: ${node.mut}`);
      if (node.children && node.children.length) {
        out.push(`${ind}  children:`);
        for (const ch of node.children) emit(ch, indent + 4);
      }
    })(c, 0);
  }
  return out.join("\n");
}

// ---- écriture de l'arbre ----
// `mutations.yaml` n'est JAMAIS réécrit par un dump YAML (qui détruirait les commentaires
// de design) : il se modifie par PATCH TEXTUEL chirurgical (cf. mut-* dans la CLI), qui
// préserve commentaires ET mise en forme. saveTree ne touche donc qu'à l'arbre.
export const saveTree = (data, header) => {
  const root = buildRoot(data.nodes); // reconstruit depuis la source plate ; rattache les .children (partagés)
  // Émission en ordre DFS pré-ordre → le fichier reste tidy après un reparent. Les orphelins
  // éventuels (parent introuvable) sont ajoutés en fin pour ne JAMAIS perdre un nœud (validate les signale).
  const ordered = [];
  (function walk(n) { for (const c of n.children ?? []) { ordered.push(c); walk(c); } })(root);
  const seen = new Set(ordered);
  for (const n of data.nodes) if (!seen.has(n)) ordered.push(n);
  fs.writeFileSync(TREE_FILE, header + emitFlat(ordered) + "\n");            // source (plat, bloc, DFS)
  fs.writeFileSync(TREE_MIN_FILE, MIN_HEADER + emitMinimalTree(root) + "\n"); // vue générée
};

// ---- recherche / validation ----
export function findAny(root, label) {
  let found = null;
  (function w(n) { if (found) return; if (n.name === label || n.tip === label) { found = n; return; } if (n.children) n.children.forEach(w); })(root);
  return found;
}
export function findByUid(root, uid) {
  let found = null;
  (function w(n) { if (found) return; if (n.uid === uid) { found = n; return; } if (n.children) n.children.forEach(w); })(root);
  return found;
}
// Mise à plat de l'arbre en Map<uid, { node, parent }> (parent = uid du parent, null au sommet).
export function flatten(root) {
  const map = new Map();
  (function w(n, parent) {
    if (n.uid) map.set(n.uid, { node: n, parent });
    if (n.children) n.children.forEach((c) => w(c, n.uid ?? parent));
  })(root, null);
  return map;
}
// ---- écologie dérivée (biome / habitat) ----
export const BIOMES = ["north", "dawn", "dusk", "south"];
export const HABITATS = ["terrestrial", "aquatic", "aerial"];
/** Lettre affichée pour chaque biome (N Nord · L Levant · C Couchant · S Sud). */
export const BIOME_LETTER = { north: "N", dawn: "L", dusk: "C", south: "S" };

const applyEco = (set, mut, addKey, removeKey) => {
  const next = new Set(set);
  for (const v of mut?.[removeKey] ?? []) next.delete(v); // remove d'abord…
  for (const v of mut?.[addKey] ?? []) next.add(v); //        …puis add (une mutation peut déplacer)
  return next;
};

/**
 * Replie les transitions d'écologie racine→feuille.
 * @returns Map<uid, { biomes: Set<string>, habitats: Set<string> }>
 */
export function deriveEcology(data) {
  const out = new Map();
  (function walk(node, biomes, habitats) {
    const m = node.mut ? data.mutations[node.mut] : null;
    const b = applyEco(biomes, m, "addBiome", "removeBiome");
    const h = applyEco(habitats, m, "addHabitat", "removeHabitat");
    if (node.uid) out.set(node.uid, { biomes: b, habitats: h });
    (node.children ?? []).forEach((c) => walk(c, b, h));
  })(data.root, new Set(data.rootBiome ?? []), new Set(data.rootHabitat ?? []));
  return out;
}

/** Lettres NLCS (ordre canonique) d'un ensemble de biomes dérivé. */
export const biomesToLetters = (set) =>
  BIOMES.filter((b) => set.has(b)).map((b) => BIOME_LETTER[b]).join("");

export function validate(data) {
  const keys = new Set(Object.keys(data.mutations));
  const used = new Set(), unknown = []; let leaves = 0, nodes = 0;
  (function w(n) { if (n.mut) { used.add(n.mut); if (!keys.has(n.mut)) unknown.push(n.mut); } if (n.children && n.children.length) { nodes++; n.children.forEach(w); } else leaves++; })(data.root);
  // Structure de la liste plate : uid uniques, parent existant (ou "root").
  const byUid = new Map(), dupUid = [], orphan = [];
  for (const n of data.nodes ?? []) { if (byUid.has(n.uid)) dupUid.push(n.uid); byUid.set(n.uid, n); }
  for (const n of data.nodes ?? []) if (n.parent !== "root" && !byUid.has(n.parent)) orphan.push(`${n.uid}→${n.parent}`);
  return { total: keys.size, used: used.size, unused: [...keys].filter((k) => !used.has(k)), unknown: [...new Set(unknown)], leaves, nodes, dupUid, orphan };
}

// ---- CLI ----
const req = (x, what) => { if (!x) throw new Error(`introuvable : ${what}`); return x; };
function report() {
  const { data } = loadRaw(); const v = validate(data);
  console.log(`${v.total} mutations · ${v.leaves} feuilles · ${v.nodes} nœuds`);
  if (v.unknown.length) console.log(`⚠ clés mut inconnues : ${v.unknown.join(", ")}`);
  if (v.dupUid.length) console.log(`⚠ uid en double : ${v.dupUid.join(", ")}`);
  if (v.orphan.length) console.log(`⚠ parent introuvable : ${v.orphan.join(", ")}`);
  console.log(`non placées (dans le dict, hors arbre) : ${v.unused.join(", ") || "(aucune)"}`);
}
function printTree() {
  const { data } = loadRaw();
  (function w(n, d) {
    const name = n.name || n.tip;
    if (name) { const lbl = n.mut ? ` ●${data.mutations[n.mut]?.label.fr ?? "?" + n.mut}` : ""; console.log("  ".repeat(d) + name + lbl); }
    if (n.children) n.children.forEach((c) => w(c, d + 1));
  })(data.root, 0);
}
/**
 * Rapport d'écologie DÉRIVÉE (biome + habitat) : contrôle de cohérence puis inventaire.
 * Signale les clés inconnues et les feuilles à ensemble vide (une créature doit bien
 * vivre quelque part, dans un milieu). `--list` détaille chaque feuille.
 */
function ecologyReport(flag) {
  const { data } = loadRaw();
  const eco = deriveEcology(data);

  const okB = new Set(BIOMES), okH = new Set(HABITATS);
  const badKeys = [];
  for (const [key, m] of Object.entries(data.mutations)) {
    for (const f of ["addBiome", "removeBiome"])
      for (const v of m[f] ?? []) if (!okB.has(v)) badKeys.push(`${key}.${f}: ${v}`);
    for (const f of ["addHabitat", "removeHabitat"])
      for (const v of m[f] ?? []) if (!okH.has(v)) badKeys.push(`${key}.${f}: ${v}`);
  }
  if (badKeys.length) console.log(`⚠ clés d'écologie inconnues :\n  ${badKeys.join("\n  ")}`);

  const leaves = [], noBiome = [], noHabitat = [];
  (function walk(node) {
    if (!(node.children && node.children.length)) {
      if (!node.uid) return;
      const e = eco.get(node.uid);
      leaves.push({ uid: node.uid, biomes: biomesToLetters(e.biomes), habitats: [...e.habitats] });
      if (!e.biomes.size) noBiome.push(node.uid);
      if (!e.habitats.size) noHabitat.push(node.uid);
      return;
    }
    node.children.forEach(walk);
  })(data.root);

  const carriers = Object.entries(data.mutations).filter(([, m]) =>
    m.addBiome || m.removeBiome || m.addHabitat || m.removeHabitat
  ).length;
  console.log(`graine : biome=[${(data.rootBiome ?? []).join(",")}] habitat=[${(data.rootHabitat ?? []).join(",")}]`);
  console.log(`${carriers} mutation(s) portent une transition · ${leaves.length} feuilles`);

  const dist = new Map();
  for (const l of leaves) dist.set(l.biomes || "∅", (dist.get(l.biomes || "∅") ?? 0) + 1);
  console.log("aires : " + [...dist].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(" · "));

  if (noBiome.length) console.log(`⚠ ${noBiome.length} feuille(s) SANS biome : ${noBiome.join(", ")}`);
  if (noHabitat.length) console.log(`⚠ ${noHabitat.length} feuille(s) SANS milieu : ${noHabitat.join(", ")}`);
  if (!noBiome.length && !noHabitat.length) console.log("✓ toute feuille a un biome et un milieu.");

  if (flag === "--list")
    for (const l of leaves) console.log(`  ${l.uid.padEnd(26)} ${(l.biomes || "∅").padEnd(6)} ${l.habitats.join("+")}`);
}

/** Édite l'ARBRE : réécrit cladogram.yaml (plat) + la vue générée cladogram.tree.yaml. */
const editTree = (fn) => { const { data, header } = loadRaw(); fn(data); saveTree(data, header); report(); };

// ---- édition SÛRE de mutations.yaml : PATCH TEXTUEL minimal (une ligne), commentaires ET
// mise en forme préservés. (eemeli/yaml préserve les commentaires mais reformate TOUT le
// fichier → écarté.) Format attendu : bloc `  <clé>:` puis `    label:` / `    description:`
// puis `      fr: …`. Sur une forme inattendue, échec BRUYANT (jamais de corruption).
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mutKeyRe = (key) => new RegExp("^  " + reEsc(key) + ":\\s*$");
const isMutKey = (l) => /^  [A-Za-z][\w]*:\s*$/.test(l);
const eolOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");
function patchMutScalar(key, section, value) {
  const text = fs.readFileSync(MUT_FILE, "utf8");
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => mutKeyRe(key).test(l));
  if (start === -1) throw new Error(`mutation introuvable : ${key}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (isMutKey(lines[i])) { end = i; break; }
  const secRe = new RegExp("^    " + section + ":\\s*$");
  let sec = -1; for (let i = start + 1; i < end; i++) if (secRe.test(lines[i])) { sec = i; break; }
  if (sec === -1) throw new Error(`${section} (bloc) absent pour ${key} — éditer à la main`);
  let fr = -1; for (let i = sec + 1; i < end; i++) if (/^      fr:/.test(lines[i])) { fr = i; break; }
  if (fr === -1) throw new Error(`fr absent pour ${key}.${section} — éditer à la main`);
  lines[fr] = `      fr: ${JSON.stringify(value)}`;
  fs.writeFileSync(MUT_FILE, lines.join(eol));
}
function addMutation(key, label, desc) {
  const text = fs.readFileSync(MUT_FILE, "utf8");
  const eol = eolOf(text);
  if (text.split(/\r?\n/).some((l) => mutKeyRe(key).test(l))) throw new Error(`mutation déjà présente : ${key}`);
  const block = ["  " + key + ":", "    label:", `      fr: ${JSON.stringify(label)}`,
    "    description:", `      fr: ${JSON.stringify(desc || "")}`].join(eol);
  fs.writeFileSync(MUT_FILE, text.replace(/(\r?\n)*$/, "") + eol + block + eol);
}

function deriveCmd(...uids) {
  if (!uids.length) throw new Error("usage : derive <uid> [<uid> ...]");
  const { data } = loadRaw();
  const map = flatten(data.root);
  const actions = yaml.load(fs.readFileSync(ACTIONS_FILE, "utf8")).actions || {};
  for (const uid of uids) {
    const entry = map.get(uid);
    if (!entry) throw new Error(`uid introuvable : ${uid}`);
    const { keys, withKit, state } = deriveState(map, data.mutations, uid);
    applySize(state.parts, state.size); // taille → décale les cases (dérivée seule ; sans surcharge d'espèce)
    console.log(formatDerived(entry.node, keys, withKit, state, actions) + (state.size ? `\ntaille : ${state.size}` : ""));
  }
}

const CMDS = {
  validate: report,
  ecology: ecologyReport,
  print: printTree,
  derive: deriveCmd,
  sync: () => editTree(() => {}), // régénère cladogram.tree.yaml (+ recanonicalise le plat) après édition main

  "mut-add": (key, label, desc) => { addMutation(key, label, desc); report(); },
  "mut-relabel": (key, label) => { patchMutScalar(key, "label", label); report(); },
  "mut-describe": (key, desc) => { patchMutScalar(key, "description", desc); report(); },
  "node-mut": (name, key) => editTree((d) => { if (!d.mutations[key]) throw new Error(`clé inconnue : ${key}`); req(findAny(d.root, name), name).mut = key; }),
  "node-clear-mut": (name) => editTree((d) => { delete req(findAny(d.root, name), name).mut; }),
  "node-cd": (name, cd) => editTree((d) => { req(findAny(d.root, name), name).cd = cd; }),
  "node-ref": (name, ref) => editTree((d) => { req(findAny(d.root, name), name).ref = ref; }),
  "node-rename": (oldN, newN) => editTree((d) => { req(findAny(d.root, oldN), oldN).name = newN; }),
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || !CMDS[cmd]) { console.log("Commandes : " + Object.keys(CMDS).join(", ")); process.exit(cmd ? 1 : 0); }
  try { CMDS[cmd](...args); } catch (e) { console.error("Erreur :", e.message); process.exit(1); }
}
