# Glossaire géomatique

**Le vocabulaire du domaine, et lui seul.** Chaque entrée est ancrée sur une
décision concrète du pipeline Aeonir plutôt que sur une définition abstraite.

Ce document est **vivant** : il s'enrichit à chaque lot. Ce qui n'a pas encore
servi est marqué *(pas encore utilisé)*.

Les deux autres fichiers du chantier ont des rôles disjoints — [README.md](README.md)
porte l'organisation du code et le pipeline, [TUTORIAL.md](TUTORIAL.md) la
feuille de route, les enseignements et **les pièges**, qui vivaient ici en
annexe jusqu'à la consolidation.

---

## Les chiffres d'Aeonir

Constantes de référence, à ne jamais recopier à la main ailleurs — elles vivront
dans un module unique.

| Grandeur | Valeur | Origine |
|---|---:|---|
| Rayon | 4 775 km | `rules/fr/univers/astronomie.md` |
| Circonférence | 30 003 km | 2πR |
| Gravité | 7,34 m/s² | `astronomie.md` |
| Rapport de rayon avec la Terre | 0,7486 | 4 775 / 6 378,137 |
| Facteur d'exagération du relief | 1,336 | inverse du précédent |
| Terminateur du **Levant** | −18° (Front du Levant) → +6° (Mur des Tempêtes) = 2 000 km | `climat.md` |
| Terminateur du **Couchant** | +3 à +6° (Front du Couchant) → −21° (Linceul) = ~2 125 km | `climat.md` |
| Zone **habitée et explorée** | ~1 500 km — ordre de grandeur, bornes non fixées | `climat.md` |
| Inclinaison de l'axe | 3° | `astronomie.md` |
| Période de rotation sidérale | 56 ans 9 mois | `astronomie.md` |
| Période orbitale | 54 ans ½ | `astronomie.md` |
| **Jour solaire** | ~1 375 ans dérivé, 1 414 annoncé | `astronomie.md` |
| Excentricité de l'orbite | 0,20 — périhélie 14 UA, aphélie 21 UA | `climat.md` |
| Vitesse du terminateur à l'équateur | 21,8 km/an | dérivée |
| Traversée de la zone habitée à l'équateur | 71 ans | `climat.md` |

> ⚠️ **Le terminateur se déplace à la vitesse du jour solaire, pas de la
> rotation.** C'est l'écart de 4 % entre rotation et orbite qui le promène. Le
> caler sur la rotation sidérale le rend **vingt-cinq fois trop rapide** — 2,8
> ans pour franchir la zone habitée au lieu de 71.

> **Les deux moitiés ne sont pas symétriques.** La croûte traverse la bande deux
> fois par rotation, en sens opposés, et les seuils diffèrent : on émerge des
> glaces à −18° au **Levant**, on y retourne à −21° au **Couchant**. Trois degrés
> d'hystérésis, soit 250 km. Conséquence : le climat est `f(lat', hémisphère)`,
> jamais `f(lat')` seule.
>
> ⚠️ **Question ouverte** — les 1 500 km de largeur annoncés par `climat.md` ne
> correspondent à aucune des deux moitiés, qui font ~2 000 et ~2 125 km. À
> trancher côté règles : cœur vivable, ou étendue front à front ?

---

# A — Où l'on est

## Formes du monde

**Géoïde** — la vraie surface d'équipotentiel de gravité d'un corps, bosselée et
irrégulière. C'est la surface que suivrait un océan au repos. Non
paramétrable simplement, on la tabule.

**Ellipsoïde** — le modèle mathématique qui approche le géoïde. Défini par un
demi-grand axe `a` et un aplatissement `f` (ou un demi-petit axe `b`). La Terre :
`a` = 6 378 137 m, `b` = 6 356 752 m.

**Sphère** — le cas dégénéré `a = b`. Aucune donnée sur l'aplatissement d'Aeonir
n'existe dans le vault, donc **Aeonir est une sphère de 4 775 km**. C'est un
choix explicite, pas un oubli.

## Repères

**Datum** — l'ellipsoïde *plus* son ancrage : position du centre, orientation des
axes, époque de validité. Deux datums peuvent partager le même ellipsoïde et
donner des coordonnées écartées de centaines de mètres. Sur Terre : NTF et RGF93
diffèrent d'environ 300 m en France.

**Datum altimétrique** — les altitudes ont leur propre référentiel, distinct du
planimétrique. En France : le **NGF-IGN69**, rattaché au marégraphe de
Marseille. Une coordonnée complète cite donc deux datums.

**Projection** — la fonction qui aplatit la surface sur un plan. Toute
projection ment : elle ne peut préserver simultanément angles, aires et
distances.

- **Conforme** — préserve les angles localement, donc les formes à petite
  échelle. Déforme les aires. *Mercator, Lambert conique conforme, UTM.*
- **Équivalente** — préserve les aires. Déforme les formes. *Lambert azimutal
  équivalent, Albers, Mollweide.*
- **Équidistante** — préserve les distances depuis un point ou le long de
  certaines lignes. Ni conforme ni équivalente.
- **Compromis** — ne préserve rien exactement, minimise l'inconfort visuel.
  *Robinson, Winkel Tripel, Equal Earth.*

**CRS / SRS** *(Coordinate Reference System — système de coordonnées de
référence)* — datum + projection + unités. L'objet manipulé au quotidien.

**Aspect** — l'orientation de la surface développable par rapport au corps.
*Normal* (axe de la projection = axe de rotation), *transverse* (perpendiculaire),
*oblique* (quelconque). Souvent oublié, c'est pourtant le troisième axe de
classification — et celui qu'utilise Aeonir.

> **Le repère d'Aeonir est un aspect oblique.** Les pôles de projection sont
> placés au point substellaire et au point antistellaire ; le terminateur devient
> l'équateur. Conséquences : la latitude *est* l'angle d'élévation de l'étoile
> (donc la table climatique devient une table de latitudes), la bande habitable
> tombe dans la zone où Mercator déforme le moins (×1,05 à 18°), et la coupure à
> 85,05° ne retire que deux calottes de 412 km de rayon, centrées sur la roche
> vitrifiée et sur le Linceul.

## Panorama des projections

| Projection | Famille | Propriété | Usage |
|---|---|---|---|
| **UTM** | cylindrique transverse | conforme | Standard mondial du levé. 60 fuseaux de 6°. `EPSG:326xx` N / `327xx` S |
| **Lambert conique conforme** | conique | conforme | Cartes nationales des pays « en largeur ». France, aéronautique |
| **Lambert azimutal équivalent** | azimutale | équivalente | `EPSG:3035`, statistiques européennes (INSPIRE, Eurostat) |
| **Albers conique équivalent** | conique | équivalente | Statistiques nationales américaines |
| **Stéréographique polaire** | azimutale | conforme | Arctique `EPSG:3413`, Antarctique `EPSG:3031` — là où Mercator meurt |
| **Équirectangulaire** (plate carrée) | cylindrique | aucune | Rasters globaux. Techniquement pas une projection : on trace lon/lat comme du X/Y |
| **Mollweide / Sinusoïdale** | pseudo-cylindrique | équivalente | Cartes thématiques mondiales. La sinusoïdale porte la grille MODIS |
| **Robinson / Winkel Tripel / Equal Earth** | pseudo-cylindrique | compromis | Atlas. *Equal Earth* (2018) est la réponse moderne à Mercator |

UTM et Web Mercator sont **tous deux du Mercator** — aspect transverse pour l'un,
normal pour l'autre. D'où des usages opposés.

## Web Mercator

`EPSG:3857`. Mercator sphérique, coupé à **±85,0511°** pour que le monde forme un
**carré** — condition nécessaire au découpage récursif en quatre.

Conforme, donc les formes locales sont justes ; mais les aires explosent vers les
pôles. Elle est universelle non par mérite mais par effet de réseau : MapLibre,
Google, OSM, tout est câblé dessus.

## Les trois espaces de coordonnées

À tenir soigneusement séparés. Confondre les deux premiers est l'erreur la plus
fréquente du métier : une distance euclidienne calculée sur des degrés donne un
résultat faux, et faux différemment selon la latitude.

| Espace | Unités | Axes | Origine |
|---|---|---|---|
| **Géographique** | degrés | longitude, latitude | méridien et équateur du datum |
| **Projeté** | mètres | easting (X) → est, northing (Y) → **nord** | origine de la projection + false easting/northing |
| **Pixel** | entiers | colonne → droite, ligne → **bas** | coin haut-gauche de l'image |

Le **false easting / false northing** décale l'origine pour éviter les
coordonnées négatives. Lambert-93 : 700 000 m et 6 600 000 m. UTM : 500 000 m sur
le méridien central, et 10 000 000 m dans l'hémisphère sud.

## Geotransform

Les six coefficients qui relient l'espace pixel à l'espace projeté, stockés dans
le GeoTIFF :

```
X = GT[0] + col × GT[1] + row × GT[2]
Y = GT[3] + col × GT[4] + row × GT[5]
```

- `GT[0]`, `GT[3]` — coordonnées du coin haut-gauche
- `GT[1]`, `GT[5]` — taille de pixel en X et en Y
- `GT[2]`, `GT[4]` — termes de rotation, nuls sauf image non calée nord

**`GT[5]` est négatif** dans la quasi-totalité des fichiers : les lignes
descendent quand le nord monte. C'est le point de contact entre l'espace pixel
et l'espace projeté, et la source de la moitié des bugs d'inversion verticale.

## Registres et outils

**EPSG** — registre de codes numériques identifiant les CRS, tenu à l'origine par
l'*European Petroleum Survey Group*, aujourd'hui par l'IOGP.

**SRID** — l'identifiant d'un CRS dans un système donné (base PostGIS, fichier
GeoPackage). Pour un CRS non enregistré à l'EPSG, on utilise un code privé,
typiquement ≥ 900000. **Aeonir aura des SRID privés.**

**PROJ** — la bibliothèque C qui exécute les conversions. Tout le reste (GDAL,
QGIS, PostGIS, geopandas, MapLibre côté serveur) l'appelle. Syntaxe historique :

```
+proj=longlat +a=4775000 +b=4775000 +no_defs
```

**WKT** *(Well-Known Text)* — la description normalisée d'un CRS, verbeuse mais
complète et auto-portante. C'est ce que stocke un GeoTIFF moderne, et ce que
PROJ 6+ considère comme la représentation canonique. La chaîne `+proj=` reste
pratique en ligne de commande mais **perd de l'information** (notamment
l'identité du datum et l'exactitude des transformations disponibles).

### Codes à connaître par cœur

| Code | CRS | Pourquoi |
|---|---|---|
| **4326** | WGS84 lon/lat | GPS, GeoJSON, l'entrée par défaut de tout |
| **3857** | Web Mercator | Toutes les cartes web |
| **2154** | RGF93 / Lambert-93 | Projection légale française depuis 2000 |
| **27572** | NTF / Lambert II étendu | Ancien standard français, encore partout dans l'historique — **et sur un autre datum** |
| **32631** | WGS84 / UTM 31N | Couvre l'essentiel de la France |

En complément : **4171** (RGF93 en lon/lat, plusieurs versions existent), **3035**
(LAEA Europe, statistiques), **4258** (ETRS89, le RGF93 européen).

## Reprojection

Le chemin réel n'est pas « dé-projeter puis re-projeter ». Le changement de datum
passe par un espace intermédiaire **géocentrique cartésien (ECEF)** — un X/Y/Z
depuis le centre du corps — seul endroit où une rotation-translation à sept
paramètres (**transformation de Helmert**) a un sens géométrique.

Depuis PROJ 6, tout cela est explicite sous forme de **pipeline** de *steps*, et
PROJ interroge sa base pour choisir le meilleur chemin. Point important :

> **Il existe souvent plusieurs transformations candidates, d'exactitudes
> différentes.** NTF → RGF93 par similitude à 7 paramètres : ~1 m. Par la
> **grille de décalage NTv2** `ntf_r93.gsb` (corrections interpolées publiées par
> l'IGN) : ~5 cm. Le logiciel choisit selon ce qui est installé — d'où des
> résultats qui diffèrent d'une machine à l'autre. La transformation de datum est
> un **choix documenté**, pas une constante.

Sur Aeonir, aucun décalage : les deux repères partagent centre et sphère. La
transformation est **une rotation pure paramétrée par l'époque**.

## Rééchantillonnage

Reprojeter un raster impose de recalculer les pixels. La méthode se choisit selon
la **nature de la valeur**, jamais par défaut :

- **Plus proche voisin** — recopie la valeur la plus proche. Obligatoire pour les
  données **catégorielles** (biomes, classes d'occupation du sol) : toute
  interpolation inventerait des catégories inexistantes.
- **Bilinéaire / cubique / Lanczos** — interpolent. Corrects pour les données
  **continues** : altitude, température, pluviométrie.

---

# B — Comment la donnée est faite

## Modèles

**Raster** — grille régulière de pixels portant chacun une valeur. Adapté aux
phénomènes continus : altitude, température, pluviométrie.

**Vecteur** — géométries discrètes (points, lignes, polygones) avec attributs.
Adapté aux objets nommables : un fleuve, une cité, une frontière.

**Résolution** — taille terrain d'un pixel. Pour Aeonir à 16 384 pixels de
circonférence : 30 003 km / 16 384 = **1,83 km/pixel**.

**Emprise** *(bounds, extent)* — rectangle englobant, exprimé dans le CRS de la
donnée.

**Nodata** — valeur conventionnelle marquant « pas de mesure ici ». À ne jamais
laisser entrer dans un calcul : une moyenne qui avale des −9999 donne n'importe
quoi.

## Modèles d'élévation

Classes de produit, pas formats. La distinction est stricte parce qu'elle change
ce qu'on a le droit de calculer.

| Sigle | Nom | Contenu | Usage |
|---|---|---|---|
| **MNT** | Modèle Numérique de Terrain | sol nu | hydrologie — l'eau ne coule pas sur la canopée |
| **MNS** | Modèle Numérique de Surface | toits, sommet des arbres | visibilité, ombre portée, potentiel solaire |
| **MNH** | Modèle Numérique de Hauteur | MNS − MNT | hauteur du bâti et de la végétation |
| **MNE** | Modèle Numérique d'Élévation | ombrelle générique | terme flottant — préférer MNT/MNS, non ambigus |

En anglais : DTM / DSM / nDSM / DEM.

L'origine capteur explique la distinction. Le LiDAR émet une impulsion qui
rebondit plusieurs fois : **premier écho** → MNS, **dernier écho** → MNT, après
classification des points. La photogrammétrie ne voit que la surface, donc produit
un MNS. Le radar interférométrique (SRTM) donne un hybride, qui pénètre
partiellement la canopée.

> Aeonir : le Lot 1 génère un **MNT**. L'Arbre-Anneau à cent mètres ferait plus
> tard un MNS, et un MNH qui *est* la carte de la forêt.

## Géoréférencement

Deux opérations distinctes, souvent confondues.

**Le géoréférencement** attribue une transformation à partir de **points d'appui**
(GCP, *Ground Control Points*) : « ce pixel correspond à cette coordonnée ».
Le modèle d'ajustement se choisit :

- **Affine** — 6 paramètres, 3 points minimum, conserve les droites et le
  parallélisme.
- **Polynomiale** ordre 2 ou 3 — absorbe la déformation d'une carte scannée.
- **TPS** *(thin plate spline)* — caoutchouc, passe exactement par tous les
  points. Dangereux : il invente entre les points.

**Le redressement** *(warping)* applique réellement la transformation en
rééchantillonnant vers une nouvelle grille. En GDAL ce sont deux commandes :
`gdal_translate -gcp …` écrit les points sans rien recalculer, `gdalwarp` produit
l'image redressée.

Cela s'applique aussi au vecteur : un plan de géomètre en coordonnées de chantier
se recale par une similitude sur des points connus. On dit aussi **recalage** pour
l'alignement de deux jeux entre eux.

## Formats raster

**GeoTIFF** — un TIFF dont les en-têtes portent le CRS (en WKT) et le
geotransform. Format raster pivot du métier.

**COG** *(Cloud Optimized GeoTIFF)* — un GeoTIFF réorganisé pour être lu
**partiellement par HTTP Range**. Deux ingrédients :

1. **Pavage interne** — pixels rangés par blocs (512×512) plutôt que ligne par
   ligne, pour qu'une petite zone tienne dans peu d'octets contigus.
2. **Aperçus** *(overviews)* — versions réduites ×2, ×4, ×8… stockées dans le
   même fichier.

Un client peut alors lire une zone d'un fichier de 10 Go sans télécharger le
reste.

Voici ce que déclarera le MNT du Lot 1 :

```
Driver: GTiff/GeoTIFF
Size is 16384, 8192
Coordinate System is:
GEOGCRS["Aeonir Star-fixed",
    DATUM["Aeonir Sphere",
        ELLIPSOID["Aeonir",4775000,0,LENGTHUNIT["metre",1]]],
    CS[ellipsoidal,2], AXIS["longitude",east], AXIS["latitude",north]]
Origin = (-180.000000000000000, 90.000000000000000)
Pixel Size = (0.021972656250000, -0.021972656250000)
Band 1 Block=512x512 Type=Float32
  Description = elevation
  NoData Value=-32768
  Unit Type: m
  Overviews: 8192x4096, 4096x2048, 2048x1024, 1024x512
```

Tout y est : CRS complet en WKT, origine du coin haut-gauche, taille de pixel
avec **son Y négatif**, pavage interne et aperçus.

## Formats vecteur

| Format | Nature | Forces | Faiblesses |
|---|---|---|---|
| **Shapefile** (`.shp`) | ESRI, années 90 | omniprésent | 3 à 6 fichiers solidaires, noms de champs ≤ 10 caractères, 2 Go max, encodage fragile |
| **GeoJSON** | JSON | lisible, universel sur le web | lourd, pas d'index, pas de typage strict |
| **GeoPackage** (`.gpkg`) | SQLite + schéma OGC | un fichier, indexé, SQL, raster **et** vecteur, plusieurs couches | moins connu des non-spécialistes |

**GeoPackage est le format retenu** pour les fleuves, lacs et bassins du Lot 2.
Trois tables de catalogue plus les données :

```sql
-- Catalogue : ce que contient le fichier
SELECT table_name, data_type, min_x, min_y, max_x, max_y, srs_id
FROM gpkg_contents;
--  rivers | features | -180 | -25 | 180 | 25 | 990001

-- Quelle colonne porte la géométrie, de quel type
SELECT table_name, column_name, geometry_type_name, z
FROM gpkg_geometry_columns;
--  rivers | geom | LINESTRING | 0

-- Les objets. Géométrie en BLOB : en-tête GPKG + WKB
CREATE TABLE rivers (
  fid       INTEGER PRIMARY KEY AUTOINCREMENT,
  geom      LINESTRING,
  name      TEXT,
  discharge REAL,      -- m³/s, issu de l'accumulation pondérée
  strahler  INTEGER
);
```

`ogrinfo -so aeonir.gpkg rivers` liste le schéma. `ogr2ogr -f GPKG out.gpkg
in.geojson` convertit. QGIS l'ouvre en double-cliquant. L'index spatial est un
**R-tree** SQLite, dans une table `rtree_rivers_geom`.

**WKB / WKT (géométrie)** — représentations binaire et texte d'une géométrie,
normalisées OGC. Attention à l'homonymie : le WKT des *géométries*
(`LINESTRING(0 0, 1 1)`) n'a rien à voir avec le WKT des *CRS*.

**OGC** *(Open Geospatial Consortium)* — l'organisme qui normalise formats et
protocoles du domaine. Son vocabulaire revient constamment.

---

# C — Comment on la sert

## Pyramide de tuiles

**Tuile** — image ou paquet de vecteurs couvrant une case du monde, typiquement
256 ou 512 pixels de côté.

**Pyramide** — le monde entier tient dans une tuile au niveau 0 ; chaque niveau
divise chaque tuile en quatre. Au niveau *z*, il y a 2^z × 2^z tuiles. C'est ce
qui rend le zoom instantané : on ne charge que ce qu'on regarde, à la résolution
où on le regarde.

> **C'est un quadtree sur le monde carré de Web Mercator**, avec trois
> particularités : il est **implicite** (aucun pointeur, l'adresse se calcule —
> l'enfant haut-gauche de `(z,x,y)` est `(z+1, 2x, 2y)`), il est **creux** sur
> disque (seules les tuiles portant de la donnée sont stockées), et son adresse
> `(z,x,y)` *est* l'identité du nœud.

**Quadkey** — le chemin depuis la racine, un chiffre en base 4 par niveau, chaque
chiffre étant l'index de l'enfant. La tuile `(3, 5, 2)` a pour quadkey `"021"`.
Le préfixe commun de deux quadkeys donne leur ancêtre commun.

**Surzoom** *(overzoom)* — au-delà du `maxzoom` déclaré par la source, le client
étire la dernière tuile disponible au lieu d'en demander une qui n'existe pas.
C'est le mécanisme le plus simple pour éviter de produire du détail inutile.

## XYZ vs TMS

Le **z** de `{z}/{x}/{y}` est le **niveau de zoom**. Aucune notion verticale
n'intervient. La différence entre les deux conventions porte sur **Y**, l'index
de ligne :

- **XYZ** (Google, OSM, MapLibre, Mapbox) — `y = 0` est la ligne du **haut**, le nord.
- **TMS** (spécification OSGeo) — `y = 0` est la ligne du **bas**, le sud.

```
y_tms = 2^z − 1 − y_xyz
```

Se tromper retourne la carte verticalement. Piège concret : **MBTiles stocke en
TMS** alors que MapLibre consomme en XYZ ; tout lecteur MBTiles fait la bascule
silencieusement.

## Résolution par niveau (Aeonir, tuiles de 256 px)

`résolution = 30 003 km / (2^z × T)`, avec **T = 256** — terrarium est un format
256, et une tuile plus petite donne une échelle de zoom plus fine.

| z | Résolution | Tuiles (monde) | Tuiles (bande −21°…+6°) |
|---:|---:|---:|---:|
| 0 | 117,2 km/px | 1 | 1 |
| 3 | 14,65 km/px | 64 | 16 |
| 5 | 3,66 km/px | 1 024 | 96 |
| **6** | **1,83 km/px** | **4 096** | **384** |
| 8 | 458 m/px | 65 536 | 5 376 |
| 9 | 229 m/px | 262 144 | 20 480 |

La bande traversable — du Linceul au Mur des Tempêtes — occupe **7,64 % de la
hauteur Mercator**, et non de la surface : c'est un ruban qui fait le tour du
monde, pas une région.

⚠️ **Une ligne entamée est une ligne payée.** Le plancher fait toujours coûter
la bande plus que sa part exacte, et l'excédent ne s'amenuise qu'en descendant :
**23 % de gâchis à z=6, 2 % à z=10**. Dire « 384 tuiles valent 7,64 % du globe »
est faux — c'est 9,4 %, et l'écart est la découpe, pas la géographie.

**C'est cette relation qui dimensionne le raster source, et non l'inverse.** Une
grille équirectangulaire et une pyramide Mercator portent le même `cos φ` :
poser `W = 2^z · T` rend l'accord E-O exact à toutes les latitudes d'un coup.
D'où les 16 384 × 8 192 du MNT, qui sont le miroir de z=6.

> **La contrainte n'est ni technique ni logique, elle est en aval.** Sur un MNT
> synthétique il n'y a aucune information sous la plus petite octave du bruit —
> celle d'Aeonir fait **4,7 km, soit 2,5 pixels**, juste au-dessus de Nyquist.
> Mais ce qui a réellement plafonné le zoom à 6, c'est le **Lot 2** :
> comblement de cuvettes et accumulation D8 restent en mémoire sur 134 Mpx et
> deviennent un problème hors-mémoire au-delà. La question n'est pas « jusqu'où
> puis-je tuiler » mais « qu'est-ce que l'analyse pourra encore traiter ».

## Encodages de terrain

**terrain-RGB** — une altitude rangée sur les trois canaux d'un PNG.

```
Mapbox     : altitude = -10000 + (R × 65536 + G × 256 + B) × 0,1
Terrarium  : altitude = R × 256 + G + B / 256 - 32768
```

| Encodage | Plancher | Plafond | Pas |
|---|---:|---:|---:|
| Mapbox | **−10 000 m** | +1 667 721 m | 10 cm |
| Terrarium | −32 768 m | +32 768 m | ~4 mm |

> **Aeonir prend le terrarium.** Le plancher de l'encodage Mapbox est à
> −10 000 m, alors que le relief peut descendre à −11 800 : il **écrêterait les
> bassins profonds en silence**. Contre-intuitif, puisque son plafond monte à
> 1 667 km — la plage est très asymétrique. Le terrarium couvre ±32 768 m avec un
> pas vingt-cinq fois plus fin.

MapLibre lit les deux ; il faut le déclarer dans la source (`encoding`). ⚠️ Sans
cette déclaration il décode en Mapbox par défaut et rend des altitudes fausses
de plusieurs milliers de mètres, **sans erreur**.

> **Le canal de précision fine coûte 60 % du volume, pour rien.** Mesuré sur 36
> tuiles réelles d'Aeonir : 137,0 Kio avec le canal B, **54,9 Kio sans**. Il
> code des pas de 4 mm sur un monde qui a 11,8 km de relief, et la partie
> fractionnaire d'un champ flottant est du **bruit incompressible**. Le mettre à
> zéro n'est pas un écart au standard : un décodeur lit `B = 0` et rend des
> mètres entiers. C'est un choix de précision *à l'intérieur* du format.
>
> Ordres de grandeur du même jeu : canal R seul (pas de 256 m) 4,7 Kio, brut non
> compressé 192 Kio.

**Une valeur « pas de mesure » se choisit avec l'encodage.** À −32 768 m, les
trois canaux terrarium valent 0 : le `NODATA` est le **plancher exact** du
format, ce qui évite un cas particulier dans le tuileur.

> ⚠️ **Jamais de compression avec perte sur du terrain-RGB.** Un JPEG ne dégrade
> pas l'image, il **fabrique des altitudes fausses** : une erreur de 1 sur le
> canal rouge vaut **256 m**. PNG ou WebP sans perte, rien d'autre.

**Le poids d'une tuile suit la douceur locale, pas la surface couverte.** Mesuré
sur Aeonir : **105 Kio à z=0 contre 58 Kio à z=6**. Une tuile z=0 étale les
11,8 km de relief de la planète sur 256 pixels, donc chaque pixel diffère
beaucoup de son voisin et le filtre prédictif du PNG n'a plus rien à prédire.
Contre-intuitif, et fatal pour une estimation de volume faite au jugé.

**Ombrage** *(hillshade)* — rendu du relief calculé en éclairant le MNT depuis
une position de lumière fictive. C'est du **2D qui donne l'illusion** du relief,
distinct du terrain 3D qui déforme réellement le maillage.

## Conteneurs de tuiles

**MBTiles** — une base SQLite. Schéma minimal :

```sql
CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER,
                    tile_row INTEGER, tile_data BLOB);
CREATE TABLE metadata (name TEXT, value TEXT);
```

Nécessite un serveur pour être lu par un navigateur. Stocke en **TMS**.

**PMTiles** — format à index interne conçu pour **HTTP Range** : le navigateur
lit directement des octets d'un fichier posé sur un hébergement statique, sans
serveur de tuiles. Les tuiles y sont ordonnées le long d'une **courbe de
Hilbert**, si bien que des tuiles voisines sur la carte le sont dans le fichier —
une lecture ramène des voisins utiles plutôt que des octets au hasard.

> **PMTiles est au pavage ce que le COG est au raster.** Tous deux déplacent
> l'index dans le fichier et laissent HTTP Range faire la pagination.

**L'arborescence `{z}/{x}/{y}.png` est un format à part entière**, pas une étape
intermédiaire : n'importe quel serveur statique la sert sans configuration, le
CDN d'OpenStreetMap ne fait pas autre chose, et elle a la vertu d'être
**inspectable à la main**. Trois choses la font céder à l'échelle :

- **les petites tuiles** — sous un cluster de 4 Kio, une tuile vectorielle de
  500 octets gaspille huit fois sa taille. Mesuré sur nos 822 fichiers à 62 Kio
  de moyenne, la perte n'est que de **3,35 %** ; le relief a la chance d'être
  lourd ;
- **le nombre** — 822 fichiers pour six niveaux sur un ruban, mais 27 805 à z=9
  et 1,3 million à z=12. Le coût bascule alors des octets vers les
  **allers-retours par fichier** : un `rsync` devient dominé par la latence ;
- **l'absence d'atomicité** — une synchronisation interrompue laisse une
  pyramide mi-ancienne mi-nouvelle, sans moyen de le savoir.

**Retenu pour Aeonir : l'arborescence en sortie de référence, PMTiles en
empaquetage** — pas l'un contre l'autre. L'argument du fichier unique redevient
décisif au Lot 6, quand les tuiles seront servies.

## Tuiles vectorielles

**MVT** *(Mapbox Vector Tile)* — géométries découpées en tuiles et encodées en
protobuf. Le style est appliqué côté client, d'où la possibilité de changer
couleurs, langue ou épaisseur de trait sans regénérer quoi que ce soit.

Une géométrie qui traverse plusieurs tuiles est **clippée**, avec une **marge**
débordant du bord — sinon un trait épais ou un halo de texte montrerait une
couture. Un fleuve traversant douze tuiles existe donc en douze morceaux
indépendants. Trois conséquences :

1. **Les identifiants comptent.** Un objet scindé n'est plus reconnu comme
   unique. Si le survol n'illumine qu'un segment, c'est que les *features* n'ont
   pas d'`id` stable → `promoteId` dans la source MapLibre.
2. **Les attributs sont dupliqués** dans chaque tuile. Ne mettre dans les tuiles
   que ce qui sert au rendu et à l'interaction, jamais la fiche complète.
3. **La géométrie est quantifiée.** Chaque tuile a un `extent`, 4096 par défaut :
   les coordonnées sont des **entiers de 0 à 4095** relatifs au coin de la tuile.
   D'où la compacité — et le fait qu'**une tuile vectorielle n'est pas une source
   de vérité géométrique**. Le GeoPackage l'est ; la tuile est un rendu.

## Bases de données spatiales

| Outil | Nature | Index | Usage |
|---|---|---|---|
| **GeoPackage** | SQLite + schéma OGC | R-tree | portable, échange, lecture |
| **SpatiaLite** | SQLite + moteur spatial | R-tree | calcul local |
| **PostGIS** | extension PostgreSQL | GiST | client-serveur, concurrent, production |

Plusieurs centaines de fonctions `ST_*` normalisées OGC :

```sql
-- Les fleuves traversant un bassin, avec la longueur de l'intersection
SELECT r.name, ST_Length(ST_Intersection(r.geom, b.geom)) AS len_m
FROM rivers r JOIN basins b ON ST_Intersects(r.geom, b.geom)
WHERE b.name = 'Bassin du Grand Marais';
```

PostGIS génère même les tuiles vectorielles : `ST_AsMVT` + `ST_AsMVTGeom`. C'est
l'architecture des serveurs de tuiles dynamiques (pg_tileserv, Martin).

## Protocoles OGC *(pas encore utilisé)*

| Protocole | Le serveur renvoie | Souplesse | Vitesse |
|---|---|---|---|
| **WMS** | une image rendue pour une emprise arbitraire | haute | faible |
| **WMTS** | des tuiles pré-découpées | faible | haute |
| **WFS** | les objets vecteur eux-mêmes | haute | variable |
| **WCS** | de la donnée raster brute | haute | faible |

Implémentations classiques : **GeoServer**, **MapServer**, **QGIS Server**. La
génération suivante s'appelle **OGC API** (Features, Tiles, Maps), en REST/JSON.

---

# D — Analyse de terrain

## Génération

**Perlin / simplex** — générateurs de champs aléatoires cohérents. Simplex est le
successeur de Perlin : moins d'artefacts directionnels, meilleure complexité en
dimension.

**fBm** *(fractional Brownian motion)* — somme de plusieurs **octaves** de bruit,
chacune deux fois plus fine (*lacunarity*) et deux fois moins forte
(*persistence*). C'est ce qui donne un relief crédible à toutes les échelles.

> **Point technique décisif** : on échantillonne le bruit en **3D sur la sphère
> unité**, jamais sur un plan lon/lat. Sinon : couture visible au méridien 180°,
> et pincement du motif aux pôles.

## Hydrologie

**Cuvette** *(sink, pit)* — dépression sans exutoire. L'eau y arrive et n'en sort
pas, ce qui casse tout calcul d'écoulement. On les **comble** avant analyse
(Planchon-Darboux, ou *priority-flood*).

**D8** — le modèle d'écoulement le plus simple : chaque pixel envoie toute son eau
vers celui de ses 8 voisins présentant la plus forte pente. Grossier mais robuste.
Variantes : **D-infinity** (direction continue), **MFD** (écoulement réparti sur
plusieurs voisins).

**Accumulation de flux** — pour chaque pixel, le nombre de pixels qui s'y
déversent en amont. Les fortes valeurs dessinent le réseau hydrographique.

> En pondérant par une **carte de précipitations** plutôt qu'en comptant les
> pixels, on obtient un débit. Sur Aeonir, cette pondération vient directement du
> lore : subsidence polaire → vents méridiens → Fleuves Méridiens descendant vers
> l'équateur du Couchant. L'hydrologie devient **falsifiable** : si le réseau
> extrait ne produit pas ces fleuves, le relief généré est faux.

**Bassin versant** — ensemble des pixels dont l'eau converge vers un même
exutoire.

**Ordre de Strahler** — hiérarchie du réseau : un tronçon sans affluent est
d'ordre 1 ; la confluence de deux tronçons d'ordre *n* donne *n+1*. Sert
directement à piloter l'épaisseur de trait au rendu.

**Pente / exposition** *(slope / aspect)* — dérivées premières du MNT :
l'inclinaison, et la direction vers laquelle la pente regarde. L'exposition
détermine l'ensoleillement — et sur un monde à lumière rasante permanente, elle
devient bien plus structurante que sur Terre.

## Au-delà de l'heuristique

D8 et l'accumulation sont des **heuristiques topologiques**, pas de la physique :
pas de temps, pas de quantité de mouvement, pas de conservation de masse. Elles
répondent à « où l'eau irait », pas à « comment elle y va ».

Pour l'inondation et la marée, le métier utilise du **shallow-water** — les
équations de Saint-Venant 2D :

- **TELEMAC-2D** — éléments finis, open source, développé par le LNHE d'EDF.
- **HEC-RAS 2D** — l'américain, gratuit, très répandu en bureau d'études.
- **LISFLOOD-FP**, **SFINCS** — versions simplifiées (onde d'inertie, *storage
  cell*) pour couvrir de grandes emprises vite.
- **Delft3D / D-Flow FM**, **MIKE 21**, **Iber** — le reste du paysage.
- Marées : **ADCIRC**, et l'atlas global **FES2014** (LEGOS / CNES).

Entre les deux mondes, un intermédiaire élégant : **HAND** *(Height Above Nearest
Drainage)*, la hauteur d'un pixel au-dessus de son point de drainage. Purement
géomatique, aucune physique, mais approche remarquablement bien l'extension d'une
crue pour un coût dérisoire.

Cadre réglementaire français associé : **Directive Inondation**, **PPRI**,
**TRI**, **Vigicrues**, avec **RGE ALTI** et **LiDAR HD** en entrée
topographique.

---

# E — Vocabulaire MapLibre

Référence : **maplibre.org/maplibre-style-spec/** — exhaustive.
Éditeur visuel : **maplibre.org/maputnik/** — le meilleur moyen d'apprendre la
spec en voyant le JSON changer.

**Style spec** — document JSON décrivant entièrement la carte : où sont les
données, comment les dessiner. C'est une **spécification publique**, pas une API :
le même style fonctionne sur MapLibre, Mapbox GL, et des rendus serveur.

**Source** — origine de données déclarée dans le style : `raster`, `raster-dem`,
`vector`, `geojson`, `image`, `video`. Porte l'URL, le `minzoom`/`maxzoom`,
l'emprise, l'encodage.

**Layer** — règle de dessin consommant une source : `fill`, `line`, `symbol`,
`raster`, `hillshade`, `fill-extrusion`, `heatmap`, `background`. **L'ordre de
déclaration fait l'ordre d'empilement.**

**`source-layer`** — pour une source vectorielle, le nom de la couche *à
l'intérieur* de la tuile. Une tuile MVT en contient plusieurs.

**Expression** — petite formule en JSON évaluée par le moteur pour calculer une
propriété de style à partir d'un attribut, du zoom ou d'un état. C'est ce qui
remplace « regénérer les tuiles quand on change le rendu ».

**`terrain`** — clé de style activant la déformation 3D réelle du maillage, avec
sa source `raster-dem` et son `exaggeration`.

**`sky`, `fog`** — atmosphère et brume de distance.

**`feature-state`** — état côté client attaché à un objet vecteur (survolé,
sélectionné), utilisable dans les expressions sans toucher aux données.

**`promoteId`** — promeut un attribut en identifiant de *feature*, pour que
`feature-state` s'applique à **tous les morceaux** d'un objet clippé sur
plusieurs tuiles.

**`glyphs` / `sprite`** — les polices (en PBF, découpées par plages de 256
caractères) et l'atlas d'icônes. ⚠️ **Sans `glyphs`, aucun calque `symbol` n'est
possible** — donc aucun texte sur la carte. Un style autonome doit vendre ses
fontes localement.

**`renderWorldCopies`** — option du constructeur, à `true` par défaut : le monde
se répète indéfiniment en longitude. Explique le défilement horizontal sans
butée, les « bandes verticales » aux zooms faibles, et les longitudes hors de
`[−180, 180[` que la carte rapporte — un survol dans la copie de gauche donne
−204,244° pour un point qui est à +155,756°, d'où des indices de tuile
**négatifs** si l'on ne replie pas.

**`prefetchZoomDelta`** — à **4** par défaut. Charge les tuiles **parentes**,
quatre niveaux plus grossières, pour afficher une version basse résolution
pendant que les fines arrivent. C'est le flou-puis-net universel. ⚠️ MapLibre ne
précharge **rien** dans l'autre sens : l'anticipation pendant les mouvements de
caméra reste une [demande ouverte](https://github.com/maplibre/maplibre-gl-js/issues/116).
L'asymétrie est économique — dézoomer demande 1 parent pour 4 enfants, souvent
déjà en cache ; zoomer demande ×4 de la vue par niveau, pour un mouvement
hypothétique.

**`maxTileCacheSize`, `maxTileCacheZoomLevels`** — rétention. Le `SourceCache`
garde les tuiles chargées et **substitue parent ou enfants** pendant qu'une
tuile cible se charge.

**`backfillBorder`** — mécanisme interne des sources `raster-dem` : la bordure
d'une tuile MNT est reconstituée depuis ses **voisines**, faute de quoi le
calcul des normales manquerait de contexte au bord et dessinerait une grille de
coutures. Autrement dit, pour le relief, **la promesse de continuité est tenue
côté client**.

**Drapeaux de débogage** — `showTileBoundaries` trace le contour de chaque tuile
**et son triplet z/x/y**, sans `glyphs` : il embarque sa propre fonte. C'est
l'outil qui distingue une couture de tuiles d'un bord de monde. Voisins :
`showCollisionBoxes`, `showPadding`, `showOverdrawInspector`.

**Sources multiples pour une pyramide creuse** — une source n'a qu'un couple
`bounds`/`maxzoom`, donc elle ne sait pas exprimer « global jusqu'à z, ruban
au-delà ». On en déclare **deux sur le même jeu de fichiers**, distinguées par
la plage de zoom et l'emprise. Le mécanisme qui le rend possible : **sous son
`minzoom`, MapLibre ne couvre pas une source du tout** — elle n'est donc jamais
demandée hors de son domaine, et les 404 disparaissent.

## Résolution variable : les trois mécanismes

1. **`maxzoom` sur la source** — au-delà, MapLibre surzoome. Aucun trou, aucune
   tuile à générer. Le plus simple, souvent suffisant.
2. **Pyramide creuse** — couvrir le monde jusqu'à z5 et ne descendre plus bas que
   dans la bande. Piège : une tuile absente renvoie un 404 et MapLibre affiche un
   **trou dans le terrain**.
3. **Deux sources** — une globale à `maxzoom 5`, une « bande » à `maxzoom 8` avec
   emprise restreinte. C'est ainsi que fonctionnent les vrais services : SRTM
   30 m mondial en fond, RGE ALTI 1 m sur la France. Contrainte : **MapLibre
   n'accepte qu'une seule source de terrain active** — il faut basculer selon le
   zoom.

---

# F — Le contexte français

Ce que ce projet ne fera jamais rencontrer, et qui tombera en entretien.

## Référentiels

**RGF93** — le datum français légal, aligné sur ETRS89 (donc sur WGS84 à quelques
centimètres). Remplace **NTF**, dont il s'écarte d'environ 300 m.

**Lambert-93** (`EPSG:2154`) — la projection légale nationale. Conique conforme,
un seul fuseau pour toute la France. Décret de 2000, obligatoire pour les données
publiques.

**CC42 à CC50** — neuf déclinaisons coniques conformes par bande de latitude,
pour les travaux exigeant une déformation faible (le Lambert-93 unique dégrade
aux extrémités du territoire).

**NGF-IGN69** — le datum altimétrique, rattaché au marégraphe de Marseille.
NGF-IGN78 pour la Corse.

## Données

**IGN** et sa **Géoplateforme** (ex-Géoportail), qui diffuse en WMTS et WMS.

| Référentiel | Contenu |
|---|---|
| **BD TOPO** | vecteur topographique national |
| **BD ORTHO** | orthophotographies |
| **RGE ALTI** | MNT national |
| **LiDAR HD** | nuages de points, programme en cours |
| **BD PARCELLAIRE / cadastre** | parcelles |
| **PCRS** | plan de corps de rue simplifié, pour les réseaux |

Côté ouvert : **OpenStreetMap**, ses *tags*, et la chaîne de rendu associée.

## Cadre

**INSPIRE** — directive européenne d'interopérabilité des données géographiques.
**Open Data** et licence ouverte Etalab. **CNIG** — le conseil national de
l'information géolocalisée.

---

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

> **Piège vérifié, et celui-ci est une bonne nouvelle** — PROJ **refuse** de
> transformer entre `AEONIR:1` et `EPSG:4326` :
>
> ```
> Source and target ellipsoid do not belong to the same celestial body
> (Non-Earth body vs Earth)
> ```
>
> Il déduit du rayon qu'Aeonir n'est pas la Terre, et bloque. C'est exactement ce
> qu'on veut : reprojeter des degrés d'une sphère de 4 775 km vers WGS84 n'a
> aucun sens. Conséquence pratique dans QGIS — voir plus bas.
>
> La dérogation `PROJ_IGNORE_CELESTIAL_BODY=YES` existe, et **il ne faut pas
> s'en servir** : elle produit un `Ballpark geographic offset`, c'est-à-dire une
> identité. Mesurée, elle rend `(60, 45) → (60, 45)`. Elle ne transforme rien,
> elle se contente de mentir en silence.

> **Troisième piège vérifié** — `ID["AEONIR",1]` est bien conservé dans le WKT et
> survit à toute re-sérialisation, mais **`to_authority()` renvoie `None`** et
> `list_authority()` une liste vide. Ces méthodes interrogent la **base de
> données** de PROJ plutôt que de relire le nœud `ID`, et une autorité maison n'y
> est pas enregistrée. L'identité est donc dans le fichier, jamais confirmée par
> l'API. Tester la présence de la chaîne, pas le retour de la méthode.

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
> rotationnelle du datum tient dans un seul paramètre PROJ.

### Invariance de l'origine des longitudes — mesuré

Six époques réparties sur une rotation complète, avec `+o_lon_p=0` :

```
λₛ (époque) |   pôle Nord géo   |   pôle Sud géo    | substellaire
          0 | lat'=0   lon'=  0 | lat'=0   lon'=180 |   lat'=90
         45 | lat'=0   lon'=  0 | lat'=0   lon'=180 |   lat'=90
         90 | lat'=0   lon'=  0 | lat'=0   lon'=180 |   lat'=90
        180 | lat'=0   lon'=  0 | lat'=0   lon'=180 |   lat'=90
        270 | lat'=0   lon'=  0 | lat'=0   lon'=180 |   lat'=90
        359 | lat'=0   lon'=  0 | lat'=0   lon'=180 |   lat'=90
```

Les pôles géographiques sont les points fixes de la rotation qu'applique
`+lon_0`. L'origine des longitudes Étoile ne dérive donc jamais, et le point
substellaire reste à `lat' = 90` par construction.

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

### Mais `ob_tran` n'est pas ce qu'on a retenu

PROJ sait exposer un `ob_tran` comme CRS **dérivé** — mais avec une méthode
privée :

```
METHOD["PROJ ob_tran o_proj=longlat"]
```

Aucun autre logiciel ne saurait la lire. La convention **netCDF CF**
`rotated_latitude_longitude` — celle des grilles climatiques CORDEX et COSMO —
donne le même résultat avec une méthode normalisée :

```
METHOD["Pole rotation (netCDF CF convention)"]
    PARAMETER["Grid north pole latitude",  <déclinaison>]
    PARAMETER["Grid north pole longitude", <longitude substellaire>]
    PARAMETER["North pole grid longitude", 0]
```

Deux avantages, mesurés. La méthode est **portable**. Et les paramètres sont
**naturels** : le pôle est donné directement par les coordonnées du point
substellaire, sans le détour par `lon_0 = λₛ − 180` qu'impose `ob_tran`. Les
deux voies donnent le même résultat à **1,1 × 10⁻¹³ degré**.

C'est cette déclaration qui est retenue pour `AEONIR:2`. Bénéfice supplémentaire
vérifié : avec l'inclinaison, le pôle Nord géographique conserve `lon' = 0`
exactement — seule sa latitude bouge.

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
