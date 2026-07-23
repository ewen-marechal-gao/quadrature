# ⚫ Actions — Universelles

> Voir aussi : [attribute_actions.md](attribute_actions.md) · [defense_reactions.md](defense_reactions.md) · [glossaire.md](../glossaire.md)

Les combats se décomposent en Manches, au cours desquelles les personnages et les adversaires agissent simultanément. Au début de chaque manche, un personnage reçoit **trois points d'action**. Un point d'action correspond à une durée de 2 à 3 secondes.

- La phase d'actions se joue en **trois bandes** révélées successivement — **I** (initiative 1-3), **II** (4-6), **III** (7-9). Le **coût** d'une carte est noté en **phases de lune** : la lune indique la **bande** (🌓 I · 🌕 II · 🌗 III), le nombre de glyphes le nombre de **points d'action** (voir [combat.md](../combat.md)).
- Les points d'action sont **génériques** : ils se dépensent librement d'une bande à l'autre, dans la limite de trois par manche.
- Lorsque l'action d'un joueur ne peut pas être résolue, les points d'action sont restitués sous forme de **Réactions ⚡**.

**Code couleur des cartes d'action :**

| Couleur | Type |
| :--- | :--- |
| Liseré jaune | ⚡ Réactions |
| Fond cyan | 🏃 Mouvement |
| Fond rouge | 🗡️ Offensives |
| Fond bleu | 🛡️ Défensives |
| Fond vert | ❤️‍🩹 Guérisons |
| Fond violet | ✨ Améliorations |

---

## Comprendre une carte d'action

| Champ | Signification |
| :--- | :--- |
| 1️⃣ **Initiative** | Ordre de résolution (1️⃣ le premier, 🔟 le dernier) — détermine la **bande** : I (1-3) · II (4-6) · III (7-9) |
| **Prérequis** | Condition de déblocage de l'action |
| **Coût** | Points d'action en phases de lune 🌓/🌕/🌗 (la lune = la bande), Réactions ⚡ et/ou ressources 💧 |
| ⚡ **Déclencheur** | Conditions pour déclencher une réaction |
| 🔒 **Conditions** | Facteurs devant être satisfaits |
| 🧠 **Mental** | État mental requis |
| 🎯 **Cible** | Cible et portée de l'action |
| 🎲 **Jet** | Compétences (🟨🟨) et caractéristique (🟦) utilisées |
| 🆚 **Contre** | DD fixe ou jet opposé |
| ⚠️ **Défaut** | Pénalité si un 0 est conservé parmi les 🟨/🟪 |
| ✴️ **Critique** | Effet si un 5 est conservé parmi les 🟨/🟫 |
| ▶️ **Effet** | Effet immédiat, quel que soit le résultat |
| ⏳ **Effet** | Effet de durée, quel que soit le résultat |
| ✅ **Succès** | Effet si résultat ≥ DD ou jet opposé |
| ❌ **Échec** | Effet si résultat < DD ou jet opposé |

**Grammaire symbolique :**

- ↗️X ⚪ : **Gagner, augmenter** de X le nombre de jetons ⚪ (💧/💢/◇)
- ↘️X ⚪ : **Perdre, diminuer** de X le nombre de jetons ⚪

---

## Actions universelles (sans prérequis)

### Actions offensives

#### 5️⃣ Attaque armée

**Coût :** 🌕🌕  
🔒 **Condition :** tenir une arme ou un objet lourd en main  
🎲 **Jet :** Puissance 🟨🟨 + Force 🟦  
🆚 **Contre :** Garde (toutes)

⚠️ **Défaut :** augmentez votre **fatigue** 💧  
✴️ **Critique :** la cible subit **🔻**  
✅ **Succès :** la cible subit 3 **blessures** 💢  
❌ **Échec :** la cible subit 1 **blessure** 💢

---

#### 3️⃣ Attaque à mains nues 🤜

**Coût :** 🌓🌓  
🎲 **Jet :** Puissance 🟨🟨 + Force 🟦  
🆚 **Contre :** Garde (esquive, parade, dérobade)

**⚒️ Poings de fer :** en cas de succès, votre **attaque à mains nues** inflige une blessure 💢 supplémentaire.

⚠️ **Défaut :** augmentez votre **fatigue** 💧  
✴️ **Critique :** la cible est **sonnée 🫨**  
✅ **Succès :** infligez 2 **fatigue** 💧 à la cible  
❌ **Échec :** la cible subit 💧

---

#### 3️⃣ Saisir

**Coût :** 🌓  
🎲 **Jet :** Robustesse 🟨🟨 + Force 🟦  
🆚 **Contre :** Garde (esquive, parade, dérobade)

**⚒️ Agripper :** peut être utilisée en **Réaction ⚡** lorsqu'une créature adjacente initie une action de **Marche**, de **Course** ou se **Relève**. Coût : ⚡💧 au lieu de 🌓.

⚠️ **Défaut :** augmentez votre **fatigue** 💧  
✴️ **Critique :** la cible est **immobilisée 🔗**  
✅ **Succès :** la cible est **entravée 🕸️**  
❌ **Échec :** la cible subit 💧

---

#### 4️⃣ Jeter

**Coût :** 🌕  
🔒 **Condition :** tenir un objet en main  
🎲 **Jet :** Observation 🟨🟨 + Acuité 🟦  
🆚 **Contre :** Garde (toutes)

✴️ **Critique :** la cible est **sonnée 🫨**  
✅ **Succès :** effet selon l'objet lancé :
- Petit emplacement : inflige 1 **blessure 💢**
- Grand emplacement : inflige 2 **blessures 💢**

❌ **Échec :** la cible subit 1 **fatigue** 💧

*Les emplacements sont expliqués dans [equipement.md](../equipement.md).*

---

#### 5️⃣ Intimidation

**Coût :** 🌕🌕  
🎲 **Jet :** Autorité 🟨🟨 + Volonté 🟦  
🆚 **Contre :** Conviction

▶️ **Effet :** si la cible n'a plus de jeton de **Stabilité ◇**, elle subit **🔻** (vers la Peur).  
✅ **Succès :** la cible perd **1 ◇** et devient **🌀 Déstabilisée** (ignore son prochain regain de ◇).  
❌ **Échec :** la cible perd **1 ◇**.  
✴️ **Critique :** la cible perd **1 ◇** supplémentaire.

---

### Déplacement

Les actions de déplacement consomment des **points d'action** et génèrent parfois de la **fatigue 💧**. Les déplacements fixent le niveau d'**Inertie ➡️** du personnage jusqu'à la résolution de son action suivante.

*Précision : 1 case = 1,5 m, diagonales comprises.*

---

#### 3️⃣ Posture

**Coût :** 🌓  
🔒 **Condition :** ne pas être **immobilisé**

▶️ **Inertie 1 ➡️**, déplacement d'une case, puis choisissez votre posture : 🧍 **Debout**, 🧎 **À genoux** ou 🙏 **À terre** — effets décrits dans [etats.md](../etats.md).

---

#### 4️⃣ Déplacement 🚶

**Coût :** 🌕

*Choisissez l'un :*

🔒 **Condition :** ne pas être **à terre** ou **immobilisé**  
▶️ 🚶 **Marche** — **Inertie 2 ➡️**, déplacement de **3 cases**.

---

🔒 **Condition :** ne pas être **à genoux**, **à terre**, **entravé**, ni **essoufflé**  
▶️ 🏃 **Course**, dépensez 💧 — **Inertie 3 ➡️**, déplacement de **5 + Mobilité ✫** cases. Cette action sera résolue avec une **initiative de 6️⃣**.

**Aucun jet** — franchir du terrain ne se rate pas, et le combat n'a rien à gagner à ce qu'on lance les dés pour marcher. Forcer l'allure ne se paie pas en dés mais en **souffle** 💧 : chaque Course creuse la fatigue, et lorsqu'elle pèse (le **test d'Endurance** de la phase d'entretien), on finit **essoufflé 😮‍💨** — et un essoufflé ne court plus. On peut donc enchaîner les foulées, mais la fatigue finit par rattraper le sprinteur qui ne reprend jamais haleine (**Respiration 🌓**).

*C'est aussi ce qui fait de l'**Inertie ➡️ 3** une ressource rare : seule la Course la donne, et la **Bousculade** comme la **Charge** l'exigent.*

---

#### 7️⃣ Bousculade 🏃

**Coût :** 🌗  
🔒 **Condition :** disposer d'un niveau d'**Inertie ➡️ 3** (ou plus)  
🎲 **Jet :** Mobilité 🟨🟨 + Agilité 🟦, avec 🟩  
🆚 **Contre :** Garde (esquive, dérobade)

⚠️ **Défaut :** augmentez votre **fatigue** 💧  
✴️ **Critique :** la cible est **sonnée 🫨**  
▶️ **Inertie ➡️ 0**  
✅ **Succès :** la cible est **à terre 🙏**  
❌ **Échec :** la cible est **à genoux 🧎**

---

### Utilitaires

#### 1️⃣ Reprendre Conscience

**Coût :** 🌓  
🔒 **Condition :** être **sonné 🫨** ou **inconscient 😵‍💫**  
🎲 **Jet :** Récupération 🟨🟨 + Vigueur 🟦  
🆚 **Contre :** DD = niveau de **fatigue** 💧

⚠️ **Défaut :** l'action requiert un **⚫** supplémentaire.  
✴️ **Critique :** gagnez un jeton **Stabilité ◇**

✅ **Succès :** le personnage perd l'état **sonné** ou **inconscient**.  
❌ **Échec :** le personnage réduit sa **fatigue** 💧 d'un point plus sa valeur de **Récupération**.

---

#### 1️⃣ Éteindre les flammes

**Coût :** 🌓🌓  
🎲 **Jet :** Prestance 🟨🟨 + Grâce 🟦  
🆚 **Contre :** DD = nombre de marqueurs **brûlure 🔥**

✴️ **Critique :** gagnez un jeton **Stabilité ◇**

✅ **Succès :** supprimez toutes vos **brûlures 🔥**.  
❌ **Échec :** supprimez **5 brûlures 🔥**.
