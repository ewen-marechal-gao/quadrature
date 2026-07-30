# États

> Voir aussi : [ressources.md](ressources.md) pour Fatigue et Condition Mentale · [combat.md](combat.md) pour l'application en manche

---

## États cumulables

### 🩸 Hémorragie

*Les plaies restent ouvertes, le sang ne coagule pas. L'armure ne peut rien contre ce qui s'écoule de l'intérieur.*

L'hémorragie est un état cumulable, suivi par des jetons **🩸**. Cet état est infligé par certaines armes ou actions ; il ne se déclenche pas automatiquement.

**Effet — à la fin de chaque manche :**

1. **Refermeture (résistance passive).** Retirez d'abord un nombre de jetons **🩸** égal à votre **Récupération ✫** : votre corps referme les plaies. Une Récupération élevée est donc une résistance passive au saignement ; un personnage sans Récupération **ne referme rien seul** et devra agir ou se soigner.
2. **Saignement.** Pour **chaque jeton 🩸 restant**, subissez **1 blessure légère 💢**.
3. **Percée d'armure.** Tant que vous avez saigné cette manche, les **blessures graves 💔** produites par la conversion (voir [ressources.md](ressources.md)) **ignorent la Protection 🛡️** — le sang passe sous l'armure.

Les jetons restants **persistent** : ils saigneront de nouveau la manche suivante (et décroîtront encore de votre Récupération). Accumuler plusieurs jetons d'un coup fait donc bien plus de dégâts qu'un seul étalé dans le temps.

**Suppression :** l'action **Stabiliser** retire **tous** les jetons **🩸** ; un **bandage** (consommable) en retire jusqu'à **3** et reste utilisable même sans Récupération ; certains sorts et équipements peuvent aussi en retirer.

---

### 🔥 Combustion

*Une brûlure superficielle ne tue personne. Ce qui tue, c'est le moment où le feu cesse d'être sur vous pour être en vous.*

La combustion se suit avec deux marqueurs distincts : les **brûlures 🔥**, qui s'accumulent, et les **embrasements ❤️‍🔥**, qui sont ce qu'elles deviennent.

**Embrasement.** Dès que vous atteignez **5 brûlures 🔥**, retirez-les toutes et posez un **embrasement ❤️‍🔥** : vous subissez **1 blessure grave 💔**, qui **ignore la Protection 🛡️** — le feu passe sous l'armure —, ainsi que **🔻**. L'embrasement se déclenche **au moment où le cinquième marqueur est posé**, sans attendre la fin de la manche : les brûlures excédentaires restent sur vous et repartent d'un nouveau lot.

**Rallumage — à la fin de chaque manche.** Pour **chaque embrasement ❤️‍🔥**, ajoutez **1 brûlure 🔥**. Un feu qui a pris se nourrit tout seul, et de plus en plus vite : c'est le second embrasement qui rend le troisième probable.

Tant que vous ne portez **aucun ❤️‍🔥**, la combustion ne progresse pas seule — quelques brûlures isolées finissent par ne rien faire du tout. Le danger n'est pas de brûler, il est d'atteindre le seuil.

**Suppression :** l'action **Éteindre les flammes** (voir [universal_actions.md](actions/universal_actions.md)) retire les brûlures 🔥 et, sur une réussite, un embrasement ❤️‍🔥. Certaines créatures y sont insensibles ou disposent de leurs propres parades ; d'autres n'ont aucun moyen d'étouffer le feu, et c'est là une vulnérabilité exploitable.

---

### 🦠 Virulence

La déstabilisation du métabolisme est un effet cumulable, suivi par des marqueurs **métabolisme 🦠**.

Au début de la manche, un personnage ayant au moins un jeton **métabolisme 🦠** voit sa **Fatigue 💧** augmenter d'un point. Puis, un jeton **métabolisme 🦠** est supprimé.

---

### 😩 Épuisé

*La fatigue s'est installée trop profondément pour qu'une nuit suffise à l'effacer.*

L'épuisement est un état cumulable, suivi par des marqueurs **épuisement 😩**, principalement infligé par les voyages éprouvants (voir [voyager.md](voyager.md)). En combat, un **Défaut ⚠️** sur l'action **Respiration** en pose également un : un souffle mal repris se paie longtemps.

**Effet — plancher de fatigue :** la **Fatigue 💧** d'un personnage ne peut jamais descendre en dessous de son nombre de marqueurs **😩** — ni par le repos, ni par les actions de récupération. Au début de chaque combat, sa fatigue démarre donc au moins à ce niveau.

**Suppression :** ni les actions, ni un simple bivouac ne retirent ces marqueurs. Seule une nuit passée dans un **Havre** (lieu de repos sûr et confortable) en retire **un** — voir [voyager.md](voyager.md), §Repos, Camps et Havres.

---

### 🌀 Déstabilisé

*L'assaut psychique a fissuré la concentration : l'esprit n'a pas le répit de se ressaisir.*

Une cible **Déstabilisée** **ignore son prochain regain de jetons de Stabilité ◇** (au début de sa manche), puis l'état est retiré.

Contrairement aux jetons **◇** d'une créature, qui se régénèrent chaque manche (souvent conférés par la Tête), cet état permet d'**assécher durablement** cette réserve : en déstabilisant une créature à répétition, on l'empêche de reconstituer son ◇, ouvrant la voie à une bascule de son **état mental** (🔺/🔻) une fois le ◇ épuisé. *(Sans effet sur une cible dont le ◇ ne se régénère pas, comme un personnage.)*

**Infligé par :** les actions sociales **Provocation** et **Intimidation** ; certains sorts et effets psychiques.

---

## États de position

### ⚔️ Engagé en mêlée

Un personnage est *Engagé en mêlée* lorsqu'il est adjacent à au moins une créature capable de l'attaquer.

---

### 🧎 À genoux

*Le personnage est agenouillé, sa mobilité est limitée.*

- Ne peut pas effectuer l'action **Course**.
- Les actions en mêlée contre un personnage **à genoux** bénéficient de 🟩.

---

### 🙏 À terre

*Le personnage est au sol, dans une position de vulnérabilité.*

- Ne peut pas effectuer les actions **Marche** et **Course**.
- Les actions en mêlée contre un personnage **à terre** bénéficient de 🟩.
- Les actions à distance contre un personnage **à terre** subissent 🟥.

---

## États de condition

### 😮‍💨 Essoufflé

*Le souffle manque : les gestes se font plus rares, plus économes.*

Un personnage ou une créature **essoufflé** dispose d'**un point d'action ⚫ de moins** au début de chacune de ses manches — mais **jamais moins de 1 ⚫** : même à bout de souffle, on peut encore agir.

**Personnage :** l'état est gagné en **échouant au test d'Endurance** de la phase d'entretien (déclenché à **fatigue 💧 ≥ 10**) ; l'action **Respiration** le retire.

**Créature :** l'état est **dérivé**, pas suivi par un jeton — une créature est essoufflée dès que sa **fatigue dépasse la moitié de sa piste** (elle ne passe pas de test d'Endurance).

---

### 🤢 Nauséeux

Une créature **nauséeuse** subit +🟥 à toutes ses **actions offensives**.

---

### 🕶️ Aveuglé

Une créature aveuglée ne peut plus compter sur la vue. Les actions nécessitant de voir la cible sont impossibles, et elle subit +🟥 à tous ses jets d'**attaque**, de **garde** et de perception visuelle.

---

### 🕸️ Entravé

Une créature ou un personnage **entravé** ne peut pas effectuer les actions **Marche** et **Course**.

---

### 🔗 Immobilisé

Une créature ou un personnage **immobilisé** subit +🟥 à tous ses jets de **garde** et **actions offensives**. Il ne peut effectuer aucune action de déplacement.

---

### 🫨 Sonné

*Le coup a porté : on encaisse sans pouvoir répondre.*

**Personnage :** il perd **toutes ses réactions ⚡** (il ne peut donc plus opposer de garde active — seul **Encaisser**, gratuit, reste possible). Ses points d'action ⚫ ne sont pas affectés.

**Créature :** n'ayant pas de réactions ⚡, elle perd à la place son **Évasion 🍀** — les blessures graves 💔 la frappent alors de plein fouet.

L'état se dissipe au **début de la manche suivante**.

---

### 😵‍💫 Inconscient

*Le corps cède avant l'esprit. L'épuisement devient plus fort que la volonté.*

Une créature devient automatiquement **Inconsciente** lorsque sa Fatigue 💧 atteint **20**.

- La créature tombe immédiatement **à terre**.
- Elle peut uniquement effectuer l'action **Reprendre Conscience**.
- Elle échoue automatiquement à tous les jets de défense.
- Les attaques en mêlée contre elle bénéficient de +🟩.
- Elle conserve néanmoins ses protections d'armure.

---

### 😵 Aux portes de la Mort

Cet état survient dès que le personnage perd son dernier point de **caractéristique physique** ✪.

- Elle échoue automatiquement à tous les jets de défense.
- Les attaques en mêlée contre elle bénéficient de +🟩.
- Elle conserve néanmoins ses protections d'armure.

À chaque fin de manche, le joueur effectue un **Test contre la Mort** :

🎲 Récupération 🟨🟨 + Vigueur 🟦  
🆚 5 + 1 par **blessure** 💢  
⚠️ **Défaut :** le personnage subit immédiatement une **blessure** 💢  
✴️ **Critique :** le personnage guérit immédiatement une **blessure** 💢

✅ **Succès :** guérit une **blessure** 💢 et gagne 🟩 sur le prochain Test contre la Mort.  
❌ **Échec :** le personnage meurt.
