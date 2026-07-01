// Utilitaire de manipulation du cladogramme d'Aeonir (source de vérité).
// DEUX fichiers :
//   data/cladogram.yaml — l'ARBRE (title, rootNote, backlog, root:) ; chaque nœud a un `uid`
//                         (slug stable) et référence une mutation par sa CLÉ (champ `mut`).
//   data/mutations.yaml — les mutations : clé -> { label{Locale}, description{Locale}, kit? }.
// L'arbre est réémis par un émetteur fidèle au style (feuilles en flow, uid/status/biome/mut bruts) ;
// les mutations sont réémises via yaml.dump (structure trop imbriquée pour un émetteur maison).
//
// CLI :  node tools/cladogram.mjs <commande> [args]
//   validate                          contrôle (clés inconnues, mutations non placées)
//   print                             arbre indenté + label de mutation par nœud
//   mut-add <clé> <labelFr> <descFr>  ajoute une mutation
//   mut-relabel <clé> <labelFr>       change le label fr
//   mut-describe <clé> <descFr>       change la description fr
//   node-mut <nom|tip> <clé>          pose une mutation sur un nœud
//   node-clear-mut <nom|tip>          retire la mutation d'un nœud
//   node-status <tip> <done|todo>     change le statut d'une feuille
//   node-cd <tip> <texte>             change le cd d'une feuille
//   node-ref <nom> <texte>            change le ref d'un clade
//   node-rename <ancien> <nouveau>    renomme un clade
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
export const TREE_FILE = path.join(REPO, "data/cladogram.yaml");
export const MUT_FILE = path.join(REPO, "data/mutations.yaml");
const require = createRequire(path.join(REPO, "web", "package.json"));
const yaml = require("js-yaml");

// ---- IO ----
export function loadRaw() {
  const treeText = fs.readFileSync(TREE_FILE, "utf8");
  const tree = yaml.load(treeText); // { title, rootNote, backlog, root }
  const mutations = yaml.load(fs.readFileSync(MUT_FILE, "utf8")).mutations;
  const lines = treeText.split("\n");
  const idx = lines.findIndex((l) => l.trim() === "root:");
  if (idx === -1) throw new Error('clé "root:" introuvable dans data/cladogram.yaml');
  const header = lines.slice(0, idx).join("\n") + "\n";
  return { data: { ...tree, mutations }, header };
}

// ---- émetteur de l'arbre (fidèle au style du fichier) ----
const QSTR = ["tip", "cd", "name", "ref", "branchNote"];
const BARE = ["uid", "status", "biome", "mut"];
const flowField = (k, v) =>
  QSTR.includes(k) ? `${k}: ${JSON.stringify(v)}`
  : k === "star" ? `star: ${v}`
  : BARE.includes(k) ? `${k}: ${v}`
  : `${k}: ${JSON.stringify(v)}`;
const emitFlow = (leaf) => `{ ${Object.keys(leaf).filter((k) => k !== "children").map((k) => flowField(k, leaf[k])).join(", ")} }`;
function emitNode(node, indent) {
  const ind = " ".repeat(indent);
  if (node.tip !== undefined) return [`${ind}- ${emitFlow(node)}`];
  const scal = Object.keys(node).filter((k) => k !== "children");
  const lines = scal.map((k, i) => (i === 0 ? `${ind}- ` : " ".repeat(indent + 2)) + flowField(k, node[k]));
  if (node.children) { lines.push(`${" ".repeat(indent + 2)}children:`); for (const c of node.children) lines.push(...emitNode(c, indent + 4)); }
  return lines;
}
export const emitTree = (root) => "root:\n  children:\n" + root.children.flatMap((c) => emitNode(c, 4)).join("\n");

// ---- émetteur des mutations (yaml.dump + en-tête stable) ----
const MUT_HEADER = `# Mutations d'Aeonir — clé -> { label{Locale}, description{Locale}, kit? }.
# label/description = lore (i18n) ; kit = brique de fiche d'adversaire (cf. rules/fr/adversaires/regles_adversaires.md, connexion III).
# Référencées par l'arbre (data/cladogram.yaml, champ \`mut\`) et par les fiches de bestiaire.
# Édition via tools/cladogram.mjs.
`;
export const emitMutationsFile = (mutations) =>
  MUT_HEADER + yaml.dump({ mutations }, { lineWidth: -1, noRefs: true, quotingType: '"' });

export const save = (data, header) => {
  fs.writeFileSync(TREE_FILE, header + emitTree(data.root) + "\n");
  fs.writeFileSync(MUT_FILE, emitMutationsFile(data.mutations));
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
export function validate(data) {
  const keys = new Set(Object.keys(data.mutations));
  const used = new Set(), unknown = []; let leaves = 0, nodes = 0;
  (function w(n) { if (n.mut) { used.add(n.mut); if (!keys.has(n.mut)) unknown.push(n.mut); } if (n.children && n.children.length) { nodes++; n.children.forEach(w); } else leaves++; })(data.root);
  return { total: keys.size, used: used.size, unused: [...keys].filter((k) => !used.has(k)), unknown: [...new Set(unknown)], leaves, nodes };
}

// ---- CLI ----
const req = (x, what) => { if (!x) throw new Error(`introuvable : ${what}`); return x; };
function report() {
  const { data } = loadRaw(); const v = validate(data);
  console.log(`${v.total} mutations · ${v.leaves} feuilles · ${v.nodes} nœuds`);
  if (v.unknown.length) console.log(`⚠ clés mut inconnues : ${v.unknown.join(", ")}`);
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
const mutate = (fn) => { const { data, header } = loadRaw(); fn(data); save(data, header); report(); };
const CMDS = {
  validate: report,
  print: printTree,
  "mut-add": (key, label, desc) => mutate((d) => { d.mutations[key] = { label: { fr: label }, description: { fr: desc || "" } }; }),
  "mut-relabel": (key, label) => mutate((d) => { req(d.mutations[key], `mutation ${key}`).label.fr = label; }),
  "mut-describe": (key, desc) => mutate((d) => { req(d.mutations[key], `mutation ${key}`).description.fr = desc; }),
  "node-mut": (name, key) => mutate((d) => { if (!d.mutations[key]) throw new Error(`clé inconnue : ${key}`); req(findAny(d.root, name), name).mut = key; }),
  "node-clear-mut": (name) => mutate((d) => { delete req(findAny(d.root, name), name).mut; }),
  "node-status": (name, st) => mutate((d) => { req(findAny(d.root, name), name).status = st; }),
  "node-cd": (name, cd) => mutate((d) => { req(findAny(d.root, name), name).cd = cd; }),
  "node-ref": (name, ref) => mutate((d) => { req(findAny(d.root, name), name).ref = ref; }),
  "node-rename": (oldN, newN) => mutate((d) => { req(findAny(d.root, oldN), oldN).name = newN; }),
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || !CMDS[cmd]) { console.log("Commandes : " + Object.keys(CMDS).join(", ")); process.exit(cmd ? 1 : 0); }
  try { CMDS[cmd](...args); } catch (e) { console.error("Erreur :", e.message); process.exit(1); }
}
