# ⚡ Réactions & 🛡️ Défenses

> Voir aussi : [universal_actions.md](universal_actions.md) · [ressources.md](../ressources.md)

---

## ⚡ Réactions

Les **Réactions ⚡** sont utilisables à n'importe quel moment pour effectuer des actions dont le **déclencheur** est satisfait.

À tout moment, un joueur peut transformer un **point d'action non utilisé** en une **Réaction ⚡**. De plus, tout personnage peut renoncer à un **point d'action** de la **prochaine manche** pour gagner immédiatement une **Réaction ⚡**.

**Report entre manches :** à la fin d'une manche, un personnage conserve au plus **Réactivité** Réactions ⚡ ; le surplus est perdu.

> ⚙️ **En rodage.** Le système de Garde fait des ⚡ la ressource défensive centrale, et plusieurs sources en confèrent désormais (état **Concentré**, critiques de Garde, traits de Discipline). Deux points demandent des mesures avant d'être figés : le **regain en début de manche** (le simulateur refait aujourd'hui le plein à Réactivité, +1 si Concentré) et l'existence d'un **plafond en cours de manche**.

---

### 2️⃣ Frappe opportuniste 🗡️

**Coût :** ⚡💧  
⚡ **Déclencheur :** une créature à portée initie une action de **Marche**, de **Course** ou se **Relève**  
🎯 Une créature **adjacente**  
🎲 **Jet :** Réactivité 🟨🟨 + Intelligence 🟦  
🆚 **Contre :** Garde

✴️ **Critique :** la cible subit **🔻**  
✅ **Succès :** la cible subit 2 **blessures 💢**  
❌ **Échec :** la cible subit 1 **fatigue 💧**

---

## 🛡️ Défenses

### Protection 🛡️

La protection confère une défense physique contre les **blessures graves 💔**.

On distingue :
- **🛡️ Protection (X)** : base de protection fixée à X points (généralement conférée par l'armure), ne se cumule pas.
- **+🛡️ Bonus de protection** : se cumule à la base et entre eux.

---

### Le système de Garde

Lorsqu'un personnage est ciblé par une attaque, il tente de se défendre en utilisant une **Réaction ⚡ de Garde**.

**Déroulement :**
1. **Déclaration :** le joueur choisit une réaction de Garde disponible et place la carte devant lui. L'action **Encaisser** est *toujours* disponible.
2. **Jet de Garde :** le joueur effectue le jet indiqué. Le score obtenu (0 à 20) devient sa valeur de **Garde** — le seuil à atteindre par l'attaquant pour le toucher.
3. **Noter la Garde :** la carte reste en jeu jusqu'à la fin de la manche.

**Une seule Garde pour tous les assaillants.** Une Garde déclarée vaut contre **toutes** les attaques de la manche : on ne relance pas un jet par adversaire. C'est ce qui rend une défense active jouable face au nombre — et c'est le **Contrecoup** qui fait payer la durée.

---

#### ↩️ Contrecoup

Chaque fois qu'une attaque **échoue** contre votre Garde, celle-ci applique son **Contrecoup** : le prix de la défense qui a tenu. Chaque Garde a le sien, et c'est lui qui la distingue autant que son jet.

Une Garde qui n'est jamais attaquée ne coûte rien de plus que sa Réaction ⚡.

> Les Contrecoups s'appliquent **coup par coup**, y compris entre des attaques de **même initiative**. Avec la case contestée (voir [combat.md](../combat.md)), la Garde est la seconde exception assumée à la simultanéité : elle se dégrade dans l'ordre où les coups tombent.

---

#### 🕐 Vitesse de Garde

Chaque Garde porte une **initiative**, qui mesure le temps qu'elle demande. Une Garde ne peut répondre qu'à une action dont l'initiative est **supérieure ou égale à la sienne** : on ne lève pas un bouclier contre un geste plus rapide que lui.

Si aucune Garde déclarée ne peut répondre à l'attaque qui vient, le personnage **Encaisse** — c'est la raison pour laquelle Encaisser ne coûte aucune Réaction ⚡ et reste toujours disponible.

| Garde | Initiative | Répond à |
| :--- | :---: | :--- |
| Encaisser | 1️⃣ | tout |
| Parade | 2️⃣ | initiative 2 et plus |
| Esquive · Dérobade | 3️⃣ | initiative 3 et plus |
| Blocage | 4️⃣ | initiative 4 et plus |

Certains Contrecoups, Défauts et Critiques modifient cette initiative pour le reste de la manche : une Garde peut donc **cesser** de pouvoir répondre en cours de manche.

---

**Affaiblir la Garde (X) :** certaines actions diminuent la valeur de Garde de X points. L'affaiblissement se cumule au Contrecoup.

**Briser la Garde :** certaines actions remplacent la carte de Garde par **Encaisser**, déclenchant un nouveau jet de Garde. L'action **Encaisser** elle-même ne peut pas être brisée.

**Réinitialisation :** un joueur peut dépenser une nouvelle **Réaction ⚡** pour effectuer un nouveau jet et modifier sa Garde. Les Contrecoups déjà subis sont effacés.

---

### 1️⃣ Encaisser

*Faute de pouvoir esquiver ou parer à temps, vous contractez vos muscles et préparez votre esprit à absorber le choc.*

⚡ **Déclencheur :** être la cible d'une action **contre 🆚** votre **Garde**  
🎲 **Jet :** Robustesse 🟨🟨 + Force 🟦  
🟩 **Concession :** l'attaquant bénéficie de 🟩 — vous ne résistez pas activement.

↩️ **Contrecoup :** vous gagnez 1 jeton d'**hémorragie 🩸**.

⚠️ **Défaut :** vous subissez **🔻**  
✴️ **Critique :** vous gagnez une Réduction (1) applicable sur toutes les blessures légères 💢 subies jusqu'à la fin de la manche.

▶️ **Effet :** le résultat du jet fixe votre score de **Garde**. Encaisser ne peut pas être brisée.

---

### 2️⃣ Parade

*Une lecture fine de la trajectoire adverse pour dévier le coup au dernier moment.*

**Coût :** ⚡  
⚡ **Déclencheur :** être la cible d'une action **contre 🆚** votre **Garde** (Parade)  
🔒 **Condition :** avoir une arme en main  
🎲 **Jet :** Vigilance 🟨🟨 + Acuité 🟦  
🟩 **Concession :** l'attaquant bénéficie de 🟩 sur les **attaques à projectile** — une arme de mêlée à allonge, elle, reste parable.

↩️ **Contrecoup :** votre score de **Garde** diminue de 1 point.

⚠️ **Défaut :** l'initiative de votre Garde augmente de **2** jusqu'à la fin de la manche.  
✴️ **Critique :** vous gagnez une **Réaction ⚡**.

▶️ **Effet :** le résultat du jet fixe votre score de **Garde**.

---

### 3️⃣ Esquive

*Un mouvement fluide, un pas de côté glissé pour laisser le coup se perdre dans le vide.*

**Coût :** ⚡  
⚡ **Déclencheur :** être la cible d'une action **contre 🆚** votre **Garde** (Esquive)  
🔒 **Condition :** ne pas être **entravé 🕸️** ou **immobilisé 🔗**  
🎲 **Jet :** Mobilité 🟨🟨 + Agilité 🟦  
🟩 **Concession :** l'attaquant bénéficie de 🟩 sur les **attaques de zone** — on n'esquive pas ce qui couvre toute la case.

↩️ **Contrecoup :** augmentez votre **Fatigue 💧** de 1 point.

**⚒️ Esquive plongeante :** si vous êtes **debout 🧍** ou **à genoux 🧎**, vous pouvez ignorer le coût ⚡ de cette Esquive. Vous vous retrouvez **À terre 🙏**.

⚠️ **Défaut :** augmentez votre Fatigue 💧 de 1 point.  
✴️ **Critique :** déplacez-vous **immédiatement** d'une case. Si l'attaque ne peut plus vous atteindre, elle est **perdue**.

▶️ **Effet :** le résultat du jet fixe votre score de **Garde**.

---

### 3️⃣ Dérobade

*Se fondre dans l'environnement, casser la ligne de vue au moment de l'impact.*

**Coût :** ⚡  
⚡ **Déclencheur :** être la cible d'une action **contre 🆚** votre **Garde** (Dérobade)  
🔒 **Condition :** ne pas être **immobilisé 🔗**, et se trouver sur (ou adjacent à) une case **occultée 🌑**  
🎲 **Jet :** Mascarade 🟨🟨 + Grâce 🟦

↩️ **Contrecoup :** la Garde est **perdue** — vous **Encaissez** les attaques suivantes de la manche. La Dérobade n'arrête qu'un seul coup : elle vous sort de la ligne, elle ne vous y maintient pas.

⚠️ **Défaut :** aucun déplacement — vous ne quittez pas votre case.  
✴️ **Critique :** vous disparaissez totalement. Vous devenez immédiatement **Dissimulé 😶‍🌫️**.

▶️ **Effet :** déplacez-vous sur une case **occultée 🌑**. Le résultat du jet fixe votre score de **Garde**.

---

### 4️⃣ Blocage

*S'abriter derrière son bouclier, et transformer son corps en une forteresse inébranlable.*

**Coût :** ⚡  
⚡ **Déclencheur :** être la cible d'une action **contre 🆚** votre **Garde** (Blocage)  
🔒 **Condition :** avoir un bouclier adapté, ou improvisé (avec -🟥)  
🎲 **Jet :** Endurance 🟨🟨 + Vigueur 🟦

↩️ **Contrecoup :** l'initiative de votre Garde augmente de **1** jusqu'à la fin de la manche. Le bras s'alourdit : à force de tenir, le bouclier finit par arriver trop tard.

⚠️ **Défaut :** l'initiative de votre Garde augmente de **1** jusqu'à la fin de la manche.  
✴️ **Critique :** l'initiative de votre Garde diminue de **1** jusqu'à la fin de la manche.

▶️ **Effet :** le résultat du jet fixe votre score de **Garde**.
