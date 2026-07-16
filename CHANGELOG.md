# Changelog

Toutes les évolutions notables de Quadrature sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/) ;
versionnage [sémantique](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- **Système d'adversaires** intégré au simulateur : résolution asymétrique
  (4 dés sommés vs garde du PJ), corps en **parties à blocs** (chaque bloc confère
  une capacité tant qu'il est intact), **ressources régénérantes** (🫁 endurance,
  ◇ stabilité, 🍀 évasion), piste mentale à **4 états** (Enragé / Agressif / Prudent /
  Paniqué) modulant le rang des dés ⬆/⬇ et la garde.
- **Armure à cases 🛡️** (adversaires) : réduit les blessures légères 💢 *et* encaisse
  une blessure grave 💔 par attrition (une case cède) ; défense non régénérante.
  Nouvelle brique de kit `armor_add_all` (cuirasse générale d'un clade).
- **Hémorragie 🩸** : jetons cumulatifs à décroissance (dégâts en rafale
  triangulaire) ; côté personnage, coagulation pilotée par la **Récupération**.
- **Actions mentales** de personnage : Provocation / Intimidation (assèchent le ◇
  de la cible, la poussent vers ses états extrêmes), consolidation (Préservation,
  Résolution…), et **Stabiliser** (retire l'hémorragie).
- **Web** — rubrique **`/adversaires`** : fiches A5 imprimables (recto/verso) et
  cartes de deck ; seuils de fatigue, encadré Défenses (garde), et **coût de
  fatigue 💧** des cartes.
- Fiches de bestiaire dérivées du cladogramme : Faucheur, Lacérateur, Bandit des
  Cimes, Cuirassard, Happe-fond, Évoluant.

### Modifié
- **Caractéristiques dérivées des compétences** (`value = 1 + rangs 2/4`) : le
  simulateur ne lit plus la valeur écrite sur la fiche, il la **calcule** — une
  fiche ne peut plus diverger de ses rangs (corrige des fiches qui gonflaient les dés).
- **Modèle de blessures des personnages** : Résistance = Vigueur ; conversion 💢→💔
  fixe (3:1) sur l'excédent ; hémorragie 🩸 à décroissance par Récupération.
- **Équilibrage des adversaires** : armure recalibrée en **signature** (retirée du
  tissu mou — fourrure, posture, lard —, conservée sur le crâne ossifié, les
  carapaces et les cuirasses) ; l'**Évasion** devient rare (signature aquatique /
  agile). Faucheur : burst plafonné (Frappe faucheuse à ⚫⚫, Serpes en bloc unique
  blindé), Morsure et Cri coûtent de la fatigue, Frappe faucheuse +1 dégât.
- Fatigue initiale des personnages = 1 (conforme aux règles).

### Corrigé
- Le **coût de fatigue 💧** des cartes d'adversaire ne s'affichait pas sur le site.
- Fiches de personnages du simulateur rendues **cohérentes** avec la règle de
  dérivation (duellistes Précis / Puissant, Lena).

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
