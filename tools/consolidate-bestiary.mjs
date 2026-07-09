// Consolide les fiches d'adversaires : data/bestiary/species/<id>.yaml -> data/bestiary/cards/<id>.card.yaml.
//
// Algorithme : (1) mise à plat du cladogramme en Map<uid,{node,parent}> (une fois) ;
// par source : (2) trouver le nœud via `from` ; (3) remonter par `parent` en empilant les
// clés de mutation ; (4) inverser (racine -> espèce) puis appliquer les kits, avec garde-fous
// (jamais deux parties de même slug ; pas de modif/suppression d'une partie inexistante).
// On fusionne enfin les stats NON dérivées (name, power, dice, guard, speed, fatigue, description)
// et les extras (extraMutations, extraParts, extraTraits) et retraits (removeCards, removeTraits) de la source.
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
const ACTIONS_FILE = path.join(REPO, "data/adversary_actions.yaml");

// Bibliothèque d'actions partagée : id -> def (name/cost/initiative/onSuccess…).
// Référencée par les blocs (grantsCard) et les kits (grant_action).
const ACTION_LIBRARY = yaml.load(fs.readFileSync(ACTIONS_FILE, "utf8")).actions || {};

// Ordre anatomique canonique d'affichage des parties.
const PART_ORDER = ["head", "body", "jaws", "carapace", "emSpines", "sickles",
  "huntingClaws", "glidingMembrane", "limbs", "frontLeg", "middleLeg", "rearLeg", "tail"];
const partRank = (t) => { const i = PART_ORDER.indexOf(t); return i === -1 ? 99 : i; };

// Noms des parties issues de la fusion de membres similaires (par `group`).
const GROUP_NAMES = { limbs: { fr: "Membres" } };

/**
 * Fusionne les parties partageant un même `group` (≥ 2 membres) en UNE partie à
 * blocs nommés — ex. les 3 paires de pattes d'un hexapode → « Membres » (blocs
 * Pattes antérieures / médianes / postérieures). Un groupe à 1 seul membre reste
 * tel quel (un quadrupède/biped garde sa patte propre). Le champ `group` est
 * interne : il est retiré de toutes les parties à l'émission.
 */
function mergeLimbGroups(parts) {
  const counts = {};
  for (const p of parts) if (p.group) counts[p.group] = (counts[p.group] || 0) + 1;
  const out = [];
  const merged = {};
  for (const p of parts) {
    if (!p.group || counts[p.group] < 2) {
      const { group, ...rest } = p; // eslint-disable-line no-unused-vars
      out.push(rest);
      continue;
    }
    if (!merged[p.group]) {
      merged[p.group] = { type: p.group, ...(p.tag && { tag: p.tag }), name: GROUP_NAMES[p.group] ?? p.name, armor: p.armor, blocks: [] };
      out.push(merged[p.group]);
    }
    for (const b of p.blocks || []) merged[p.group].blocks.push(b.name ? b : { ...b, name: p.name });
  }
  return out;
}

// Normalise la forme d'un bloc en sortie : le champ `grants` doit toujours être
// { text: {Locale}, …ops }. Les blocs sources hérités (grants = {fr,en?}) sont
// enveloppés ; ceux déjà en nouvelle forme (grants.text présent) sont inchangés.
function normalizeBlock(block) {
  const g = block.grants;
  if (!g || g.text) return block;
  return { ...block, grants: { text: g } };
}
function normalizePartBlocks(part) {
  return { ...part, blocks: (part.blocks || []).map(normalizeBlock) };
}

// Ids d'actions conférées par les blocs d'une liste de parties (grantsCard).
function deckIdsFromParts(parts) {
  const ids = [];
  for (const p of parts || []) for (const b of p.blocks || []) {
    if (b.grants && b.grants.grantsCard) ids.push(b.grants.grantsCard);
  }
  return ids;
}

// Résout une liste d'ids (dédupliquée) en cartes depuis la bibliothèque, triées par initiative.
function resolveDeck(ids) {
  const seen = new Set();
  const cards = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const def = ACTION_LIBRARY[id];
    if (!def) throw new Error(`action introuvable dans data/adversary_actions.yaml : ${id}`);
    cards.push({ id, ...structuredClone(def) });
  }
  return cards.sort((a, b) => a.initiative - b.initiative);
}

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
    if (m.tag) part.tag = m.tag;
    if ("group" in m) part.group = m.group || undefined; // group:null → sort du groupe (membre repurposé)
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
  if (kit.grant_action) {
    const ids = Array.isArray(kit.grant_action) ? kit.grant_action : [kit.grant_action];
    state.grantActions.push(...ids); // actions innées (non liées à un bloc destructible)
  }
  if (kit.traits) state.traits.push(...structuredClone(kit.traits));
}

function consolidate(source, map, mutations) {
  const keys = [...ancestryMutations(map, source.from), ...(source.extraMutations || [])];
  const state = { parts: [], traits: [], appearance: [], fatigue: 0, speed: null, grantActions: [] };
  for (const key of keys) applyKit(state, key, mutations[key]?.kit);

  for (const p of source.extraParts || []) {
    if (state.parts.some((x) => x.type === p.type)) throw new Error(`extraParts: partie déjà présente : ${p.type}`);
    state.parts.push(structuredClone(p));
  }
  if (source.extraTraits) state.traits.push(...structuredClone(source.extraTraits));
  // Retraits d'équilibrage : l'ascendance ajoute, l'espèce peut soustraire (par id).
  if (source.removeTraits) {
    const rm = new Set(source.removeTraits);
    state.traits = state.traits.filter((t) => !rm.has(t.id));
  }

  state.parts.sort((a, b) => partRank(a.type) - partRank(b.type));
  state.parts = mergeLimbGroups(state.parts); // fusionne les membres similaires (ex. hexapode → « Membres »)

  // Deck : actions conférées par les blocs (grantsCard) + innées (grant_action),
  // résolues depuis la bibliothèque partagée. Les armes confèrent via leurs blocs.
  const weapons = source.weapons ? structuredClone(source.weapons) : null;
  const removeCards = new Set(source.removeCards || []);
  // removeCards retire la carte ET le bloc qui la conférait : un bloc = une
  // capacité, un bloc conférant une carte retirée serait un « bloc mort ».
  if (removeCards.size) {
    for (const p of [...state.parts, ...(weapons || [])]) {
      p.blocks = (p.blocks || []).filter((b) => !(b.grants && removeCards.has(b.grants.grantsCard)));
    }
  }
  // Traits conférés par un bloc (grants.trait) → surfacés dans la liste des traits,
  // avec leur partie SOURCE : ils restent conditionnels à l'intégrité du bloc
  // (ex. Blindage lourd de la Carapace, Stabilité de la Queue).
  for (const p of [...state.parts, ...(weapons || [])]) {
    for (const b of p.blocks || []) {
      if (b.grants && b.grants.trait) {
        state.traits.push({ name: b.grants.trait.name, kind: "passive", effect: b.grants.trait.effect, source: p.name });
      }
    }
  }

  const deckIds = [
    ...state.grantActions,
    ...deckIdsFromParts(state.parts),
    ...deckIdsFromParts(weapons),
  ].filter((id) => !removeCards.has(id)); // filet : couvre aussi les grant_action innées
  const cards = resolveDeck(deckIds);

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
    parts: state.parts.map(normalizePartBlocks),
    ...(weapons ? { weapons: weapons.map(normalizePartBlocks) } : {}),
    ...(state.traits.length ? { traits: state.traits } : {}),
    cards,
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
