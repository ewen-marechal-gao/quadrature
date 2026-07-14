// Consolide les fiches d'adversaires : data/bestiary/species/<id>.yaml -> data/bestiary/cards/<id>.card.yaml.
//
// Algorithme : (1) mise à plat du cladogramme en Map<uid,{node,parent}> (une fois) ;
// par source : (2) trouver le nœud via `from` ; (3) remonter par `parent` en empilant les
// clés de mutation ; (4) inverser (racine -> espèce) puis appliquer les kits, avec garde-fous
// (jamais deux parties de même slug ; pas de modif/suppression d'une partie inexistante).
// On fusionne enfin les stats NON dérivées (name, power, dice, guard, speed, fatigue, description)
// et les extras (extraMutations, extraParts, extraTraits) et retraits (removeCards, removeTraits) de la source.
//
// TypeScript « effaçable » exécuté par Node ≥ 22.18 (type-stripping natif). Usage : node tools/consolidate-bestiary.ts
import { loadRaw, flatten } from "./cladogram.ts";
import { applyKit, ancestryMutations, applySize } from "./derive.ts"; // noyau de dérivation PARTAGÉ (TS)
import type { Block, Part, State } from "./derive.ts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const require = createRequire(path.join(REPO, "web", "package.json"));
const yaml: any = require("js-yaml");

const SPECIES_DIR = path.join(REPO, "data/bestiary/species");
const CARDS_DIR = path.join(REPO, "data/bestiary/cards");
const ACTIONS_FILE = path.join(REPO, "data/adversary_actions.yaml");

// Bibliothèque d'actions partagée : id -> def (name/cost/initiative/onSuccess…).
// Référencée par les blocs (grantsCard) et les kits (grant_action).
const ACTION_LIBRARY: Record<string, any> = yaml.load(fs.readFileSync(ACTIONS_FILE, "utf8")).actions || {};

// Ordre anatomique canonique d'affichage des parties.
const PART_ORDER = ["head", "body", "segMedian", "segArriere", "abdomen", "jaws", "carapace", "emSpines", "sickles",
  "huntingClaws", "raptorial", "glidingMembrane", "finlets", "limbs", "frontLeg", "middleLeg", "rearLeg", "tail"];
const partRank = (t: string): number => { const i = PART_ORDER.indexOf(t); return i === -1 ? 99 : i; };

// Noms des parties issues de la fusion de membres similaires (par `group`).
const GROUP_NAMES: Record<string, { fr: string }> = { limbs: { fr: "Membres" } };

/**
 * Fusionne les parties partageant un même `group` (≥ 2 membres) en UNE partie à
 * blocs nommés — ex. les 3 paires de pattes d'un hexapode → « Membres » (blocs
 * Pattes antérieures / médianes / postérieures). Un groupe à 1 seul membre reste
 * tel quel (un quadrupède/biped garde sa patte propre). Le champ `group` est
 * interne : il est retiré de toutes les parties à l'émission.
 */
function mergeLimbGroups(parts: Part[]): Part[] {
  const counts: Record<string, number> = {};
  for (const p of parts) if (p.group) counts[p.group] = (counts[p.group] || 0) + 1;
  const out: Part[] = [];
  const merged: Record<string, any> = {};
  for (const p of parts) {
    if (!p.group || counts[p.group] < 2) {
      const { group, ...rest } = p; // eslint-disable-line no-unused-vars
      out.push(rest as Part);
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
function normalizeBlock(block: any): any {
  const g = block.grants;
  if (!g || g.text) return block;
  return { ...block, grants: { text: g } };
}
function normalizePartBlocks(part: any): any {
  return { ...part, blocks: (part.blocks || []).map(normalizeBlock) };
}

// Ids d'actions conférées par les blocs d'une liste de parties (grantsCard).
function deckIdsFromParts(parts: Part[] | null | undefined): string[] {
  const ids: string[] = [];
  for (const p of parts || []) for (const b of p.blocks || []) {
    if (b.grants && b.grants.grantsCard) ids.push(b.grants.grantsCard);
  }
  return ids;
}

// Résout une liste d'ids (dédupliquée) en cartes depuis la bibliothèque, triées par initiative.
function resolveDeck(ids: string[]): any[] {
  const seen = new Set<string>();
  const cards: any[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const def = ACTION_LIBRARY[id];
    if (!def) throw new Error(`action introuvable dans data/adversary_actions.yaml : ${id}`);
    cards.push({ id, ...structuredClone(def) });
  }
  return cards.sort((a, b) => a.initiative - b.initiative);
}

// `applyKit` et `ancestryMutations` vivent désormais dans ./derive.ts (source unique).

function consolidate(source: any, map: any, mutations: any): any {
  const keys = [...ancestryMutations(map, source.from), ...(source.extraMutations || [])];
  const state: State = { parts: [], traits: [], appearance: [], fatigue: 0, speed: null, grantActions: [], size: null };
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
  const weapons: Part[] | null = source.weapons ? structuredClone(source.weapons) : null;
  // Taille : décale UNIQUEMENT le nombre de cases de chaque bloc (encaissement à la blessure).
  // L'impact offensif n'est PAS un bonus générique : il tient aux CARTES propres de la créature —
  // un petit ne mord pas comme un géant, et un colosse a d'AUTRES cartes (engloutir, briser, 💔).
  const size = source.size ?? state.size ?? "normal";
  applySize([...state.parts, ...(weapons || [])], size);
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
        state.traits.push({ name: b.grants.trait.name, kind: "passive", effect: b.grants.trait.effect, source: p.name } as any);
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
    from: source.from, // uid du nœud du cladogramme → lien fiche ↔ arbre (page /evolution)
    name: source.name,
    power: source.power,
    dice: source.dice,
    ...(source.description ? { description: source.description } : {}),
    ...(source.art ? { art: source.art } : {}), // illustration du verso (data/bestiary/art/)
    guard: source.guard,
    ...(size !== "normal" ? { size } : {}),
    // ⚫ Points d'action : 2 par défaut (valeur plate) — seul un override d'espèce est écrit.
    ...(source.actions != null ? { actions: source.actions } : {}),
    speed: source.speed ?? state.speed ?? { walk: 0, run: 0 }, // source surcharge sinon dérivé
    fatigue: source.fatigue ?? state.fatigue,
    ...(source.tenacity != null ? { tenacity: source.tenacity } : {}), // 🧠 (A) explicite ; (B) dérivera du cladogramme

    ...(appearanceFr ? { appearance: { fr: appearanceFr } } : {}),
    parts: state.parts.map(normalizePartBlocks),
    ...(weapons ? { weapons: weapons.map(normalizePartBlocks) } : {}),
    ...(state.traits.length ? { traits: state.traits } : {}),
    cards,
  };
}

// ---- exécution (uniquement lancé en script, pas à l'import) ----
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { data } = loadRaw();
  const map = flatten(data.root);
  const HEADER = `# GÉNÉRÉ par tools/consolidate-bestiary.ts — NE PAS ÉDITER À LA MAIN.
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
}
