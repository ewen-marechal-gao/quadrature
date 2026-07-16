# 🎴 Cartes d'action — données structurées

Ce dossier contient les **cartes d'action** au format YAML, directement parsables par le simulateur, le site web (rubrique Cartes) et l'outil d'impression.

> **Source de vérité du contenu :** les fichiers `core/actions/*_actions.md` restent la référence détaillée des règles. Les YAML en sont la **projection condensée au format carte** — toute évolution d'une action doit être répercutée ici.

## Fichiers

| Fichier | Contenu |
| :--- | :--- |
| `actions_universelles.yaml` | Actions sans prérequis (universal_actions.md) |
| `actions_avancees.yaml` | Actions à prérequis de compétence (attribute_actions.md) |
| `reactions_defense.yaml` | Réactions et gardes (defense_reactions.md) |

À terme : un fichier par discipline (`discipline_escrime.yaml`, …).

## Schéma d'une carte

```yaml
cartes:
  - id: frappe-brutale          # identifiant unique kebab-case
    nom: Frappe brutale
    type: action                # action | reaction
    famille: melee              # melee | distance | mouvement | tempo | mental |
                                #   physique | sociale | utilitaire | garde
    categorie: offensive        # code couleur de la carte :
                                #   mouvement (cyan) | offensive (rouge) | defensive (bleu)
                                #   guerison (vert) | amelioration (violet)
    initiative: 6               # ordre de résolution 1-10 (→ bande I:1-3 · II:4-6 · III:7-9)
    cout: "🌕🌕💧💧"             # PA en phases de lune (la lune = la bande) : 🌓 I · 🌕 II · 🌗 III ; + 💧 fatigue
    description: ""             # texte d'ambiance (italique en bas de carte)
    prerequis: "Puissance 1"    # condition de déblocage
    bandeau: ""                 # note de règle affichée sous l'en-tête
                                #   (même rendu que le prérequis)
    declencheur: ""             # ⚡ condition de déclenchement (réactions)
    condition: ""               # 🔒 facteurs requis
    mental: ""                  # 🧠 état mental requis
    cible: ""                   # 🎯 cible et portée
    jet: "Puissance 🟨🟨 + Force 🟦"   # 🎲
    contre: "Garde"             # 🆚 DD fixe ou jet opposé
    ameliorations:              # ⚒️ effets conditionnés à un trait
      - nom: Momentum
        effet: "réduit d'un point le coût en fatigue 💧"
    sacrifices:                 # ⛞ options de sacrifice de dé
      - des: "🟦"               # 🟦 (≥2🟦 en réserve) | 🟨 (≥3🟨 en réserve)
        nom: Sprint
        effet: "augmenter le déplacement de 3 cases"
    defaut: ""                  # ⚠️
    critique: ""                # ✴️
    effet: ""                   # ▶️ effet immédiat, quel que soit le résultat
    effet_duree: ""             # ⏳ effet de durée
    succes: ""                  # ✅
    echec: ""                   # ❌
    table:                      # table de dépense de points (optionnel)
      titre: ""
      lignes:
        - cout: 1
          effet: ""
    notes: ""                   # renvois, précisions
    source: core/actions/attribute_actions.md
```

Les champs absents ou vides sont omis. Les valeurs conservent les symboles normalisés
(voir `core/glossaire.md`) et un balisage léger : `**gras**`, `*italique*`.

## Tags (typage machine des cartes)

En complément de `famille`/`categorie` (affichage), chaque carte d'action — joueur
**et** adversaire — porte un **ensemble de tags** en anglais, lus par les règles
(ex. le trait *Sanguinaire* s'applique aux cartes `physicalDamage`) et par le
simulateur (traits, heuristiques d'agent). Une carte cumule librement plusieurs
tags ; ils ne sont **jamais inférés des effets**.

| Groupe | Tags | Sens |
| :--- | :--- | :--- |
| Intention | `offensive` `defensive` `movement` `support` `healing` `enhancement` | ce que la carte cherche à faire |
| Domaine | `melee` `ranged` `mental` `physical` `social` | par quel vecteur |
| Marqueur d'effet | `physicalDamage` | inflige des blessures 💢/💔 |
| | `mentalDamage` | inflige 🔻/🔺 ou une perte de Stabilité ◇ |
| | `fatigueDamage` | inflige de la Fatigue 💧 |

Exemple : *Charge* = `[offensive, movement, melee, physical, physicalDamage]` ;
*Cri terrifiant* = `[offensive, mental, mentalDamage]`.

Sources machine : `data/adversary_actions.yaml` (adversaires) et, pour l'instant,
`simulator/src/combat/actions.ts` (actions joueur — convergence vers le YAML prévue).
