# Simulateur de combat — Quadrature

Moteur de combat **TypeScript** qui rejoue les règles de Quadrature jusqu'à
l'incapacitation d'un camp. Il sert à **mesurer l'équilibrage** (taux de
victoire, durée, usage des actions) et à **valider les règles** en les exécutant
plutôt qu'en les relisant. Les combattants sont pilotés par des **agents
scriptés** qui décident par espérance d'utilité (pas de LLM requis).

> Source de vérité des règles : le vault `rules/fr/`. Le simulateur en est une
> *implémentation* — les quelques écarts assumés sont listés [plus bas](#écarts-règles--simulation).

---

## Démarrage rapide

Prérequis : **Node 20+**.

```bash
cd simulator
npm install

npm test                                                 # suite de tests (Jest)
npx ts-node src/simulate.ts encounters/duel-arme.yaml    # 1 combat, log manche par manche
npx ts-node src/simulate.ts encounters/duel-arme.yaml 400 --quiet   # 400 combats, stats agrégées
```

Scripts `package.json` : `test`, `test:watch`, `typecheck` (`tsc --noEmit`),
`build`, `simulate`, `optimize`, `demo`.

---

## Les modes d'exécution

`src/simulate.ts` prend un **chemin de rencontre** et un **nombre de runs** :

| Commande | Effet | Rapport écrit |
| :--- | :--- | :--- |
| `simulate.ts <enc>.yaml` | **1 run** — sortie détaillée manche/bande/action | `combatReports/<id>.json` (rejouable) |
| `simulate.ts <enc>.yaml 400` | **batch** — une ligne par run + tableau de stats | `<id>.batch.json` + `<id>.stats.json` |
| `simulate.ts <enc>.yaml 400 --quiet` | batch sans le détail par run | idem |

- Un **rapport 1-run** (`.json`) est rejouable dans le visualiseur web (`/fr/combat`).
- Un **batch** écrit les runs bruts (`.batch.json`, gros) **et** les stats seules
  (`.stats.json`). Les batchs ne sont pas destinés à être rechargés ni analysés à la main.
- `combatReports/` est **gitignoré** : les rapports sont locaux à ta machine.

Autres entrées :
- `npx ts-node src/demo.ts` (`npm run demo`) — démonstration du système de dés et
  d'une fiche de personnage (hors combat).
- `npx ts-node src/optimize.ts` (`npm run optimize`) — ⚠️ **obsolète** : grid search
  sur `respirationThreshold`, un paramètre que le planificateur par utilité **ne lit
  plus**. À réoutiller sur les **poids de persona** (`PlannerConfig.weights`) — voir
  [Écarts & dette](#écarts-règles--simulation).

---

## Anatomie d'une rencontre

Une rencontre est un YAML dans [`encounters/`](encounters). Schéma
([`src/encounter/types.ts`](src/encounter/types.ts)) :

```yaml
name: "Duel à l'épée"                 # titre (affiché + nom du rapport)
description: >                        # optionnel — texte d'ambiance
  Un duel codifié entre deux combattants armés.
maxRounds: 20                         # nul si personne n'est vaincu avant

# board optionnel — modèle spatial TOUT-OU-RIEN (cf. § Positions) :
# board: { width: 34, height: 22 }

factions:                            # exactement DEUX camps opposés
  - name: "Dueliste puissant"
    characters:
      - sheet: characterSheets/Duelist_powerful.yaml   # OU adversary: faucheur
        persona: aggressive          # aggressive | cautious | opportunist | inexperienced
        # agent: scripted            # scripted (défaut) | llm
        # pos: { x: 2, y: 2 }        # requis SSI un board est déclaré
    allowedActions:                  # liste blanche ; vide/absente = tout est permis
      - armed-attack
      - stabilize
      - respiration
  - name: "Dueliste précis"
    characters:
      - sheet: characterSheets/Duelist_precise.yaml
        persona: opportunist
    allowedActions: [armed-attack, stabilize, respiration]
```

- **`sheet`** charge une fiche de PJ ; **`adversary`** charge une créature
  (`data/bestiary/cards/<id>.card.yaml`). Exactement l'un des deux.
- **`allowedActions`** restreint la trousse au niveau du scénario — c'est ainsi
  qu'on isole un duelliste « qui n'a que ses attaques directes », ou un archer
  « sans mêlée ».
- **`persona`** et **`agent`** ne concernent que les PJ ; les créatures sont
  toujours scriptées (heuristique de deck + garde fixe).

### Fiches de personnage

Dans [`characterSheets/`](characterSheets) — 10 caractéristiques × 2 compétences.
La **valeur d'une caractéristique est DÉRIVÉE** de ses deux compétences
(`value = 1 + jalons aux rangs 2/4`, plafond 5) : le simulateur la **recalcule**,
la valeur écrite sur la fiche n'est qu'indicative. Une fiche ne peut donc pas
diverger de ses rangs pratiqués. Les compétences débloquent aussi les actions
(prérequis) : `precision ≥ 1` → Frappe vive, `intuition ≥ 1` → Tir rapide…

Une fiche porte en plus, optionnellement :

- **`traits`** — atouts de socle (§ traits.md), débloqués aux rangs 3/5 d'une compétence ;
- **`disciplines`** — rang investi dans une discipline hors socle (`{ fencing: 1 }`) ;
- **`perks`** — atouts de discipline (les Formes, Bottes…) ;
- **`skillTags`** — choix de build enregistrés (arme de prédilection, style : `favweapon-broad`, `style-duelist`).

`validateCharacter` refuse toute fiche incohérente : un perk dont les prérequis ne
sont pas tenus, un choix d'arme non résolu, un rang de discipline au-delà du cap
débloqué par les perks.

---

## Architecture

```
src/
├── dieSystem/     # Le Jet : réserves de dés, lancer, conservation des 4 dés, critiques/défauts
├── character/     # Fiches de PJ : dérivation des caracs, I/O YAML, traits, disciplines & atouts (perks)
│   ├── traits.ts       # registre data/traits.yaml + validation de progression
│   ├── disciplines.ts  # registre data/disciplines/*.yaml (perks) + validatePerks
│   └── grants.ts       # vocabulaire partagé des grants (familles trait ET perk)
├── combat/        # Cœur : actions, gardes, statuts, blessures, bandes, positions, résolution
│   ├── round.ts       # resolveRoundBands — balaie les 3 bandes, snapshot-puis-applique
│   ├── actions.ts     # ActionDef + GUARD_DEFS + resolveAction (jet vs DD)
│   ├── actions-data.ts# charge data/player_actions.yaml → ACTION_DEFS
│   ├── combatant.ts   # état d'un PJ : blessures, fatigue, piste mentale, ◇, trauma
│   ├── bands.ts        # bandes d'initiative I/II/III (🌓🌕🌗)
│   ├── position.ts / movement.ts   # grille (Chebyshev), chemins, approche & recul
│   ├── status.ts       # STATUS_DEFS (essoufflé, sonné, à terre, hémorragie…)
│   ├── effect-ops.ts   # grammaire d'effets partagée PJ ↔ adversaires
│   ├── traits.ts       # face combat des traits (modes réactifs, coûts)
│   └── perks.ts        # face combat des perks : substitution de jet d'Escrime
├── adversary/     # Créatures : parties à blocs, ressources régénérantes, dés d'adversaire, heuristique de deck
├── planner/       # Le cerveau des agents scriptés (cf. § ci-dessous)
│   ├── prob.ts        # distributions EXACTES des jets (mémoïsées)
│   ├── value.ts       # valorisation générique des effets en équivalents-💢 ; poids de persona
│   └── planner.ts     # meilleur plan de manche, garde EV, sélection de partie
├── encounter/     # Chargement des rencontres YAML
├── simulate.ts    # Boucle de combat + affichage + écriture des rapports
├── stats.ts       # Agrégation batch (taux de victoire, durées, usage d'actions)
└── optimize.ts    # (obsolète) grid search d'équilibrage
```

Les **définitions d'actions** (PJ) vivent dans
[`data/player_actions.yaml`](../data/player_actions.yaml) à la racine du dépôt ;
les **fiches de créatures** dans `data/bestiary/`. Le simulateur les charge au
démarrage. C'est un choix : la donnée de jeu est éditable sans toucher au code.

### Le Jet (`dieSystem/`)

Reproduit fidèlement `rules/fr/core/jouer.md` : réserve = N dés 🟦 (caractéristique)
+ N dés 🟨 (compétence, complétés en 🟪 Affaibli sous 2) + 1 dé ⬜ (± 🟩/🟥). On
lance tout, on **conserve 4 dés** (meilleur 🟦, 2 meilleurs 🟨, 1 aléa), score
0–20. **Critique ✴️** si un 🟨 conservé = 5, **Défaut ⚠️** si un 🟨/🟪 = 0.

### Résolution d'une manche (`combat/round.ts`)

1. **Phase d'entretien** : reset des PA, test d'Endurance (fatigue ≥ 10), refill
   des ressources d'adversaire.
2. **Phase d'actions** en **trois bandes** révélées successivement (I / II / III).
   Chaque combattant pose **une carte par bande au plus**. À l'intérieur d'une
   bande, résolution par initiative fine (snapshot-puis-applique : les coups
   simultanés lisent un état figé).
3. **Système de garde** : au premier coup reçu dans la manche, le défenseur choisit
   et lance sa garde une fois ; le résultat devient le **DD** que tout attaquant
   doit atteindre ce tour. Gardes actives (Esquive/Parade/Blocage) = 1⚡.
4. **Fin de manche** : conversion 💢→💔 (3:1 au-dessus de la Résistance),
   saignements, expiration des protections temporaires.

### Adversaires (`adversary/`)

Résolution **asymétrique** : une créature lance **4 dés sommés** (qualité 🟧⬜🟫
selon sa puissance) contre la **garde fixe** du PJ — elle ne roule pas de garde.
Son corps est fait de **parties à blocs** ; chaque bloc intact **confère** une
capacité (une carte, un bonus de garde, une ressource régénérante 🫁/◇/🍀) qui
disparaît quand le bloc cède. Piste mentale à 4 états modulant le rang des dés.

### Disciplines & atouts — perks (`character/disciplines.ts`, `combat/perks.ts`)

Les **disciplines** (§ `rules/fr/disciplines/`) sont des compétences **hors du
socle** de 20 : leur rang est débloqué par des **atouts (perks)**, plafonné à 4.
La source est un fichier par discipline dans
[`data/disciplines/`](../data/disciplines) (sections `perks:` + `actions:`), même
patron que `player_actions.yaml` : clés anglaises, chaînes `Locale`.

Un perk va plus loin qu'un trait : il porte une **liste hétérogène de `grants`**
(un trait en porte au plus un de chaque). Les familles vivent dans
[`character/grants.ts`](src/character/grants.ts) :

| Famille | Ce qu'elle fait | Branchée ? |
| :--- | :--- | :--- |
| `rollSubstitution` | jouer la discipline 🟨🟨 au lieu d'une compétence, sur une action **ou** une garde | ✅ (Lot 1) |
| `skillTag` / `skillTagChoice` | conférer un marqueur / offrir un choix de build (arme de prédilection) | ✅ (validation) |
| `mentalInit`, `reactionOnTrigger` | les ♾️ Formes : état mental initial + ⚡ sur déclencheur gaté | ⏳ Lot 2 |
| `rollBonus`, `costOverride`, `outcomeRider` | passifs restants | ⏳ |

Un grant `wired: false` est de la **donnée porteuse** ignorée par le moteur (même
convention que le Contrecoup des gardes) — la donnée est complète, le moteur suit
par lots. La **substitution** est câblée là où le jet se construit, une seule fois :
`checkRollParams` (actions, vue aussi par le planificateur) et `makeGuardRoll`
(gardes) ; elle remplace la valeur de compétence par le rang de discipline, la
caractéristique 🟦 ne bouge pas. Le porteur est lu depuis `state.char`, donc aucun
champ n'est dupliqué sur l'état de combat.

**Escrime** est la première discipline branchée : les trois Formes (Duelliste,
Fine Lame, Belliciste) avec leurs substitutions par arme de prédilection. Les ♾️
et les Bottes suivront.

---

## Le planificateur par utilité (`planner/`)

Les agents scriptés ne choisissent **pas** par listes de priorité codées en dur,
mais par **espérance d'utilité** :

1. **`prob.ts`** calcule la distribution **exacte** de chaque jet (mémoïsée) →
   `P(toucher)`, `P(✴️)`, `P(⚠️)`.
2. **`value.ts`** price les effets qu'une action *produirait* (son `resolve()` est
   pur) en **équivalents-💢** : une blessure vaut plus près du seuil de conversion,
   un statut est lu depuis `STATUS_DEFS`, un choc mental selon la piste et le ◇…
   Les **personas** sont des **vecteurs de poids** (offense / prudence / achèvement
   / bruit), pas des listes de candidats.
3. **`planner.ts`** énumère les affectations de bande (une carte par bande, PA
   réservés) et retient le plan de plus haute utilité. Il choisit aussi la **garde**
   à l'espérance et la **partie** du corps visée.

**Positionnement** (sur plateau) : l'agent compare *sa* portée à la **menace** de
l'ennemi (portée + terrain couvert) et décide **approche / kite / tenir**. Un
tirailleur qui **outporte** son adversaire ouvre la distance (recul) et tire ; un
combattant de mêlée ferme toujours le contact (il n'outporte personne).

La replanification se fait **par bande** : quand la cible tombe entre deux bandes,
l'acteur **se re-cible** sur l'état courant.

---

## Positions, déplacement, distance

Le modèle spatial est **optionnel et tout-ou-rien** : une rencontre sans `board`
n'a aucune géométrie (tout le monde est à portée de tout le monde) ; avec un
`board`, **chaque** combattant a une case de départ (`pos`).

- Grille en **métrique de Chebyshev** (diagonales = 1 case).
- **Marche** 3 · **Course** 5 + Mobilité · **Charge** (exige l'Inertie ➡️ 3 que
  seule la Course donne, résolue en Bande III). Le déplacement peut **approcher**
  ou **reculer** (kiting).
- **Bande de portée** `[minRange, effectiveRange]` : la mêlée porte à 1, un **tir**
  ne part **pas au contact** (minRange 1) et porte loin (effectiveRange). La portée
  est gâtée *après* le mouvement — une Charge traverse le terrain puis connecte.

---

## Rapports & statistiques

- **1-run** : `combatReports/<id>.json` — log complet (manches, bandes, actions,
  jets, effets, positions), rejouable dans le visualiseur web.
- **Batch** : `<id>.batch.json` (runs bruts) + `<id>.stats.json` (agrégats seuls).
  Le tableau imprimé donne : taux de victoire par camp, double incapacitation,
  limite de rounds, durées, et par personnage l'**usage des actions** (Util,
  Hit %, effet moyen) et les **gardes** (setup, DD moyen, taux de blocage).

---

## Écarts règles ↔ simulation

Le simulateur implémente l'essentiel des règles ; quelques points sont
volontairement simplifiés ou **en avance** sur le vault :

- **Portées codées en dur dans l'action** (mêlée 1, tir min 1 / max 24) : elles
  viendront de l'**arme équipée** (chantier armes #18). Même raccourci qui fait
  rouler l'Attaque armée sur Puissance pour tout le monde, dague ou rapière.
- **Nuances de tir non modélisées** : avantage 🟩 contre Parade, mode réactif du
  Tir rapide, relance 🟦 du Tir ajusté (⚒️ différés).
- **Escrime partielle (Lot 1)** : seule la substitution de jet par arme de
  prédilection est branchée. Les ♾️ Formes (état mental initial, ⚡ sur déclencheur),
  la Riposte et les Bottes attendent le Lot 2 — présents en donnée `wired: false`.
- **`optimize.ts` obsolète** : il cherche `respirationThreshold`, inerte depuis que
  le planificateur par utilité a remplacé les seuils de self-care. À réoutiller sur
  les poids de persona (`PlannerConfig.weights`, déjà prévus pour ça).
- Divers `⚒️` (améliorations d'actions) et déclencheurs mentaux fins restent différés.

La liste vivante des chantiers est dans [`../Roadmap.md`](../Roadmap.md).
