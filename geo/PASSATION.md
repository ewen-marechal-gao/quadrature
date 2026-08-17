# Passation — reprise du Lot 3

> **Document temporaire**, rédigé le 11/08/2026 pour reprendre le chantier sur
> une autre machine. Il ne contient **que ce que le dépôt ne dit pas** : le
> raisonnement, les décisions et les mesures du Lot 3 sont désormais dans
> `README.md` et `GLOSSAIRE.md`. Le supprimer une fois le défaut ouvert traité.

---

## Où en est le chantier

**Lots 0 à 3 faits, 228 tests verts.** Le pipeline va du bruit au navigateur :

```
noise.py → dem.py → COG ─┬→ hydro.py + export.py → GeoPackage
                         └→ tiles.py + pyramid.py → tuiles PNG + TileJSON → viewer/
```

Production : `python -m aeonir_gis.pyramid` → **821 tuiles, 50,3 Mio, ~107 s**
sur un i5-7300HQ (comptez la moitié sur le poste fixe).

| fichier | lignes | rôle |
|---|---:|---|
| `aeonir_gis/tiles.py` | 443 | adressage XYZ, cartographie inverse, échantillonnage, terrarium |
| `aeonir_gis/pyramid.py` | 421 | empilement des niveaux, PNG, TileJSON, CLI |
| `tests/test_tiles.py` | 473 | 30 tests |
| `tests/test_pyramid.py` | 311 | 20 tests |
| `viewer/index.html` | 436 | visualiseur MapLibre 6 |

La documentation est **à jour** : section « Lot 3 — le tuileur » du `README.md`,
pièges **#24 à #31** du `GLOSSAIRE.md`, plus les entrées MapLibre, terrarium et
conteneurs de tuiles enrichies.

---

## Le défaut ouvert — l'ombrage

**C'est la seule chose qui bloque.** Ewen n'est pas satisfait du rendu de
l'ombrage, et la cause n'est pas identifiée.

Ce qui est **éliminé par la mesure** :

- *les coutures de données* — vingt jointures testées de z=1 à z=4, rapports de
  0,89 à 1,14 contre la référence locale (piège #31) ;
- *le crénelage* — 1,6 % de σ, et le suréchantillonnage ne l'améliore pas
  (139 → 124 puis plateau dès S=4) ;
- *les blocs d'interpolation* — corrigés par le passage au bicubique (piège #26),
  vérifiés à source identique ;
- *l'absence de reconstitution des bordures côté client* — `backfillBorder` et
  `neighboringTiles` sont bien dans le bundle MapLibre.

Ce qui **reste à examiner** :

1. la façon dont MapLibre calcule ses normales — nous n'avons jamais lu ce
   code, seulement constaté que le mécanisme de bordure existe ;
2. l'hypothèse que **ce qu'on prend pour un défaut soit le terrain lui-même**.
   Comparée au bruit évalué directement aux positions des pixels, notre tuile
   s'écarte de **44,7 m pour un σ de 2 333** — 1,9 % — et se trouve *plus lisse*,
   ce qui est correct. Et l'autocorrélation du relief tombe de moitié à 491 km,
   donc à z=1 le motif caractéristique fait **quatre pixels**. Il se pourrait
   qu'il n'y ait rien à corriger avant le Lot 7.

**Outils déjà en place pour trancher** : le visualiseur porte une bascule
*une source / deux sources* pour comparer les deux montages sur la même vue, la
graticule avec les latitudes remarquables, et `showTileBoundaries`.

---

## Ce qui reste à faire

### Court terme

1. **Trancher le défaut d'ombrage** (ci-dessus).
2. **Migrer les exemples chiffrés de `hydro.py` vers `test_hydro.py`.**
   `resolve_roots` et `resolve_depths` portent encore leurs traces pas à pas en
   docstring, sous l'ancienne consigne — voir la mémoire `feedback_work_style`.

### Suite du chantier

3. **PMTiles** — reporté au Lot 6, voir le README.
4. **Lot 4** — ce qui reste du front.
5. **Lot 6 — tuileur dynamique** : le même code déclenché par requête HTTP,
   lisant des plages dans le COG, l'époque en paramètre d'URL. C'est le pendant
   de la dimension temporelle d'une archive satellite.
6. **Lot 7 — géographie tectonique.** Le modèle hydrique complet y est rattaché ;
   il est **conçu et consigné dans le README**, ne pas le reconstruire de mémoire.

### Dettes anciennes, toujours ouvertes

- `geo/` n'a **aucun job dans `ci.yml`** : les 228 tests ne tournent que
  localement.
- **Aucun code versionné ne produit les `out/*.wkt`** dont le README a besoin
  pour déclarer les SCR dans QGIS. À intégrer à `export.py`.
- `.claude/launch.json` est **versionné avec des chemins absolus
  `C:\Users\Ewen\…`** : ses trois configurations d'origine sont inopérantes sur
  toute autre machine. La quatrième, `geo-viewer`, est en relatif.
- `requirements.txt` épingle les bibliothèques mais **pas l'interpréteur** :
  `fiona==1.10.1` n'a de roues que jusqu'à CPython 3.12.

---

## Modifications apportées aux mémoires

**`feedback_work_style`** — deux entrées.

- *Exemples chiffrés → dans les tests, pas dans les docstrings.* Révision de la
  consigne du 07/08 : le code porte **l'équation et l'URL de la source**, le test
  porte **l'arithmétique pas à pas**, chaque étape sous assertion. Raison
  empirique — deux exemples travaillés faux se sont glissés dans des docstrings
  du Lot 3 ; le premier n'a été vu que parce qu'un test l'a recoupé, le second a
  échoué à la seconde où il est entré dans un test. **Un exemple dans un
  commentaire n'est vérifié par rien.**
- *ESM par défaut, partout.* UMD et CommonJS sont des formats historiques à
  éviter. Vaut pour tout le dépôt.

**`project_geo_sig`** — trois entrées.

- Renumérotation : **Lot 6 = tuileur dynamique**, **Lot 7 = géographie**.
- Le poste visé porte sur l'**analyse d'images satellite** : COG + STAC +
  `titiler`, WMS/WMTS, MosaicJSON, cubes Zarr. Le tuileur écrit ici est la forme
  *batch* de ce que `rio-tiler` fait par requête ; les concepts transfèrent, ce
  qui s'ajoute est le temps comme dimension, le mosaïquage et les clés de cache.
- État au 11/08 et renvoi vers ce fichier.

---

## Reprendre sur une autre machine

```bash
cd geo && python -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements.txt
```

```bash
cd geo/viewer && npm install
```

Les 228 tests doivent passer **avant** qu'aucune donnée n'existe — c'est la
preuve que le générateur est la source de vérité :

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
