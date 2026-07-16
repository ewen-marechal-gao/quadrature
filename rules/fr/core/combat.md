# Le Combat

> Voir aussi : [actions/universal_actions.md](actions/universal_actions.md) · [actions/defense_reactions.md](actions/defense_reactions.md) · [etats.md](etats.md)

Le combat dans Quadrature est tactique et structuré. Il se déroule en une succession de tours appelées **manches**. À chaque manche, les personnages et leurs adversaires agissent simultanément au moyen des cartes d'Action et de Réaction.

À chaque manche, les joueurs reçoivent **trois points d'action** et les adversaires un nombre variable (généralement 2). Les PA se dépensent au fil des trois **bandes d'initiative** de la phase d'actions ; le coût d'une carte, noté en **phases de lune 🌓🌕🌗**, indique à la fois sa **bande** et son nombre de **PA** (voir [glossaire](glossaire.md)).

Les joueurs commencent le combat avec un nombre de **Réactions ⚡** égal à leur **Réactivité**.

---

## Déroulement d'une manche

### a) Phase d'entretien

Durant cette phase :
1. Les joueurs reçoivent leurs **trois points d'action**.
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

La phase d'actions se déroule en **trois bandes** révélées successivement — **Bande I**, **Bande II**, puis **Bande III** — à l'image du Reflet Argenté qui **croît, s'emplit, puis décroît** au fil de la manche. Chaque carte appartient à une bande selon son **initiative** :

| Bande | Initiative | Lune |
| :---: | :---: | :---: |
| **I** | 1 à 3 | 🌓 |
| **II** | 4 à 6 | 🌕 |
| **III** | 7 à 9 | 🌗 |

*(Les initiatives **0** et **10** sont hors-bande, réservées à des cas particuliers : une réaction jouée avant la révélation de la Bande I — comme **Prédiction** — se résout en 0 ; un effet exceptionnellement tardif se résout en 10, après la Bande III.)*

Pour chaque bande, dans l'ordre :

1. **Engagement.** Chaque joueur pose face cachée la ou les **cartes action 🎴** de cette bande qu'il souhaite jouer et peut payer. Le meneur fait de même pour chaque **adversaire** et chaque **horde**. Un combattant qui n'a rien à jouer dans cette bande **passe**.
2. **Révélation.** Toutes les cartes de la bande sont révélées **simultanément**.
3. **Résolution.** Les actions se résolvent par **ordre d'initiative croissante** (résolution fine **1️⃣ à 🔟**). Les actions à **initiative identique** sont **simultanées** : on prend un **instantané** de l'état de chaque combattant concerné *avant* de résoudre le groupe, puis on applique les effets d'un bloc.

Chaque bande étant révélée *après* la résolution de la précédente, une carte lente s'engage en connaissant l'issue des bandes rapides — mais **à l'aveugle** vis-à-vis des autres cartes de sa propre bande.

Les actions ne pouvant pas être effectuées (cible invalide, condition non satisfaite, PA insuffisants) sont **perdues**.

- Égalité d'initiative entre deux joueurs : ils décident ensemble de l'ordre.
- Égalité entre le meneur et les joueurs : le meneur décide.

Les **points d'action non dépensés** à la fin de la Bande III sont perdus (sauf effet spécifique).

---

### c) Phase de nettoyage

À la fin de la manche, dans l'ordre :

1. **Saignement 🩸** — si le personnage porte des jetons d'**Hémorragie**, retirer d'abord **Récupération ✫** jetons (le corps referme), puis subir **1 💢 par jeton restant** ; les jetons restants persistent (voir [etats.md](etats.md)).
2. **Conversion 💢 → 💔** — comparer les **blessures légères 💢** à la **Résistance** (Vigueur). L'excédent au-dessus de la Résistance se convertit au taux **3 💢 → 1 blessure grave 💔** (par tranches entières de 3) ; le **reste est reporté** à la manche suivante. Chaque 💔 est absorbée par la **Protection 🛡️** — **sauf** si le personnage a saigné cette manche (le sang passe sous l'armure).

*Exemple : Lena (Vigueur 1 → Résistance 1 ; Récupération 0) termine la manche avec 4 marqueurs 💢. L'excédent vaut 3 (4 − 1), soit une tranche de 3 → elle subit 1 💔, et il lui reste 1 💢 (reporté). Sans Récupération et sans bandage, une hémorragie non soignée continuerait de la faire saigner chaque manche.*
