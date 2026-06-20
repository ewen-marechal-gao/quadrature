# 🧬 Faune d'Aeonir — intentions de design

> **⚠️ NE PAS mettre à jour ce document sans validation explicite du créateur.**
> Il fixe les **intentions de design** et les **acquis stables** du bestiaire — il ne cherche
> **pas** à refléter la structure courante de l'arbre (refactorings trop fréquents pour qu'une
> synchronisation soit réaliste).
>
> **Source de vérité du cladogramme : [`cladogram.yaml`](cladogram.yaml).** Le schéma compagnon
> [`faune_arbre.svg`](faune_arbre.svg) en est **généré** (`node tools/gen-faune-arbre.mjs`) — ne
> jamais l'éditer à la main. Pour la topologie courante, se reporter au schéma et au YAML.

---

## L'ancêtre commun & l'événement fondateur (haut du cladogramme)

- **Racine.** Une cellule unique, **mobile, hétérotrophe** (phagocytose), **électrosensible**
  (l'environnement saturé d'électricité statique fait de la perception des champs un sens basal),
  **sexuée** (méiose). Elle n'est **pas** photosynthétique : c'est l'état ancestral, celui que les
  **animaux** conservent.
- **⊕ Première mutation — l'endosymbiose pourpre.** Une lignée capture et **garde** un **phototrophe
  au rétinal** (microbe pourpre ; hypothèse de la « Terre pourpre », analogue de la bactériorhodopsine).
  L'autotrophie est donc **acquise, dérivée**, jamais ancestrale ; elle colore le vivant en
  **bordeaux / lie-de-vin**.
- **La locomotion suit le choix trophique.** Se nourrir de lumière permet de se fixer → les
  autotrophes tendent à devenir **sessiles** ; manger les autres impose de conserver la **motilité**
  (muscles, nerfs).
- **Deux règnes** en découlent : les **Pourpres** (autotrophes) et les **Zoïdes** (animaux).

---

## Mutations consolidées (registre)

Innovations propres à Aeonir. *Différée* = pas encore placée sur l'arbre (cercle vide au schéma).
La **numérotation est un simple registre**, *non chronologique* (renumérotation différée jusqu'à
stabilisation de l'arbre).

| # | Mutation | Effet & ce qu'on infère |
| :-: | :-- | :-- |
| 1 | **Endosymbiose pourpre** | autotrophie au rétinal → définit les **Pourpres** ; bordeaux, tendance sessile |
| 2 | **Sacs d'hydrogène** | flottaison / dispersion → flotteurs aériens portés par les vents |
| 3 | **Cristallisation (l'Arche)** | l'Arbre-Anneau **franchit la Nuit** et ferrye le vivant |
| 4 | **Flore mobile / prédatrice** | autotrophe ayant regagné la motilité (mixotrophe) → « plante » qui marche / chasse |
| 5 | **Symétrie tri-radiale** | 3 axes à 120° → locomotion omnidirectionnelle, **sans avant** |
| 6 | **Métamorphose thermique** | larve aquatique → adulte terrestre au **seuil thermique** ; amphibie inféodé à l'eau pour se reproduire |
| 7 | **Corne EM (télépathie)** *(différée)* | émission EM active → **télépathie** (futurs Peuples / Sidérocères) |
| 8 | **Carapace chitino-ferrique** | armure dermique **externe** sur un corps déjà marcheur → blindé, lent, endurant |
| 9 | **Plan hexapode (3 paires)** | 3 paires d'appendices **propres** à la lignée endosquelettique (2 porteuses + 1 dorsale) → socle de tous les plans terrestres |
| 10 | **Sidérotropisme** | **routage orienté du fer** (centripète ↔ centrifuge) → scission **Endoferres / Exoferres** (cf. tableau ci-dessous) |
| 11 | **Corde dorsale (axe EM ferrique)** | le fer centripète forme un **axe dorsal** servant d'antenne EM → ossature axiale, électro-sensibilité, voie vers la télépathie |
| 12 | **Cage de Faraday** *(différée)* | cuirasse ferrique **écrantante** (Exoferres) → **sourd à l'EM, résistant à la télépathie** |

---

## Principe directeur : des mutations lisibles, des traits inférables

Objectif : un **bestiaire** crédible, **dérivé des contraintes d'Aeonir** (terminateur mobile,
environnement électrique, photosynthèse au rétinal, fronts mortels). Le cladogramme **dévie** de
l'évolution terrestre, mais doit rester **cohérent du point de vue du processus de spéciation**.

Deux exigences fortes :

1. **Mutations lisibles.** Chaque mutation est un **caractère compréhensible**, jamais un détail
   invisible. *Modèle :* le split **Pourpre / Zoïde** (le spectre du terminateur impose un choix
   trophique). *Contre-exemple rejeté :* « bouche d'abord / anus d'abord » (invisible, ne prédit rien).
2. **Traits des espèces inférables via l'ascendance.** Un joueur ou le meneur doit pouvoir **déduire**
   les caractéristiques d'une créature en lisant les mutations de ses ancêtres.

*Exemple — le thème du fer (Sidérotropisme) :*

| Ancêtre porteur de… | On infère la créature… |
| :-- | :-- |
| **Sidérotropisme centripète** (Endoferres) | fer au centre → **ossature interne, grande, céphalisée / dressée, électro-sensible** → lignée de la **corne EM / télépathie** |
| **Sidérotropisme centrifuge** (Exoferres) | fer en périphérie → **cuirasse / coquille, petite à moyenne, écrantée** → **résistante à la télépathie** |

Méthode : peupler l'arbre **par grades ascendants** (basal → couronne), **lore d'abord** ; ne pas
introduire un organe complexe avant le grade qui le permet ; renumérotation des mutations différée.
