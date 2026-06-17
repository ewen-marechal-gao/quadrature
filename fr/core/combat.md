# Le Combat

> Voir aussi : [actions/universal_actions.md](actions/universal_actions.md) · [actions/defense_reactions.md](actions/defense_reactions.md) · [etats.md](etats.md)

Le combat dans Quadrature est tactique et structuré. Il se déroule en une succession de tours appelées **manches**. À chaque manche, les personnages et leurs adversaires agissent simultanément au moyen des cartes d'Action et de Réaction.

À chaque manche, les joueurs reçoivent trois points d'action **🟢⚫🔴** et les adversaires un nombre variable (généralement ⚫⚫).

Les joueurs commencent le combat avec un nombre de **Réactions ⚡** égal à leur **Réactivité**.

---

## Déroulement d'une manche

### a) Phase d'entretien

Durant cette phase :
1. Les joueurs reçoivent leurs points d'action 🟢⚫🔴.
2. On résout les effets des états **Combustion 🔥** et **Virulence 🦠**.
3. Chaque personnage dont la fatigue est **≥ 10** effectue un **test d'Endurance**.

**Test d'endurance**

*Le combat épuise — même les plus valeureux finissent par vaciller.*

🎲 Endurance 🟨🟨 + Vigueur 🟦  
🆚 Votre niveau de **Fatigue 💧**

⚠️ **Défaut :** vous subissez l'état **Essoufflé 😮‍💨**  
✴️ **Critique :** met immédiatement fin à l'état **Essoufflé 😮‍💨**

✅ **Succès :** ↘️ votre **Fatigue 💧** d'un point plus votre valeur d'**Endurance**  
❌ **Échec :** ↘️ votre **Fatigue 💧** d'un point

---

### b) Phase d'actions

Chaque joueur choisit et joue une **carte action 🎴** face cachée. Le meneur en fait de même pour chaque **adversaire** et chaque **horde**.

Les cartes sont révélées, et les actions résolues par ordre d'initiative croissante, de **1️⃣ à 🔟**. Les actions ne pouvant pas être effectuées (cible invalide, condition non satisfaite, manque de PA) sont perdues.

- En cas d'égalité entre deux joueurs : ils décident ensemble de l'ordre.
- En cas d'égalité entre le meneur et les joueurs : le meneur décide.

La phase d'action se poursuit tant qu'au moins un joueur ou adversaire dispose de points d'action.

---

### c) Phase de nettoyage

À la fin de la manche, chaque personnage compare ses **blessures légères 💢** à sa **Résistance** (Vigueur + Robustesse) :

- Si le nombre de 💢 est **strictement supérieur** à la Résistance → le personnage subit **1 Blessure grave 💔** et tous les marqueurs 💢 sont supprimés. Cette blessure peut être prévenue par la Protection, sauf en cas d'**Hémorragie 🩸**.
- Ensuite, retirer un nombre de marqueurs **blessure légère 💢** égal à la valeur de **Récupération** (minimum 1).

*Exemple : Lena (Vigueur 1, Robustesse 0 — Résistance 1 ; Récupération 0) termine la manche avec 2 marqueurs 💢. Comme 2 > 1, elle subit 1 💔 et tous les marqueurs sont supprimés. La manche suivante, elle ne reçoit qu'une blessure légère : 1 > 1 est faux, pas de conversion — et elle retire 1 💢 en fin de manche (le minimum, malgré sa Récupération 0) : elle repart indemne.*
