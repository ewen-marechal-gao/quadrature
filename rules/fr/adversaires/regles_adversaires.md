# 🐉 Adversaires

> Voir aussi : [exemples_adversaires.md](exemples_adversaires.md) · [../core/combat.md](../core/combat.md) · [../core/etats.md](../core/etats.md)

Les personnages non joueurs, monstres et alliés mineurs utilisent des **fiches simplifiées**, conçues pour limiter la charge mentale du meneur — en particulier le suivi des ressources. Le meneur réalise tout de même les **jets d'attaque et de défense** : l'adversaire reste un acteur du combat.

Une fiche d'adversaire tient sur une **feuille A5 paysage** (plastifiable), accompagnée d'un **deck de cartes d'action** au même format que les cartes des joueurs.

Les groupes d'adversaires faibles, les **Hordes**, utilisent un système encore plus simplifié et font l'objet d'une [section dédiée](#-hordes).

---

## Résolution des jets

Les adversaires n'ont ni caractéristiques ni compétences détaillées : ils résolvent leurs jets avec **quatre dés** dont on additionne le résultat (**0 à 20**), au lieu du « 1 meilleur 🟦 + 2 meilleurs 🟨 + 1 aléa » des joueurs. La qualité des dés encode la puissance de la créature (voir [§ Dés d'adversaires](#dés-dadversaires-0-à-5)).

### Quand l'adversaire attaque un personnage

1. Le meneur lance les **4 dés** de la créature et **additionne** le résultat.
2. Il le compare à la **valeur de Garde** du personnage ciblé (le score que le joueur a obtenu lors de sa réaction de Garde — voir [../core/actions/defense_reactions.md](../core/actions/defense_reactions.md)).
   - Résultat **≥ Garde** → on applique l'effet **✅ Réussite**.
   - Résultat **< Garde** → on applique l'effet **❌ Échec**.
3. Si le jet contient **un ou plusieurs 5**, on résout en plus l'effet **⭐ Repérez X 5** de la carte (X = nombre de 5 requis).

> **Pas de Défaut ⚠️ pour les adversaires.** Pour alléger le travail du meneur, les jets d'adversaires n'ont jamais d'effet de défaut : seuls **Réussite**, **Échec** et **Repérez X 5** existent.

### Quand un personnage attaque l'adversaire

1. Chaque adversaire possède un **type et une valeur de Garde** fixes, inscrits sur sa fiche (ex. *Esquive 10*, *Parade 12*). Cette valeur ne fait l'objet d'aucun jet.
2. Le joueur effectue son jet d'attaque normalement, puis le compare à la **Garde** de l'adversaire.
   - Score **≥ Garde** → la cible est touchée, on applique les effets de l'action.
   - Score **< Garde** → l'attaque échoue.

### Avantage et désavantage 🟩🟥

Une attaque peut bénéficier d'un **avantage 🟩** ou souffrir d'un **désavantage 🟥** selon le **type de garde** rencontré (une frappe lourde porte mieux contre une esquive qu'une botte vive, etc.). L'effet dépend de qui lance les dés :

- **Côté joueur** (attaque ou garde) : 🟩🟥 fonctionnent normalement (dé d'aléa supplémentaire).
- **Côté adversaire** : 🟩 **améliore** d'un cran la qualité d'un dé lancé (🟧 → ⬜ → 🟫), 🟥 la **dégrade** d'un cran. Comme chaque cran vaut exactement **±1 d'espérance**, cet ajustement est mathématiquement neutre.

---

## La fiche d'adversaire

### Dés d'adversaires (0 à 5)

Pour conserver la règle des quatre dés, on ne change pas leur **nombre** mais leur **qualité**, selon la fiabilité voulue pour la créature :

- **Dé de Nuisance 🟧** — faces 0, 1, 1, 2, 2, 3. *Créatures chétives, blessées ou paniquées* (moyenne basse, beaucoup de 0).
- **Dé de Menace ⬜** — faces 0, 1, 2, 3, 4, 5. *L'équilibre standard.*
- **Dé de Danger 🟫** — faces 2, 3, 3, 4, 4, 5. *Créatures massives, vétérans, frappes lourdes* (pas de 0 possible, plancher haut).

| Puissance | Équivalent PJ | Jet de base | min | Moyenne | max |
| :---- | :---: | :---: | :---: | :---: | :---: |
| Insignifiant | 0/0 | 🟧🟧🟧🟧 | 0 | **6** | 16 |
| Nuisible | 1/0 | ⬜🟧🟧🟧 | 0 | **7** | 17 |
| Faible | 1/1 | ⬜⬜🟧🟧 | 0 | **8** | 18 |
| Novice | 2/1 | ⬜⬜⬜🟧 | 0 | **9** | 19 |
| Initié | 2/2 | ⬜⬜⬜⬜ | 0 | **10** | 20 |
| Compétent | 3/2 | 🟫⬜⬜⬜ | 1 | **11** | 20 |
| Vétéran | 3/3 | 🟫🟫⬜⬜ | 2 | **12** | 20 |
| Expert | 4/3 | 🟫🟫🟫⬜ | 3 | **13** | 20 |
| Élite | 4/4 | 🟫🟫🟫🟫 | 4 | **14** | 20 |

Au-delà, ajouter un dé et **garder les quatre meilleurs**.

### Santé ♥️ et parties du corps

La vitalité d'un adversaire n'est pas une barre de points de vie unique : elle est répartie entre des **parties du corps** nommées (Tête, Corps, Serres, Pattes…). Chaque partie possède :

- une **Armure 🛡️ X** propre (réduit de X les **blessures 💢** reçues sur cette partie, minimum 1) ;
- un ou plusieurs **blocs** de cases ▢ ; **chaque bloc confère une capacité** (imprimée à côté de lui).

**Capacités conférées.** Une partie intacte donne à la créature ce qu'elle *est* : des **actions** disponibles dans son deck, des **ressources régénérantes** (gagnées au début de chaque manche), ou des **modificateurs**. On lit toujours ce que la créature possède encore, jamais ce qu'elle a perdu.

**Cibler une partie.** L'attaquant **déclare la partie visée avant de lancer les dés**. Les blessures s'appliquent à cette partie (réduites par son armure).

**Détruire un bloc.** Les **blessures 💢** cochent les cases de la partie, **bloc par bloc** dans l'ordre imprimé (du haut vers le bas). Une **blessure grave 💔** détruit immédiatement un bloc entier. Lorsque toutes les cases d'un bloc sont cochées, le bloc est **détruit** et la capacité qu'il conférait est **perdue** (par exemple, une action quitte le deck, ou son coût augmente).

> Un bloc de |▢▢| absorbe donc **2 blessures légères 💢** ou **1 blessure grave 💔**. Contrairement aux personnages, les adversaires **n'effectuent pas de conversion 💢 → 💔 en fin de manche** : les blessures restent sur la partie jusqu'à ce qu'un bloc soit rempli.

La créature reste en jeu tant que toutes ses parties ne sont pas détruites ; sa mise hors de combat dépend surtout de la **Fatigue 💧** (voir ci-dessous).

### Fatigue 💧 et Endurance 🫁

💧 **Fatigue.** Chaque case ▢ représente un point de fatigue. Si toutes les cases sont cochées, la créature est **Épuisée** : brisée, elle s'effondre, se soumet ou prend la fuite — elle est **hors de combat, mais pas morte**. Tuer une créature passe par ses blessures ; l'épuiser permet de la capturer ou de la chasser.

🫁 **Endurance X.** Au début de chaque tour de la créature, prendre **X jetons fatigue**. Ces jetons sont **dépensés avant** de cocher les cases de fatigue permanente ▢ — mais une attaque qui inflige de la fatigue coche **toujours au moins 1 case ▢**, quel que soit le tampon restant (même principe que le « minimum 1 » de l'armure). L'Endurance est généralement conférée par le **Corps** : détruire le Corps coupe ce tampon, et la fatigue s'accumule alors directement.

💧 **Coût de fatigue des actions.** Certaines actions puissantes portent un coût en fatigue (ex. `Cri 💧`) payé au moment de les jouer. Contrairement à la fatigue subie, ce coût est absorbable **intégralement** par les jetons 🫁 : agir en étant frais est gratuit. Mais le tampon brûlé n'absorbe plus les attaques — une créature qui se dépense s'ouvre aux dégâts de fatigue. Une créature **ne peut pas jouer** une action dont le coût remplirait sa piste de fatigue.

### Défenses : Évasion et Armure

🛡️ **Armure X** — propre à chaque partie du corps (voir ci-dessus).

🍀 **Évasion X** — défense **globale** de la créature. Au début de chaque manche, elle gagne X jetons d'Évasion. Chaque jeton transforme **une blessure grave 💔** reçue dans la manche en **3 blessures légères 💢** (elles-mêmes réduites par l'armure de la partie). L'Évasion est conférée par les **Pattes** : pattes détruites → **Évasion 0** et plus aucun déplacement possible.

Par défaut, la **Garde** d'un adversaire est l'**Esquive**. Certaines créatures **bloquent** ou **parent** à la place, généralement avec une valeur plus haute. ⚔️

### Hémorragie 🩸

Les jetons d'**Hémorragie 🩸** sont **cumulatifs**. À la **fin de chaque manche**, la créature coche autant de cases ▢ qu'elle possède de jetons, en **ignorant toute armure ou réduction** — le sang ne connaît ni le souffle (🫁) ni la cuirasse. Les cases sont cochées en **priorité sur les blocs les plus entamés** : le saignement concentre les pertes et précipite la destruction des capacités déjà fragilisées. Puis la **plaie se referme d'un cran** (retirez **1 jeton**) : un saignement récent continue de couler mais **s'estompe** si la créature n'est pas blessée à nouveau.

### États mentaux (4 états)

La piste mentale d'une créature est **simplifiée** (4 états au lieu des sept des personnages) et **sans centre neutre** : deux **dispositions douces** encadrées par deux **extrêmes**. Au début du combat, le meneur pose la disposition de départ — la créature est **😠 Agressive** ou **😟 Prudente** —, ce qui colore d'emblée son comportement.

| État | Menace (rang des dés) | Garde | |
| :-- | :-- | :-- | :-- |
| 😡 **Enragé** | **⬆** renforce un dé | **−2** | extrême colère : plus dangereux, mais s'ouvre |
| 😠 **Agressif** | **⬆** renforce un dé | — | disposition offensive (pur bonus) |
| 😟 **Prudent** | — | **+1** | disposition défensive (pur bonus) |
| 😱 **Paniqué** | **⬇⬇** dégrade deux dés | **+1** | extrême peur : plus dur à toucher, mais inoffensif |

*(**⬆/⬇** modifient le **rang** des dés de menace — 🟧 → ⬜ → 🟫 — en s'empilant avec les 🟩/🟥 de matchup ; **±garde** modifie le seuil fixe.)*

**🔺 vers la Colère / 🔻 vers la Peur.** Un **🔺** remonte la piste (Prudent → Agressif → Enragé), un **🔻** la descend (Agressif → Prudent → Paniqué) ; franchir le milieu **bascule la disposition**. Seuls les **extrêmes** portent une contrepartie pour la créature : les joueurs peuvent donc **chercher à l'y pousser** — vers **Enragé** pour la trouer plus facilement (garde −2), vers **Paniqué** pour la rendre inoffensive (menace ⬇⬇).

**◇ Stabilité X** — au début de chaque manche, la créature gagne **X** jetons de Stabilité (souvent conférés par la **Tête** ; les détruire coupe cette régénération). Chaque **🔺/🔻** subi est d'abord **absorbé** en dépensant un **◇** : la piste ne bouge qu'une fois le **◇ épuisé** (§ Ténacité). Assécher ce ◇ est donc le préalable à toute bascule — voir l'état **Déstabilisé** ([etats.md](../core/etats.md)) et les actions sociales **Provocation** / **Intimidation**.

### Actions ⚫ et réactions ⚡

⚫ La créature dispose d'un ou plusieurs **points d'action ⚫**, et parfois de **réactions ⚡**. Les cartes jouables forment son **deck**, modulé par l'état de ses parties du corps.

🚶/🏃 **Vitesse.** Une créature peut effectuer gratuitement un **pas de placement** ou une action de **Marche**, ou dépenser **⚫ + ▢💧** pour une action de **Course**.

---

## Niveau de menace 💀

Le **Niveau de Menace 💀** estime la dangerosité d'une créature, pour la doser ou comparer deux adversaires. Il vaut **(Survie × Létalité)**, ajusté par la **Fiabilité** des dés.

| Survie | 💀 Valeur | Note de design |
| :---- | :---- | :---- |
| ♥️ Bloc de partie | +5 / bloc | Capacité à encaisser une blessure grave |
| 💢 Attrition | +1 / ▢ des blocs | Un bloc large résiste mieux à l'attrition qu'un petit |
| 💧 Fatigue | +2 / case | Une créature inconsciente est hors de combat |
| 🫁 Endurance | +2 / point | Tampon contre l'épuisement |
| 🍀 Évasion | +2 / point | Transforme la mort immédiate en délai |
| 🛡️ Armure | +3 / point | Réduction passive |
| 🧠 Ténacité | +2 / case | Barre de santé mentale |

| Létalité | 💀 Valeur | Note de design |
| :---- | :---- | :---- |
| ⚫ Actions | +5 / point | Plus d'actions = plus de létalité |
| Infliger 💧 | +5 | Équivalent d'une attaque à mains nues |
| Infliger 💢 | +5 | Équivalent d'une frappe rapide |
| Infliger 💔 | +10 | Équivalent d'une frappe lourde |
| Infliger 🔺🔻 | +5 | Équivalent d'une frappe lourde |

| Fiabilité | 💀 Valeur | Note de design |
| :---- | :---- | :---- |
| 🟧 Nuisance | +2 / dé | Moyenne de 1,5 |
| ⬜ Menace | ×1.0 / dé | Moyenne de 2,5 |
| 🟫 Danger | ×1.2 / dé | Coefficient multiplicateur sur la létalité |

---

## Actions d'adversaires

Briques réutilisables pour composer un deck. Elles prennent la forme de cartes, similaires aux cartes d'action des joueurs, mais sans effet de **Défaut ⚠️**.

**🗡️ Harcèlement ⚫** *(init. 2)*
*Une pluie de coups faibles mais incessants visant à épuiser la garde.*
⭐ Repérez un 5 : la cible subit 💧 supplémentaire.
✅ Inflige 💢 + 💧
❌ Inflige 💧

**⚔️ Frappe vive ⚫** *(init. 3)*
⭐ Repérez un 5 : la cible subit 🔻.
✅ Inflige 💢💢💢
❌ Inflige 💢

**🪓 Frappe lourde ⚫⚫** *(init. 5)*
⭐ Repérez un 5 : la cible est **Sonnée 🫨**.
✅ Inflige 💔
❌ Inflige 💢💢

**🦷 Morsure ⚫⚫** *(init. 3)*
⭐ Repérez un 5 : la créature **agrippe** la cible (**Entravé 🕸️**).
✅ Inflige 💢💢💢
❌ Inflige 💢

---

## Traits d'adversaires

Briques pour concevoir et équilibrer des adversaires.

### Traits offensifs

**Réflexes de prédateur :** la créature dispose de **+1 ⚡** par manche. Elle peut l'utiliser pour effectuer une *Frappe vive* sur toute cible qui tente de quitter son **Engagement serré (≬)**.

**Sanguinaire :** si la cible souffre d'au moins une **hémorragie 🩸**, la créature gagne **🟩** sur ses actions infligeant des dégâts physiques.

**Frappe épuisante :** chaque succès inflige **+1 Fatigue 💧**. Si la cible n'a plus de jetons d'Endurance 🫁, elle coche **deux cases ▢** de fatigue au lieu d'une.

### Traits mentaux

**Aura de terreur :** au début de son tour, toute créature engagée avec ce monstre perd **1 jeton de Stabilité ◇**. Sans jeton, elle subit immédiatement **🔻**.

**Esprit de ruche :** la créature partage ses jetons de Stabilité ◇ avec ses alliés adjacents possédant le même trait. Une attaque mentale doit vider la réserve commune avant d'affecter la Ténacité 🧠.

**Regard hypnotique :** en dépensant **⚫**, la créature force une cible à dépenser sa Stabilité ◇ restante. Si la cible tombe à 0, elle est **Entravée 🕸️**.

### Traits défensifs

**Cuirasse naturelle (X) :** la créature possède **Armure X** sur la partie concernée. Si une attaque inflige moins de X marqueurs 💢, elle est **totalement ignorée** (au lieu du minimum de 1 habituel).

---

## 🕷️ Hordes

Les Hordes sont un type d'adversaire particulier, représenté sur le terrain par des jetons : leur dangerosité **diminue avec leur nombre**.

### Ressources simplifiées

💧 **Fatigue :** les hordes n'ont pas de fatigue. Tout dégât à la fatigue est immédiatement converti en **blessure 💢**.

♥️ **Santé :** chaque case ▢ représente un membre de la horde et la capacité d'encaisser une **blessure 💢** ; chaque *groupe* |▢▢▢| représente un groupe de créatures, figuré par un jeton horde 🕷️.

🛡️ **Armure ∞ :** les hordes sont un ensemble d'individus sans armure ; tout dégât est automatiquement réduit à 1 💢.

🍀 **Évasion ∞ :** de même, les hordes transforment automatiquement les **blessures graves 💔** en une 💢 et un effet 🔻.

### Défenses simplifiées

La seule défense des hordes est l'**esquive**.

### États mentaux simplifiés

**◇ Stabilité :** la horde gagne des jetons de manière conditionnelle, généralement lorsqu'elle inflige ou subit une blessure.

**🧠 Ténacité :** lorsque la horde subit un effet 🔺🔻, retirer un jeton ◇. Sans jeton, elle subit une **blessure 💢** (fuite ou désorganisation de ses membres).

L'état mental d'une horde dépend du nombre de ses membres : elle débute **enragée** et tend vers **paniquée** (ou l'inverse).

| État | Effet |
| :-- | :-- |
| 😠 **Enragé** | +1 💀 attaque / −1 💀 défense |
| 😐 **Neutre** | pas de modification |
| 😬 **Paniqué** | +1 💀 défense / −1 💀 attaque |

### Actions simplifiées

Les hordes ne disposent que de deux actions, 🟢 et 🔴, et **pas de réactions ⚡** :

- 🟢 sert à **déplacer** les jetons des membres de la horde.
- 🔴 sert à effectuer une **attaque** pour l'ensemble des membres.
