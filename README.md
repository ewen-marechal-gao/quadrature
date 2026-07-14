# Quadrature

> Jeu de rôle sur table original, dans le monde d'**Aeonir**.

**Quadrature** est un JdR maison construit autour d'un système de dés singulier
(quatre dés numérotés **0–5**, score final 0–20) et d'un univers à forte identité :
une planète quasi-verrouillée à son étoile, dont le terminateur — la frontière
jour/nuit — dérive lentement, façonnant quatre peuples. Ce dépôt regroupe à la fois
les **règles**, le **site de lecture**, un **simulateur de combat** et les **outils**
de worldbuilding.

> 🚧 **En développement actif.** Voir l'[état du projet](#état-du-projet).

---

## Aperçu

| Dossier        | Rôle                                                            | Stack |
| :------------- | :-------------------------------------------------------------- | :---- |
| [`rules/`](#règles-rules)         | Vault Obsidian — **source de vérité** des règles et de l'univers | Markdown / Obsidian |
| [`web/`](#site-web-web)           | Site de lecture (livre paginé + PDF), cartes d'action, feuille de personnage | Next.js 16 · React 19 · Tailwind v4 |
| [`simulator/`](#simulateur-simulator) | Moteur de combat avec agents (scriptés et LLM)               | TypeScript · Jest |
| [`tools/`](#outils-tools)         | Calculateur astronomique + **cladogramme du bestiaire**          | Python · Node |

---

## Le jeu en bref

- **Résolution** : on lance un dé **caractéristique** 🟦, deux dés **compétence** 🟨
  et un dé **aléa** ⬜ (plus, selon le contexte, avantage 🟩 / désavantage 🟥). Le
  score = `1 meilleur 🟦 + 2 meilleurs 🟨 + 1 aléa`, soit **0 à 20**.
- **Critique ✴️** si un 🟨 conservé montre 5 ; **défaut ⚠️** s'il montre 0.
- **10 caractéristiques** (5 Corps / 5 Esprit) × **2 compétences** chacune.
- **Combat** tactique : points d'action, **réactions ⚡**, système de **gardes**
  (seuil de défense persistant et dégradable), piste mentale à 7 états, double
  échelle de blessures (légères 💢 / graves 💔).

Détail complet : ouvrir le vault `rules/` (entrée [`fr/_index.md`](rules/fr/_index.md))
ou lire le site (`web/`).

## L'univers — Aeonir

Planète **quasi-verrouillée** (rotation ≈ période orbitale) : le Soleil se déplace
très lentement dans le ciel, et le **terminateur mobile** traverse les terres au fil
des siècles. Quatre peuples (Cimes, Neiges, Pluies, Vents) s'y sont adaptés. La
physique du monde n'est pas qu'évoquée : elle est **calculée** par [`tools/astronomy.py`](tools/astronomy.py)
(quasi-verrouillage, lune-horloge, saisons polaires asymétriques, gravité 0,75 g…).

Aeonir possède aussi une **langue rituelle ancienne** ([`rules/fr/univers/language.md`](rules/fr/univers/language.md)) :
une phonologie à **deux registres** — voix de *pierre* (minérale, gutturale) et voix de *sève*
(vivante, chantante) — où l'**inversion sonore encode les antonymes** (un contre-sort renverse
l'incantation). Elle outille la génération de **noms propres, toponymes, créatures et incantations**,
et nomme les quatre peuples : *Syldor* (Cimes), *Vaedor* (Vents), *Lumidor* (Pluies), *Sahgdor* (Neiges).

---

## Structure du dépôt

Dépôt **unique** (monorepo) à la racine. Chaque sous-projet reste autonome mais
partage le même historique git.

```
Quadrature/
├── rules/        # Vault Obsidian (core/, disciplines/, univers/, cartes/…) — SOURCE DE VÉRITÉ des règles
│   └── fr/       #   entrée : _index.md
├── data/         # Données structurées (cladogramme, mutations, bestiaire) — lues par web/ & tools/
├── web/          # Site Next.js (lit rules/fr/ + data/ au build)
├── simulator/    # Moteur de combat TypeScript
├── tools/        # astronomy.py · cladogram.ts · consolidate-bestiary.ts
├── images/       # Illustrations et concept art
├── README.md · Roadmap.md · CHANGELOG.md
└── rapport_avancement_*.md   # revues d'avancement ponctuelles
```

> La **source de vérité des règles** est `rules/fr/`. Les exports legacy à la racine
> (`Quadrature_latest.md`…) sont conservés hors versionnement et ne font plus foi.

---

## Démarrage rapide

Prérequis : **Node 20+** (web, simulator, `tools/cladogram.ts`), **Python 3** (`tools/astronomy.py`), **Obsidian** (rules).

### Règles (`rules/`)
Ouvrir le dossier `rules/` comme **vault Obsidian** ; commencer par
[`fr/_index.md`](rules/fr/_index.md). Aucune installation.

### Site web (`web/`)
```bash
cd web
npm install
npm run dev            # serveur de dev sur http://localhost:3000
npm run build          # export statique → web/out/
npm run generate-pdf   # génère le PDF du livre (Puppeteer + pdf-lib)
```
Rubriques notables : `/fr` (accueil), `/fr/volumen/<livre>` (lecture paginée),
`/fr/cartes` (cartes d'action imprimables), `/fr/personnage` (feuille de personnage
interactive : édition, sauvegarde locale multi-personnages, export/import JSON,
impression PDF).

### Simulateur (`simulator/`)
```bash
cd simulator
npm install
npx jest --no-coverage                                   # suite de tests
npx ts-node src/simulate.ts encounters/duel-arme.yaml 400 --quiet
npx ts-node src/optimize.ts                              # équilibrage (grid search)
```
Les agents pilotés par LLM utilisent l'API **Mistral** — renseigner `MISTRAL_API_KEY`
dans un `.env` (cf. `.env.example`). Les agents scriptés n'en ont pas besoin.

### Outils (`tools/`)

**Astronomie** — modèle physique d'Aeonir :
```bash
python tools/astronomy.py    # régénère tools/aeonir_astronomy.md
```

**Cladogramme du bestiaire** — [`data/cladogram.yaml`](data/cladogram.yaml) (l'arbre) et
[`data/mutations.yaml`](data/mutations.yaml) (les mutations : label, description, `kit` de combat)
sont la **source de vérité** de l'arbre phylogénétique de la faune d'Aeonir (clades, mutations,
biomes, statut). On les édite via l'utilitaire `tools/cladogram.ts` **plutôt qu'à la main** : il
préserve le style de l'arbre et **valide** après chaque opération.

```bash
# nécessite js-yaml — lancer `npm install` dans web/ au préalable
node tools/cladogram.ts validate                          # contrôle (clés inconnues, mutations non placées)
node tools/cladogram.ts print                             # arbre indenté + label de chaque mutation
node tools/cladogram.ts node-mut "Faucheurs" sickleClaws  # pose une mutation (référencée par CLÉ)
node tools/cladogram.ts node-status "Faucheurs" done      # marque une espèce comme peuplée
node tools/cladogram.ts mut-add maCle "Label fr" "Description fr"
# autres : node-cd · node-ref · node-rename · node-clear-mut · mut-relabel · mut-describe
```

Les **mutations** (`data/mutations.yaml`) forment un dictionnaire `clé → { label, description, kit? }`
(chaînes `Locale`) ; les nœuds de l'arbre y réfèrent par **clé** (champ `mut`) et chacun porte un
**`uid`** stable. Le **`kit`** décrit la brique de fiche d'adversaire conférée par la mutation
(cf. `rules/fr/adversaires/`). La **numérotation d'affichage est calculée côté front**. Une
**insertion de nœud** (qui ré-indente le sous-arbre) se fait en important la lib
(`import { loadRaw, save, findAny } from "./cladogram.ts"`) dans un petit script ponctuel.

**Bestiaire d'adversaires** — [`data/bestiary/`](data/bestiary/) relie le cladogramme aux fiches de monstres :
les **sources** `species/<id>.yaml` (stats propres + `from:` = uid d'une espèce du cladogramme) sont
consolidées en **fiches** `cards/<id>.card.yaml` par [`tools/consolidate-bestiary.ts`](tools/consolidate-bestiary.ts).
Chaque **mutation** de l'ascendance apporte sa brique (`kit` : parties du corps, cartes, traits ;
Speed/Fatigue dérivés) → *ce que la créature EST découle de ses mutations*. Les fiches (anglais + `Locale`)
alimentent la rubrique web `/adversaires`.

```bash
node tools/consolidate-bestiary.ts   # régénère data/bestiary/cards/*.card.yaml
```

---

## État du projet

Système jouable et chaîne de publication fonctionnelle ; le projet a dépassé le
prototype. Chantiers en cours côté cohérence des règles, resynchronisation du lore
et complétion des disciplines.

- Revue détaillée : [`rapport_avancement_2026-06-10.md`](rapport_avancement_2026-06-10.md)
- Feuille de route : [`Roadmap.md`](Roadmap.md)
- Historique des versions : [`CHANGELOG.md`](CHANGELOG.md)

---

## Conventions

- **Code** en anglais (identifiants, API) ; **contenu de jeu et commentaires** en
  français. Libellés affichables localisables (`{ fr: … }`).
- **Commits** au format conventionnel (`feat:`, `fix:`, `chore:`, `refactor:`…).
- **Source de vérité** des règles : `rules/fr/` (pas les exports legacy de la racine).

## Licence

Projet personnel, œuvre originale. Licence **à définir**.
