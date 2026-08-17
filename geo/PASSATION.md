# Passation — Lot 3, le tuileur

> **Document temporaire.** Il sert à reprendre le chantier sur une autre
> machine. Une fois `README.md` et `GLOSSAIRE.md` mis à jour (première tâche
> ci-dessous), il n'a plus de raison d'être et se supprime.
>
> Rédigé le 11/08/2026, sur le portable de déplacement.

---

## 1. Où en est le chantier

**Lots 0 à 3 essentiellement faits, 228 tests verts.** Le pipeline va du bruit
au navigateur :

```
noise.py → dem.py → COG ─┬→ hydro.py + export.py → GeoPackage
                         └→ tiles.py + pyramid.py → tuiles PNG + TileJSON → viewer/
```

Deux modules et un visualiseur sont nés dans cette session :

| fichier | lignes | rôle |
|---|---:|---|
| `aeonir_gis/tiles.py` | 443 | géométrie du tuilage : adressage XYZ, cartographie inverse, échantillonnage, encodage terrarium |
| `aeonir_gis/pyramid.py` | 421 | empilement des niveaux, écriture PNG, TileJSON, CLI |
| `tests/test_tiles.py` | 473 | 30 tests |
| `tests/test_pyramid.py` | 311 | 20 tests |
| `viewer/index.html` | 436 | visualiseur MapLibre 6 |

Production actuelle : `python -m aeonir_gis.pyramid` → **821 tuiles, 50,3 Mio,
~107 s** sur un i5-7300HQ.

---

## 2. Les décisions prises, et pourquoi

### La pyramide a deux régimes

```
z ≤ 4   monde entier, rendu DIRECTEMENT depuis le MNT
z > 4   bande du terminateur seule, construite PAR LE BAS
```

**Le seuil de 4 est imposé, pas choisi.** Construire par le bas exige que les
quatre enfants d'un parent existent ; la bande vérifie cette fermeture entre
z=6 et z=5, et la **rompt** à z=4 — dont les parents `(7, 8)` réclament des
lignes `(14, 17)` que la bande ne contient pas. Poursuivre par le bas jusqu'à
z=1 obligerait à rendre le globe entier à z=6, soit 5 460 tuiles au lieu de 821.

**Le régime hybride vient d'Ewen**, contre ma proposition initiale (une pyramide
fermée avec `minzoom = 4`, 672 tuiles et aucune vue globale). Le sien coûte 22 %
de plus et donne une pyramide globale complète depuis z=0.

Conséquence heureuse : **aucune moyenne n'est jamais partielle**, donc le
`NODATA` ne se pose pas. Le problème se règle en choisissant le jeu de tuiles,
pas en rafistolant la moyenne.

### La construction se fait par le bas

Décision d'Ewen, contre ma proposition d'évaluer chaque niveau analytiquement :
(1) c'est plus proche des problèmes réels, (2) la propriété « le terrain est une
fonction » disparaîtra au premier modèle tectonique. Elle achète une garantie —
un pixel de `z−1` est **exactement** la moyenne de ses quatre enfants, vérifié
sur disque à 0,25 m près (la quantification du terrarium).

### La reprojection part du COG, jamais du générateur

Décision d'Ewen, avec un argument meilleur que le mien : le futur MNT tectonique
sera structurellement coûteux. D'où la formulation à retenir — **le pipeline
sépare ce qui coûte cher et ne se calcule qu'une fois (le terrain) de ce qui est
bon marché et se recalcule à volonté (projections et tuiles)**.

### Le canal bleu du terrarium est à zéro

Mesuré sur 36 tuiles réelles : 137,0 Kio avec, **54,9 Kio sans**, soit −60 %
pour une précision de 4 mm sur un monde qui a 11,8 km de relief. Ce n'est pas un
écart au standard — un décodeur lit `B = 0` et rend des mètres entiers.

### Le schéma XYZ ne référence aucun rayon

`crs.py` l'avait déjà écrit et je ne l'avais pas vu : passer de (lon, lat) à
(z, x, y) n'emploie que des angles et un logarithme. `WebMercatorQuad`
s'applique donc à Aeonir **sans mentir**. Le rayon ne réapparaît qu'à
l'affichage, via `TERRAIN_EXAGGERATION`. Le choix n'existait de toute façon pas :
MapLibre GL JS ne rend qu'en Web Mercator.

---

## 3. Les pièges découverts — à verser au GLOSSAIRE

Aucun n'est dans la documentation pour l'instant. Ils sont numérotés à la suite
des 23 existants.

**#24 — `PROJCRS` refuse une base géographique dérivée.** Un « Mercator Étoile »
est impossible : PROJ rend `Missing DATUM or ENSEMBLE node`, parce qu'un
`PROJCRS` exige une base portant un `DATUM` et que le repère Étoile est un CRS
dérivé. C'est ce qui impose la cartographie inverse — bonne nouvelle déguisée,
puisqu'elle divise par deux le nombre d'interpolations.

**#25 — La cartographie inverse : la donnée et la transformation vont en sens
opposés.** On itère sur les pixels de DESTINATION et on demande d'où ils
viennent, donc on emploie `star_to_crust` alors que la donnée va Croûte →
Étoile. Mesuré : en sens direct (*forward mapping*), avec pourtant 40 % de
pixels source de plus que de cases de destination, **39,6 % des cellules
restent vides et 27,9 % reçoivent plusieurs échantillons** (jusqu'à 1 221 pour
la pire — les pôles géographiques). La cartographie inverse rend exactement une
valeur par cellule, par construction.

**#26 — Le bilinéaire ne suffit pas quand on va dériver le résultat.** Un
ombrage **est** une dérivée. Le bilinéaire est C⁰ : sa dérivée est constante par
morceaux et saute à chaque frontière de cellule source, ce qui dessine des
**blocs rectangulaires** de la taille du pixel source — d'autant plus gros que
Mercator étire la latitude (blocs de 5 px mesurés à −79°). Catmull-Rom est C¹ et
l'artefact disparaît **à source identique**. Contrepartie : un noyau cubique
dépasse légèrement près d'une rupture de pente, sans conséquence sur du fBm.

**#27 — Lire la source à la résolution du niveau, pas en pleine résolution.**
Contre-intuitif : la pleine résolution rend le résultat *pire* (crénelage à la
place des blocs). `source_shape(zoom)` fait choisir à GDAL l'aperçu adapté du
COG, qui est en moyenne — donc une vraie moyenne d'aire.

**#28 — Une ligne qui traverse le monde entier ne survit pas au retuilage
GeoJSON.** Symptôme : les parallèles ne s'affichaient que dans les tuiles
`x = 0`, alors que les méridiens s'affichaient partout. La source GeoJSON de
MapLibre duplique les entités dans les copies du monde, et cette duplication
n'opère qu'en longitude — une polyligne remplissant exactement l'étendue
mondiale en x tombe dans ce cas limite. **On trace les parallèles par tronçons.**

**#29 — `line-dasharray` n'est pas pilotable par entité.** Le motif est rendu
via une texture construite par calque, donc un `["get", …]` y est refusé à la
validation, alors que `line-color` et `line-width` l'acceptent. Contournement :
deux calques et un filtre.

**#30 — MapLibre 6 est ESM uniquement.** Plus de bundle UMD, plus de variable
globale `maplibregl`, et **aucun export `default`** — il faut
`import * as maplibregl`. Corollaire : un module ES ne se charge **jamais**
depuis `file://` (origine opaque, la requête n'est pas HTTP), donc un serveur
statique est obligatoire.

**#31 — Ne pas comparer une jointure à la moyenne d'une tuile.** Erreur que j'ai
commise : en Mercator l'espacement des lignes varie du simple au décuple entre
le haut et le bas d'une tuile, donc l'écart médian sous-estime la référence
locale et fait crier à la couture. La bonne référence est l'écart entre les
**deux dernières lignes**, à la même latitude. Avec elle, les vingt jointures
testées de z=1 à z=4 donnent des rapports de 0,89 à 1,14 — aucune couture.

---

## 4. Les mesures qui ont changé une décision

| mesure | valeur | ce qu'elle a changé |
|---|---|---|
| poids réel d'une tuile terrarium | **129,6 Kio**, pas 40 | toutes mes projections de volume étaient fausses d'un facteur 3,2 |
| canal B mis à zéro | **−60 %** (137 → 54,9 Kio) | encodage retenu par défaut |
| tuiles grossières | **105 Kio à z=0** contre 58 à z=6 | la compression suit la douceur locale, pas la surface couverte |
| rendu d'une tuile | 21 ms | mais **79 ms** avec l'encodage PNG : le compresseur pèse les ¾ |
| fermeture jusqu'à z=1 | 5 460 tuiles, 293 Mio | a tué la pyramide fermée au profit de l'hybride |
| crénelage d'un niveau grossier | **1,6 %** de σ | bien moins que je ne l'avais annoncé — parce que ce terrain-ci est lisse |
| autocorrélation du relief | demi à **491 km** | à z=1 le motif fait 4 px : le fBm ne tient pas la vue planétaire |
| écart tuile vs bruit évalué directement | **44,7 m** médian pour σ = 2 333 | il n'y avait pas de bug à corriger |

---

## 5. Ce qui reste à faire

### Immédiat, avant toute autre chose

1. **La passe de documentation.** `README.md` et `GLOSSAIRE.md` n'ont **rien**
   reçu du Lot 3. Y verser les sections 2, 3 et 4 de ce fichier, puis supprimer
   ce fichier.
2. **Corriger l'erreur d'unité du README.** Il annonce le COG à « 442 Mio » ;
   le fichier fait 442 394 953 octets, soit **421,9 Mio** (442 **Mo**). L'erreur
   s'est propagée dans un chiffre dérivé : le gain de la compression DEFLATE est
   de **17,6 %**, pas 14 %. Trois endroits — lignes 55, 474 et 633.
3. **Migrer les exemples chiffrés de `hydro.py` vers `test_hydro.py`.**
   `resolve_roots` et `resolve_depths` portent encore leurs traces pas à pas en
   docstring, sous l'ancienne consigne (voir §6).

### Le défaut ouvert

**L'ombrage ne satisfait pas Ewen**, et la cause n'est pas identifiée. État de
la recherche :

- éliminé par la mesure — les coutures de données (§3 #31), le crénelage
  (§4, 1,6 %), les blocs d'interpolation (corrigés par le bicubique) ;
- éliminé par lecture du bundle — l'absence de reconstitution des bordures côté
  client : `backfillBorder` et `neighboringTiles` sont bien présents ;
- **reste à examiner** : la façon dont MapLibre calcule ses normales, et
  l'hypothèse que ce qu'on prend pour un défaut soit le terrain lui-même aux
  zooms faibles (§4, autocorrélation à 491 km).

Le visualiseur porte une **bascule une source / deux sources** pour comparer les
deux montages sur la même vue, plus la graticule et `showTileBoundaries`.

### La suite du chantier

4. **PMTiles** — fichier unique, index décrivant exactement les tuiles
   présentes, servi par requêtes HTTP Range. Devenu du confort depuis que les
   deux sources suppriment les 404, mais nécessaire dès z=8 et pour le Lot 6.
5. **Lot 4** — ce qui reste du front.
6. **Lot 6 — bascule vers un tuileur dynamique** : le même code déclenché par
   requête HTTP, lisant des plages dans le COG, l'époque en paramètre d'URL.
   C'est le pendant de la dimension temporelle d'une archive satellite.
7. **Lot 7 — géographie tectonique** (renuméroté, portait le 6). Le modèle
   hydrique complet y est rattaché ; il est **conçu et consigné dans
   `README.md`**, ne pas le reconstruire de mémoire.

### Dettes anciennes, toujours ouvertes

- `geo/` n'a **aucun job dans `ci.yml`** : les 228 tests ne tournent que
  localement.
- **Aucun code versionné ne produit les `out/*.wkt`** dont le README a besoin
  pour déclarer les SCR dans QGIS. À intégrer à `export.py`.
- `.claude/launch.json` est **versionné avec des chemins absolus
  `C:\Users\Ewen\…`** : ses trois configurations d'origine sont inopérantes sur
  toute autre machine. La quatrième (`geo-viewer`) est en relatif. À uniformiser.
- `requirements.txt` épingle les bibliothèques mais **pas l'interpréteur** :
  `fiona==1.10.1` n'a de roues que jusqu'à CPython 3.12.

---

## 6. Modifications apportées aux mémoires

**`feedback_work_style.md`** — deux entrées.

- *Exemples chiffrés → dans les tests, pas dans les docstrings.* Révision de la
  consigne du 07/08 : le code porte désormais **l'équation et l'URL de la
  source**, le test porte **l'arithmétique pas à pas**, chaque étape sous
  assertion. Raison empirique : deux exemples travaillés faux se sont glissés
  dans mes docstrings ; le premier n'a été vu que parce qu'un test l'a recoupé,
  le second a échoué à la seconde où il est entré dans un test. **Un exemple
  dans un commentaire n'est vérifié par rien.**
- *ESM par défaut, partout.* UMD et CommonJS sont des formats historiques à
  éviter. Vaut pour tout le dépôt.

**`project_geo_sig.md`** — trois entrées.

- Renumérotation : **Lot 6 = tuileur dynamique**, **Lot 7 = géographie**.
- Le poste visé porte sur l'**analyse d'images satellite** : COG + STAC +
  `titiler`, WMS/WMTS, MosaicJSON, cubes Zarr. Le tuileur batch écrit ici est la
  forme *batch* de ce que `rio-tiler` fait par requête ; les concepts
  transfèrent, ce qui s'ajoute est le temps comme dimension, le mosaïquage et
  les clés de cache.
- État au 11/08 et renvoi vers ce fichier.

---

## 7. Reprendre sur une autre machine

```bash
cd geo && python -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements.txt
```

```bash
cd geo/viewer && npm install
```

Puis, dans l'ordre — 228 tests doivent passer **avant** qu'aucune donnée
n'existe, c'est la preuve que le générateur est la source de vérité :

```bash
cd geo && .venv/Scripts/python.exe -m pytest -q
```

```bash
cd geo && .venv/Scripts/python.exe -m aeonir_gis.dem
```

```bash
cd geo && .venv/Scripts/python.exe -m aeonir_gis.export
```

```bash
cd geo && .venv/Scripts/python.exe -m aeonir_gis.pyramid
```

Le visualiseur se sert en HTTP — **jamais en ouvrant le fichier**, un module ES
ne se charge pas depuis `file://` :

```bash
cd geo/viewer && npm start
```

puis http://localhost:8765/viewer/
