
# ❄️ Calomancie

♨️🧊 **Mécanique Unique : Transferts de chaleur**

**Sources** ♨️ et  **puits** 🧊 

Les **Sources (x)** ♨️ et les **puits (x)** 🧊 sont des pile de **x** marqueurs posée sur une case :

**Intensité :** le nombre de marqueurs dans la pile.

**Zone d'effet :** la zone d'effet dépend du nombre d'intensité :

* 1 jeton : seule la case de la source est affectée  
* 2 jetons : la case de la source, et les 4 cases directement adjacentes (N, S, E, O).  
* 3-5 jetons : la case de la source, et les les 8 cases adjacentes (toutes)  
* 6+ jetons : la case de la source, les 8 cases adjacentes, et les 4 cases à distance 2 hors diagonales (N, S, E, O à 2 cases).

**Effet** : lorsqu'une créature **entre dans la zone d'effet** (pour la première fois de son tour) ou qu'elle y termine son tour, elle subit l'effet, puis on retire immédiatement un jeton de la pile (avant que la créature suivante n'agisse)

* **Source** ♨️ : inflige 2 Brûlures 🔥  
* **Puit** 🧊 : inflige 1 Fatigue 💧

**Durée :** la source reste en jeu jusqu'à consommation de tous les jetons.

**♨️/ 🧊 Transfert (i) : place une source / un puit de chaleur d'intensité de i (i jetons).**

Lorsqu'un sort utilise un Transfert, le joueur suit ces étapes :

1. **Déterminer l'intensité** : **l'intensité** est déterminée par le sort (parfois modifiable par un sacrifice, comme dans *Combustion*).  
2. **Choisir l'emplacement** : le sort précise la cible ou la zone de placement (par exemple *sur la case de la cible*, *sur une case adjacente*, *dans un rayon de X cases*).  
3. **Appliquer les règles de superposition** :  
   * Si la case ciblée contient déjà une **source** ♨️ (ou un **puit** 🧊) du **même type**, on **ajoute** les jetons à la pile existante (sans dépasser une éventuelle limite fixée par le sort ou la règle générale).  
   * Si la case ciblée se trouve **dans la zone d'effet** d'une source ♨️ et qu'on tente d'y placer un puit 🧊 (ou l'inverse), on applique la règle d'**annulation mutuelle** : on retire un jeton de chaque pile, en répétant jusqu'à ce que les zones ne se chevauchent plus ou qu'une pile disparaisse.  
   * Si aucune interaction particulière n'a lieu, on pose une nouvelle pile de i jetons sur la case choisie.

*Exemple : si vous tentez de placer une **source (2)*****♨️** *et qu'il existe déjà un **puits (2)*****🧊** *dont la zone chevauche la case cible, vous devez retirer 1 marqueur de la source (elle devient (1)) et 1 du puits (il devient (1) et n'affectera que sa case). Si après cela le chevauchement persiste (par exemple parce que le puits avait une taille 3), on recommence.*

**⚠️Défaut sur les jets utilisant la compétence de Calomancie :** vous subissez un **fatigue**💧 

**Traits d'Affinité**

#### Brasier

*Vous concentrez la chaleur ambiante en un point, jusqu'à ce que l'air lui-même s'embrase. Les flammes qui en jaillissent embrasent les proies comme les objets.*

**Prérequis** : Volonté 1  
**Coût : ⚫⚫**  
**Jet :** Calomancie 🟨🟨 \+ Volonté 🟦  
**Contre :** DD 5 \+ nombre de jetons **source** ♨️sur la case ciblée.  
**Portée :** 4 cases (6 m)

**Attiser les flammes :** vous pouvez **sacrifier** un dé 🟦 avant le jet. Si vous le faites, l'intensité de la source créée par Brasier augmente d'un point.

**✅ Effets :** Vous placez une **source (2)**♨️ sur une case libre ou une **source** ♨️existante  à portée.  
**❌ Échec :** vous placez une **source (1)**♨️ sur une case libre.

**Conseil :** brasier peut être utilisé pour allumer un feu de camp.  
---

#### Givre

*Vous extrayez la chaleur d'une zone pour y former une poche de froid mordante.*

**Prérequis** : Intelligence 1  
**Coût : ⚫⚫**  
**Jet :** Calomancie 🟨🟨 \+ Intelligence 🟦.  
**Contre :** DD 5 \+ nombre de jetons **source** 🧊sur la case ciblée.  
**Portée :** 4 cases (6 m)

**Verglas** : vous pouvez **sacrifier** un dé 🟦. Si vous le faites, toutes les créatures dans la zone d'effet du **puit🧊** au moment du placement doivent effectuer un jet de **Mobilité**. En cas d'échec, elles subissent l'effet **Entravé🕸️**jusqu'à la fin de leur prochain tour.

**✅ Effets :** Vous placez un **puit (2)**🧊 sur une case libre ou un **puit**🧊existant  à portée.  
**❌ Échec :** vous placez un **puit (1)**🧊 sur une case libre.  
---

#### Armes incendiaires

*Le métal de votre lame devient un conducteur vorace. Tandis que le givre grimpe le long de votre garde, le tranchant vire au rouge sombre, prêt à enflammer tout ce qu'il touche.*

**Prérequis** : Volonté 1

**Coût** :**⚫**

🧊**Transfert** **(1) :** placez un **Puit (1)** 🧊 sur la case du lanceur.  
▶️**Effets** : Jusqu'à votre prochain tour, vos armes et projectiles infligent **deux brûlures**🔥en cas d'attaques réussies.

### **Tiers 1 : Initiation**

#### Syphon de Chaleur

*On ne crée pas le froid, on déplace simplement la chaleur ailleurs.*

**Prérequis** : Volonté 2  
**Bonus de compétence** : Calomancie (max 1\)

**Coût** :**⚫⚫**  
**Mental** : Lanceur **Prudent** ou **Concentré**  
**Jet** : Calomancie🟨🟨 \+ Volonté**🟦**  
**Contre :** Endurance🟨🟨 \+ Vigueur🟦  
**Portée :** 8 cases (12 m).

**Morsure de givre** : vous pouvez **sacrifier** un dé 🟦 et augmenter l'intensité du **Transfert**♨️ d'un point. En cas de succès, la cible subit également l'état **Entravé🕸️**

♨️**Transfert** : placez une **source (1)** ♨️sur la case de la cible.  
✅**Succès** : La créature ciblée subit **2 Fatigue**💧.  
❌**Échec** : la cible subit **1 Fatigue 💧**, et l'intensité du **Transfert**♨️ diminue d'un point  
---

Combustion

*Flavour text.*

**Prérequis** : Volonté 2  
**Bonus de compétence** : Calomancie (max 1\)

**Coût** :**⚫⚫**💧  
**Mental** : Lanceur **Concentré** ou **Agressif**  
**Jet** : Volonté **🟦** et Calomancie🟨.  
**Contre :** Grâce  
**Portée :** 8 cases (12 m).

**Implosion** : vous pouvez **sacrifier** jusqu'à **3 dés 🟦**. Pour chaque dé sacrifié, l'intensité du **Transfert** augmente de 1\.

🧊**Transfert** **(1)** : placez une **source (intensité)** ♨️ sur la case de la cible. Puis, placez un nombre égale à l'intensité de **puits (1)** 🧊sur des cases adjacentes à la **zone d'effet** de la **source**♨️. Si le nombre de cases adjacentes libres est insuffisant, les puits excédentaires sont perdus.

✅**Succès** : La créature ciblée subit un nombre de **brûlures**🔥égale à l'intensité du transfert.  
❌**Échec** : la cible subit 🔻

---

### **Tiers 2 : Spécialisation**

#### Equilibre Thermodynamique

*L'entropie n'est pas le chaos, c'est le retour à l'équilibre primordial.*

**Prérequis :** Intelligence 2, Calomancie 1  
**Bonus de compétence :** Calomancie (max 3\)

**Coût** :**⚫**💧  
**Jet** : Intelligence **🟦** et Calomancie🟨.  
**Mental** : Lanceur **Concentré**  
**Contre :** DD \= 7 \+ 1 par paire ♨️et 🧊 supprimée.

Sacrifier **🟦 :** vous pouvez supprimer une paire de sources ♨️et 🧊 supplémentaire par **🟦** sacrifié.

▶️**Effets** : supprimez une paire de sources ♨️et 🧊  
✅**Succès** : Gagnez un **Stabilité ◇** pour chaque paire supprimée.  
❌**Échec** : Gagnez un **Stabilité ◇**  
---

#### Médecine élémentaire

*La chair n'est qu'une autre forme de matière soumise à l'entropie*

**Prérequis :** Volonté 2, Calomancie 1  
**Bonus de compétence :** Calomancie (max 3\)

**Coût** :**⚫⚫⚫**  
**Mental** : Lanceur **Concentré** ou **Agressif**  
**Jet** : Volonté **🟦** et Calomancie🟨.  
**Contre :** DD 8 \+ 1 par effet. Vous avez un avantage 🟩 sur un allié consentant.  
**Cible :** une **source de chaleur** ♨️ à portée de 10 cases (15 m).  
**Portée :** contact

**Précision :** sacrifiez un 🟦 pour augmenter la portée de 4 cases (6m).  
**Improvisation :** sacrifier 🟦 pour appliquer un effet sans supprimer de **source** ni de **puit**.  
**Régulation :** sacrifier 🟨 pour appliquer les deux effets.

**Cautérisation** \- supprimez une **source de chaleur** ♨️

**▶️Effet :** Supprimez toutes les **blessures**💢au delà du seuil d'hémorragie de la cible.  
**✅Succès :** La cible gagne un **Stabilité ◇**  
❌**Échec** : La cible augmente son état mental 🔺

**Extinction** \- supprimez un **puit de chaleur** 🧊

**▶️Effet :** Supprimez tous les marqueurs **Brûlure 🔥** sur la cible.  
**✅Succès :** La cible gagne un **Stabilité ◇**  
❌**Échec** : La cible diminue son état mental 🔻

---

#### 

#### Embrasement soudain

*Flavour Text*

**Prérequis :** Volonté 3, Calomancie 1  
**Bonus de compétence :** Calomancie (max 3\)

**Coût** :**⚫⚫⚫⚫**💧  
**Mental** : Lanceur **Concentré** ou **Agressif**  
**Jet** : Volonté **🟦** et Calomancie🟨.  
**Contre :** Endurance🟨🟨 \+ Vigueur **🟦**  
**Cible :** une **source de chaleur** ♨️ à portée de 10 cases (15 m).  
**Zone :** un rayon de deux cases (3) centré sur la source ciblée.

**Embrasement contenu :**  sacrifier **🟦,** réduit la zone aux cases adjacentes et inflige **une** **brûlure**🔥.

🧊**Puit (2)** : placez un **puit de chaleur** 🧊 à la place de la **source de chaleur** ♨️.

▶️**Effets** : supprimez la **source de chaleur** ♨️ ciblée  
✅**Succès** : Toutes les créatures dans la zone subissent **trois** **brûlures**🔥.  
❌**Échec** : Les créatures qui réussissent leur jet sont **à Terre**.

---

#### Cristallisation

*Vous puisez dans le vide thermique d'une zone glacée pour en extraire la structure même. Le givre au sol s'érige brusquement en pointes acérées et en fils de glace translucides qui s'agrippent aux membres des imprudents.*

**Prérequis :** Volonté 3, Calomancie 1  
**Bonus de compétence :** Calomancie (max 3\)

**Coût** :**⚫⚫⚫⚫**💧  
**Mental** : Lanceur **Prudent** ou **Concentré**  
**Jet** : Intelligence **🟦** et Calomancie🟨.  
**Contre :** Mobilité  
**Cible :** une  **puit de chaleur** 🧊 à portée de 10 cases (15 m).  
**Zone :** un rayon de deux cases (3) centré sur le puits ciblé.

**Permagel :**  sacrifier **🟦** pour maintenir la zone de Stalagmites active un tour supplémentaire avant qu'elle ne fonde.

**Fractales :** sacrifier **🟦** pour rendre les Stalagmites acérées. Toute créature traversant la zone d'effet subit une **blessure**💢par case traversée.

**♨️Source (2) :** En cristallisant l'eau de l'air de manière aussi brutale, vous rejetez une chaleur intense. Placez une source chaude ♨️ sur le terrain.

**▶️Effets :** Supprimez le **puit de chaleur** 🧊 ciblé. Les actions de course sont impossibles dans cette zone. Cet effet perdure jusqu'au prochain tour du lanceur.

✅**Succès** : Les créatures présentes dans la zone d'effet sont **immobilisées🔗** pendant un tour.  
❌**Échec** : Les créatures présentes dans la zone d'effet sont **Entravée**🕸️pendant un tour.
