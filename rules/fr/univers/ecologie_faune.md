# 🧬 Faune d'Aeonir — intentions de design

> **⚠️ NE PAS mettre à jour ce document sans validation explicite du créateur.**
> Il fixe les **intentions de design** et les **acquis stables** du bestiaire — il ne cherche
> **pas** à refléter la structure courante de l'arbre (refactorings trop fréquents pour qu'une
> synchronisation soit réaliste).
>
> **Source de vérité du cladogramme : [`data/cladogram.yaml`](../../../data/cladogram.yaml)** (l'arbre)
> et [`data/mutations.yaml`](../../../data/mutations.yaml) (les mutations : label, description, kit).
> Édition via `tools/cladogram.mjs`. L'arbre se visualise sur la page web `/evolution`, qui lit
> le YAML directement — il n'y a plus d'étape de génération statique.

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

---

## Les Peuples — une espèce, quatre races interfécondes

> **Choix structurant.** Les **nœuds terminaux** de l'arbre représentent les **races** des espèces
> encore vivantes, pas des espèces distinctes. Ce n'est pas rigoureux cladistiquement (des races
> interfécondes échangent des gènes → **réticulation**, pas arbre), mais l'objectif est la
> **création du bestiaire**.

Les quatre Peuples — **Cimes, Vents, Neiges, Pluies** — sont **quatre expressions d'une seule
espèce, pleinement interfécondes**. Leurs différences morphologiques sont des **adaptations à
l'habitat** (donc inférables depuis le biome), jamais des barrières d'espèce : le métissage produit
des **intermédiaires viables et fertiles**. Modèle : la variabilité du chien (énorme variance
*visible*, faible divergence *génétique*) — peu de loci régulateurs à effet majeur, sélection
clinale forte le long de la bande, et **auto-domestication par la télépathie** (sélection
sexuelle / sociale intense → syndrome de domestication : néoténie, dépigmentation, diversification).

### Le plan podal — un seul pied, trois boutons

Le point le plus tendu est la **plasticité des membres inférieurs** (sole humaine grimpante / sabot /
griffe / large sabot). Les races de chien ne varient pas à ce point au niveau du pied : sabot, griffe
et ongle distinguent dans le réel des *ordres* entiers. Pour rester crédible **au sein d'une espèce
interféconde**, on ne crée pas quatre pieds différents : on **module un plan podal ancestral unique**
via trois leviers à faible coût génétique, ce qui garantit des **hybrides « mélangeables »** :

| Bouton | Mécanisme réel | Amplitude |
| :-- | :-- | :-- |
| **Cape de kératine** | sabot, griffe et ongle = *le même organe kératineux* ; seule change la quantité / géométrie de dépôt | ongle ↔ griffe ↔ sabot |
| **Posture & doigts** | longueur des métatarses, fusion / réduction des doigts | plantigrade (grimpe) ↔ digitigrade ↔ ungulé |
| **Coussinet / sole** | tissu mou ; palmure = simple défaut d'apoptose interdigitale | sole agrippante ↔ semelle isolante ↔ pied palmé |

Deux points qui dé-risquent la lecture biologique :

1. **Le « genou inversé » des Vents n'est pas une articulation nouvelle** : c'est la **cheville
   surélevée** (posture digitigrade / ungulée, métatarses allongés) — le **même squelette
   re-posturé**, comme cheval, chien ou oiseau.
2. **Griffe, sabot et ongle sont le même organe** kératineux modulé : on ne fait jamais
   apparaître / disparaître un organe entre peuples, on **règle un curseur**.

*Levier complémentaire (interfécondité) :* une part de la différence podale peut être **plastique**
(induite par le substrat / l'usage pendant la croissance, pas seulement génétique) → divergence
génétique minime, hybrides triviaux, et un enfant qui change de « type » selon où il grandit.

> **L'état ancestral du pied** est le **plantigrade généraliste** (≈ Cimes, le moins dérivé) ; sabots
> (Vents, Neiges) et griffes palmées (Pluies) en sont des **dérivés** spécialisés. Comme pour le fer,
> on lit le pied depuis l'ascendance et le biome.

---

## Les Faucheurs — l'ombre d'*Aeonis sapiens* (espèce aboutie)

> **Espèce-monstre.** Le **cousin bestial** des Peuples : tout l'héritage sapient (télépathie, gros
> cerveau de meute, bipédie) **sans les mains** — tourné vers l'**arme et la prédation** plutôt que
> vers l'outil et la culture. Lecture-miroir d'*Aeonis sapiens*.

**Lignée.** Faucheurs et *Aeonis sapiens* partagent tout l'arbre jusqu'au **redressement** : c'est là
que la route bifurque. Là où *Aeonis sapiens* **achève** la verticalisation (perte de la queue,
membres antérieurs → **mains**), les Faucheurs **s'arrêtent à mi-chemin** — d'où leur silhouette plus
animale.

**Anatomie (tout est inférable de l'ascendance) :**

| Trait                                   | Mutation / origine                                                                   |
| :-------------------------------------- | :----------------------------------------------------------------------------------- |
| Deux longues **serpes** aux avant-bras  | **●Serpes** (les ongles s'allongent en faux — *seule mutation propre des Faucheurs*) |
| **Semi-dressé**, queue-balancier        | redressement **incomplet** ; la queue (●Queue) n'est **pas** perdue                  |
| **Membres inférieurs puissants**        | bipédie ●Bipédie + posture ramassée                                                  |
| **Fourrure** dense                      | héritée des Fourrés (●Fourrure)                                                      |
| **Léger museau**                        | **état ancestral conservé** (pas de face plate)                                      |
| **Aiguilles EM** sur le crâne (≈ Cimes) | récepteur EM externe (●Récepteur EM) en longues épines                               |
| **Cri neural** (sidère la proie)        | **capacité** de l'émetteur EM (●Émetteur EM) — pas une mutation                      |
|                                         |                                                                                      |

**Écologie & rôle de jeu.** Prédateur télépathe : il **sent** l'activité nerveuse de ses proies par
ses aiguilles, **fige** d'un cri neural à courte portée, puis lacère de ses serpes. Chasse en
groupe, coordonné en silence par l'EM. C'est l'**antagoniste-miroir** d'*Aeonis sapiens* : assez
proche pour être troublant (même ascendance, même don), assez sauvage pour terrifier. Excellente
créature de meneur, et amorce possible d'une lignée de « bêtes dressées ».

---

## Les Syntones — meutes télépathes synchronisées

> **Les chasseurs en meute.** Cousins **quadrupèdes** des Peuples : restés à quatre pattes là où la
> lignée sapiente se dressait, ils partagent la **télépathie** — mais l'ont tournée vers le
> **collectif** plutôt que vers le gros cerveau individuel. Une famille de plusieurs espèces, un même don.

**Lignée.** Dès l'apparition de l'**émetteur EM** (la télépathie active), la route se sépare en deux
usages du don : la **voie collective** (les Syntones, l'esprit réparti) et la **voie individuelle**
(le gros cerveau → bipèdes → Peuples et Faucheurs). Les Syntones bifurquent donc **avant**
l'encéphalisation : ils héritent de tout — sang chaud, **fourrure**, vivipare, **vision frontale** de
prédateur, **épines EM** réceptrices (●Récepteur EM externe), télépathie (●Émetteur EM) — **sauf** le
gros cerveau individuel. Leur intelligence est celle du **réseau**, pas de la bête. Le tout porté par
un corps de chasseur horizontal, **gabarit de hyène**, queue conservée.

**Le don — la synchronisation (●Esprit de meute).** Ce n'est *pas* une ruche à esprit unique : chaque
bête garde son **autonomie**, mais ses actes et ses désirs se calquent fortement sur ceux de ses
pairs — une **contagion sociale intégrée**. La meute rabat, encercle et vire d'un même élan, en
silence. Les **épines EM courent le long de la colonne** : un membre peut faire tressaillir par
réflexe le corps d'un congénère.

*Au combat, traduire par :* un **pool de stabilité commun** (état mental collectif), une **résistance
aux effets mentaux**, l'**impossibilité de se dissimuler** (se cacher d'un seul = se cacher d'aucun)
et un **bonus d'esquive tant que la bête n'est pas isolée**. Le talon d'Achille est donc
l'**isolement** — séparer une bête de sa meute la prive de tout cela.

**Les espèces (inférables du biome + de l'ascendance) :**

| Espèce | Biome | Trait propre |
| :-- | :-- | :-- |
| **Meute-chasseresse** | Couchant (steppes) | la forme-souche : coursière-embusquée des hautes herbes, chasse par poursuite |
| **Meute boréale** *(Lutriens)* | Nord (lacs, marais) | ●Fourrure huileuse imperméable → semi-aquatique, chasse sur terre (écho des Pluies) |
| **Pêcheurs** *(Lutriens)* | Nord (eaux) | ●Crocs harponneurs + pattes-rames → pleinement aquatique, rabat le poisson |
| **Lacérateurs** *(Sidéronyches)* | Couchant | ●Griffes de chasse ferro-renforcées = l'arme : éventrent d'un coup de patte |
| **Meute fouisseuse** *(Talpidés)* | Couchant | ●Griffes fouisseuses → galeries communes, petits gardés au terrier |
| **Meute australe** *(Talpidés)* | Sud (froid) | ●Graisse & fourrure polaires : terrier + lard isolant pour tenir au pôle Sud |

**Rôle de jeu.** Adversaires de **groupe** par excellence : on n'affronte jamais *une* Syntone mais
la meute, qui pense d'un bloc. Le meneur joue la coordination muette (flanquements, replis
simultanés) ; le joueur avisé cherche à **isoler** une bête ou à semer la panique. Comme les
Faucheurs, certaines lignées sont **dressables** — d'où l'idée de « chiens de chasse » au service
d'un clan.

---

## Les Bondisseurs — le gibier bondissant

> **La proie.** Là où Syntones et Faucheurs sont les chasseurs, les Bondisseurs sont le **gibier** :
> des bipèdes bâtis pour la **fuite**, jamais le combat. Des **mammifères** vivipares à fourrure et
> vision frontale — malgré la silhouette, *pas* des dinosaures.

**Lignée.** Issus de la branche **bipède**, mais *avant* le redressement : dos encore **incliné**,
longue **queue-balancier** poilue conservée, membres antérieurs réduits (ni mains ni serpes). S'y
ajoute la **●Détente** — des postérieurs à ressort (bonds explosifs + sprint).

**Bauplan partagé.** Bipède au dos horizontal, queue contrepoids, postérieurs élastiques, fourrure,
**troupeau télépathe** ; survie par l'**alerte EM** et la fuite.

| Espèce | Biome | Trait propre |
| :-- | :-- | :-- |
| **Coureurs** | répandus (Nord · Levant · Couchant) | la forme-souche : sauteur des clairières, sprint en troupeau — gibier de prédilection des Faucheurs |
| **Planeurs** | Levant (canopée) | ●Voilure : membrane antérieurs↔flancs → le bond devient vol plané d'arbre en arbre |
| **Détaleurs** | Levant (fourrés) | ●Poche ventrale : petite proie, emporte sa portée d'un bond dans la fuite (jamais abandonnée) |

**Rôle de jeu.** Faune d'ambiance et gibier : leur **alerte télépathe** trahit l'approche d'un
prédateur — donc aussi celle de PJ furtifs. Parfaits pour rythmer une scène de chasse, ou pour
montrer ce que traquent Faucheurs et Syntones.