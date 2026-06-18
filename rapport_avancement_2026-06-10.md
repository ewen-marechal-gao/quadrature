# Quadrature — Rapport d'avancement

> **Date :** 10 juin 2026
> **Périmètre :** revue complète des cinq sous-projets (`rules/`, `web/`, `sheet/`, `simulator/`, `tools/`) ainsi que de la racine du dépôt.
> **Méthode :** lecture intégrale des règles cœur, lecture structurelle des disciplines et de l'univers, revue de code des trois projets logiciels, exécution des suites de tests et du typecheck.

---

## Mise à jour — 18 juin 2026

Évolutions depuis la revue du 10 juin :

- **Feuille de personnage intégrée au site.** Réécriture complète du prototype en page-outil React du site (`web/`, route `/[locale]/personnage/`) : modèle d'état sérialisable (`web/src/lib/character/`), persistance multi-personnages en localStorage, export/import JSON, impression PDF, et UX « pages empilées » (bascule au clic). Mergé sur `master`.
- **⚠️ Le répertoire `sheet/` est désormais OBSOLÈTE.** `sheet/sheet.html` n'est plus qu'un brouillon legacy de référence ; la version vivante et maintenue est celle du site. Les recommandations #7 et #11 (§8) sont traitées ou reportées sur cette intégration. `sheet/` a vocation à rejoindre un futur dossier `archive/`.
- **Vault `rules/` commité.** Le travail substantiel jadis en suspens (restructuration, `personnages.md`, cartes YAML, univers par peuple, etc.) est désormais dans l'historique git de `rules/`.
- **Corrections de fond** : provider LLM du simulateur = **Mistral** (et non Claude) ; fondation Tailwind du site mergée sur `master`.

Les sections ci-dessous datent de la revue du 10 juin ; les points liés à la feuille (§1, §3, §4, §8) sont annotés en conséquence.

---

## 1. Synthèse

Quadrature est un projet de TTRPG ambitieux et remarquablement outillé : un système de dés original (4d6 numérotés 0–5, score 0–20), un univers à forte identité (planète quasi-verrouillée, terminateur mobile, quatre peuples), et une chaîne d'outils complète — vault Obsidian, site de lecture avec pagination livre et export PDF, feuille de personnage interactive, simulateur de combat avec agents IA, et calculateur astronomique.

**État de maturité estimé par sous-projet :**

| Sous-projet | Maturité | État |
| :--- | :---: | :--- |
| `rules/` — cœur du système | ★★★★☆ | Mécaniques complètes et cohérentes dans l'ensemble ; trous ciblés (traits, formations) et ~25 incohérences de détail relevées |
| `rules/` — disciplines | ★★★☆☆ | 11 disciplines sur 15 jouables ; Impact et Choromancie à l'état de carnet de conception ; nombreux *Flavour text* placeholder |
| `rules/` — univers | ★★★★☆ | Riche et physiquement crédible ; `lore.md` désynchronisé du nouveau modèle astronomique |
| `web/` | ★★★★☆ | Fonctionnel de bout en bout (lecture, pagination Paged.js, PDF, cartes) ; **feuille de personnage interactive intégrée** (`/personnage`) ; typecheck sans erreur ; i18n EN préparée mais vide |
| `sheet/` | ⚠️ Obsolète | Prototype autonome **remplacé** par la feuille intégrée au site (juin 2026) ; conservé en legacy, à archiver |
| `simulator/` | ★★★★☆ | Moteur solide, **241 tests passent (8 suites)** ; couvre un sous-ensemble des règles (pas de positionnement) |
| `tools/` | ★★★★★ | Calculateur astronomique abouti, les 6 objectifs de design sont validés |

**Verdict global :** le projet a dépassé le stade du prototype. Le système de jeu est jouable en l'état pour un combat de démonstration, et la chaîne de publication fonctionne. Les deux chantiers prioritaires sont (1) la **résorption des incohérences internes des règles** — surtout les références croisées périmées issues des refontes successives de la nomenclature — et (2) la **resynchronisation du lore** (`lore.md`) avec le modèle astronomique calculé.

---

## 2. Les règles (`rules/`)

### 2.1 État des lieux

Le vault est bien structuré (`core/`, `disciplines/`, `adversaires/`, `univers/`, `_wip/`) avec un index d'entrée à jour ([_index.md](rules/fr/_index.md)). Le dépôt git est récent (restructuration depuis `Quadrature_latest.md`) ; le travail substantiel jadis en suspens a été **commité en juin 2026**.

| Domaine | État | Observations |
| :--- | :--- | :--- |
| Jet, dés, matériel | ✅ Complet | Mécanique des 4 dés conservés claire, conversion D6 classique prévue |
| Caractéristiques & compétences | 🟡 Quasi complet | 2 compétences sans usage hors combat (« À définir ») ; descriptions manquantes pour Mascarade, Manipulation, Observation, Vigilance, Clairvoyance, Intuition |
| Combat (manche, PA, gardes) | ✅ Complet | Système 🟢⚫🔴 + Réactions ⚡ + Gardes original et bien spécifié |
| Ressources & états | ✅ Complet | Piste mentale à 7 états, double échelle blessures 💢/💔 |
| Actions (universelles, avancées, réactions) | ✅ Complet | 30+ cartes d'action au format normalisé |
| Traits | 🔴 Incomplet | 6 compétences sur 20 sans aucun trait (« à définir ») ; il en faut ~2 par compétence pour couvrir les rangs 3 et 5 |
| Personnages (création, origines, formations) | 🟡 Partiel | 28 origines définies ; note explicite « tables à revoir » ; seulement 3 formations rédigées |
| Équipement | ✅ Complet | Système Emplacements/Poches original, 6 familles d'armes, armures typées |
| Voyage | 🟡 Brouillon | Système de segments/rôles intéressant mais typos et mécanique de consommation en conflit avec `equipement.md` (cf. §7.2) |
| Furtivité | ✅ Complet | Référence une action « Pas » qui n'existe que dans `_wip/cartes.md` |
| Adversaires & hordes | ✅ Complet | Table des dés d'adversaires mathématiquement étalonnée (+1 d'espérance par palier) ; formule du Niveau de Menace 💀 encore difficile à appliquer (aucun exemple chiffré) |

### 2.2 Disciplines — avancement détaillé

**Martiales :**

| Discipline | Avancement | Notes |
| :--- | :--- | :--- |
| Escrime | ★★★★ | La plus développée (3 formes × 3 catégories de lames, 5 spécialisations, 3 bottes) ; 8 *Flavour text* à écrire |
| Lames courtes | ★★★★ | Tiers 1→3 complets |
| Armes d'hast | ★★★☆ | Tiers 1–2 complets, **Tiers 3 vide** (« À développer ») |
| Archerie | ★★★☆ | Tiers 1→3, compact |
| Tir tendu | ★★★☆ | Mécanique ⚙️Recharger + 6 munitions |
| Arts martiaux | ★★★☆ | 4 styles + Tiers 2 |
| Impact | ★☆☆☆ | Carnet d'intentions uniquement |

**Magiques :** Électromancie (la plus riche, Tiers 0→3), Télépathie (Tiers 0→3) et Calomancie (Tiers 0→2) sont bien avancées ; Biomancie et Alchimie ont un Tiers 1–2 fonctionnel ; Échomancie est mince (4 pouvoirs, traits d'affinité quasi vides) ; **Choromancie est un carnet de conception**. L'intro (la Cascade : Choromancie → … → Biomancie) est une très belle base de cohérence magique.

### 2.3 Incohérences internes relevées

Les plus importantes d'abord. La plupart sont des références croisées périmées — traces des refontes de nomenclature.

**Références croisées défense/compétence ([caracteristiques.md](rules/fr/core/caracteristiques.md) vs [defense_reactions.md](rules/fr/core/actions/defense_reactions.md)) :**

1. **Encaisser** est listée comme défense de *Robustesse*, mais la carte roule **Récupération 🟨🟨 + Vigueur 🟦**.
2. **Blocage** est listée comme défense d'*Endurance*, mais la carte roule **Robustesse 🟨🟨 + Force 🟦**.
3. **Injonction** est listée comme défense de *Logique*, mais la carte ([attribute_actions.md](rules/fr/core/actions/attribute_actions.md)) s'oppose à **Conviction**.
4. **Intimidation** est listée comme défense de *Conviction*, mais la carte ([universal_actions.md](rules/fr/core/actions/universal_actions.md)) s'oppose à **Résilience**.

**Erreurs de formule ou de symbole :**

5. [universal_actions.md:102](rules/fr/core/actions/universal_actions.md) — **Jeter** : « Acuité 🟨🟨 + Observation 🟦 » est inversé (Observation est la compétence, Acuité la caractéristique).
6. [ressources.md](rules/fr/core/ressources.md) — « Résistance = Vigueur ✪ + Robustesse ✪ » et « Stabilité = Ténacité ✪ + Discipline ✪ » : Robustesse et Discipline sont des **compétences (✫)**, pas des caractéristiques (✪). Le symbole induit en erreur (les deux échelles évoluent différemment).

**Vocabulaire flottant (ancien nommage) :**

7. « **Tir précis** » (Arc de chasse, Arbalète classique, Arquebuse dans [equipement.md](rules/fr/core/equipement.md)) vs l'action réelle « **Tir ciblé** ».
8. « **Frappe puissante** » (Fine Lame, traits WIP) vs l'action réelle « **Frappe brutale** » ; les familles d'armes parlent d'« attaques vives/puissantes » sans mapper explicitement vers Frappe vive / Frappe brutale / Attaque armée.
9. L'action « **Pas** » est requise par la Furtivité ([furtivite.md](rules/fr/core/furtivite.md)) et l'Escrime (Fente, Fente défensive) mais n'est définie que dans [_wip/cartes.md](rules/fr/_wip/cartes.md) — pas dans les actions universelles (« Posture » en est la plus proche).
10. [traits.md](rules/fr/core/traits.md) — « Esquive plongeante » exige **Évasion 2** (compétence inexistante) ; « Vision tactique » exige **Intelligence 2** (une caractéristique, hors du système de rangs) ; « Tir ajusté » référence « Attaque à distance précise » (action inexistante).
11. [personnages.md](rules/fr/core/personnages.md) — formation « Garde » : « +1 Épée et +1 Bouclier » (compétences inexistantes) ; la formation « Soldat » référence des disciplines non rédigées (« Adepte des grandes lames », « Arbalétrier »).

**Détails et divers :**

12. [combat.md](rules/fr/core/combat.md) vs [universal_actions.md](rules/fr/core/actions/universal_actions.md) : le test d'endurance d'entretien et l'action Respiration sont identiques — voulu, mais la duplication risque de diverger (c'est déjà le cas pour le Critique).
13. [etats.md](rules/fr/core/etats.md) — « À genoux » : effets différents selon la source (`etats.md` : 🟩 aux attaques adverses ; carte Posture : 🟥 aux jets d'esquive). Compatible mais à consolider en un seul endroit.
14. Inspiration : « la fatigue 💧 de la cible diminue » sans montant chiffré (succès et échec).
15. [equipement.md](rules/fr/core/equipement.md) — typo « Cuire souple » ; coûts d'armures en « j » (unité non définie) vs « 100 pièces de Fer » dans les formations : système monétaire à unifier.
16. [voyager.md](rules/fr/core/voyager.md) — typos (« doivent ét la carte », « Colines ») ; « Fatigue permanente » et « Havre » utilisés sans définition ; règle des Charges incohérente en interne (« maximum 3d6 » §La Règle des Charges, mais « maximum 4d6 » §Chasse et table de probabilités jusqu'à 4d6).
17. Glossaire : les jetons ⊕⊖ (électromancie), ➡️ (inertie), 🌐⏳ (choromancie), ≬ (engagement serré) n'y figurent pas.

### 2.4 Points forts à souligner

- La **grammaire symbolique normalisée** (🎲🆚⚠️✴️▶️✅❌) rend les cartes d'action très lisibles et machine-parsables — c'est ce qui a permis le simulateur.
- Le **système de garde** (le défenseur fixe un seuil persistant, dégradable, brisable) est original et crée de vraies décisions tactiques.
- La **piste mentale symétrique** Colère/Peur avec états extrêmes auto-régulés (trauma + rebond) est élégante.
- La table des **dés d'adversaires** (🟧⬜🟫) avec progression d'espérance de +1 par palier est un excellent outil de calibrage.

---

## 3. Le site web (`web/`)

### 3.1 État

**Fonctionnel.** Next.js 16 (App Router, export statique, `trailingSlash`), pipeline Markdown → HTML (remark + GFM, callouts Obsidian convertis, liens `.md` réécrits), rendu « livre » via Paged.js avec double-buffer, préchargement et cache des sections, sidebar multi-livres, génération PDF (Puppeteer + pdf-lib, `quadrature.pdf` de 4,3 Mo présent). Le contenu est indexé par `scripts/generate-content-index.mjs` exécuté en pré-build.

**Vérifications effectuées :**
- `tsc --noEmit` : **0 erreur**.
- Les corrections de la revue de code de juin ([code_review.md](web/code_review.md)) ont été **appliquées dans l'arbre de travail** (suppression de `startFromEnd`, dédoublonnage de `generateStaticParams`, extraction de `BookViewerSkeleton`, disparition des `window as any`, `key={h2text}`) — mais **rien n'est commité** (12 fichiers modifiés + 4 non suivis).

### 3.2 Reste à faire / points d'attention

| Priorité | Sujet |
| :--- | :--- |
| Haute | **Commiter** l'état actuel (les correctifs de revue + le skeleton sont en suspens depuis le commit `6ef6869`) |
| Haute | `public/content-index.json` (350 Ko) est un artefact **obsolète** — le script génère désormais `content-index-{locale}.json` ; à supprimer du dépôt |
| Moyenne | La pipeline Markdown est **dupliquée** entre `src/lib/content.ts` et `scripts/generate-content-index.mjs` (assumé en commentaire, mais le risque de dérive est réel — extraire un module partagé) |
| Moyenne | Locale EN : structure prête (`LOCALES`, `books.json` bilingue, fallback fr) mais aucun contenu `rules/en/` |
| Basse | `README.md` est encore le boilerplate create-next-app |
| Basse | Reliquat de `code_review.md` : tokens CSS brass et regroupement `.sidebar-link` dans `globals.css` |

L'architecture (BookShell permanent + navigation sans changement d'URL + interception des liens `/rules/...` dans le HTML paginé) est propre et documentée. Bonne pratique : les fichiers sources commentés en français avec en-têtes explicatifs.

### 3.3 Feuille de personnage intégrée (juin 2026)

Le site héberge désormais l'outil interactif `/[locale]/personnage/` (réécriture de l'ex-`sheet/`) : composants `components/sheet/`, modèle d'état sérialisable `lib/character/` (identifiants anglais, libellés `LocalizedString`, valeurs dérivées jamais stockées), persistance multi-personnages en localStorage, export/import JSON, impression PDF, et UX « pages empilées » avec bascule au clic. Le CSS (`app/sheet.css`) est porté du prototype, scopé sous `.sheet-root` et importé localement pour que `@page`/`@media print` ne polluent pas le PDF du livre. Typecheck et build statique au vert ; commité sur `master`. Conçu comme socle du futur **créateur de personnage** pas-à-pas.

---

## 4. La feuille de personnage (`sheet/`)

> **⚠️ Section obsolète depuis le 18 juin 2026.** La feuille a été **réécrite et intégrée au site** (`web/`, route `/[locale]/personnage/` — voir §3.3). Le répertoire `sheet/` n'est plus maintenu ; `sheet.html` reste un brouillon legacy de référence, à archiver. La description ci-dessous documente l'état antérieur (le point 4.2.1 sur l'écart Dos/Taille avec `equipement.md` **reste valable** : il a été reporté tel quel dans l'intégration).

### 4.1 État

Fichier autonome [sheet.html](sheet/sheet.html) (~2 900 lignes, HTML + CSS + JS embarqués), avec un dépôt git actif à l'historique soigné (commits conventionnels). Fonctionnalités : upload de portrait, calcul automatique des cases de santé (Vigueur + Robustesse), jauge de fatigue, jetons de stabilité, **Charge Maximale auto-calculée (2 + Force + Robustesse — conforme aux règles)**, inventaire par zones avec emplacements 🔳/▫️/🔸, et mise en page imprimable. Un export PDF est présent.

### 4.2 Points d'attention

1. **Divergence avec les règles** : le commit `ea7d454` passe l'inventaire à **Dos 3 / Taille 1**, alors que [equipement.md](rules/fr/core/equipement.md) spécifie **Dos 2 / Taille 2**. L'un des deux doit être aligné (le total de 12 reste juste).
2. **Dépendance réseau** : la police est chargée depuis Google Fonts — à embarquer pour un usage hors-ligne/impression.
3. **Intégration au site** (objectif annoncé) non commencée : le portage d'un fichier monolithique vers un composant React sera un chantier en soi ; à anticiper avant que le fichier ne grossisse davantage.
4. Deux PDF « Feuille de Personnage » coexistent (racine, daté de mai, et `sheet/`) — risque de version périmée en circulation.

---

## 5. Le simulateur (`simulator/`)

### 5.1 État

**Solide et testé : 241 tests passent (8 suites, ~3 s).** Architecture claire en modules : `dieSystem/` (pool, jet, sélection des 4 dés — conforme aux règles, y compris sacrifices ⛞, renforcements ⬆ et annulation 🟩/🟥), `character/` (chargement YAML), `combat/` (actions, gardes, statuts, résolution par vagues d'initiative, effets en données pures appliqués sur snapshots), `encounter/` (scénarios YAML). Trois points d'entrée : `demo`, `simulate` (1→N runs, rapports JSON dans `combatReports/` — 45 rapports déjà générés), `optimize` (**grid search + équilibre de Nash** sur le seuil de Respiration — outil d'équilibrage réellement avancé).

Les agents sont soit scriptés (4 personas), soit **pilotés par LLM** (Mistral via `@node-llm/core`, sessions persistantes, battle cries + raisonnement loggés). `.env.example` documente la configuration.

### 5.2 Écarts règles ↔ simulation à connaître

Ces écarts sont acceptables pour un outil d'équilibrage, mais devraient être documentés (un `README.md` manque) pour interpréter correctement les résultats :

1. **Fatigue initiale = 0** dans `initCombatant` ; les règles disent « débute à 1, ne descend jamais sous 1 ».
2. **Défaut ⚠️** : le simulateur ne le détecte que sur les 2 dés de compétence conservés ; les règles l'étendent au dé 🟪 lancé à la place d'une caractéristique à 0.
3. **Statuts simplifiés** : « À terre » → −1 PA (au lieu des restrictions de déplacement + 🟩 en mêlée) ; « Essoufflé » → blocage du jeton 🔴 (au lieu de 🟥 à tous les jets).
4. **Pas de positionnement** : 6 actions et 4 gardes implémentées (pas de Dérobade, pas de déplacements, d'inertie, ni d'actions sociales/mentales hors piste).
5. Divers : warnings de dépréciation ts-jest (config `globals`), commentaires de timeout incohérents dans `agent.ts` (60 s annoté « 30 seconds »), modifications non commitées dans `agent.ts`.

---

## 6. L'outil d'astronomie (`tools/`)

**Abouti.** [astronomy.py](tools/astronomy.py) est un calculateur paramétrique propre (constantes physiques séparées des paramètres libres) qui régénère [aeonir_astronomy.md](tools/aeonir_astronomy.md). Le bilan des 6 objectifs de design est entièrement validé : quasi-verrouillage (T_rot 56,8 ans vs T_orb 54,6 ans), lune-horloge de 30 h au diamètre apparent 1,8× lunaire, traversée du terminateur en 100 ans à 45°, étés polaires asymétriques (20 ans intenses au Nord / 34 ans faibles au Sud — même énergie totale, démonstration par la loi des aires), gravité 0,75 g. Le système de temps en base 6 est dérivé jusqu'au pendule-étalon de ~1 m. Beau travail de worldbuilding quantitatif.

Points mineurs : le dossier n'est **pas versionné** (seul des cinq sous-projets) ; l'ambiguïté « 300 km de rayon ou de diamètre » de la lune (note BookStack) reste à trancher.

---

## 7. Cohérence transversale

C'est ici que se trouvent les écarts les plus importants du projet.

### 7.1 `lore.md` est désynchronisé du modèle astronomique

[univers/astronomie.md](rules/fr/univers/astronomie.md) est aligné sur l'outil. [univers/lore.md](rules/fr/univers/lore.md) conserve les **anciennes valeurs** :

| Grandeur | lore.md (ancien) | astronomie.md + outil (actuel) |
| :--- | :--- | :--- |
| Masse planète | 0,85 M⊕ | **0,42 M⊕** |
| Rayon | 6 000 km | **4 775 km** |
| Rotation / jour solaire | 2 500 ans | **T_rot 56,8 ans ; jour solaire 1 414 ans** |
| Dérive du terminateur | 15 km/an (40 m/j) | **21,2 km/an (58 m/j)** |
| Saisons polaires | 600–625 ans (¼ d'Ère) | **20–34 ans** (mécanisme orbital) |
| Ère | demi-rotation ≈ 1 250 ans, « ≈ 12 cycles » | **1 période orbitale = 54,6 ans** |

Le changement d'échelle des saisons polaires (600 ans → ~27 ans) a des **conséquences narratives majeures** (un « destin générationnel » devient une saison vécue plusieurs fois par vie) qui irriguent `climat.md`, `ecologie.md` et les fiches des peuples — une passe de relecture complète de l'univers est nécessaire.

### 7.2 Deux systèmes de temps concurrents

- `lore.md` : **Course** (orbite lunaire) / Phase / **Cycle** (traversée du terminateur ≈ 100 ans) / Ère (demi-rotation).
- `tools/` : **Cycle = orbite lunaire 30 h** / Ronde / Moment / Instant / Battement / Hexade / Phase / **Ère = période orbitale**.

Le même mot (« Cycle », « Phase », « Ère ») désigne des durées différentes selon le document. À trancher avant que le vocabulaire ne se propage dans les textes des peuples.

### 7.3 Deux systèmes de consommables

- [equipement.md](rules/fr/core/equipement.md) : **Jauge de Stock** (1 dé ⬜ contre le stock actuel, ≥ stock → −1).
- [voyager.md](rules/fr/core/voyager.md) : **Règle des Charges** (1d6 *par* charge, un 0 → −1 charge).

Deux mécaniques pour le même concept ; à fusionner ou à différencier explicitement (individuel vs groupe).

### 7.4 Duplication de contenu univers

`lore.md` contient une section `# 🌦️ Climat` entière qui recouvre [climat.md](rules/fr/univers/climat.md) (et les désignations saisonnières des pôles y divergent : été/hiver dans `lore.md`, Automne/Printemps polaires dans `climat.md`). À dédupliquer — `lore.md` gagnerait à devenir une synthèse renvoyant vers les fichiers spécialisés.

### 7.5 Artefacts hérités à la racine

`Quadrature_latest.md` (280 Ko — l'export legacy d'où la restructuration est partie), 4 captures d'écran, un PDF de feuille de personnage daté, `.bookstack-access`. La racine n'est pas versionnée. Suggestion : un dossier `archive/`, et clarifier le statut de BookStack vs le vault (qui est la source de vérité désormais ?).

---

## 8. Recommandations priorisées

| # | Priorité | Action | Effort |
| :-: | :--- | :--- | :--- |
| 1 | 🔴 P1 | Corriger les 6 références croisées cassées des règles (§2.3.1–6 : défenses, Jeter, symboles ✪/✫) | Faible |
| 2 | 🔴 P1 | Passe de nomenclature : Tir ciblé/précis, Frappe brutale/puissante, action « Pas », traits orphelins, formation Garde | Moyen |
| 3 | 🔴 P1 | Resynchroniser `lore.md` avec `astronomie.md` + unifier le système de temps (§7.1–7.2) | Moyen |
| 4 | 🟠 P2 | `rules/` et `web/` **commités** (juin 2026) ; reste : commiter `simulator/` (`agent.ts`) et versionner `tools/` | Faible |
| 5 | 🟠 P2 | Trancher le conflit Jauge de Stock vs Règle des Charges | Faible |
| 6 | 🟠 P2 | Compléter les traits manquants (6 compétences sans traits) — bloquant pour la progression des personnages au rang 3 | Élevé |
| 7 | 🟠 P2 | Aligner l'inventaire de la feuille (désormais intégrée au site) sur `equipement.md` — Dos 3/Taille 1 ↔ Dos 2/Taille 2 — et embarquer la police (toujours via Google Fonts) | Faible |
| 8 | 🟡 P3 | Rédiger un README simulateur documentant les écarts règles/simulation (§5.2) | Faible |
| 9 | 🟡 P3 | Finaliser Hast Tiers 3, Échomancie, puis Impact et Choromancie | Élevé |
| 10 | 🟡 P3 | Ajouter un exemple chiffré de calcul du Niveau de Menace 💀 ; étendre le glossaire aux symboles des disciplines | Faible |
| 11 | ✅ Fait | Feuille intégrée au site (`/personnage`, React + état persistant, pages empilées) — juin 2026 | — |

---

## 9. Conclusion

Le socle est très sain : un système de jeu original dont le cœur mécanique est complet et testé *par du code*, un univers dont la physique est littéralement calculée, et une chaîne de publication fonctionnelle. Les faiblesses actuelles ne sont pas structurelles — ce sont des dettes de synchronisation entre documents nés de refontes successives, exactement ce qu'on attend d'un projet en construction active. La priorité naturelle est une **passe de cohérence éditoriale** (règles puis lore), après quoi le projet sera en excellent état pour une séance de découverte (`_wip/decouverte.md`) avec les six personnages prétirés prévus.
