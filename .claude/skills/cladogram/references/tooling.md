# Cladogram tooling & schemas — reference

Contents:
1. `tools/cladogram.ts` — CLI commands
2. `tools/cladogram.ts` — library API
3. Node schema (`data/cladogram.yaml`, flat)
4. Mutation schema (`data/mutations.yaml`)
5. Kit operations (adversary-sheet building blocks)
6. `tools/derive.ts` + the consolidator
7. Derived ecology

---

## 1. `tools/cladogram.ts` — CLI

Run from the repo root: `node tools/cladogram.ts <command> [args]`.

| Command | Effect |
| :-- | :-- |
| `validate` | counts; unknown `mut` keys; unplaced (deferred) mutations; **duplicate uid**; **orphan parent** |
| `ecology [--list]` | derived biome/habitat coherence + area inventory; `--list` details every leaf |
| `derive <uid> …` | the sheet a node DERIVES (parts, blocks, actions, traits, fatigue, speed) |
| `sync` | regenerate `data/cladogram.tree.yaml` from the flat source (run after a hand-edit) |
| `print` | indented tree with each node's mutation label |
| `node-mut <name\|tip> <key>` · `node-clear-mut` · `node-cd <tip> <text>` · `node-ref <name> <text>` · `node-rename <old> <new>` | edit a node (writes the flat file + regenerates the view) |
| `mut-add <key> <labelFr> <descFr>` · `mut-relabel <key> <labelFr>` · `mut-describe <key> <descFr>` | **safe** surgical text patch of `mutations.yaml` (comments + formatting preserved) |

The `mut-*` commands only cover label/description/stub. **Author rich kits by hand.**
On an unexpected format they fail loudly rather than corrupt.

## 2. Library API (ES module exports)

```js
import { loadRaw, saveTree, buildRoot, emitFlat, emitMinimalTree,
         findAny, findByUid, flatten, validate,
         deriveEcology, BIOMES, HABITATS, BIOME_LETTER, biomesToLetters,
         TREE_FILE, TREE_MIN_FILE, MUT_FILE } from "./tools/cladogram.ts";
import { applyKit, ancestryMutations, deriveState, formatDerived } from "./tools/derive.ts";
```

- `loadRaw()` → `{ data, header }`. `data = { title, rootNote, backlog, rootBiome,
  rootHabitat, nodes, mutations, root }`. **`data.nodes`** is the flat array (the
  editable source); **`data.root`** is a nested view rebuilt by `buildRoot`, sharing
  the SAME node objects (an edit via `findByUid` shows up on save). `header` is the
  raw text before `nodes:`.
- `saveTree(data, header)` — writes the flat `data/cladogram.yaml` (from
  `data.nodes`) **and** regenerates `data/cladogram.tree.yaml` (from `data.root`).
  Tree only; never touches `mutations.yaml`.
- `buildRoot(nodes)` — groups the flat list into a nested root by `parent`, sibling
  order = array order. A missing parent leaves the node out of the tree (flagged by
  `validate`; never silently lost — emission is from `data.nodes`).
- `findByUid(root, uid)` / `findAny(root, nameOrTip)` → mutable node.
- `flatten(root)` → `Map<uid, { node, parent }>`.
- `deriveEcology(data)` → `Map<uid, { biomes:Set, habitats:Set }>`.
- From `derive.ts`: `deriveState(map, mutations, fromUid, extraMutations?)` →
  `{ keys, withKit, state }`; `applyKit(state, key, kit)`; `formatDerived(...)`.

There is no faithful nested emitter or dry-run dance anymore — the flat file is
edited directly (append/modify a line, or change a `parent`). To re-canonicalize
or refresh the generated view after a hand-edit, run `sync`.

## 3. Node schema (`data/cladogram.yaml` — flat)

```yaml
# header, rootBiome/rootHabitat seed, backlog … then:
nodes:
  # clade: uid + parent + name + ref (+ mut? star? branchNote?)
  - { uid: exoferres, parent: hemoferriques, name: "EXOFERRES", ref: "…grade description…", mut: centrifugalSiderotropism }
  # leaf: uid + parent + tip + cd (+ mut?)
  - { uid: mueurs, parent: ecdysiens, tip: "Mueurs", cd: "…creature description…" }
```

- `parent` is a uid, or `"root"` for a first-level node. Structure is carried
  entirely by `parent`; **sibling order = order of lines in the file.**
- `uid` is a stable slug (target of species `from:` and `/evolution` links) — not a
  display id.
- A node is a leaf iff no other node names it as `parent`. A leaf renders as a link
  on `/evolution` iff a species file targets its `uid`.
- `data/cladogram.tree.yaml` mirrors this as a nested `uid`/`mut` view — **read it to
  see structure**; it is generated, never edited.

## 4. Mutation schema (`data/mutations.yaml`)

```yaml
mutations:
  rigidFinlets:
    label:       { fr: "Ailerons rigides" }        # Locale {fr, en?}
    description: { fr: "…lore…" }
    addBiome:    [dawn, dusk]     # ecology, folded root→leaf
    removeBiome: [north]          #   biome  = north | dawn(Levant) | dusk(Couchant) | south
    addHabitat:    [terrestrial]  #   habitat = terrestrial | aquatic | aerial (amphibious = both)
    removeHabitat: [aquatic]      #   order: remove THEN add (a mutation can move a lineage)
    kit: { … }                    # optional adversary-sheet block (§5)
```

Ecology keys sit at the mutation **root**, beside `kit`. Seed is
`rootBiome`/`rootHabitat` in the tree header. Comments in this file are preserved by
`mut-*` (surgical patch) and by hand-editing; nothing re-serializes it.

## 5. Kit operations (adversary-sheet building blocks)

The consolidator threads a `state` (parts, traits, appearance, fatigue, speed)
root→leaf, applying each mutation's `kit`:

```yaml
kit:
  body: { fr: "appearance sentence" }   # appended to the creature's description
  fatigue: 4                            # ADDS to the pool (even numbers; organs only)
  speed: { walk: 4, run: 8 }            # the MOST DERIVED kit wins (overwrites)
  addParts:      [ <part>, … ]          # error if a part of that `type` already exists
  modifyPart:  <mod>                    # single …
  modifyParts: [ <mod>, … ]             # … or many
  removeParts:   [ <type>, … ]
  grant_action:  [ <actionId>, … ]      # innate action, not tied to a destructible block
  traits: [ { name{Locale}, kind: passive, effect{Locale} }, … ]

# <part>
- type: body            # unique per creature; add new types to PART_ORDER in the consolidator
  tag: support          # support | mobility | offensive | defensive (display/AI)
  group: limbs          # optional: parts sharing a group (≥2) merge into one "Membres"-style part
  name: { fr: "Corps" }
  description: { fr: "…" }
  armor: 0
  blocks:
    - cases: 3                          # HP boxes; destroyed top→bottom (first block = outer layer)
      name: { fr: "Cœur" }
      grants:                           # what the block confers WHILE intact:
        text: { fr: "…" }               #   prose
        grantsCard: bite                #   an action id (→ deck)
        resource: endurance             #   resource + amount (endurance/evasion/stability…)
        amount: 2
        trait: { name{Locale}, effect{Locale} }   # a conditional passive (lost if block breaks)
        armorAll: 2                     #   +armor to all OTHER parts
        immunity: knockdown
        cardCost: { card: sickleStrike, cost: 1 }

# <mod> (modifyPart[s])
- type: head
  name: { fr: "Céphalon" }             # rename
  tag: offensive
  group: null                          # remove from a group
  armor_add: 1  /  armor_set: 2
  descriptionAppend: { fr: " …" }
  blocksModify:  [ <blockmod>, … ]     # modify INHERITED blocks (applied FIRST)
  blocksAdd:     [ <block>, … ]        # append
  blocksPrepend: [ <block>, … ]        # prepend (becomes the outer layer to pierce)
  blocksRemove:  [ 0 ]                 # by index (on the post-add array)

# <blockmod> — selects an inherited block BY NAME (the author key, fr): stable
# across the derivation chain, unlike an index that any intermediate mutation shifts.
- match: "Mâchoires"                   # error if no block of that name on the part
  cases: 3         /  casesAdd: 1      # replace / shift the case count (floor 1)
  name: { fr: "Mâchoires broyeuses" }  # rename
  grants: { … }                        # REPLACE what the block confers
  grantsMerge: { grantsCard: rendingBite }  # MERGE into the existing grant (keeps the rest)
```

A block's `grants` may also carry **`guard: N`** — a guard bonus held while the block
is intact. Destroying it drops the creature's guard (the "blind it to hit it" loop).
Effective guard = sheet guard + Σ(intact blocks' `guard`) ± mental-state modifier.

Guard rails: no two parts of the same `type`; can't modify/remove an absent part.
Actions referenced by `grantsCard` / `grant_action` must exist in
`data/adversary_actions.yaml`.

## 6. `tools/derive.ts` + the consolidator

`tools/derive.ts` is the **single source** of the kit-application core
(`applyKit`, `ancestryMutations`, `deriveState`, `formatDerived`). It is pure —
takes the flattened map + mutations, returns state. Imported by
`tools/consolidate-bestiary.ts` and by the `derive` CLI command
(`node tools/cladogram.ts derive <uid> …`).

`node tools/consolidate-bestiary.ts` reads each `data/bestiary/species/<id>.yaml`,
walks its `from:` uid up the tree, applies kits root→tip (via `applyKit`), merges the
species' own non-derived fields, and writes `data/bestiary/cards/<id>.card.yaml`. Its
main block is guarded (`import.meta.url`) so it can be imported without side effects.

Species file fields: `id`, `from` (uid), `name`, `power`, `dice`, `guard`, `speed?`,
`fatigue?`, `tenacity?`, `description?`, `weapons?`, `extraMutations?`, `extraParts?`,
`extraTraits?`, `removeCards?`, `removeTraits?` (`source.fatigue ?? derived`, etc.).

**Non-regression:** after any mutation change, regenerate and confirm the existing
`.card.yaml` files change only where intended.

## 7. Derived ecology

Seed = `rootBiome`/`rootHabitat`. Fold root→leaf; for each node's mutation apply
`removeBiome`/`removeHabitat` then `addBiome`/`addHabitat`. Pure inheritance — no
node-level override. Letters: N=north, L=dawn (Levant), C=dusk (Couchant), S=south.
`node tools/cladogram.ts ecology` reports coherence + area distribution.
