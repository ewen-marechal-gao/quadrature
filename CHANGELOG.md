# Changelog

Toutes les évolutions notables de Quadrature sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/) ;
versionnage [sémantique](https://semver.org/lang/fr/).

## [0.1.0] — 2026-06-18

Première version étiquetée : consolidation du projet en **dépôt unique** et
état jouable de bout en bout.

### Ajouté
- **Règles** (`rules/`) — système de dés 0–5, combat (gardes, réactions ⚡, états,
  blessures), 10 caractéristiques × 2 compétences, actions/cartes, équipement,
  disciplines martiales et magiques, univers d'Aeonir.
- **Site web** (`web/`) — lecture du livre paginée (Paged.js) + export PDF, rubrique
  cartes d'action imprimables, et **feuille de personnage interactive** (`/personnage`) :
  modèle d'état persistant, multi-personnages en localStorage, export/import JSON,
  impression PDF, pages empilées avec bascule au clic.
- **Simulateur** (`simulator/`) — moteur de combat TypeScript (241 tests), agents
  scriptés et pilotés par LLM (Mistral), optimiseur d'équilibrage.
- **Outils** (`tools/`) — calculateur astronomique paramétrique d'Aeonir.
- Documentation racine : `README.md`, `Roadmap.md`, ce `CHANGELOG.md`.

### Modifié
- Consolidation des sous-projets (`rules`, `web`, `simulator`) en un **monorepo** à
  la racine, **historique git préservé** (import par sous-arbres).

### Retiré
- Prototype autonome `sheet/sheet.html`, **remplacé** par la feuille de personnage
  intégrée au site (`web/personnage`). Son historique reste consultable.
