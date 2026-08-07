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
automatiquement : le panoramique reste fluide malgré les 442 Mio.

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

## Commandes

Depuis `geo/`, avec le venv actif :

```bash
.venv/Scripts/python.exe -m pytest -q
```

```bash
.venv/Scripts/python.exe -m aeonir_gis.dem -o out/aeonir_crust_dem.tif
```

`-z` fixe le zoom maximal visé, donc la taille du raster (`-z 3` pour un aperçu
en quelques secondes) ; `-s` la graine ; `--plain` saute la conversion COG.

## Lots

| Lot | Contenu | État |
|---|---|---|
| **0** | Référentiels Croûte et Étoile, rotation datée entre eux | ✅ 79 tests |
| **1** | MNT global — fBm échantillonné en 3D sur la sphère → GeoTIFF → COG | ✅ 139 tests |
| **2** | Hydrologie — comblement, D8, accumulation pondérée, réseau, bassins → GeoPackage | |
| **3** | Tuileur maison — pyramide XYZ, terrain-RGB, empaquetage PMTiles | |
| **4** | Viewer MapLibre — style spec, `hillshade`, `terrain`, projection globe | |
| **5** | Tuiles vectorielles MVT — fleuves, lacs, biomes | |
| **6** | Relief tectonique — plancher dominant, chaînes de collision, fosses en eau dans le seul terminateur, croûte dilatée/contractée | |

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

# Lot 1 — le MNT global

## La résolution ne se choisit pas, elle se déduit

Une grille équirectangulaire et une pyramide Mercator portent le **même
`cos φ`** :

```
équirectangulaire   E-O : C·cos φ / W          N-S : C / W   (constant)
Mercator, zoom z    les deux : C·cos φ / (2^z·T)   — conforme, donc isotrope
```

En posant **`W = 2^z · T`**, l'accord E-O devient exact à *toutes* les latitudes
d'un coup. C'est la seule origine légitime de la largeur du raster ; tout nombre
rond saisi à la main serait un chiffre orphelin.

| z | W | rés. équat. | bande habitée | tuiles cumulées | source f32 | génération |
|---:|---:|---:|---:|---:|---:|---:|
| 5 | 8 192 | 3,66 km | 410 px | 1 365 | 0,12 Gio | 1 min |
| **6** | **16 384** | **1,83 km** | **819 px** | **5 461** | **0,50 Gio** | **5 min 24** |
| 7 | 32 768 | 0,92 km | 1 638 px | 21 845 | 2,0 Gio | ~22 min |
| 8 | 65 536 | 0,46 km | 3 277 px | 87 381 | 8,0 Gio | ~1 h 25 |

La ligne z=6 est **mesurée** ; les deux suivantes sont extrapolées au facteur 4.
Le COG produit pèse **442 Mio** — la compression DEFLATE avec prédicteur
flottant ne gagne que 14 % sur les 512 Mio bruts, le bruit se comprimant mal.

**Retenu : z = 6**, avec `T = 256` — terrarium est un format 256, et une tuile
plus petite donne une échelle de zoom plus fine.

Ce qui plafonne n'est ni le disque ni le calcul, qui tiendraient jusqu'à z=8,
mais le **Lot 2** : comblement de cuvettes et accumulation D8 restent tractables
en mémoire sur 134 Mpx et deviennent un problème hors-mémoire au-delà. La
contrainte de sortie converge : à 40 Kio la tuile — hypothèse à mesurer au
Lot 3 — la pyramide pèse 210 Mio en z=6 contre 830 en z=7, et GitHub plafonne un
fichier à 100 Mo. Un PMTiles global devra de toute façon être tranché.

La profondeur au-delà se règle au Lot 3, par une **pyramide locale sur la seule
bande** et le surzoom de MapLibre entre les deux.

### Le coût accepté, et où il tombe

En N-S l'accord n'existe pas : Mercator réclame `1/cos φ` fois plus fin que le
pas constant de l'équirectangulaire — 1,07 à ±21°, 2,00 à 60°, **11,59** à la
coupure. Le tuileur interpolera donc en N-S dans les hautes latitudes. Comme la
pyramide sera en repère **Étoile**, ces hautes latitudes sont les deux faces
mortes, et la bande habitée tombe sur l'équateur Mercator, où l'accord est exact
dans les deux directions.

Second coût, mesuré : la coupure à ±85,0511° occupe **5,5 % des lignes du raster
pour 0,37 % de la surface réelle**, et le pixel de la première ligne fait 40 cm
de large. Gaspillage assumé.

## Le bruit s'évalue en 3D, il se stocke en 2D

Deux questions distinctes, et c'est de leur découplage que tout dépend.

| | Réponse |
|---|---|
| **Où on évalue** le bruit | la **sphère unité, dans ℝ³** |
| **Où on stocke** le résultat | une grille **équirectangulaire** |

Pour chaque pixel on calcule `(lon, lat)`, on convertit en vecteur unitaire, et
on évalue le bruit *là*. La fonction ne voit jamais ni longitude ni latitude :
elle vit dans ℝ³, où la sphère est plongée sans point privilégié. Les deux
pathologies du bruit 2D sur `(lon, lat)` disparaissent, et elles sont chiffrées :

- **La couture.** Les deux pixels de bord (`lon = ±180`) sont distants de
  **1 791 m** en 3D à la latitude 12° — exactement le pas d'un voisin ordinaire
  à cette latitude. Il n'y a pas de raccord à faire.
- **Le pincement polaire.** Les 16 384 pixels de la première ligne tiennent dans
  une calotte de **1 831 m**, et le bruit y varie comme sur trois pixels
  équatoriaux. En 2D, cette même ligne balaierait tout le domaine du bruit.

Le coût est un facteur trois sur le nombre de cellules du réseau — on
échantillonne une surface dans un champ volumique. Il n'y en a pas d'autre.

`test_noise.py` teste chaque propriété **avec son contre-exemple 2D à côté** :
sans lui, on vérifierait qu'un problème est absent sans avoir montré qu'il
pouvait être présent.

## Pourquoi on ne pave pas la sphère

Le problème est réel et porte un nom normalisé : **DGGS**, *Discrete Global Grid
System*. Les candidats sérieux :

| Pavage | Propriété | Qui l'utilise |
|---|---|---|
| **Équirectangulaire** | ni équi-aire ni conforme, singulier aux pôles | tout le SIG raster |
| **Cube map** (`+proj=qsc`) | distorsion bornée ~1,3×, pas de pôle | rendu temps réel |
| **HEALPix** (`+proj=healpix`) | **équi-aire exact**, hiérarchique | astronomie — Planck, WMAP |
| **H3 / S2** | hexagones / quadtree sphérique | Uber, Google |

On ne pave pas, et pas par paresse. Un pavage résout un problème
d'**échantillonnage** — obtenir des cellules comparables partout — qu'on vient de
dissoudre autrement, en sortant le bruit de la grille. Il resterait un problème
de *stockage*, et là aucun pavage ne vaut le coût : rasterio, la
géotransformation, `gdalwarp`, le COG et QGIS attendent tous une grille
régulière.

L'argument qui emporte la décision est en aval. La sortie du Lot 3 est une
pyramide XYZ, elle-même un pavage. Une source équirectangulaire s'y accorde
exactement en E-O par la relation `W = 2^z·T`. Une source HEALPix équi-aire
obligerait au contraire à **sur**-interpoler pour nourrir les tuiles polaires :
on aurait payé un pavage exotique pour dégrader le résultat.

## Le raster est global, seules les tuiles seront coupées

L'équirectangulaire n'a aucune singularité aux pôles — seulement de la
redondance. Le ±85,0511° est une amputation du **rendu**, jamais de la donnée.

La conséquence est ce qui achève l'arbitrage du référentiel. La roche
actuellement sous le point substellaire porte son altitude dans le COG ; quand
la croûte l'aura menée dans le terminateur, on ne régénère rien, on **retuile à
la nouvelle époque**. Un raster Croûte est sans époque et sans coupure : il ne
peut pas, structurellement, perdre ce qui servira plus tard.

Et si les faces devaient un jour être affichées, le métier ne réaligne pas les
référentiels, il **change de pavage** — une seconde pyramide en stéréographique
polaire, comme `UPSArcticWGS84Quad` au registre OGC.

## Espérance nulle n'est pas moyenne nulle

Le point 6 exige un générateur à moyenne nulle *par construction*, pour n'avoir
pas à recentrer. Les douze gradients allant par paires opposées, le champ est
bien d'espérance nulle — et `test_noise.py` vérifie la symétrie plutôt que de la
supposer.

**Mais une réalisation ne l'est pas.** Mesuré sur trois cents graines, le
décalage de surface d'un tirage a un écart-type de **305 m** et peut atteindre
869 m. La première graine essayée donnait **−445 m** : le sol moyen d'Aeonir un
demi-kilomètre sous son propre datum.

Deux mesures ont débloqué la situation :

1. le décalage est **invariant en résolution** — identique à 0,1 m près de z=2 à
   z=5. C'est une propriété de la réalisation du bruit, pas de l'échantillonnage ;
2. il se calcule donc sur une grille 1 024 × 512 en une seconde, et le résultat
   vaut pour le raster complet.

D'où le critère retenu, explicite : **la graine est choisie parmi les trois cents
premières pour que la moyenne de surface tombe à moins de deux mètres de la
sphère de référence.** La graine 77 donne −1,5 m, avec des extrêmes symétriques.

> Sélectionner une réalisation n'est **pas** recentrer la donnée. Le zéro reste
> la sphère, il ne bouge pas, et il ne dépend d'aucune statistique du terrain.
> Un test le vérifie en sens inverse : deux graines doivent donner deux
> décalages *différents*. S'ils étaient tous nuls, c'est qu'on aurait recentré.

La moyenne qui juge le datum est **pondérée par l'aire** : sur une grille
équirectangulaire un pixel polaire couvre `cos φ` fois moins de sol, et la
moyenne par pixel n'est donc pas la moyenne de surface.

## Le générateur est volontairement pauvre

Dix octaves depuis la fréquence 2, lacunarité 2, persistance 0,5. La plus fine
tombe à 1 024, soit une cellule de 4,7 km — **2,5 pixels**, juste au-dessus de
Nyquist. L'échelle vise `σ = MAX_RELIEF_M / 4 = 2 950 m`, et **on n'écrête pas** :
un écrêtage créerait des plateaux et briserait la moyenne nulle.

La normalisation est **analytique**, `σ₁·√Σp²ⁱ` — les octaves étant décorrélées,
leurs variances s'ajoutent. Aucune statistique du terrain produit n'entre dans le
calcul, sans quoi une même altitude ne signifierait pas la même chose d'une
graine à l'autre. `σ₁ = 0,2702` est une propriété **mesurée** de cette
implémentation, à 1,5 % près selon la graine.

Rien de plus, et c'est délibéré. La géographie d'Aeonir sera **tectonique** :
sans océan global l'essentiel de la surface est du plancher, les collisions de
plaques font des chaînes massives, les fosses ne sont en eau que dans le
terminateur, et la dilatation de la croûte en face chaude contre sa contraction
en face froide brise le relief. Aucun empilement d'octaves ne produit ça. Le
tenter donnerait un faux réalisme plus coûteux qu'un bruit franchement
synthétique — d'où le **Lot 6**.

## Ce que le raster de production vaut

```
Grille 16384 × 8192 — W = 2^6 × 256, graine 77
  min / max             -9266.9 / +9288.6 m
  écart-type             2890.6 m
  moyenne par pixel       -108.1 m
  moyenne par aire          -1.4 m   (-0.05 % de σ)
  durée                    323.7 s
  → 442 Mio, tuiles internes 512×512, aperçus [2, 4, 8, 16, 32]
```

Trois vérifications au passage.

**Le choix de graine tient à l'échelle de production.** Prédit à −1,5 m sur la
grille 1 024 × 512, mesuré à **−1,4 m** sur 134 Mpx. L'invariance en résolution
n'était pas une commodité de test, elle porte la méthode.

**Moyenne par pixel ≠ moyenne par aire.** −108 m contre −1,4 m : l'écart est
entièrement dû au poids excessif des pixels polaires sur une grille
équirectangulaire. C'est la seconde qui juge le datum, jamais la première.

**Le plafond de relief n'a pas été atteint**, donc rien n'a été écrêté. Les
extrêmes sortent à ±9,3 km pour un `MAX_RELIEF_M` de 11,8 km — la convention à
4σ était bien calibrée, et symétriques à 0,2 % près.

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
