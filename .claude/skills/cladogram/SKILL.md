---
name: cladogram
description: >-
  Best practices for building and editing the Quadrature / Aeonir cladogram — the
  phylogenetic tree that DERIVES the bestiary (creatures, ecology, adversary
  sheets). Use this whenever touching data/cladogram.yaml or data/mutations.yaml,
  adding or reworking creatures / clades / mutations / grades, running
  tools/cladogram.ts or tools/consolidate-bestiary.ts, deriving adversary fiches,
  or reasoning about the bestiary's evolutionary design — even if the user just
  says "add a creature", "edit the tree", "a new mutation", or names an Aeonir
  clade (Exoferres, Syntones, Faucheurs, Trachéés…). It encodes the flat-file data
  model, the safe editing paths, the derived-ecology / derived-fiche mechanics, and
  the design principles. Consult it before editing, not after.
---

# Building the Aeonir cladogram (Quadrature bestiary)

The bestiary of Aeonir is **derived**, not authored piece by piece. A single
phylogenetic tree of mutations produces every creature: its body parts, its
ecology (biome + habitat), and — for creatures that get a stat block — its whole
adversary sheet. Your job when editing is to keep that derivation coherent and
legible, so a Game Master can *infer* a creature's traits from its ancestry.

Work **lore-first, ascending** (basal grades → crown), and **propose before you
edit**: the creator wants options and validation, and has been burned by agents
taking unrequested initiative. Never restructure the tree or invent mutations
without a green light.

## The data model — two data files + one generated view

At the repo root under `data/`:

- **`data/cladogram.yaml`** — the TREE, as a **FLAT LIST** (`nodes:`), one node per
  line. Structure is carried by a **`parent`** field (a uid, or `"root"`), not by
  nesting. A clade has `uid` + `name` + `ref`; a leaf has `uid` + `tip` + `cd`.
  Optional: `mut` (mutation key), `star`, `branchNote`. This is the source of truth.
- **`data/cladogram.tree.yaml`** — **GENERATED** nested view (uid + mut only),
  regenerated on every write. **Read this to see the tree's shape** instead of
  inferring it from the flat list. Never edit it.
- **`data/mutations.yaml`** — the MUTATIONS: a dict `key -> { label{Locale},
  description{Locale}, addBiome?, removeBiome?, addHabitat?, removeHabitat?,
  kit? }`. `kit` is the adversary-sheet building block (parts, blocks, traits,
  speed, fatigue).

**Derived, never stored:** ecology (biome N/L/C/S, habitat), adversary fiches
(the consolidator applies kits root→tip), and "populated" status — there is **no
`status` field**: a leaf is populated **iff** a species file
(`data/bestiary/species/*.yaml`) targets its `uid` via `from:`.

Full schemas, the tool API, and the flat-node shape are in `references/tooling.md`.

## Golden rules

1. **The tree is a FLAT list — editing is a one-liner.** Add a node = add a
   `{ uid, parent, … }` line (place it among its siblings for display order).
   Reparent a node or move a whole subtree = change one `parent` value. No
   indentation cascade, no custom emitter to fight. **To see structure, read
   `data/cladogram.tree.yaml`.** After hand-editing the flat file, run
   `node tools/cladogram.ts sync` to regenerate that view.
2. **`data/mutations.yaml` — the `mut-*` commands are now SAFE.** They apply a
   *surgical text patch* (one line) that preserves comments **and** formatting, so
   `mut-relabel` / `mut-describe` / `mut-add` no longer destroy the design
   comments. **Author rich kits (parts/blocks/grants) by hand**, though — a CLI
   for nested kits would be unusable. Nothing re-dumps the file wholesale.
3. **The `fs` gotcha.** `web/src/lib/cladogram.ts` reads the YAML via `fs`. Never
   import a **value** from it into a client component — `import type` is erased,
   constants are not, and the bundle then tries to load `fs` and the page goes
   blank. Pure vocabulary (types, `BIOME_TO_LETTER`, `applyEco`) lives in
   `web/src/lib/cladogram-eco.ts`; import values from there.
4. **Don't re-dump the whole tree in chat** — read `cladogram.tree.yaml` or show
   only the subtree you changed. The creator views structure on `/evolution`.

## Design principles

- **Mutations must be legible and inferable.** Each mutation is a *visible*
  character (armor, a limb, a sense, a biome shift) from which the reader deduces
  the creature. Reject invisible traits. Model: the Pourpre/Zoïde split reads
  straight off the terminator.
- **Causal chains, not mirroring.** Don't copy the vertebrate ladder step for
  step. Each mutation should *emerge from the previous one's consequence*.
  Worked example (the Exoferre climb): rigid iron finlets improve swimming →
  **but rigid parts can't grow** → molting evolves to shed and regrow them →
  molting lets you harden everything → exoskeleton. Story first, then it stats
  itself.
- **One grade = one legible innovation.** A single mutation shouldn't do
  segmentation *and* exoskeleton *and* land invasion at once. Gradual beats
  compressed; aim for a lineage as deep as its neighbours.
- **The endurance model.** Fatigue comes **only from circulatory / respiratory /
  muscular organs** (Corps, Cœur, Poumons, Stigmates), never from insulation or
  armor (fur, blubber, carapace → give those a *trait* instead). Use **even
  increments** so the fatigue track halves cleanly at the "Essoufflé" midpoint.
- **Put shared traits on the common ancestor.** A part appears at the grade that
  first justifies it, and every descendant inherits it (Corps @ `cephalization`,
  Tête @ `bilateralSymmetry`, Cœur @ `ferricCirculation`, central nervous system @
  `axialSkeleton`). Iron routing is the template: `centripetalSiderotropism`
  (Endoferres, internal axis) vs `centrifugalSiderotropism` (Exoferres, external
  cuticle) — both inherit everything up to the split, then diverge.
- **Naming.** A clade gets a **distinctive proper noun**, latinate grades in CAPS
  (SIDÉROCÈRES, ECDYSIENS) — **never** the mutation's label. Pick names unlikely
  to recur. Mutation **keys are English** (`rigidFinlets`, `molting`);
  labels/descriptions/lore are French `Locale` strings.
- **Each grade node = a basal leaf + a continuation clade.** The leaf is the
  "species that stayed at this grade" (a concrete monster); the clade carries the
  lineage onward. This is the tree's rhythm — follow it.
- **Ecology is pure inheritance.** Only mutations move biome/habitat; a clade
  carries its lineage's *potential* range. When a leaf's *realized* range
  genuinely differs, add a narrow terminal restriction mutation
  (`removeBiome`/`removeHabitat`) rather than overriding the node.
- **Mutation vs capability.** A mutation is a *structural* innovation (a node on
  the tree). A one-off *use* of an existing organ (a neural shriek from the EM
  emitter) is a **capability** — it lives in the creature's lore/stat block, not
  as a new mutation.

## Workflow: adding a grade, mutation, or creature

1. **Derive the substrate first.** Before designing on top of a node, see what it
   *already* derives — parts, blocks, fatigue: `node tools/cladogram.ts derive
   <uid> [<uid>…]`. Don't design blind.
2. **Propose, then wait.** Sketch the sequence (grades, mutations, the creature at
   each node, the monster it unlocks) and get validation. Name the causal links.
3. **Write the mutations.** Metadata via `mut-add`/`mut-relabel`/`mut-describe`
   (safe); rich kits by hand. Put `add/removeBiome` and `add/removeHabitat` at the
   mutation's root (beside `kit`) — biome is ecology, `kit` is the sheet.
4. **Edit the tree (flat).** Add/modify `{ uid, parent, … }` lines, or change a
   `parent` to reparent. For bulk restructuring, script it with the lib: `loadRaw`
   → mutate `data.nodes` → `saveTree(data, header)`. If a part uses a new `type`,
   add it to `PART_ORDER` (and any `group` to `GROUP_NAMES`) in
   `tools/consolidate-bestiary.ts`. Run `sync` after any hand-edit.
5. **Verify** (always — see below).

## Verify after every edit

```
node tools/cladogram.ts validate      # counts + unknown mut keys / unplaced mutations / dup uid / orphan parent
node tools/cladogram.ts ecology        # every leaf has a biome + habitat; area distribution
node tools/cladogram.ts derive <uid>   # the new/changed nodes derive what you intend
node tools/consolidate-bestiary.ts     # regenerates fiches — existing ones must be UNCHANGED (non-regression)
```

Even fatigue totals, no orphan-ecology leaves, no unexpected diff in existing
`.card.yaml` files. If you touched the web schema, `/evolution` and `tsc` in
`web/` are the final check.

## Key files

- `data/cladogram.yaml` (flat source) · `data/cladogram.tree.yaml` (generated view) · `data/mutations.yaml`.
- `tools/cladogram.ts` — tree lib + CLI (`validate`/`ecology`/`derive`/`sync`/`print`/`node-*`/`mut-*`).
- `tools/derive.ts` — shared kit-derivation core (single source of `applyKit`).
- `tools/consolidate-bestiary.ts` — fiche generator.
- `data/bestiary/species/*.yaml` (authored) → `data/bestiary/cards/*.card.yaml` (generated).
- `data/adversary_actions.yaml` — shared action library (referenced by `grantsCard`).
- `web/src/lib/cladogram.ts` (reads fs) · `web/src/lib/cladogram-eco.ts` (pure vocab).
- `rules/fr/univers/ecologie_faune.md` — design-intent doc; **do not edit without explicit creator validation.**

See `references/tooling.md` for the full CLI reference, lib API, and node/mutation/kit schemas.
