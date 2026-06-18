
Le voyage dans _Quadrature_ n'est pas une simple ellipse narrative entre deux points de la carte, mais une épreuve d'usure physique et logistique. Qu'il s'agisse d'une traversée rapide à pied ou d'une expédition de plusieurs semaines en convoi, la progression est rythmée par la gestion des ressources, la maintenance du matériel et la fatigue des corps.

## 1. L’Échelle du Voyage et Préparation

Avant le départ, les joueurs doivent étudier la carte pour planifier leur itinéraire et déterminer la structure du voyage.

1. **Tracer l'Itinéraire** : Les joueurs choisissent leur chemin. Le MJ détermine la **Distance** totale en cases.
    
2. **Choisir le Transport** : Le mode de déplacement définit la **Vitesse** du groupe ainsi que sa capacité de stockage.
    
3. **Calculer les Segments** : Divisez la Distance par la Vitesse pour obtenir le nombre de **Segments de voyage**.

$$\text{Nombre de Segments} = \frac{\text{Distance}}{\text{Vitesse}}$$

> Règle d'or du Rythme
> 
> Un voyage ne doit jamais excéder **5 segments**. Si le calcul dépasse ce nombre, le Meneur doit faire basculer l'expédition à l'échelle supérieure (Échelle Semaine), modifiant la nature et l'encombrement des ressources nécessaires.

### Table des Échelles de Voyage

| **Échelle**  | **Durée d'un Segment** | **Type de Ressources** | **Encombrement des Vivres** |
| ------------ | ---------------------- | ---------------------- | --------------------------- |
| Voyage court | 1 Journée              | Rations standard       | Petit Emplacement           |
| Voyage long  | 5 Jours                | Charges Lourdes        | Grand Emplacement           |

## 2. Déroulement d'un Segment

Chaque segment de voyage représente une unité de temps (un jour ou une semaine) durant laquelle le groupe progresse. Pour chaque segment, les joueurs doivent attribuer **trois rôles obligatoires** aux membres de l'expédition. Un même personnage ne peut assumer qu'un seul rôle par segment.

Le Meneur fixe le Seuil de Difficulté (DD) des jets en fonction de la météo et de la dangerosité du terrain. Pour cela, il peut s'appuyer sur la table ci-dessous :

| Terrain / Météo | Seuil / Modificateur de Difficulté pour le Segment |
| --------------- | -------------------------------------------------- |
| Plaines         | Seuil : 8                                          |
| Collines        | Seuil : 10                                         |
| Forêts          | Seuil : 11                                         |
| Marais          | Seuil : 12                                         |
| Montagnes       | Seuil : 13                                         |
| Route pavée     | Modificateur : -2                                  |
| Piste           | Modificateur : -1                                  |
| Sol accidenté   | Modificateur : +1                                  |
| Passage à Gué   | Modificateur : +2                                  |
| Passage de Col  | Modificateur : +2                                  |

### A. Chasse et Rationnement

Ce rôle gère la subsistance du groupe et impacte directement le pool de dés lors de la phase de consommation.

- **Critique ✴️** : Le groupe obtient un avantage permanent sur tous les jets de consommation de ce voyage, ou gagne immédiatement 1 charge de vivre.
    
- **Succès** : _Ménagement_. Retirez 1d6 au prochain jet de consommation de ce segment (minimum 1d6, ou 0d6 en mode Course si le groupe n'a qu'une charge).
    
- **Échec** : _Gaspillage_. Ajoutez 1d6 au prochain jet de consommation de ce segment (maximum 4d6).
    
- **Défaut ⚠️** : _Pénurie_. Une charge de nourriture ou de ressource est immédiatement détruite (moisissure, vermine, perte). Ce défaut court-circuite le jet de consommation.
    

### B. Orientation et Itinéraire

Ce rôle détermine la qualité de la progression géographique et le coût physique du voyage.

- **Critique ✴️** : Le guide trouve un raccourci ou un abri idéal. Le groupe gagne un dé d'Avantage (🟩) pour le segment suivant.
    
- **Succès** : Le groupe progresse normalement d'un segment sur la carte.
    
- **Échec** : _Progression pénible_. Le groupe avance d'un segment, mais les conditions difficiles infligent **1 marqueur d'épuisement 😩** à tous les voyageurs. Cette fatigue profonde ne peut pas être récupérée lors d'un simple bivouac — seul un séjour dans un **Havre** permet de s'en remettre (voir §4).
    
- **Défaut ⚠️** : _Égarement_. Le groupe subit **+1 Retard**. Le MJ accumule ces points et peut les dépenser pour durcir les futures rencontres ou saboter le prochain bivouac.
    

### C. Logistique et Entretien

Ce rôle est obligatoire dès que le groupe utilise des montures, des bêtes de somme ou des véhicules.

- **Critique ✴️** : Le transport est parfaitement optimisé. Le prochain jet de consommation de subsistance des bêtes/véhicules est ignoré.
    
- **Succès** : Le convoi progresse sans incident technique.
    
- **Échec** : Le transport subit l'état _Éprouvé_. Le prochain jet de Logistique au segment suivant subira un dé de malus (🟥).
    
- **Défaut ⚠️** : _Avarie mécanique / Blessure de bête_. Un Grand Emplacement de l'inventaire du véhicule est détruit au hasard, entraînant la perte définitive de ce qu'il contenait.
    

## 3. L'Économie des Ressources & Consommation

À la fin de chaque segment de voyage, le groupe doit consommer ses ressources (nourriture, eau, consommables spécifiques). Le système de _Quadrature_ utilise une mécanique à rendement décroissant pour simuler le gaspillage lorsque l'abondance règne, et le rationnement lorsque la pénurie menace.

### La Règle des Charges

Lorsqu'un personnage ou un convoi doit utiliser un consommable (ration, potion, bourses d'or), le joueur lance **1d6 par point de Stock actuellement en sa possession**, avec un **maximum de 3d6** avant modificateurs. Les modificateurs issus des rôles de Chasse peuvent faire monter ou descendre ce total au-delà de cette limite. *C'est le **Jet d'Usage** général des consommables — règle complète et espérances d'utilisation dans [Équipement](equipement.md).*

- **Si le jet obtient au moins un Défaut (0 sur le dé)** : Une charge est définitivement consommée et retirée de l'inventaire.
    
- **Si le jet ne contient aucun Défaut** : Le groupe a consommé de manière si efficiente (ou s'est rationné) qu'aucune charge n'est déduite.
    

> 📊 Probabilités de Perte d'une Charge
> 
> - **Stock 1** ($1d6$) : 16,6 % de risque de perte.
> - **Stock 2** ($2d6$) : 30,5 % de risque de perte.
> - **Stock 3+** ($3d6$, base max) : 42,1 % de risque de perte.
> - **Après modificateur +1d6** ($4d6$) : 51,7 % de risque de perte.
>     

### Consommation des Transports (Échelle Semaine)

En mode Semaine, les véhicules et montures consomment également leurs propres ressources (fourrage, graisse, pièces de rechange). Un second jet distinct, basé sur les charges de subsistance du véhicule, doit être effectué par le responsable de la **Logistique** selon les mêmes règles de charges.

---

## 4. Repos, Camps et Havres

### Bivouac *(repos en chemin)*

À la fin de chaque segment, le groupe établit un bivouac. Un bivouac permet de **récupérer toute la fatigue 💧** accumulée pendant le segment, mais **ne réduit pas l'Épuisement**.

Un bivouac peut être perturbé (attaque nocturne, mauvais temps, garde défaillante) : en cas d'incident, la fatigue 💧 n'est pas récupérée.

---

### Épuisement 😩

Un marqueur **épuisement 😩** représente une fatigue profonde qui ne se dissipe pas au simple repos. Il est infligé par des progressions éprouvantes (§B Orientation, Échec) ou par d'autres effets ultérieurs du système de voyage. *L'état complet est décrit dans [États](etats.md).*

**Règles :**

- **Plancher de fatigue.** Au début de chaque combat et après tout repos (bivouac ou autre), la fatigue 💧 du personnage ne peut jamais descendre en dessous de son nombre de marqueurs **😩**.  
  *Exemple : un personnage avec 2 marqueurs 😩 commence chaque combat avec au moins 2 💧, et toute action qui réduit sa fatigue s'arrête à 2.*
- **Aucune récupération hors Havre.** Les actions Respiration, Stabiliser et les repos de bivouac ne réduisent pas l'Épuisement.

---

### Havre *(lieu de repos complet)*

Un **Havre** est tout lieu où les personnages peuvent dormir en sécurité avec un minimum de confort : auberge, maison amie, camp fortifié, monastère, garnison alliée…

**Chaque nuit passée dans un Havre :**
- Récupère toute la **fatigue 💧**.
- Réduit l'**Épuisement** d'**1 marqueur**.

> *Un personnage portant 3 marqueurs d'Épuisement devra passer au moins 3 nuits dans un Havre pour retrouver sa pleine capacité.*

> ⚙️ **À développer :** coût du séjour (en journées de travail **j**), effets des soins médicaux sur la vitesse de récupération, règles pour établir un camp permanent comme Havre temporaire.