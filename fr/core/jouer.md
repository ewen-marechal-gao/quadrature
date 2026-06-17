# Jouer

Une partie de Quadrature est une conversation : le meneur décrit le monde, les joueurs disent ce que leurs personnages tentent, et le meneur en décrit les conséquences. La plupart des actions réussissent simplement — on ne lance pas les dés pour ouvrir une porte. Mais lorsque l'issue est **incertaine** et que l'échec a un **prix**, la conversation s'interrompt le temps d'un **Jet**.

## Le Jet

Le Jet est le cœur de Quadrature. Toute action incertaine — attaque, défense, compétence, résistance — se résout par un Jet.

Le résultat d'un jet est la somme de **4 dés à 6 faces numérotées de 0 à 5** :

| Dé | Rôle |
| :--- | :--- |
| 🎲 1 dé d'aléa | toujours inclus |
| 🟦 Meilleur dé de Caractéristique | potentiel du personnage |
| 🟨🟨 2 meilleurs dés de Compétence | entraînement du personnage |

Soit un score entre **0 et 20**. Le résultat est toujours :
- soit comparé à un **Degré de Difficulté (DD)**,
- soit opposé à un autre Jet.

**Règle : en cas d'égalité, le jet offensif l'emporte.**

---

## Étapes d'un jet

### 1 — Constituer sa réserve de dés

Avant de lancer les dés, le joueur rassemble sa réserve en trois catégories.

#### ✪ Caractéristique

Ajoutez un nombre de dés bleus 🟦 **égal à la valeur de la caractéristique** utilisée (0 à 5).

**Exception :** si la caractéristique est 0, un dé **Affaibli** 🟪 (faces 0,0,1,2,3,4) est lancé à la place.

#### ✫ Compétence

Ajoutez un nombre de dés dorés 🟨 égal à la valeur de la **compétence** utilisée. Si elle est **inférieure à 2**, on ajoute des dés **Affaibli** 🟪 pour compléter jusqu'à deux dés.

#### 🎲 Aléa

- 1 dé blanc ⬜ est **toujours** inclus.
- 🟩 ajoute 1 dé d'avantage.
- 🟥 ajoute 1 dé de désavantage.

Des compétences et effets peuvent ajouter des dés 🟩🟥 à la réserve d'un autre joueur.

---

#### Sacrifier des dés ⛞🟦 / ⛞🟨

Certaines capacités permettent ou imposent de **sacrifier ⛞** des dés avant le lancer : le dé est retiré de la réserve en échange d'un effet supplémentaire. Sacrifier diminue l'espérance du jet et augmente sa variance — le joueur échange de la fiabilité contre de la puissance.

La couleur indique le dé à sacrifier :

- **⛞🟦** sacrifie un dé de Caractéristique — la réserve doit comporter au moins 🟦🟦.
- **⛞🟨** sacrifie un dé de Compétence — la réserve doit comporter au moins 🟨🟨🟨.

#### Renforcer des dés ⬆

Renforcer ⬆ un dé transforme un dé 🟨 en un dé 🟫. Les dés 🟫 n'ont pas de face 0 — ils ne peuvent donc jamais entraîner de **défaut ⚠️**.

#### Annuler les paires 🟩🟥

Les avantages et désavantages s'annulent mutuellement : retirer de la réserve toute paire (🟩 + 🟥).

---

### 2 — Effectuer le Jet

Lancer tous les dés de sa réserve simultanément (généralement 4 à 15 dés).

Certaines capacités permettent de relancer un ou plusieurs dés :
- Un dé relancé remplace son ancien résultat.
- Un dé ne peut être relancé qu'une fois.
- Seul le joueur effectuant le jet peut relancer ses dés.

---

### 3 — Conserver les dés

Le joueur conserve exactement **4 dés** :

1. Le **meilleur** dé de Caractéristique 🟦
2. Les **deux meilleurs** dés de Compétence 🟨
3. Un seul dé d'aléa :
   - Le ⬜ s'il est seul
   - Le **plus haut** résultat parmi ⬜ et 🟩 : c'est un avantage
   - Le **plus bas** résultat parmi ⬜ et 🟥 : c'est un désavantage

Le score final est la somme de ces 4 dés (**toujours entre 0 et 20**).

---

### 4 — Déclencher les Critiques ✴️ et Défauts ⚠️

**⚠️ Défaut :** si **au moins un** des dés **conservés** (🟨 ou 🟪) présente un résultat de **0**, l'action comporte un défaut. La pénalité est précisée par l'action — généralement une modification de l'état mental ou de la fatigue. Une action peut réussir ou échouer indépendamment d'un défaut.

**✴️ Critique :** si **au moins un** des dés **conservés** 🟨 présente un résultat de **5**, l'action peut comporter un effet critique. Les effets critiques sont indiqués dans la description de chaque action.

---

### 5 — Résolution

Le score est comparé au seuil fixe (DD) ou au jet opposé.

C'est à ce moment que l'on applique l'**effet** ▶️, puis le **succès** ✅ ou l'**échec** ❌.

**Échelle des Degrés de Difficulté :**

| DD | Difficulté |
| :---: | :--- |
| 6 | Trivial |
| 8 | Simple |
| 10 | Courant |
| 12 | Exigeant |
| 14 | Difficile |
| 16 | Héroïque |
| 18 | Quasi légendaire |

---

## Exemple complet — hors combat

> [!example] La corniche
> Le groupe longe une falaise ; un éboulis a emporté le sentier. **Lena** propose d'escalader la paroi pour fixer une corde. Le meneur estime l'ascension **Exigeante (DD 12)**, et la paroi est humide : un désavantage 🟥 s'ajoute au jet de **Mobilité 🟨🟨 + Agilité 🟦**.
>
> **Réserve :** Agilité 3 → 🟦🟦🟦 · Mobilité 2 → 🟨🟨 · l'aléa ⬜ et le désavantage 🟥. Sept dés.
>
> **Jet :** 🟦 2, 3, 1 · 🟨 5, 3 · ⬜🟥 0, 4.  
> **Conservation :** le meilleur 🟦 (3) · les deux 🟨 (5 et 3) · l'aléa : avec un désavantage, on conserve le **plus bas** de ⬜🟥, soit 0 → **11**.  
> **Critique :** un 🟨 conservé montre un **5** : ✴️ ! Le meneur improvise : à mi-hauteur, Lena repère une voie plus clémente — l'ascension passe à **DD 10**.  
> **Résolution :** 11 ≥ 10 — succès. Lena se hisse au sommet et fixe la corde.
>
> **Kévin** s'élance à son tour. La paroi est toujours humide (🟥), mais la corde le sécurise (🟩) : **la paire s'annule**, et il ne reste que l'aléa ⬜. Sa réserve : Mobilité 1 → 🟨🟪 (complétée d'un Affaibli) · Agilité 1 → 🟦 · ⬜.
>
> **Jet :** 🟦 3 · 🟨 2 · 🟪 0 · ⬜ 3.  
> **Conservation :** 3 + 2 + 0 + 3 → **8**.  
> **Défaut :** le 🟪 conservé montre un **0** : ⚠️ — l'effort lui coûte de la **fatigue 💧**.  
> **Résolution :** 8 < 10 — échec. Kévin glisse, pendule au bout de la corde, et finit l'ascension hissé par Lena, les bras tremblants.

---

## Les modes de jeu

Selon l'intensité de la situation, Quadrature bascule entre **quatre modes**, du plus libre au plus structuré. Le jet reste le même partout — seul le cadre qui l'entoure change.

### 💬 Narration

Le mode par défaut : la conversation. Dialogues, enquêtes, négociations, scènes de la vie du groupe. Le temps s'écoule librement, le meneur appelle un jet ponctuel — opposé ou contre DD — lorsque l'issue est incertaine, et la fiction repart.

### 🧭 Exploration

Les trajets au long cours, structurés en **segments de voyage** : rôles d'expédition, gestion des ressources et de l'épuisement, incidents de route. *Règles détaillées dans [Voyager](voyager.md).*

### ⏳ Épreuves

Les séquences tendues où chaque geste compte, sans être un combat : course-poursuite, incendie, escalade périlleuse, infiltration. Le temps se découpe, les jets s'enchaînent et les échecs accumulent la pression. *Règles détaillées dans [Épreuves](epreuves.md).*

### ⚔️ Combat

Le mode le plus structuré : le temps se fige en **manches**, les actions se jouent en simultané par **cartes** posées face cachée, et chaque point d'action compte. *Règles détaillées dans [Combat](combat.md) et ses [actions](actions/universal_actions.md).*
