# Site de Quadrature

Site Next.js (App Router) qui publie les règles et les outils de table. En ligne
sur [quadrature.marechal-gao.fr](https://quadrature.marechal-gao.fr).

> ⚠️ Cette version de Next.js s'écarte de ce qui circule ailleurs : lire le guide
> concerné dans `node_modules/next/dist/docs/` avant d'écrire du code
> (cf. [AGENTS.md](AGENTS.md)).

## Démarrage

```bash
npm install
npm run dev
```

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de dev sur http://localhost:3000 |
| `npm run build` | Build serveur (`.next/`), servi par `npm run start` |
| `npm run build:public` | Build **public** statique (`out/`) — ce qui part en ligne |
| `npm run generate-pdf` | PDF du livre (Puppeteer + pdf-lib) |
| `npx tsc --noEmit` | Type-check — à passer avant tout commit |

## Deux modes de build

- **local** (défaut) — rendu hybride : les pages du livre sont prérendues, l'outil
  de rejeu de combat (`/encounters`) est dynamique, car il lit le disque.
- **public** (`QUADRATURE_PUBLIC=1`) — les routes locales sortent du build par
  `pageExtensions` (fichiers `page.local.tsx`), ce qui rend `output: "export"`
  possible : un dossier `out/` autonome servi par nginx.

Détail dans [next.config.ts](next.config.ts).

## D'où vient le contenu

| Source | Rubriques |
|---|---|
| `rules/fr/**.md` | `/volumen/<livre>` — lecture paginée |
| `rules/fr/cartes/*.yaml` | `/cartes` — cartes d'action imprimables |
| `data/traits.yaml` | `/traits` |
| `data/equipment/*.yaml` | `/equipement` |
| `data/bestiary/`, `data/cladogram.yaml` | `/adversaires`, `/evolution` |
| `simulator/combatReports/` | `/encounters` — **local uniquement** |

Les rubriques `/traits` et `/equipement` lisent la **même source que le
simulateur** et n'en redéfinissent rien : elles affichent l'état réel du
branchement moteur, trous compris. Les modules de chargement (`src/lib/*.ts`)
utilisent `node:fs` et ne s'importent donc que depuis un Server Component — les
libellés dont un composant client a besoin vivent à part (`*-labels.ts`).

Les **types** de ces données viennent du simulateur via l'alias `@sim/*`
(cf. [tsconfig.json](tsconfig.json)), en `import type` **uniquement** : les imports
de type s'effacent à la compilation, donc rien du simulateur n'entre dans le
bundle et le site reste autonome à l'exécution.

## Chrome commun

Toutes les rubriques partagent deux composants, dans cet ordre :

```
components/TopBar.tsx    [‹ repli]  QUADRATURE — Rubrique · Section   [actions]  [FR EN]
components/ToolBar.tsx   recherche · groupes de filtres · bascules · zoom
```

La **TopBar** dit *où l'on est*, la **ToolBar** ce qu'on peut y *faire*. D'où deux
règles que les composants font respecter par construction : une barre d'outils ne
porte ni titre de page ni lien de retour, et le sélecteur de langue est toujours le
dernier élément de la TopBar. Styles dans `app/shell.css` et `app/toolbar.css`.

Gabarit de page identique partout : conteneur à **hauteur figée**, barres fixes, un
**seul bloc défilant** en dessous — rien ne passe jamais sous une barre.

## Organisation

```
src/
├── app/[locale]/       # Routes (fr, en) — les `page.local.tsx` n'existent qu'en build local
├── app/*.css           # Une feuille par rubrique + tokens.css, shell.css, toolbar.css
├── components/         # TopBar, ToolBar, puis un dossier par rubrique
├── lib/                # Chargement et mise en forme des données (serveur)
└── data/books.json     # Structure des livres — source de la navigation
scripts/                # Pré-build : index de contenu, images, Paged.js, PDF
```
