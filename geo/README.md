# `geo/` — SIG d'Aeonir

Chaîne géomatique complète sur un monde inventé : définition d'un référentiel,
génération d'un modèle numérique de terrain, analyse hydrologique, tuilage,
rendu 3D dans un navigateur.

La génération procédurale du relief n'est **pas** l'objet du chantier — elle n'en
est que la source de données. L'objet, c'est le pipeline qui l'entoure.

**Ce fichier porte le code** : son organisation, son pipeline, et les décisions
de conception qui lui donnent sa forme. Les deux autres ont des rôles disjoints :

| | |
|---|---|
| [GLOSSAIRE.md](GLOSSAIRE.md) | le **vocabulaire** du domaine, et la référence PROJ |
| [TUTORIAL.md](TUTORIAL.md) | la **trajectoire** — feuille de route, enseignements, **pièges** |

> **Aucun nombre de tirage n'est écrit ici.** Graine, décalage au datum,
> extrêmes, écart-type, pic : tout cela vit dans
> [`aeonir_gis/calibration.json`](aeonir_gis/calibration.json), produit par
> `python -m aeonir_gis.calibrate`. Ce document ne porte que les nombres de
> **conception** — ceux qui se déduisent, et qu'un changement de graine ne
> déplace pas.

---

## Installation

Depuis `geo/`, avec Python 3.13 :

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
```

Aucun GDAL système n'est nécessaire : les roues embarquent les bibliothèques
natives.

| Couche | Version | Fournie par |
|---|---|---|
| GDAL | 3.12.1 | `rasterio` |
| PROJ | 9.5.1 | `pyproj` |
| GEOS | 3.13.1 | `shapely` |

**QGIS** est recommandé en complément — non pour produire, pour *inspecter*.

### Ouvrir les produits dans QGIS

Le COG est un GeoTIFF ordinaire : glisser-déposer suffit. Trois points qui ne
vont pas de soi, parce que la donnée n'est pas terrestre.

1. **Fixer le SCR du projet depuis la couche** — clic droit sur la couche, *SCR*
   → *Définir le SCR du projet depuis la couche*. À défaut, QGIS tente une
   reprojection vers `EPSG:4326` que PROJ refuse : les deux ellipsoïdes
   n'appartiennent pas au même corps céleste. Le refus est correct, et la
   dérogation `PROJ_IGNORE_CELESTIAL_BODY` ne ferait que le masquer par une
   identité.
2. **La couche s'affiche « Aeonir Crust », sans code d'autorité.** Le nom et la
   définition survivent dans le WKT ; c'est seulement `AEONIR:1` que la base de
   PROJ ne connaît pas. Normal, documenté plus bas.
3. **L'ombrage a besoin d'un facteur Z.** Le SCR est géographique : les pixels
   sont en degrés, les altitudes en mètres. Un degré valant 83 340 m sur Aeonir,
   le facteur neutre est **1,2 × 10⁻⁵** — à multiplier pour exagérer. Sur Terre
   on utilise 9 × 10⁻⁶, qui écraserait le relief d'un tiers ici.

Les aperçus internes du COG (`[2, 4, 8, 16, 32]`) sont utilisés
automatiquement : le panoramique reste fluide malgré la taille du fichier.

### Le projet `QGISviz.qgs`

Versionné pour ce qu'il porte : le montage des couches, et surtout le **style**
du MNT, qui a demandé plusieurs tâtonnements — rampe divergente bornée symétriquement pour que le zéro tombe au milieu, min/max sur **emprise entière** et
non sur l'emprise courante, ombrage à **1,2 × 10⁻⁵** sur une couche dupliquée en
mode de fusion *Multiplier*.

Enregistré en `.qgs` et non `.qgz` : le second est un zip, illisible en diff. Les
chemins sont relatifs, la seule source externe étant `./out/aeonir_crust_dem.tif`
— absent du dépôt, régénérable par une commande.

**Deux choses qu'il ne porte pas**, pour éviter la surprise :

- **Les couches de graticule rouvriront vides.** Ce sont des couches temporaires
  en mémoire ; le projet n'enregistre que leur schéma. À regénérer par *Créer une
  grille* + *Densifier*, ou par script le jour où le pipeline aura un écrivain
  vectoriel — ce que le Lot 5 apportera.
- **Une couche référence son SCR par code** (`USER:100002`) plutôt qu'en WKT.
  Ce code n'a de sens que dans une base QGIS où les trois SCR d'`out/*.wkt` ont
  été déclarés dans le même ordre. C'est le piège n° 18 du TUTORIAL en action :
  un identifiant ne vaut que relativement à son registre.

## Structure

```
geo/
  aeonir_gis/     code du pipeline
    calibration.json   produit par calibrate, versionné
  tests/          suite pytest
  out/            produits générés (gitignoré)
```

Tout produit vit dans `out/` et n'est **jamais** versionné : le MNT pèse
plusieurs centaines de mégaoctets, les pyramides de tuiles davantage. La
reproductibilité est assurée par le code, pas par le stockage.

L'exception est `calibration.json`, qui est produit *et* versionné — c'est un
résultat de mesure, pas un artefact : quelques dizaines d'octets qui rendent le
terrain reproductible à l'identique.

## Commandes

Depuis `geo/`, avec le venv actif.

```bash
.venv/Scripts/python.exe -m pytest -q
```

Les tests passent **avant** qu'aucune donnée n'existe : c'est la preuve que le
générateur est la source de vérité.

```bash
.venv/Scripts/python.exe -m aeonir_gis.calibrate
```

Établit la graine et l'échelle du relief, et écrit `calibration.json`. À
relancer **à chaque changement du générateur** — un test le rappelle en tombant.
`--dry-run` mesure sans écrire.

```bash
.venv/Scripts/python.exe -m aeonir_gis.dem
```

Le MNT global. `-z` fixe le zoom visé donc la taille du raster (`-z 3` pour un
aperçu en quelques secondes), `-s` force une graine, `--plain` saute la
conversion COG.

```bash
.venv/Scripts/python.exe -m aeonir_gis.export
```

Fleuves, exutoires et bassins en GeoPackage. `--width` fixe la résolution de
travail, `--stream-km2` la densité du réseau, `--basin-km2` le filtre de
polygonisation.

```bash
.venv/Scripts/python.exe -m aeonir_gis.pyramid
```

La pyramide de tuiles terrarium. `--split-zoom` déplace la bascule monde/bande,
`--epoch` change l'époque du repère Étoile, `--full-precision` encode le canal
bleu.

Le visualiseur ne vit plus ici : il est servi par le site, à la route `/sig`.
Depuis `web/`, `npm run dev` — le script `copy-aeonir-tiles.mjs` y recopie
`out/tiles` avant de démarrer.

---

# Le pipeline

```
calibrate.py ──→ calibration.json   graine et échelle, mesurées
                        │
noise.py ──→ dem.py ────┴──→ COG ─┬─→ hydro.py + export.py ──→ GeoPackage
                                  └─→ tiles.py + pyramid.py ──→ PNG + TileJSON ──→ web/ (/sig)
```

Chaque module porte sa propre justification en docstring — **ce tableau ne la
répète pas**, il dit où chercher.

| module | rôle | la décision qui le structure |
|---|---|---|
| `constants.py` | les grandeurs d'Aeonir, tirées du vault | une seule source, jamais recopiée |
| `crs.py` | les trois SCR et la rotation datée | `star_to_crust` est la réciproque **qui travaille** |
| `calibrate.py` | balayage de graines, pic, invariance, Hurst | le critère au code, la valeur au fichier |
| `noise.py` | bruit de gradient et fBm | pur — il ignore tout d'Aeonir |
| `dem.py` | le MNT global → GeoTIFF → COG | `W = 2^z · T` |
| `hydro.py` | D8, accumulation, Strahler, bassins | doublement de pointeurs, décomposition par profondeur |
| `export.py` | raster → vecteur, GeoPackage | découpage à l'antiméridien du repère |
| `tiles.py` | adressage XYZ, cartographie inverse, terrarium | le schéma XYZ ne référence **aucun rayon** |
| `pyramid.py` | empilement, PNG, TileJSON | deux régimes, seuil imposé par la fermeture |

## La grille se déduit, elle ne se choisit pas

Une grille équirectangulaire et une pyramide Mercator portent le même `cos φ`
en E-O. En posant **`W = 2^z · T`**, l'accord devient exact à *toutes* les
latitudes d'un coup — c'est la seule origine légitime de la largeur du raster.

Retenu : **z = 6**, `T = 256`, donc `W = 16 384`. Ce qui plafonne n'est ni le
disque ni le calcul, qui tiendraient jusqu'à z=8, mais la mémoire de l'analyse
hydrologique. Le détail du calcul est dans la docstring de `dem.py`.

En N-S l'accord n'existe pas : Mercator réclame `1/cos φ` fois plus fin. Comme
la pyramide est en repère **Étoile**, ces hautes latitudes sont les deux faces
mortes, et la bande habitée tombe sur l'équateur Mercator où l'accord est exact
dans les deux directions.

## Le bruit s'évalue en 3D, il se stocke en 2D

Deux questions distinctes, et c'est de leur découplage que tout dépend : on
**évalue** sur la sphère unité dans ℝ³, on **stocke** sur une grille
équirectangulaire. La fonction ne voit jamais ni longitude ni latitude, donc ni
la couture de l'antiméridien ni le pincement polaire ne peuvent exister.

`tests/test_noise.py` teste chaque propriété **avec son contre-exemple 2D à
côté** : sans lui, on vérifierait qu'un problème est absent sans avoir montré
qu'il pouvait être présent.

## Pourquoi on ne pave pas la sphère

Le problème est réel et porte un nom normalisé — **DGGS**. On ne pave pas, et
pas par paresse : un pavage résout un problème d'**échantillonnage** qu'on vient
de dissoudre autrement, en sortant le bruit de la grille. Resterait un problème
de *stockage*, où rasterio, la géotransformation, `gdalwarp`, le COG et QGIS
attendent tous une grille régulière.

L'argument qui emporte la décision est en aval : la sortie est une pyramide XYZ,
elle-même un pavage, et une source équirectangulaire s'y accorde exactement par
`W = 2^z·T`. Une source HEALPix équi-aire obligerait à **sur**-interpoler pour
nourrir les tuiles polaires.

## Ce que la calibration produit

La graine du générateur et l'échelle du relief sont des **résultats de mesure**,
pas des constantes. `calibrate` les établit et les écrit ; `dem` les lit.

```
p = l^(−H)                       la persistance se déduit de l'exposant visé
σ = MAX_RELIEF_M / pic mesuré    l'échelle utilise tout le budget, sans écrêter
graine = première du balayage    dont la moyenne de surface tient sous ±2 m
```

Le contrat : **le critère vit dans le code et dans les tests**, la valeur vit
dans `calibration.json`. Changer un paramètre du générateur sans relancer la
calibration fait tomber la suite, au lieu de produire un terrain silencieusement
décalé sous son propre datum.

---

# Les décisions de conception

## Python pour le pipeline, TypeScript pour le viewer

Rupture assumée avec le monoculture TypeScript du dépôt. L'écosystème géomatique
*parle python* — rasterio, pyproj, shapely, whitebox — et c'est ce vocabulaire
qu'il s'agit d'acquérir. Réimplémenter GDAL en TypeScript n'apprendrait rien du
métier.

Le viewer reste en TypeScript parce que MapLibre est une bibliothèque
navigateur. Il a d'abord vécu en page autonome dans `geo/viewer/`, le temps
d'apprendre MapLibre sans déboguer en même temps du rendu serveur. Cette page a
été **supprimée** une fois le portage fait : deux implémentations du même style
n'auraient pas tenu longtemps identiques, et c'est précisément le style qui
porte les enseignements du chantier.

Le visualiseur vit donc dans `web/` :

| | |
|---|---|
| `src/lib/sig/` | ce qui se relit sans navigateur — contrat TileJSON, style, graticule, palette, éclairage, politique du relief |
| `src/components/sig/` | le cycle de vie et le branchement React ↔ MapLibre |
| `src/app/sig/` | la route, publique mais non annoncée |

Dans `src/lib/sig/`, chaque fichier porte sa propre justification en docstring —
ce tableau dit où chercher, il ne la répète pas.

| module | rôle | la décision qui le structure |
|---|---|---|
| `tilejson.ts` | le contrat, lu avant toute tuile | plage de zoom et emprises viennent du fichier, jamais du code |
| `mercator.ts` | adressage XYZ, repli de longitude | la grille ne référence **aucun** rayon |
| `graticule.ts` | parallèles et méridiens en GeoJSON | tracés par tronçons, et densifiés pour le drapé |
| `palette.ts` | teintes hypsométriques et opacité | la palette ignore le terrain — c'est la pièce qu'on remplace |
| `sun.ts` | éclairage direct et diffus | l'angle est un uniforme : on le recale sur le centre de la vue |
| `relief.ts` | seuil et rampe d'inclinaison du relief 3D | le seuil vient du défaut d'ombrage, pas de la lisibilité |
| `style.ts` | sources, couches et leurs portées | une couche coûte, une source non |

### Le montage des couches de relief

Deux montages, comparables à la bascule du panneau.

**Source unique** — une source couvrant tous les niveaux avec l'emprise globale.
Au-delà du partage et hors bande, elle réclame des tuiles qui n'existent pas :
MapLibre reçoit un 404 et retombe silencieusement sur l'ancêtre. Rendu correct,
seize requêtes perdues.

**Sources multiples** — quatre couches qui ne se recouvrent jamais :

| couche | emprise de source | portée de couche |
|---|---|---|
| monde global | globale, z ≤ partage | jusqu'au relais |
| monde nord | au-dessus de la bande | au-delà du relais |
| monde sud | en dessous de la bande | au-delà du relais |
| bande | bande, z > partage | au-delà du relais |

⚠️ **Deux emprises pour le hors-bande**, parce que `bounds` est une boîte et que
« partout sauf cette bande » ne s'écrit pas d'un seul rectangle. Mais c'est
`minzoom`/`maxzoom` **de couche** qui réalise l'exclusion en zoom, les bornes de
source ne découpant qu'en latitude.

⚠️ **Le relais se mesure en zoom de carte, pas en niveau de tuile.** Avec des
tuiles de 256 px, MapLibre sert `round(zoom + 1)` : le partager sur `split_zoom`
décalerait le relais d'un cran entier.



## Le tuileur est écrit à la main

`rio-rgbify` ferait le travail en une commande. La pyramide de tuiles, la
mathématique de Mercator et l'encodage terrain-RGB sont précisément ce qu'il
s'agit de comprendre — les déléguer reviendrait à sauter le chapitre.

Règle générale du chantier : **on délègue la plomberie, on implémente les
concepts.** GDAL produit les COG et reprojette ; le tuilage s'écrit.

La frontière s'est déplacée d'elle-même au Lot 3, et pas dans le sens prévu :
PROJ **refusant** un Mercator bâti sur le repère Étoile, la reprojection a dû
rentrer dans le tuileur sous forme de cartographie inverse. La plomberie qu'on
comptait déléguer n'existait pas.



## Le repère a ses pôles au point substellaire

Aeonir est en quasi-verrouillage gravitationnel. Un repère aligné sur l'axe de
rotation réel placerait la seule bande habitable — le terminateur — en travers
des méridiens, et la coupure de Web Mercator à ±85,05° amputerait deux régions
peuplées.

En plaçant les **pôles de projection au point substellaire et au point
antistellaire**, le terminateur devient l'équateur. Trois conséquences :

- **La latitude *est* l'angle d'élévation de l'étoile.** La table du gradient
  solaire de `rules/fr/univers/climat.md` devient littéralement une table de
  latitudes. L'identité est **exacte**, pas approchée — mesurée plus bas.
- **La bande habitable tombe où Mercator déforme le moins.** Le facteur d'échelle
  vaut 1/cos(lat) : **1,02** au bord de la bande habitable (−12°), 1,07 jusqu'au
  Linceul (−21°). Deux pour cent d'étirement sur toute la civilisation.
- **La coupure de Mercator ne coûte plus rien.** Elle retire deux calottes de
  **412 km de rayon** — (90° − 85,0511°) × π/180 × 4 775 km — centrées sur la
  roche vitrifiée de la Face Ardente et sur le Linceul. Les deux endroits où
  personne ne met les pieds.

C'est un **aspect oblique** : même cylindre, même formule, pôle déplacé. Rien
d'exotique — les grilles climatiques CORDEX et COSMO fonctionnent ainsi.



## La géographie qui en résulte

Les pôles fixés, deux paramètres restaient : où tombe la longitude zéro, et dans
quel sens comptent les latitudes.

### Latitude — l'identité est exacte

`lat' = 90° − distance angulaire au point substellaire`, c'est-à-dire l'élévation
de l'étoile au-dessus de l'horizon, **positive vers la Face Ardente**. Vérifié
sur dix points répartis : écart maximal **5 × 10⁻¹⁴ degré**, la précision
machine. Aucune constante d'ajustement — `+o_lat_p=0` avec le point substellaire
en pôle nord tourné produit l'identité par construction.

Mais **la latitude ne suffit pas à dire le climat** — voir la section suivante.
Elle dit l'insolation, ce qui n'est pas la même chose.

| `lat'` | Distance | Levant — la terre monte | Couchant — la terre descend |
|---:|---:|---|---|
| +6° | +500 km | **Mur des Tempêtes** — sortie | **Front du Couchant** — entrée |
| +3° | +250 km | Savane aride | *entrée, selon l'hygrométrie* |
| **0°** | **0** | **Cœur tempéré — cités** | **Cœur tempéré — cités** |
| −3° | −250 km | Jungle Indigo | Jungle Indigo |
| −6° | −500 km | Steppes crépusculaires | Steppes crépusculaires |
| −12° | −1 000 km | Zone d'absorption | *non nommé par le vault* |
| −18° | −1 500 km | **Front du Levant** — entrée | *descente vers le Linceul* |
| −21° | −1 750 km | *encore sous la glace* | **Le Linceul** — sortie |

**Le zéro n'est pas au centre de la bande, et c'est voulu.** `lat' = 0` est la
surface où l'étoile rase l'horizon, définie physiquement — c'est ce que doit être
l'origine d'un CRS géographique. Décaler le datum ferait de `lat'` une grandeur
sans signification et mettrait une constante magique dans chaque formule
d'insolation.

Le centrage d'une feuille est un **paramètre de projection** : les cartes locales
porteront un `+lat_0` adapté. C'est exactement à cela que sert ce paramètre.

### Longitude — origine au pôle Nord géographique

`+o_lon_p = 0` place le pôle Nord géographique à `lon' = 0`, et le pôle Sud à
`lon' = 180`.

La propriété qui décide du choix : **cette origine ne dérive jamais.** Mesuré sur
six époques réparties sur une rotation complète, les deux pôles géographiques
restent exactement à `lat' = 0`, `lon' = 0` et `180`. Logique après coup —
`+lon_0` fait tourner autour de l'axe polaire de la Croûte, dont les pôles sont
les points fixes. Un lieu polaire garde donc sa longitude Étoile pendant les
56 ans de rotation, sans aucun recalage entre deux époques.

### Levant et Couchant sont des longitudes

La table du gradient solaire laisse croire le contraire en listant un « Front du
Couchant » à −18°, comme s'il s'agissait d'un parallèle. Or un parallèle ceinture
toute la planète : le même −18° est la sortie des glaces d'un côté du monde, et
l'enfoncement vers le Linceul de l'autre.

| Demi-terminateur | Longitudes Étoile | Sens | Entrée | Sortie |
|---|---|---|---|---|
| **Levant** | `lon' ∈ (−180, 0)` | la terre **monte** | Front du Levant, −18° | Mur des Tempêtes, +6° |
| **Couchant** | `lon' ∈ (0, 180)` | la terre **descend** | Front du Couchant, +3 à +6° | Le Linceul, −21° |

**Les deux moitiés ne sont pas symétriques**, et c'est le point qui structure
toute la carte des biomes. On émerge des glaces à −18° côté Levant, on y
retourne à −21° côté Couchant : trois degrés d'écart, soit **250 km**. C'est une
**hystérésis**, physiquement banale — le seuil de dégel n'est jamais celui du
gel.

La cause du Mur des Tempêtes l'explique. Ce sont les mers et les nappes d'une
terre *qui vient de traverser la zone tempérée* qui s'évaporent d'un coup. Une
terre qui émerge de la face brûlante côté Couchant est déjà sèche : pas de mur
d'orages, seulement un front dont la position dépend de l'humidité résiduelle du
terrain — d'où une plage de +3 à +6° et non un seuil.

> **Le climat n'est donc pas `f(lat')`, mais `f(lat', hémisphère)`.**
> L'insolation, elle, reste bien une fonction de la seule latitude. Mais à −20°,
> le Levant garde ses terres sous la glace pendant que le Couchant y voit l'azote
> se solidifier. La distinction Levant/Couchant cesse d'être du vocabulaire pour
> devenir **un axe de la classification raster** du Lot 2.

Il en découle aussi que **les pôles géographiques, à `lon' = 0` et `180`, sont la
charnière entre les deux moitiés** — géométriquement obligatoire, la vitesse de
la croûte y étant nulle. Les civilisations polaires vivent au seul endroit du
monde où la terre ne se lève ni ne se couche.



## Il faut deux référentiels, pas un

L'axe de rotation d'Aeonir est perpendiculaire au plan orbital et le point
substellaire est sur l'équateur réel : **les pôles géographiques se trouvent donc
sur le cercle du terminateur**. Le lore est cohérent avec cette géométrie — les
deux civilisations polaires voient l'étoile à ±3° d'élévation, soit la bande
tempérée.

Mais la croûte tourne sous le climat : 71 ans pour que le terminateur parcoure
1 500 km à l'équateur. D'où deux référentiels distincts :

| Référentiel | Fixé à | Ce qui y vit |
|---|---|---|
| **Aeonir-Croûte** | la planète | relief, fleuves, villes bâties, **anticyclones polaires**, vents méridiens |
| **Aeonir-Étoile** | l'étoile | terminateur, insolation, biomes |

La transformation entre eux est **une rotation dépendant de l'époque**. Ce n'est
pas une bizarrerie de monde inventé : c'est le problème de l'ITRF sur Terre, où
les coordonnées sont datées parce que les plaques bougent.

### Le climat n'est pas une fonction de la seule latitude Étoile

L'insolation l'est — c'est l'identité `lat' = élévation`. Mais la stabilité des
pôles vient des **anticyclones de subsidence** : `climat.md` est explicite, le
dôme d'air subsident repousse les perturbations du Terminateur, et « c'est cette
barrière invisible qui rend possible l'existence de cités sédentaires ». Ce sont
eux, et non la géométrie, qui donnent aux pôles leur température et leur humidité
stables.

Or ces anticyclones sont ancrés sur l'axe de **rotation** — donc dans le repère
Croûte, à une latitude géographique β, pas à une latitude Étoile.

### Ce que le lore établit, et ce que le modèle en déduit

La frontière entre les deux doit rester lisible, sous peine de faire passer un
calcul pour un fait du monde.

**Établi par le lore.** Les durées de traversée du terminateur — 71 ans à
l'équateur, 100 ans à 45°, 140 ans à 60° — varient en `1/cos β` et divergent au
pôle : la croûte y est immobile par rapport au terminateur. Les pôles
géographiques ne quittent donc jamais la bande, aux ±3° d'inclinaison près qui
produisent les jours et nuits polaires. La stabilité qui rend les cités possibles
est **atmosphérique** — les anticyclones de subsidence — et l'asymétrie entre les
deux pôles est **orbitale**.

**Déduit par le modèle, absent du lore.** Dans le repère Étoile, **aucun lieu de
la croûte n'est immobile**, pas même le pôle. Deux effets se superposent :

- la **rotation** (56,75 ans) fait osciller la latitude Étoile de `±(90° − β)` ;
- l'**inclinaison de 3°**, portée par l'orbite (54,5 ans), ajoute `±3°`.

Mesuré sur 3 000 ans, les deux s'additionnent exactement :

| β | Amplitude de `lat'` |
|---:|---:|
| 90° — pôle exact | ±3° |
| 87° | ±6° |
| 84° | ±9° |
| 80° | ±13° |

**Le pôle géographique exact n'est pas fixe non plus** : sa latitude Étoile suit
la déclinaison du point substellaire, entre −3° et +3°. C'est exactement le jour
et la nuit polaires. Il ne serait fixe que si l'inclinaison était nulle.

En prenant le Mur des Tempêtes (+6°) pour limite franche, la calotte qui ne le
franchit jamais est `β ≥ 87°`, soit **250 km de rayon** — la moitié de ce qu'on
obtient en négligeant l'inclinaison. Mais le maillon faible reste le seuil : rien
ne dit qu'une cité doive ne *jamais* dépasser +6° plutôt que le tolérer quelques
années, ou être évacuée. **La calotte n'est pas une frontière de peuplement.** Ce
qui sert au Lot 2, c'est la fonction `lat'(β, λ, t)` elle-même.

> **Les deux horloges battent.** 56,75 et 54,5 ans donnent un battement de
> **~1 375 ans**. Un lieu proche du pôle ne retrouve son climat exact ni au bout
> d'une rotation, ni au bout d'une orbite, mais au bout du battement. L'histoire
> climatique d'un pixel a donc une période millénaire — ce qui conditionne la
> durée qu'il faudra simuler au Lot 2.

> **Conséquence pour le Lot 2** — toute carte climatique se calcule dans les
> **deux repères à la fois** : insolation en `f(lat')`, subsidence polaire et
> vents méridiens en `f(β)`. Les deux référentiels ne sont pas un raffinement de
> présentation, ils sont porteurs du modèle.



## Aeonir est une sphère — exactement, pas approximativement

Le premier réflexe serait de traiter la sphère comme un pis-aller faute de donnée
sur l'aplatissement. C'est l'inverse.

### L'obstruction géodésique

Si Aeonir était aplatie aux pôles géographiques, ceux-ci se trouveraient — on
vient de le voir — **sur l'équateur du repère Étoile**. L'axe de symétrie de
l'ellipsoïde serait couché dans le plan équatorial du repère, et le rayon
dépendrait alors de la latitude *et* de la longitude :

```
cos θ = cos φ′ · cos λ′        θ = angle à l'axe de symétrie
```

| Lieu | φ′, λ′ | θ | Rayon |
|---|---|---|---|
| Points substellaire et antistellaire (**pôles du repère**) | ±90°, — | 90° | équatorial, renflé |
| Pôles géographiques réels (**sur l'équateur du repère**) | 0°, 0° et 180° | 0° | polaire, aplati |
| Méridien λ′ = ±90° (= l'équateur géographique) | —, ±90° | 90° partout | cercle parfait |

Toute la machinerie géodésique — latitude isométrique, latitude conforme, arc de
méridien, solveurs de géodésiques — repose sur `rayon = f(latitude)` seule. La
séparation des variables serait perdue.

**PROJ ne sait pas le faire, et personne ne sait le faire.** Les corps réellement
triaxiaux (Phobos, Vesta) restent un point douloureux de toute la pile SIG. Voir
les mesures plus bas.

### La physique dissout le problème

L'aplatissement vient de la rotation. Aeonir tourne en **56 ans et 9 mois**.

| Source | Paramètre | Amplitude |
|---|---:|---:|
| Rotation | f = 1,0 × 10⁻¹¹ | 0,048 mm |
| Marée (verrouillage synchrone, 17,5 UA) | q = 8,7 × 10⁻¹² | 0,041 mm |
| **Total** | | **≈ 0,09 mm** |

Quatre-vingt-dix microns sur un rayon de 4 775 km. Le même calcul appliqué à la
Terre donne f = 1/231 contre 1/298 réel — le modèle fluide homogène surestime
d'un tiers parce que la Terre est centralement condensée, mais l'ordre de
grandeur est validé. Même à un facteur dix près, Aeonir reste sous le dixième de
millimètre.

**Une rotation de 56 ans ne peut pas soulever de bourrelet.** La sphère est la
forme exacte, et `ob_tran` — qui est sphérique par construction — travaille sur
précisément la forme qu'Aeonir possède. L'obstruction identifiée plus haut ne
nous touche jamais.

C'est d'ailleurs la pratique de l'UAI pour la quasi-totalité des corps
planétaires, Mars étant l'exception notable avec un vrai ellipsoïde aplati.



## Le mensonge de rayon vit à un seul endroit

MapLibre est câblé sur Web Mercator et un rayon terrestre. Aeonir fait 4 775 km
contre 6 378 km, soit un rapport de **0,7486**.

Comme longitude et latitude sont des **angles**, la pyramide de tuiles fonctionne
inchangée. Seules les grandeurs métriques mentent. D'où l'arbitrage :

- Le **COG conserve les altitudes vraies en mètres** — c'est la donnée d'analyse,
  celle sur laquelle tourne l'hydrologie.
- Le relief 3D le corrige par `terrain.exaggeration = 1.336` (= 6378/4775), qui
  restitue la proportion angulaire correcte à l'écran.

⚠️ **Il a longtemps été écrit ici que le mensonge tenait à ce seul paramètre.
C'est faux, et mesuré.** L'ombrage est un second consommateur du même MNT, et il
porte le même mensonge sans correctif : la circonférence terrestre est **en dur**
dans le nuanceur de préparation de MapLibre, sous la forme de la constante
`28.2562 = log₂(8 × 40 075 016,7)` — vérifiée à 0,1 ppm sur sept niveaux de
tuiles. Toute pente y est donc sous-estimée de 1,3357, exactement le facteur que
le relief 3D corrige.

Et la correction est **inapplicable** : `hillshade-exaggeration` plafonne à 1
dans la spec. Sans conséquence visible, cependant — un facteur constant sur une
grandeur qui n'a pas de référence absolue ne se voit pas. Le détail, et le
second terme bien plus visible qui l'accompagne, sont au piège n° 32 du
[TUTORIAL](TUTORIAL.md).

Une seule vérité, deux endroits où elle est déformée, un seul corrigible — et
c'est écrit.



## Deux types de carte, un seul datum

**A — globale, centrée sur un pôle géographique.** Axe horizontal `lon'`, axe
vertical `lat'`. Le terminateur est la ligne médiane, le pôle Nord au centre, le
Levant et le Couchant aux tiers, le pôle Sud coupé aux deux bords, la Face
Ardente en haut et la Face Obscure en bas. Version centrée sud : `+o_lon_p=180`,
un seul paramètre change.

Avertissement : en Web Mercator, la bande habitable n'occupe que **7,6 % de la
hauteur** de la carte — 15 % en équirectangulaire. MapLibre ne sachant faire que
du Mercator, le viewer s'ouvrira sur une carte dont l'essentiel est du désert
vitrifié dilaté. Correctif : `maxBounds` et `fitBounds` sur la bande à
l'initialisation.

**B — locale, dans l'esprit de la carte dessinée.** Axes échangés, gradient
climatique lu de gauche à droite, du chaud vers le froid.

> **C'est un choix de projection, pas un nouveau datum.** On garde deux CRS
> géographiques — Croûte et Étoile — et on dérive autant de CRS *projetés* que de
> types de feuille. Multiplier les datums est ce qui rend un SIG ingérable ;
> multiplier les projections est le fonctionnement normal.

Pour une feuille imprimée, une projection en aspect transverse dérivée du repère
Étoile, avec `+lat_0=-3` pour centrer la bande. Pour le viewer, beaucoup plus
simple : **`bearing: 90`** fait tourner la vue de MapLibre à l'écran. Près de
l'équateur, où le facteur d'échelle vaut 1,02, c'est indiscernable d'une vraie
projection tournée — et cela évite une seconde pyramide de tuiles.

---


---


# Ce qui reste ouvert

| # | Décision | État |
|---|---|---|
| 1 | **Forme du corps** — sphère de 4 775 km, exacte et non approchée | ✅ |
| 2 | **Origine des longitudes** — pôle Nord géographique à `lon' = 0` | ✅ |
| 3 | **Latitudes** — `lat'` = élévation de l'étoile, positive vers la Face Ardente | ✅ |
| 4 | **Déclaration des CRS** — autorité `AEONIR`, WKT2, ordre d'axes ISO | ✅ |
| 5 | **Époque** — origine au périhélie, unité l'année, `λₛ(0) = 0` | ✅ |
| 6 | **Zéro altimétrique** — la sphère de référence elle-même | ✅ |
| 7 | **Grille du MNT** — `W = 2^z·T`, z=6, T=256, repère Croûte | ✅ |

Toutes figées dans `aeonir_gis/` et verrouillées par `tests/`.

## Point 6 — le zéro est la sphère

`climat.md` est explicite : « il n'existe pas d'océan global ». Pas de niveau de
la mer, donc. Retenu : `altitude = distance au centre − 4 775 000 m`.

**Parce que c'est stable.** Un zéro calé sur la moyenne du terrain généré
bougerait à chaque régénération : le datum dépendrait de la donnée, l'inverse de
ce qu'un datum doit être.

**Et parce que le géoïde *est* l'ellipsoïde.** Sur Terre, la séparation
géoïde/ellipsoïde atteint ±100 m, d'où la distinction entre hauteur ellipsoïdale
et altitude orthométrique et tout un modèle de conversion. Sur Aeonir, la
déformation du corps vaut 0,09 mm : les deux se confondent. **Une seule échelle
d'altitude, aucun modèle de séparation.**

> Choix de modèle, pas fait démontré : les ondulations du géoïde terrestre
> viennent surtout des anomalies de densité du manteau, qu'on ne modélise pas. On
> *déclare* que le géoïde est la sphère.

Le générateur du Lot 1 sera écrit **à moyenne nulle par construction** : le
terrain enjambe la sphère sans qu'on ait à le recentrer après coup.

### Ce que la gravité impose au relief

La densité d'Aeonir vaut celle de la Terre à **0,1 % près** — 0,42 M⊕ pour
0,7486 R⊕, vérifié par un test. Or `g ∝ ρR`, donc à densité égale le rapport de
pesanteur **est** le rapport des rayons.

Le même **1,336** gouverne donc deux choses sans rapport apparent : l'exagération
du relief à l'écran, et la hauteur maximale d'un pic — une montagne limitée par
`σ/(ρg)` monte 1,336 fois plus haut. D'où `MAX_RELIEF_M = 11 800 m`, l'Everest
transposé. `astronomie.md` énonce déjà la même loi pour la végétation.

### Ce qui a décidé l'encodage des tuiles

Contrôle inattendu du datum : le plancher de l'encodage **Mapbox est à
−10 000 m**, alors que le relief peut descendre à −11 800. Il écrêterait les
bassins profonds en silence — et sa plage est très asymétrique, puisque son
plafond monte à 1 667 km.

L'encodage **terrarium** couvre ±32 768 m avec un pas de 4 mm contre 10 cm. C'est
lui qui est retenu, et un test garde la contrainte.

## Les identités déclarées

| SRID | Nom | Nature |
|---|---|---|
| `AEONIR:1` | Aeonir Crust | géographique, fixé à la planète |
| `AEONIR:2` | Aeonir Star | géographique dérivé, fixé à l'étoile, daté |
| `AEONIR:3` | Aeonir Mercator | projeté, mètres — pour l'analyse métrique |

**On ne squatte aucun code EPSG.** Il circule des conventions consistant à
prendre un code libre dans les 9xxxxx : c'est une mauvaise habitude, le registre
évoluant. L'espace de noms `AEONIR` est à nous.

## Point 5 — il y a deux horloges, pas une

| Horloge | Période | Ce qu'elle pilote |
|---|---|---|
| **Rotation** | 56 ans 9 mois | `λₛ`, la position du terminateur sur la croûte — donc `+lon_0` |
| **Orbite** | 54 ans ½ | l'inclinaison ±3° (jours et nuits polaires de 27 ans) et le flux via l'excentricité 0,20 |

Le jour polaire, la nuit polaire et toute l'asymétrie Nord/Sud sont **orbitaux**,
pas rotationnels. Une époque ne peut donc pas se réduire à `λₛ(t)` : il faut
aussi la phase orbitale, sans quoi on perd exactement ce qui distingue le Peuple
des Pluies du Peuple des Neiges.

Mise en garde : les 1 414 ans du jour solaire sont le **battement** entre les deux
périodes, et ce battement est extrêmement sensible aux arrondis — 54,5 ans
donnent 1 375 ans, 54,56 ans donnent 1 414. Ce chiffre ne peut pas servir de
contrôle de cohérence, seulement d'ordre de grandeur.

---

## Source de vérité

Les constantes physiques viennent de `rules/fr/univers/astronomie.md` et
`rules/fr/univers/climat.md`. Elles ne seront recopiées nulle part : un module
unique les portera, et tout le reste s'y réfèrera.

---


---


# Contrôles du modèle contre le lore

Le pipeline n'a pas à croire le lore sur parole : là où le texte donne des
chiffres, le modèle géométrique doit les retrouver. Trois contrôles passés.

## Deux largeurs, qui ne mesurent pas la même chose

J'avais d'abord écrit que les 1 500 km du lore valaient exactement la plage
`−12° → +6°`, en « cohérence vérifiée ». C'était une **coïncidence arithmétique
promue en fait** — le même travers que la calotte polaire. Le −12° n'a aucun
statut particulier.

La structure réelle distingue deux grandeurs :

| | Étendue | Largeur |
|---|---|---:|
| **Franchissable**, Levant | −18° → +6° | 24° = 2 000 km |
| **Franchissable**, Couchant | +4,5° → −21° | 25,5° = 2 125 km |
| **Habitée et explorée** | bornes non fixées par le lore | ~**1 500 km** |

Les extrémités sont traversées mais pas peuplées : trop hostiles. Les 1 500 km
sont un ordre de grandeur pour le cœur habité — et c'est bien cette largeur-là
qu'`climat.md` utilise pour ses durées de traversée, « soixante et onze ans à
l'équateur pour franchir les mille cinq cents kilomètres ».

Le pipeline encode les quatre seuils, qui sont des données sûres, et la largeur
habitée comme ordre de grandeur. **Il n'invente pas les bornes en latitude du
cœur habité**, que le lore ne donne pas.

## Les durées de traversée — et l'horloge qu'il ne faut pas confondre

Le terminateur **ne se déplace pas à la vitesse de rotation**. Sur un monde
quasi-verrouillé, rotation et orbite ne diffèrent que de 4 %, et c'est cet écart
qui promène le point substellaire autour de la croûte : la période est le **jour
solaire**, ~1 375 ans, pas les 56,75 ans de la rotation sidérale.

Confondre les deux donne un terminateur **vingt-cinq fois trop rapide** — la
zone habitée franchie en 2,8 ans au lieu de 71. C'est l'erreur que le pipeline a
faite avant correction, et un test la garde fermée.

Avec la bonne horloge, la vitesse à l'équateur vaut 21,8 km/an, modulée par
`cos β` puisque la croûte tourne moins vite aux hautes latitudes :

| Latitude géographique | Modèle | `climat.md` |
|---|---:|---:|
| 0° | 68,7 ans | 71 ans |
| 45° | 97,2 ans | 100 ans |
| 60° | 137,4 ans | 140 ans |

Les trois valeurs sortent du jour solaire et des 1 500 km, sans qu'on ait fourni
ni la loi en `1/cos β` ni aucune des durées. L'écart de 3 % est exactement celui
qui sépare notre jour solaire de 1 375 ans des 1 414 du vault — une différence
d'arrondi sur la période orbitale.

## Les étés polaires

Tout le tableau d'asymétrie de `climat.md` se reconstruit depuis Kepler avec
**deux entrées seulement** : périhélie 14 UA, aphélie 21 UA.

| | Modèle | `climat.md` |
|---|---:|---:|
| Excentricité | 0,2000 | 0,20 |
| Été du Nord (périhélie) | 20,4 ans | 20,4 ans |
| Été du Sud (aphélie) | 34,1 ans | 34,2 ans |
| Flux au solstice, Nord / Sud | 1,56 / 0,69 F₀ | 1,56 / 0,69 F₀ |
| Flux moyen, Nord / Sud | 1,37 / 0,81 F₀ | 1,37 / 0,82 F₀ |

Et l'affirmation la plus contre-intuitive du texte se vérifie exactement :

```
Nord    20,4 ans × 1,366 F₀ = 27,81 F₀·an
Sud     34,1 ans × 0,815 F₀ = 27,81 F₀·an
```

Énergie totale identique aux quatre chiffres significatifs — l'analogie du
chalumeau et de la bougie est littéralement exacte, pas seulement imagée.

Contrôle indépendant : en modélisant la **déclinaison** du point substellaire,
`δ(t) = 3° × cos(ν(t))`, et en comptant les années où `δ > 0`, on retrouve
20,4 ans de jour polaire Nord et 34,1 de nuit. Deux routes distinctes — l'angle
balayé de Kepler, et le signe de la déclinaison — donnent le même résultat.

Bénéfice pour le Lot 2 : `flux(pôle, phase orbitale)` est entièrement déterminé,
sans paramètre libre.

---


---


# Références

Vérifiées, pas citées de mémoire.

**Pavages sphériques — le vocabulaire DGGS**

- [OGC — Discrete Global Grid Systems](https://www.ogc.org/standard/dggs/) —
  Topic 21 (`20-040r3`) pour l'abstrait, *OGC API - DGGS Part 1: Core*
  (`21-038r1`) pour l'API.
- [HEALPix](https://healpix.sourceforge.io/), le pavage équi-aire de
  l'astronomie, et son implémentation
  [`+proj=healpix`](https://proj.org/en/stable/operations/projections/healpix.html)
  avec sa variante `rhealpix` hiérarchique.
- [`+proj=qsc`](https://proj.org/en/stable/operations/projections/qsc.html) —
  *quadrilateralized spherical cube*, le cube map côté SIG.
- [H3](https://h3geo.org/docs/) (Uber, hexagones) et
  [S2](https://s2geometry.io/) (Google, quadtree sur le cube).

**Le pavage qu'on utilise vraiment — la pyramide de tuiles**

- [OGC Two Dimensional Tile Matrix Set 2.0](https://www.ogc.org/standard/tms/)
  (`17-083r4`) — la formalisation de ce que tout le monde appelle « XYZ ».
  Le registre contient `WebMercatorQuad`, `WorldCRS84Quad`,
  `WorldMercatorWGS84Quad`, `WGS1984Quad`, `UPSArcticWGS84Quad`,
  `UPSAntarcticWGS84Quad`, `EuropeanETRS89_LAEAQuad`, `UTM31WGS84Quad`,
  `CanadianNAD83_LCC`, `GNOSISGlobalGrid`, `CDB1GlobalGrid`.
- [Slippy map tilenames](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames)
  — l'article canonique, formules et code.
- [WMTS](https://www.ogc.org/standard/wmts/) — l'ancêtre orienté service, encore
  vivant côté IGN.

**Encodages et conteneurs**

- [Terrarium](https://github.com/tilezen/joerd/blob/master/docs/formats.md) — la
  doc d'origine. Formule vérifiée : `(R·256 + G + B/256) − 32768`. Le `−32768`
  est exactement notre `NODATA` : un pixel noir décode en plancher, d'où
  l'absence de cas particulier au tuilage.
- [Mapbox Terrain-RGB](https://docs.mapbox.com/data/tilesets/guides/access-elevation-data/)
  — l'autre encodage, écarté pour son plancher à −10 000 m.
- [PMTiles](https://github.com/protomaps/PMTiles),
  [MBTiles](https://github.com/mapbox/mbtiles-spec),
  [Mapbox Vector Tile](https://github.com/mapbox/vector-tile-spec),
  [COG](https://cogeo.org/).

**PROJ** — [proj.org](https://proj.org/). Navigation utile : *Operations →
Projections → `<nom>`* pour une projection, *Usage → Ellipsoids* pour la forme.
