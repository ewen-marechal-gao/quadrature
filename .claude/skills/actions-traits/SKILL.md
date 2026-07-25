---
name: actions-traits
description: >-
  How to create or modify a PLAYER ACTION (attack, movement, mental consolidation,
  social, ⚡ reaction) or a TRAIT in Quadrature — the data-first pipeline linking
  data/player_actions.yaml and data/traits.yaml to the simulator engine, the
  vault cards (rules/fr/cartes/*.yaml), and the web pages. Use it whenever the
  user adds, renames, re-costs, re-times or re-scopes an action, a card, a
  reaction mode ⚒️, a trait, or an effect outcome — even when the request sounds
  small ("change the cost of Frappe brutale", "add a shove action", "wire trait
  X", "why doesn't my reaction fire?"). It encodes the exact files to touch, the
  order to touch them in, the manual registration points that silently rot, and
  the verification that catches divergence. Consult it BEFORE editing.
---

# Actions & traits in Quadrature

Actions and traits are **data-first**. The YAML under `data/` is the machine
source; TypeScript holds only the interpreters. Adding an action is normally
*two files and no new resolver*. If you find yourself writing a bespoke resolver,
stop and check whether the shared op grammar already expresses the effect.

Three sources must stay in agreement, and each has a different job:

| Source | Job | Authority |
|---|---|---|
| `rules/fr/cartes/*.yaml` | the **printed card** — prose, upgrades ⚒️, sacrifices ⛞ | **source of truth for name / initiative / cost** |
| `data/player_actions.yaml` | what the **engine** resolves | source of truth for effects |
| `data/traits.yaml` | the **traits**, prose + mechanical grant | mirrors `rules/fr/core/traits.md` |

A test enforces the first two agree. Nothing enforces prose ↔ effects — that is
the human's job, and it is the usual place for silent drift.

## Golden rules

1. **The vault card wins on name, initiative and cost.** When the engine and the
   card disagree, fix the engine unless the creator says otherwise. `data/` may
   lead on *effects* (the card's prose is written by hand), never on the pastille.
2. **The moon encodes the band.** A cost of `🌓`/`🌕`/`🌗` is 1 PA each, and the
   moon must match the initiative's band (I = 1–3, II = 4–6, III = 7–9). The lint
   in `actions-data.test.ts` checks the card *and* each of its options.
3. **A `trigger:` makes an action a REACTION.** It is then excluded from round
   planning, from the offensive envelope, and from the actor's reach profile. Do
   not put a `trigger` on an action you still want planned.
4. **A trait ⚒️ "can be used as a Reaction" ADDS a mode.** It never replaces the
   base action — the vault says *peut*, not *devient*. That is why reactive modes
   live in `reactionDefs` and not in an overlay on the def.
5. **Prose is never parsed.** `effect:` on a trait and the card's prose are
   display strings. Only `grants:` (traits) and `onSuccess`/`resolver` (actions)
   drive the engine. A trait with no `grants` is legitimate and says so on `/traits`.
6. **Never re-tune balance unasked.** Measure with a batch, report the numbers,
   let the creator decide.

## Adding a player ACTION

**1 — Write the card first** (`rules/fr/cartes/actions_universelles.yaml`,
`actions_avancees.yaml`, or `reactions_defense.yaml`). It fixes the name, the
initiative and the cost, and it is what a player reads.

**2 — Write the engine entry** in `data/player_actions.yaml`:

```yaml
  shove:
    vaultCard: bousculade          # lien vers la carte (obligatoire — testé)
    name: { fr: "Bousculade" }
    description: { fr: "…" }        # résumé tactique, lu par les agents LLM
    initiative: 7                   # DOIT égaler celle de la carte
    cost: { actions: 1, fatigue: 1 } # DOIT égaler le coût de la carte
    tags: [offensive, melee, physical, physicalDamage]
    reach: 1
    roll: { characteristic: strength, skill: power }
    onSuccess: { text: { fr: "…" }, effect: [{ wound: 1 }, { status: knockdown }] }
    onFailure: { text: { fr: "…" }, effect: [{ wound: 1 }] }
```

**3 — Register the id** in `ActionId` (`simulator/src/combat/types.ts`). This is
the one manual step the loader cannot derive: the YAML key is cast to `ActionId`,
so a missing entry compiles but every literal reference fails.

**4 — Only if the shared grammar cannot express it**, add a resolver id to
`ACTION_RESOLVERS` (`simulator/src/combat/action-resolvers.ts`) and point at it
with `resolver: <id>` instead of `onSuccess`/`onFailure`. Reserved for dynamic
amounts (Respiration heals `1 + Endurance`) and always-fire parts.

**5 — Make it reachable**: add the id to the relevant scenarios'
`allowedActions` in `simulator/encounters/*.yaml`. An action absent from every
kit is dead code the batches will never exercise.

**6 — Web is automatic.** The viewer resolves `actionId → vaultCard → card`, so
the real card renders with no extra work. `web/src/lib/combat-labels.ts` only
holds the *fallback* label used in plan lists — add the id there if you want a
nice name in the 🧠 planning badge.

### Choosing fields that the planner reads

The utility planner is not a display layer: these fields change behaviour.

- `tags` — read by traits (`physicalDamage` gates Sanguinaire) and by targeting.
- `reach` / `minRange` — the **reach gate**: an action that cannot connect pays
  its cost for nothing and stops being picked. `minRange: 1` = no shot when engaged.
- `movement: true` — routes to the movement branch (no roll, no guard); needs
  `moveBudget` and usually `grantsInertia`.
- `requiresInertia` — forces the previous band to have run (Charge needs a Course).
- `blockedByStatus` / `clearsStatus` — how the planner knows a Band-I Respiration
  reopens a Band-II Course.
- `mentalConditions` — empty array = no constraint. Always present.
- `selfTargeted` — rolls against a dynamic DC, no opponent, no guard.

## Adding or wiring a TRAIT

**1 — The vault** (`rules/fr/core/traits.md`) is the list. A trait belongs to a
skill and unlocks at **ranks 3 and 5**; several skills offer three traits for two
slots — the player chooses, so nothing pins a trait to rank 3 *or* 5. Do not
invent that data.

**2 — `data/traits.yaml`** — every trait has an entry, even a purely narrative
one:

```yaml
  opportunisme:
    name:   { fr: "Opportunisme" }
    kind:   active                 # active ⚒️ | passive ♾️
    skill:  precision              # vocabulaire SIMULATEUR (voir l'alias web)
    action: sharp-strike           # l'ActionId modifié (⚒️ seulement)
    effect: { fr: "…" }            # prose, jamais parsée
    grants:                        # ABSENT = trait prose seule
      reactiveMode: { on: movement-initiated, scope: reach, cost: { actions: 0, reactions: 1, fatigue: 1 } }
```

**3 — Pick an existing family, or add one.** Implemented today:
`reactiveMode` (the action gains a trigger + a reaction cost) and `costDelta`
(signed deltas on the action's cost). If your trait fits one, **you are done —
no TypeScript**. If it does not, add a family to `combat/traits.ts`; two are
already specified in comments (`rollBonus`, `guardMod`) with their seams named.

**4 — Give it a bearer**: `traits: [opportunisme]` on a sheet in
`simulator/characterSheets/*.yaml`. Validation is strict — the skill rank must
open the slot, or `validateCharacter` rejects the sheet.

⚠️ **Do not push an existing reference sheet up a rank to carry a trait.** Bumping
`Ranged_skirmisher` from Intuition 2 to 3 moved `tir-vs-faucheur` from 59 % to
88 %. Copy the sheet instead (`Ranged_instinctive.yaml` is the precedent).

**5 — `/traits` is automatic.** The page reads `data/traits.yaml`; a trait
without `grants` displays as "texte seul, pas encore branché" — that is a
feature, it shows what remains to wire.

## Why a reaction doesn't fire — read in this order

1. Is the action in the actor's **kit** (`allowedActions`)? `kitOf` reads it.
2. Does `canUseAction` pass — prerequisite skill, mental conditions, blocking statuses?
3. Is the reactor an **enemy** of the trigger's actor? There is no `self` scope yet.
4. Is it in range? Both `reach` **and** `minRange` are gated.
5. Can it pay? PC = ⚡; creature card = free but **once per round per card**.
6. **Is the utility positive?** The provider declines a reaction worth less than
   it costs. That is the design, and it is fatigue-sensitive: the same reaction
   scores +0.18 at 1💧 and turns negative when the actor is worn down. A
   scenario that produces zero reactions is often correct behaviour, not a bug.
7. Is the trigger **emitted at all**? Only `movement-initiated` is, and only from
   the PC movement branch of `resolvePlans`. **Creature movement emits nothing** —
   a charging monster provokes no opportunity strike.

## Verify after every edit

```bash
npx jest --no-coverage                                       # dans simulator/
```

The suite that matters here:

- `tests/combat/actions-data.test.ts` — loader **+ coherence with the vault**.
  Its id list is **derived from the YAML**, so a new action is checked the moment
  it exists. It compares name, initiative and cost (moons/💧/⚡ counted from the
  card's `cout:`), and lints that each moon matches its band.
- `tests/character/traits.test.ts` — registry, **coverage of `traits.md`** (a
  trait in the vault with no YAML entry fails), progression rules, and the two
  wired families.
- `tests/combat/reactions.test.ts` — eligibility, ordering (reaction resolves
  *before* the movement), the variant's cost being the one debited, depth 1.

Then, for anything that touches behaviour:

```bash
npx ts-node src/simulate.ts encounters/<scenario>.yaml         # un run lisible
npx ts-node src/simulate.ts encounters/faucheur-vs-precis.yaml 100 --quiet
```

**Report the batch numbers, do not act on them.** A new action or a re-costed one
shifts balance by design; the creator arbitrates.

Web check, when the change is visible: `npm run build` in `web/`, and the pages
`/traits`, `/cartes` and a combat report.

## Key files

- `data/player_actions.yaml` — engine source for actions · `data/traits.yaml` — traits.
- `rules/fr/cartes/{actions_universelles,actions_avancees,reactions_defense}.yaml` — the printed cards.
- `rules/fr/core/traits.md` — the trait list (authority for names and skills).
- `simulator/src/combat/types.ts` — `ActionId`, `CardTag`, `StatusEffect`, `TriggerKind`.
- `simulator/src/combat/actions-data.ts` (loader) · `action-resolvers.ts` (escape hatch) · `effect-ops.ts` (the op grammar).
- `simulator/src/combat/traits.ts` (families, pure) · `simulator/src/character/traits.ts` (registry + progression).
- `simulator/src/combat/actions.ts` — `ACTION_DEFS`, **`defFor(state, id)`** (the trait-aware seam; prefer it wherever cost is read).
- `web/src/lib/traits.ts` · `web/src/lib/combat-cards.ts` · `web/src/lib/combat-labels.ts` (fallback labels only).

Full schemas — every field, the op vocabulary, the tag taxonomy, the cost/moon
encoding and the trait grant families — are in `references/schemas.md`.
