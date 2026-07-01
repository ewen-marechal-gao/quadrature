// Consolide les fiches d'adversaires : data/bestiary/species/<id>.yaml -> data/bestiary/cards/<id>.card.yaml.
//
// Algorithme : (1) mise à plat du cladogramme en Map<uid,{node,parent}> (une fois) ;
// par source : (2) trouver le nœud via `from` ; (3) remonter par `parent` en empilant les
// clés de mutation ; (4) inverser (racine -> espèce) puis appliquer les kits, avec garde-fous
// (jamais deux parties de même slug ; pas de modif/suppression d'une partie inexistante).
// On fusionne enfin les stats NON dérivées (name, power, dice, guard, speed, fatigue, description)
// et les extras (extraMutations, extraParts, extraTraits) de la source.
//
// Usage : node tools/consolidate-bestiary.mjs
import { loadRaw, flatten } from "./cladogram.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const require = createRequire(path.join(REPO, "web", "package.json"));
const yaml = require("js-yaml");

const SPECIES_DIR = path.join(REPO, "data/bestiary/species");
const CARDS_DIR = path.join(REPO, "data/bestiary/cards");

// Ordre anatomique canonique d'affichage des parties.
const PART_ORDER = ["head", "body", "jaws", "carapace", "emSpines", "sickles",
  "huntingClaws", "glidingMembrane", "frontLeg", "middleLeg", "rearLeg", "tail"];
const partRank = (t) => { const i = PART_ORDER.indexOf(t); return i === -1 ? 99 : i; };

// Remonte l'ascendance (racine -> espèce) et retourne les clés de mutation, dans l'ordre.
function ancestryMutations(map, fromUid) {
  let entry = map.get(fromUid);
  if (!entry) throw new Error(`from: uid introuvable dans le cladogramme : ${fromUid}`);
  const keys = [];
  while (entry) {
    if (entry.node.mut) keys.push(entry.node.mut);
    entry = entry.parent ? map.get(entry.parent) : null;
  }
  return keys.reverse();
}

function appendDescription(part, add) {
  part.description = part.description || {};
  for (const [loc, val] of Object.entries(add)) part.description[loc] = (part.description[loc] || "") + val;
}

function applyKit(state, key, kit) {
  if (!kit) return;
  if (kit.body) state.appearance.push(kit.body);
  if (kit.fatigue) state.fatigue += kit.fatigue; // corps → s'additionne
  if (kit.speed) state.speed = structuredClone(kit.speed); // membres → la plus dérivée fixe
  for (const p of kit.addParts || []) {
    if (state.parts.some((x) => x.type === p.type)) throw new Error(`${key}: partie déjà présente : ${p.type}`);
    state.parts.push(structuredClone(p));
  }
  const mods = [...(kit.modifyPart ? [kit.modifyPart] : []), ...(kit.modifyParts || [])];
  for (const m of mods) {
    const part = state.parts.find((x) => x.type === m.type);
    if (!part) throw new Error(`${key}: modifyPart d'une partie absente : ${m.type}`);
    if (m.armor_set !== undefined) part.armor = m.armor_set;
    if (m.armor_add !== undefined) part.armor = (part.armor ?? 0) + m.armor_add;
    if (m.name) part.name = structuredClone(m.name);
    if (m.description) part.description = structuredClone(m.description);
    if (m.descriptionAppend) appendDescription(part, m.descriptionAppend);
    if (m.blocksAdd) part.blocks.push(...structuredClone(m.blocksAdd));
    if (m.blocksPrepend) part.blocks.unshift(...structuredClone(m.blocksPrepend));
    if (m.blocksRemove) for (const i of [...m.blocksRemove].sort((a, b) => b - a)) part.blocks.splice(i, 1);
  }
  for (const t of kit.removeParts || []) {
    const i = state.parts.findIndex((x) => x.type === t);
    if (i === -1) throw new Error(`${key}: removeParts d'une partie absente : ${t}`);
    state.parts.splice(i, 1);
  }
  if (kit.cards) state.cards.push(...structuredClone(kit.cards));
  if (kit.traits) state.traits.push(...structuredClone(kit.traits));
}

function consolidate(source, map, mutations) {
  const keys = [...ancestryMutations(map, source.from), ...(source.extraMutations || [])];
  const state = { parts: [], cards: [], traits: [], appearance: [], fatigue: 0, speed: null };
  for (const key of keys) applyKit(state, key, mutations[key]?.kit);

  for (const p of source.extraParts || []) {
    if (state.parts.some((x) => x.type === p.type)) throw new Error(`extraParts: partie déjà présente : ${p.type}`);
    state.parts.push(structuredClone(p));
  }
  if (source.extraTraits) state.traits.push(...structuredClone(source.extraTraits));
  if (source.extraCards) state.cards.push(...structuredClone(source.extraCards));

  state.parts.sort((a, b) => partRank(a.type) - partRank(b.type));
  state.cards.sort((a, b) => a.initiative - b.initiative);

  const appearanceFr = state.appearance.map((b) => b.fr).filter(Boolean).join(" · ");
  return {
    id: source.id,
    name: source.name,
    power: source.power,
    dice: source.dice,
    ...(source.description ? { description: source.description } : {}),
    guard: source.guard,
    speed: source.speed ?? state.speed ?? { walk: 0, run: 0 }, // source surcharge sinon dérivé
    fatigue: source.fatigue ?? state.fatigue,
    ...(appearanceFr ? { appearance: { fr: appearanceFr } } : {}),
    parts: state.parts,
    ...(source.weapons ? { weapons: structuredClone(source.weapons) } : {}),
    ...(state.traits.length ? { traits: state.traits } : {}),
    cards: state.cards,
  };
}

// ---- exécution ----
const { data } = loadRaw();
const map = flatten(data.root);
const HEADER = `# GÉNÉRÉ par tools/consolidate-bestiary.mjs — NE PAS ÉDITER À LA MAIN.
# Source : data/bestiary/species/<id>.yaml ; parties/cartes/traits dérivés du cladogramme (via \`from\`).
`;

const sources = fs.readdirSync(SPECIES_DIR).filter((f) => f.endsWith(".yaml")).sort();
for (const file of sources) {
  const source = yaml.load(fs.readFileSync(path.join(SPECIES_DIR, file), "utf8"));
  const card = consolidate(source, map, data.mutations);
  fs.writeFileSync(path.join(CARDS_DIR, `${source.id}.card.yaml`),
    HEADER + yaml.dump(card, { lineWidth: -1, noRefs: true, quotingType: '"' }));
  console.log(`✓ ${source.id} : ${card.parts.length} parties · ${card.cards.length} cartes · ${card.traits?.length || 0} traits`);
}
console.log(`${sources.length} fiche(s) générée(s).`);
