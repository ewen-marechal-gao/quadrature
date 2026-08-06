# `geo/` — SIG d'Aeonir

Chaîne géomatique complète sur un monde inventé : définition d'un référentiel,
génération d'un modèle numérique de terrain, analyse hydrologique, tuilage,
rendu 3D dans un navigateur.

La génération procédurale du relief n'est **pas** l'objet du chantier — elle n'en
est que la source de données. L'objet, c'est le pipeline qui l'entoure.

Le vocabulaire du domaine est consigné dans [GLOSSAIRE.md](GLOSSAIRE.md).
Ce fichier-ci consigne les **décisions et leur justification**.

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

## Structure

```
geo/
  aeonir_gis/     code du pipeline
  tests/          suite pytest
  out/            produits générés (gitignoré)
```

Tout produit vit dans `out/` et n'est jamais versionné : le MNT global pèse
plusieurs centaines de mégaoctets, les pyramides de tuiles davantage. La
reproductibilité est assurée par le code, pas par le stockage.

## Lots

| Lot | Contenu | État |
|---|---|---|
| **0** | Référentiels Croûte et Étoile, rotation datée entre eux | en cours |
| **1** | MNT global — fBm échantillonné en 3D sur la sphère → GeoTIFF → COG | |
| **2** | Hydrologie — comblement, D8, accumulation pondérée, réseau, bassins → GeoPackage | |
| **3** | Tuileur maison — pyramide XYZ, terrain-RGB, empaquetage PMTiles | |
| **4** | Viewer MapLibre — style spec, `hillshade`, `terrain`, projection globe | |
| **5** | Tuiles vectorielles MVT — fleuves, lacs, biomes | |

---

# Les décisions

## Python pour le pipeline, TypeScript pour le viewer

Rupture assumée avec le monoculture TypeScript du dépôt. L'écosystème géomatique
*parle python* — rasterio, pyproj, shapely, whitebox — et c'est ce vocabulaire
qu'il s'agit d'acquérir. Réimplémenter GDAL en TypeScript n'apprendrait rien du
métier.

Le viewer reste en TypeScript parce que MapLibre est une bibliothèque navigateur.
Il vivra d'abord en application Vite autonome dans `geo/viewer/`, et ne sera
porté en route du site qu'une fois fonctionnel : le Next.js de `web/` a des
particularités documentées dans son `AGENTS.md`, et déboguer du rendu serveur
pendant qu'on apprend MapLibre est une mauvaise dépense.

## Le tuileur est écrit à la main

`rio-rgbify` ferait le travail en une commande. La pyramide de tuiles, la
mathématique de Mercator et l'encodage terrain-RGB sont précisément ce qu'il
s'agit de comprendre — les déléguer reviendrait à sauter le chapitre.

Règle générale du chantier : **on délègue la plomberie, on implémente les
concepts.** GDAL produit les COG et reprojette ; le tuilage s'écrit.

## Le repère a ses pôles au point substellaire

Aeonir est en quasi-verrouillage gravitationnel. Un repère aligné sur l'axe de
rotation réel placerait la seule bande habitable — le terminateur — en travers
des méridiens, et la coupure de Web Mercator à ±85,05° amputerait deux régions
peuplées.

En plaçant les **pôles de projection au point substellaire et au point
antistellaire**, le terminateur devient l'équateur. Trois conséquences :

- **La latitude *est* l'angle d'élévation de l'étoile.** La table du gradient
  solaire de `rules/fr/univers/climat.md` (−21° Linceul → +6° Mur des Tempêtes)
  devient littéralement une table de latitudes. L'insolation se calcule en
  `f(lat)`, les biomes deviennent des bandes horizontales.
- **La bande habitable tombe où Mercator déforme le moins.** À ±18°, le facteur
  d'échelle vaut 1/cos(18°) = **1,05**. Cinq pour cent d'étirement sur toute la
  civilisation.
- **La coupure de Mercator ne coûte plus rien.** Elle retire deux calottes de
  **412 km de rayon** — (90° − 85,0511°) × π/180 × 4 775 km — centrées sur la
  roche vitrifiée de la Face Ardente et sur le Linceul. Les deux endroits où
  personne ne met les pieds.

C'est un **aspect oblique** : même cylindre, même formule, pôle déplacé. Rien
d'exotique — les grilles climatiques CORDEX et COSMO fonctionnent ainsi.

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
| **Aeonir-Croûte** | la planète | relief, fleuves, villes bâties |
| **Aeonir-Étoile** | l'étoile | terminateur, climat, biomes, insolation |

La transformation entre eux est **une rotation dépendant de l'époque**. Ce n'est
pas une bizarrerie de monde inventé : c'est le problème de l'ITRF sur Terre, où
les coordonnées sont datées parce que les plaques bougent.

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

> **Vérification annexe** — les 14 et 21 UA du lore donnent un demi-grand axe de
> 17,5 UA et une excentricité de **0,20**, exactement la valeur annoncée dans
> `climat.md`. Le lore est numériquement cohérent avec lui-même.

## PMTiles plutôt que MBTiles

Le site Quadrature est un export statique déployé par GitHub Actions. MBTiles est
une base SQLite : il faudrait un serveur de tuiles. PMTiles porte son index en
interne et se lit par **requêtes HTTP Range** — le navigateur récupère directement
les octets d'un fichier posé sur un hébergement statique.

## Le mensonge de rayon vit à un seul endroit

MapLibre est câblé sur Web Mercator et un rayon terrestre. Aeonir fait 4 775 km
contre 6 378 km, soit un rapport de **0,7486**.

Comme longitude et latitude sont des **angles**, la pyramide de tuiles fonctionne
inchangée. Seules les grandeurs métriques mentent. D'où l'arbitrage :

- Le **COG conserve les altitudes vraies en mètres** — c'est la donnée d'analyse,
  celle sur laquelle tourne l'hydrologie.
- Le mensonge est confiné à **un unique paramètre de style**,
  `terrain.exaggeration = 1.336` (= 6378/4775), qui restitue la proportion
  angulaire correcte à l'écran.

Une seule vérité, un seul endroit où elle est déformée, documenté.

---

# PROJ : les commandes, paramètre par paramètre

Documentation de référence : **[proj.org](https://proj.org/)**. La navigation
utile est *Operations → Projections → `<nom>`* pour une projection donnée, et
*Usage → Ellipsoids* pour les paramètres de forme.

## Paramètres communs à toutes les projections

*Réf. [Usage → Projections](https://proj.org/en/stable/usage/projections.html)*

| Paramètre | Rôle |
|---|---|
| `+proj=` | nom de la projection. `longlat` signifie « pas de projection », coordonnées géographiques |
| `+lon_0=` | méridien central, en degrés. PROJ le **soustrait** de la longitude d'entrée avant tout calcul |
| `+lat_0=` | parallèle d'origine |
| `+x_0=` `+y_0=` | *false easting* / *false northing*, en mètres — décalage pour éviter les coordonnées négatives |
| `+k_0=` (ou `+k=`) | facteur d'échelle au point d'origine |
| `+units=` | unité linéaire de sortie, `m` par défaut |
| `+no_defs` | n'applique aucune valeur par défaut issue des fichiers de définition. Vestige historique, inoffensif |
| `+type=crs` | déclare que la chaîne décrit un **CRS** et non une simple opération. Nécessaire pour `CRS.from_proj4()` |

## Paramètres de forme

*Réf. [Usage → Ellipsoids](https://proj.org/en/stable/usage/ellipsoids.html)*

| Paramètre | Rôle |
|---|---|
| `+ellps=` | ellipsoïde nommé du catalogue — `WGS84`, `GRS80`, `clrk66`… |
| `+a=` | demi-grand axe (équatorial), en mètres |
| `+b=` | demi-petit axe (polaire), en mètres |
| `+f=` | aplatissement, `(a−b)/a` |
| `+rf=` | aplatissement **inverse**, `a/(a−b)` — la forme sous laquelle il est habituellement publié (298,257 pour WGS84) |
| `+R=` | **rayon d'une sphère.** Forme idiomatique quand `a = b` |

Pour Aeonir, les deux écritures sont équivalentes ; `+R` est préférée car elle
énonce l'intention :

```
+R=4775000                      ← retenu
+a=4775000 +b=4775000           ← équivalent
```

En WKT, cela s'écrit `ELLIPSOID["Aeonir", 4775000, 0]` — le second nombre est
l'aplatissement inverse, et **zéro y signifie sphère**, par convention.

> **Piège vérifié** — PROJ **ignore silencieusement les paramètres inconnus**.
> `+c=6300000`, `+axis_rot=45` et même `+ceci_nexiste_pas=42` sont acceptés sans
> broncher et sans effet. Une chaîne `+proj=` qui ne lève pas d'erreur ne prouve
> **rien** sur ce qu'elle fait. Toujours vérifier le résultat, jamais la syntaxe.

## `ob_tran` — la transformation oblique

*Réf. [Operations → Projections →
ob_tran](https://proj.org/en/stable/operations/projections/ob_tran.html)*

C'est l'opération qui déplace le pôle. Elle applique une rotation sphérique aux
coordonnées, puis exécute une projection ordinaire dans le repère tourné.

| Paramètre | Rôle |
|---|---|
| `+o_proj=` | la projection à appliquer **après** rotation — `eqc`, `merc`, `longlat`… |
| `+o_lat_p=` | latitude du pôle tourné |
| `+o_lon_p=` | **origine des longitudes** du repère tourné (voir mesure ci-dessous) |
| `+lon_0=` | fixe la **longitude** du pôle tourné |

Deux paramétrages alternatifs existent pour définir la rotation autrement :
`+o_alpha` avec `+o_lon_c`/`+o_lat_c` (par azimut), ou `+o_lon_1`/`+o_lat_1` avec
`+o_lon_2`/`+o_lat_2` (par deux points).

### Sémantique mesurée, pas recopiée

La convention de pôle d'`ob_tran` est ambiguë selon les communautés. Voici ce
que PROJ 9.5.1 fait réellement, mesuré avec `+o_lat_p=0` (la configuration
d'Aeonir) :

```
o_lat_p  o_lon_p  lon_0 |  pôle Nord géo.  |  pôle nord tourné
      0        0      0 | lat'=0  lon'=  0 | (180, 0)  → lat'= 90
      0       45      0 | lat'=0  lon'= 45 | (180, 0)  → lat'= 90
      0       90      0 | lat'=0  lon'= 90 | (180, 0)  → lat'= 90
      0      -90      0 | lat'=0  lon'=-90 | (180, 0)  → lat'= 90
      0        0     45 | lat'=0  lon'=  0 | (180, 0)  → lat'= 45
```

Trois enseignements :

1. **`+o_lon_p` ne déplace pas le pôle.** Il fait tourner le repère *autour* de
   l'axe polaire, c'est-à-dire qu'il choisit où tombe `lon' = 0`. Avec
   `o_lon_p=0`, le pôle Nord géographique reçoit `lon' = 0`.
2. **`+lon_0` déplace le pôle.** Le pôle nord tourné se trouve au point
   d'entrée de longitude `180 + lon_0`, latitude `o_lat_p`.
3. **Avec `o_lat_p = 0`, les pôles géographiques réels atterrissent sur
   l'équateur tourné** (`lat' = 0`). C'est exactement la géométrie d'Aeonir, et
   elle sort du paramétrage sans effort.

> **Conséquence pour le Lot 0** — si `λₛ(t)` désigne la longitude du point
> substellaire dans le repère Croûte à l'époque *t*, alors la transformation
> Croûte → Étoile s'écrit avec **`+lon_0 = λₛ(t) − 180`**. Toute la dépendance
> temporelle du datum tient dans un seul paramètre PROJ.

### `ob_tran` est sphérique — mesuré

Même calcul avec `+ellps=WGS84` puis avec `+R=6378137` :

```
(10, 45)  ellipsoïde  1096616.7771  -4913200.3255
          sphère      1096616.7771  -4913200.3255    écart 0.000000 m
```

Zéro à la précision machine, sur les trois points testés. Ce n'est pas une
négligence de PROJ : faire tourner le pôle d'un ellipsoïde n'a pas de sens comme
opération conservant la forme.

**Contrôle** avec `omerc` (Hotine oblique Mercator), qui est authentiquement
ellipsoïdal :

```
(30, 60)  écart ellipsoïde/sphère   2711.24 m
( 0, 80)  écart ellipsoïde/sphère   3678.55 m
```

La distinction est essentielle : **`omerc` incline la projection** — l'ellipsoïde
reste aligné sur l'axe de rotation — alors qu'Aeonir demanderait d'**incliner
l'ellipsoïde lui-même**, ce que personne ne sait faire. C'est la projection de la
Suisse, de la Malaisie et de la zone 1 de l'Alaska.

### `+o_proj=longlat` renvoie des radians

Piège vérifié, qui ne s'annonce nulle part dans la chaîne :

```
o_proj=longlat  ->  x=       0.886077   y=      -0.659058     ← radians
o_proj=latlong  ->  x=       0.886077   y=      -0.659058     ← radians
o_proj=eqc      ->  x= 5645197.355683   y= -4198858.746250    ← mètres
o_proj=merc     ->  x= 5645197.355683   y= -4540665.672151    ← mètres
```

Les projections métriques se comportent normalement ; seule la sortie
géographique sort en radians et doit être convertie.

## Reproduire les mesures

Les sondes qui ont produit tous les chiffres ci-dessus sont jetables et ne sont
pas versionnées. Elles se réécrivent en quelques lignes :

```python
from pyproj import Proj
common = "+proj=ob_tran +o_proj=eqc +o_lat_p=0 +o_lon_p=0 +lon_0=0"
ell, sph = Proj(f"{common} +ellps=WGS84"), Proj(f"{common} +R=6378137")
print(ell(10, 45), sph(10, 45))     # identiques → ob_tran est sphérique
```

---

# Ce qui reste ouvert

Le Lot 0 n'est pas clos. Décisions en attente, dans l'ordre où elles se posent :

| # | Décision | Pourquoi elle compte |
|---|---|---|
| ✅ 1 | **Forme du corps** — sphère de 4 775 km | tranché ci-dessus |
| 2 | **Origine des longitudes** de chaque repère | `+o_lon_p`. Le pôle Nord géographique, qui est sur le terminateur, est le candidat naturel |
| 3 | **Sens et signe des latitudes** du repère Étoile | pour que la latitude soit littéralement l'angle d'élévation, le positif va vers la Face Ardente |
| 4 | **Déclaration d'un CRS non terrestre** que GDAL, PROJ et QGIS acceptent | `EPSG:3857` est *défini sur WGS84* : la Web Mercator d'Aeonir devra être la nôtre, avec un SRID privé |
| 5 | **Définition numérique de l'époque** | origine du temps, unité, et si le repère Étoile mérite d'être un CRS ou seulement une fonction dérivée |
| 6 | **Zéro altimétrique d'un monde sans océan** | `climat.md` est explicite : « il n'existe pas d'océan global ». Détermine le `NoData`, l'encodage terrain-RGB et la lecture de toutes les cartes |

---

## Source de vérité

Les constantes physiques viennent de `rules/fr/univers/astronomie.md` et
`rules/fr/univers/climat.md`. Elles ne seront recopiées nulle part : un module
unique les portera, et tout le reste s'y réfèrera.

**Incohérence connue à trancher côté règles** — les 1 500 km de largeur du
terminateur valent 18° d'arc au rayon d'Aeonir, alors que la table du gradient
solaire couvre −21° à +6°, soit 27° ≈ 2 250 km. Le pipeline prendra la table
comme source, étant la plus détaillée.
