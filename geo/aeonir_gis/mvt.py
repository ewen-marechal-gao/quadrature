"""Le tuileur vectoriel — du sommet Croûte à la tuile MVT.

:mod:`aeonir_gis.pyramid` fait la pyramide raster ; celui-ci fait la
vectorielle. Les deux partagent la grille de :mod:`aeonir_gis.tiles`, et rien
d'autre, parce que **tout le reste s'inverse**.

## L'inversion qui structure le module

Un rééchantillonnage raster itère sur les pixels d'**arrivée** et demande à
chacun d'où il vient : le tuileur raster applique donc ``star_to_crust``, la
transformation *inverse*. Un tuileur vectoriel n'a pas de pixel à remplir — il a
des sommets à transporter, et il applique ``crust_to_star``, la transformation
*directe*.

C'est le même déplacement de repère pris dans les deux sens, et se tromper de
sens ne lève aucune erreur : la carte sort décalée de la double rotation.

## Où passe la frontière entre ce qu'on écrit et ce qu'on délègue

Règle du chantier : **on délègue la plomberie, on implémente les concepts.** Le
partage tombe ici entre deux choses que « l'encodage MVT » recouvre :

* le **cadrage protobuf** — varint, types de fil, champs délimités, zigzag,
  entiers de commande. C'est de la sérialisation générique. Elle est déléguée à
  ``mapbox-vector-tile``, qui la fait mieux : il corrige de lui-même
  l'enroulement des anneaux, répare les polygones dégénérés, et sort une tuile
  d'essai en 236 octets là où une implémentation à la main en produisait 245 ;
* la **cartographie** — changement de repère, déroulement de la couture,
  simplification, découpage, politique de généralisation. Rien de tout cela
  n'existe dans une bibliothèque d'encodage, et c'est le sujet du lot.

## Ce qui vit ici, et ce qui vit à côté

Ce module porte le **métier** : les couches d'Aeonir et ce qui les classe, le
passage du repère Croûte au repère Étoile, l'assemblage de la pyramide, le
contrat livré au client. Les **algorithmes** qu'il emploie — Douglas-Peucker,
Cohen-Sutherland, Sutherland-Hodgman, quantification, déroulement angulaire —
vivent dans :mod:`aeonir_gis.geometry`, qui n'importe rien du projet.

Le partage n'est pas cosmétique : il rend testable, sur des suites de couples de
nombres, tout ce qui n'a pas besoin d'une planète. Et il donne un critère net
quand on hésite sur l'endroit où poser une fonction — si elle a besoin d'une
constante du monde, elle est ici.

Ce que le format a d'instructif — le curseur relatif, la répétition portée dans
l'entier de commande, l'enroulement qui distingue un trou d'un plein — est
consigné dans ``geo/TUTORIAL.md``. Une connaissance n'a pas besoin d'être
exécutable pour être acquise, et un encodeur écrit à la main est une surface de
maintenance que ce dépôt n'a aucune raison de porter.

## Sources

* MVT 2.1 : https://github.com/mapbox/vector-tile-spec/tree/master/2.1
* Encodage protobuf : https://protobuf.dev/programming-guides/encoding/
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path
from typing import Final, Sequence

import fiona
import numpy as np
from mapbox_vector_tile import encode as encode_tile
from mapbox_vector_tile.encoder import on_invalid_geometry_make_valid
from shapely.geometry import (LineString, MultiLineString, MultiPoint, Point,
                              Polygon)

from . import pyramid, tiles
from .crs import crust_to_star
from .geometry import (clip_line, clip_ring, douglas_peucker, quantise,
                       unwrap_longitudes)
from .dem import MAX_ZOOM
from .pyramid import SPLIT_ZOOM

EXTENT: Final[int] = 4096
"""Côté de la grille entière interne à une tuile.

⚠️ Ce n'est **pas** une résolution en mètres, et c'est le piège 8 : la géométrie
livrée est quantifiée sur cette grille, donc la tuile n'est jamais la vérité.

Le pas qu'elle représente dépend du zoom. À z=6, une tuile couvre 5,625° de
longitude, soit 469 km à l'équateur : le pas vaut donc 114 m, quand le MNT servi
au même niveau a des pixels de 1,83 km. La quantification n'est pas le facteur
limitant de cette chaîne — la généralisation l'est.

## Ce que l'extent coûte, mesuré

Intuition courante : « une grille plus fine, donc des tuiles plus lourdes ».
Elle est vraie, mais **beaucoup plus faiblement qu'on ne le croit**, et pour une
raison qui vaut d'être sue.

Le nombre d'entiers de commande ne dépend **pas** de l'extent : il est fixé par
le nombre de sommets. Mesuré sur les fleuves à z=4, à tolérance et marge mises à
l'échelle, de l'extent 512 à 16 384 — un facteur 32 :

    extent   sommets   octets   Δ sur 1 octet   pas au sol
       512   105 150  733 651        99,9 %        3 656 m
     1 024   105 641  739 104        99,6 %        1 828 m
     2 048   105 772  746 870        96,1 %          914 m
     4 096   105 812  762 959        87,0 %          457 m
     8 192   105 827  795 939        68,8 %          228 m
    16 384   105 842  864 154        40,2 %          114 m

Les sommets varient de 0,7 % sur toute la plage ; les octets de +18 %. Ce qui
change n'est pas le NOMBRE des paramètres mais leur LARGEUR : zigzagué puis mis
en varint, un déplacement tient sur un octet jusqu'à ±63 et sur deux jusqu'à
±8 191. Doubler l'extent double les déplacements et en pousse une part au-delà
du seuil — la colonne « Δ sur 1 octet » est ce basculement, et rien d'autre.

**Le compromis existe donc, mais il est très favorable à la précision** : ×32 de
finesse pour +18 % de volume. Il ne mordrait qu'au-delà de 8 192. Ce qui pilote
réellement le poids d'une tuile, c'est le nombre de sommets — donc la
simplification et la généralisation, pas l'extent.

## Pourquoi 4096 malgré tout

Aucune des trois raisons n'est une histoire d'octets :

* c'est la **valeur par défaut de la spécification** — tout décodeur l'attend, et
  s'en écarter n'achète rien qu'il faille payer en surprise ;
* c'est une **puissance de deux**, donc le sur-zoom subdivise sans dérive : les
  coordonnées d'une tuile fille se déduisent de la mère par un décalage de bits ;
* elle doit rester **supérieure à la taille de rendu en pixels**, sinon la
  quantification devient visible à l'écran. À 512 px de rendu, 4 096 laisse huit
  pas par pixel.

⚠️ **L'extent n'est pas un réglage isolé dans ce module.** :data:`BUFFER` et
:data:`SIMPLIFY_TOLERANCE` sont eux aussi exprimés en unités de tuile : le
changer seul change trois choses à la fois. Mesuré naïvement — extent seul, les
deux autres figées — la courbe des octets devient un **U de minimum 4 096**, ce
qui « prouverait » l'optimalité de cette valeur pour une raison entièrement
fausse : à extent 512, une marge de 64 unités vaut 12,5 % de la tuile au lieu de
1,6 %, et c'est la duplication de bordure qu'on mesure, pas l'encodage.
"""

BUFFER: Final[int] = 64
"""Marge de découpe, en unités de tuile — soit 1,6 % du côté.

Sans marge, un trait qui longe le bord d'une tuile s'y arrête net et reprend
dans la voisine : au rendu, l'épaisseur du trait déborde du bord et la jointure
se voit. On découpe donc un peu **au-delà** de la tuile, et le client rogne.

64 est la valeur qu'emploient les tuileurs courants pour des traits fins. Elle
coûte ce qu'elle duplique, et ce coût se mesure : sur la couche des fleuves à
z=4, la marge fait passer 20 288 morceaux et 717 413 octets à 21 617 et
762 959, soit **+6,4 % de volume**. À z=6, +5,6 %.

⚠️ Cette constante est la valeur *par défaut* du paramètre ``buffer`` de
:func:`tile_layer`, donc liée à la définition de la fonction. La réassigner à
l'exécution ne change rien — mesurer son effet impose de passer le paramètre.
C'est ainsi que la première version de ce chiffre est sortie à « coût nul ».

⚠️ Exprimée en unités de tuile, elle est donc **solidaire de** :data:`EXTENT` :
changer l'un sans l'autre change la marge en proportion de la tuile. Voir la
mise en garde qui clôt la documentation de l'extent.
"""

# ─────────────────────────────────────────────────────────────────────────
#  L'encodage — délégué, mais pas aveuglément
# ─────────────────────────────────────────────────────────────────────────

POINT: Final[int] = 1
LINESTRING: Final[int] = 2
POLYGON: Final[int] = 3
"""Types de géométrie de la spécification MVT.

Conservés comme entiers plutôt que remplacés par les classes Shapely : ils
pilotent le branchement du découpage, où un point, une ligne et un anneau
n'obéissent pas aux mêmes règles, et cette distinction est antérieure à
l'encodage.
"""

ENCODE_OPTIONS: Final[dict] = {
    "extents": EXTENT,
    "y_coord_down": True,
    "on_invalid_geometry": on_invalid_geometry_make_valid,
}
"""Options passées à l'encodeur, et pourquoi chacune.

``y_coord_down`` déclare que nos coordonnées sont **déjà** dans le repère de la
tuile, l'axe y vers le bas. ⚠️ Sans elle, l'encodeur retourne verticalement ce
qu'on lui donne, et la carte sort en miroir sans qu'aucune erreur soit levée —
c'est le bug d'initiation du métier (piège 3) déplacé d'un cran.

``extents`` doit valoir :data:`EXTENT`, sans quoi la quantification ne
correspondrait plus à la grille sur laquelle le découpage a travaillé.

``on_invalid_geometry_make_valid`` répare au lieu de rejeter, et ce n'est pas
une précaution de confort : :func:`clip_ring` produit, sur un anneau concave,
des liaisons qui longent le bord de la tuile. Les bassins versants sont tous
concaves. C'est cette option qui rend l'algorithme simple acceptable.
"""


def to_geometry(kind: int, parts: Sequence[Sequence[tuple[int, int]]]):
    """Parties en coordonnées entières de tuile → géométrie Shapely.

    Pour un polygone, la **première partie est l'enveloppe** et les suivantes
    ses trous : c'est l'ordre que :func:`tile_layer` conserve depuis la source.
    L'enroulement, lui, n'est pas notre affaire — l'encodeur impose le sien, et
    le vérifier ici serait le faire deux fois.
    """
    if kind == POINT:
        flat = [point for part in parts for point in part]
        if not flat:
            return None
        return Point(flat[0]) if len(flat) == 1 else MultiPoint(flat)

    if kind == LINESTRING:
        usable = [part for part in parts if len(part) >= 2]
        if not usable:
            return None
        return (LineString(usable[0]) if len(usable) == 1
                else MultiLineString(usable))

    rings = [part for part in parts if len(part) >= 3]
    if not rings:
        return None
    return Polygon(rings[0], rings[1:])


# ─────────────────────────────────────────────────────────────────────────
#  L'espace tuile — du degré Étoile à l'unité de grille
# ─────────────────────────────────────────────────────────────────────────


def world_xy(longitude_deg, latitude_deg):
    """Degrés Étoile → carré unité Mercator, ``(0, 0)`` au coin haut-gauche.

    Cette normalisation est *indépendante du zoom* : c'est ce qui permet de
    transformer et de découper **une seule fois** pour toute la pyramide.
    """
    x = (np.asarray(longitude_deg, dtype=float) + 180.0) / 360.0
    return x, tiles.mercator_y(np.asarray(latitude_deg, dtype=float))


def grid_units(x, y, zoom: int, extent: int = EXTENT):
    """Carré unité → unités de tuile **globales** à ce niveau.

    Un sommet vaut ici ``x · 2^z · extent`` : les coordonnées locales d'une
    tuile s'en déduisent par une soustraction, sans nouveau calcul.
    """
    scale = float(tiles.grid_side(zoom) * extent)
    return (np.asarray(x, dtype=float) * scale,
            np.asarray(y, dtype=float) * scale)


# ─────────────────────────────────────────────────────────────────────────
#  La généralisation — simplifier AVANT de découper
# ─────────────────────────────────────────────────────────────────────────

SIMPLIFY_TOLERANCE: Final[float] = 1.0
"""Tolérance de Douglas-Peucker, en unités de tuile.

En deçà de 1, la simplification ne peut rien retirer que la quantification
n'efface déjà — les sommets tombent sur le même entier. Au-delà, elle retire du
relief réel. C'est donc le plus petit seuil qui fasse encore quelque chose.

⚠️ Exprimée en unités de tuile, elle est donc **solidaire de** :data:`EXTENT` :
la garder fixe en changeant l'extent change la sévérité réelle de la
simplification, au sol, du même facteur.
"""


# ─────────────────────────────────────────────────────────────────────────
#  Les couches, et ce qui les classe
# ─────────────────────────────────────────────────────────────────────────

LAYERS: Final[dict] = {
    "fleuves": {"kind": LINESTRING, "rank": "drainage_km2",
                "keep": ("strahler", "drainage_km2")},
    "exutoires": {"kind": POINT, "rank": "drainage_km2",
                  "keep": ("bassin", "drainage_km2", "altitude_m")},
    "bassins": {"kind": POLYGON, "rank": "aire_km2",
                "keep": ("bassin", "aire_km2")},
}
"""Ce qu'on tuile, et l'attribut sur lequel se décide la généralisation.

⚠️ **``rank`` n'est pas ``strahler``, et c'est un choix mesuré.** L'ordre de
Strahler est l'idiome cartographique — il reste porté, et c'est lui qui donnera
la largeur du trait — mais il est inutilisable pour *sélectionner* :

* il n'offre que quatre paliers, et ils gardent 100 %, 19 %, 1,4 % puis 0,02 %
  des lignes : rien n'existe entre « tout » et « un cinquième » ;
* il ne classe pas par débit. Un tronçon d'ordre 1 draine jusqu'à 226 421 km²,
  au-dessus du minimum de l'ordre 3 (33 648 km²), et 8,5 % des lignes d'ordre 1
  dépassent la médiane de l'ordre 2.

Le second point est structurel, non accidentel : Strahler compte des
**confluences**, pas de l'eau, et un long tronc sans affluent de rang égal reste
d'ordre 1 quelle qu'en soit l'importance. C'est le régime d'un terrain fBm,
pauvre en confluences.

``drainage_km2`` est continu et monotone par construction — c'est une aire
accumulée — donc il donne un seuil exact par niveau au lieu d'un palier subi.
La matrice des deux est produite par :func:`rank_matrix`, qui est la pièce à
conviction plutôt qu'un argument.
"""

FEATURE_BUDGET: Final[int] = 1000
"""Nombre d'entités qu'on accepte au plus dans la tuile la plus chargée.

Le vrai plafond est en **octets** — c'est ce que le client télécharge — mais il
n'est connu qu'après encodage, donc on pilote sur le compte et on vérifie les
octets au bilan. Le rapport mesuré entre les deux est imprimé par ``build`` ;
s'il dérive, c'est ce budget qu'il faut corriger, pas la politique.

⚠️ Le maximum, pas la moyenne. Une pyramide se juge sur sa tuile la plus lourde :
c'est celle que le client attend, et une moyenne saine peut cacher une tuile de
bassin versant dix fois au-dessus des autres.
"""


def _to_world(longitudes, latitudes, epoch_a: float):
    """Croûte → Étoile → carré unité, en déroulant la couture.

    Le bornage en latitude n'est pas une approximation : Mercator diverge aux
    pôles et ``mercator_y`` y renverrait l'infini, ce qui empoisonnerait toute
    la géométrie de la tuile. La grille elle-même s'arrête à cette latitude.

    ⚠️ ``epoch_a`` doit être transmis, et son oubli est **doublement muet** :
    l'époque 0 est la valeur par défaut, et à l'époque 0 le changement de repère
    est son propre inverse (voir :func:`read_layer`). Un paramètre ignoré y rend
    donc exactement le même résultat qu'un paramètre honoré.
    """
    star_lon, star_lat = crust_to_star(np.asarray(longitudes, dtype=float),
                                       np.asarray(latitudes, dtype=float),
                                       epoch_a)
    limit = tiles.WEB_MERCATOR_LIMIT_DEG
    star_lat = np.clip(star_lat, -limit, limit)
    return world_xy(unwrap_longitudes(star_lon), star_lat)


def read_layer(path, name: str, *, epoch_a: float = 0.0) -> list[dict]:
    """Lit une couche du GeoPackage et la porte dans le carré unité.

    Le changement de repère se fait **ici, une seule fois**, et non par niveau :
    il ne dépend pas du zoom, et ``crust_to_star`` est de loin l'opération la
    plus chère de la chaîne.
    """
    spec = LAYERS[name]
    records: list[dict] = []
    with fiona.open(path, layer=name) as source:
        for feature in source:
            geometry = feature["geometry"]
            coordinates = geometry["coordinates"]
            if spec["kind"] == POINT:
                rings = [[coordinates]]
            elif spec["kind"] == LINESTRING:
                rings = [coordinates]
            else:
                rings = list(coordinates)
            parts = []
            for ring in rings:
                array = np.asarray(ring, dtype=float)
                x, y = _to_world(array[:, 0], array[:, 1], epoch_a)
                parts.append(np.column_stack([x, y]))
            properties = feature["properties"]
            records.append({
                "parts": parts,
                "rank": float(properties[spec["rank"]]),
                "properties": {key: properties[key] for key in spec["keep"]},
            })
    return records


# ─────────────────────────────────────────────────────────────────────────
#  Le tuilage — découper tout, choisir ensuite
# ─────────────────────────────────────────────────────────────────────────


def tile_layer(records: Sequence[dict], name: str, zoom: int,
               rows: tuple[int, int], *, extent: int = EXTENT,
               buffer: int = BUFFER,
               tolerance: float = SIMPLIFY_TOLERANCE) -> dict:
    """Découpe une couche entière à un niveau, **sans filtrer**.

    Renvoie ``{(x, y): [(index, parties), …]}``, les parties étant déjà en
    coordonnées entières de tuile.

    ## Pourquoi on découpe avant de choisir

    Le seuil de généralisation se décide sur la charge d'une tuile, et la charge
    d'une tuile n'est connue qu'après découpage — une entité longue en alimente
    plusieurs. Découper d'abord rend donc le compte **exact par construction**,
    au lieu de l'estimer sur des boîtes englobantes qui le surévaluent.

    Le coût est de garder la découpe complète en mémoire un niveau à la fois.
    Sur ce réseau, c'est quelques mégaoctets.

    ## Pourquoi on simplifie avant de découper

    ⚠️ L'ordre importe et l'inverse est un piège. Simplifier *après* découpage
    fait travailler Douglas-Peucker sur deux morceaux dont les extrémités sont
    des points de coupure différents : les deux moitiés d'un même fleuve ne
    retiennent plus les mêmes sommets, et un décalage apparaît à la limite de
    tuile. Simplifier avant, dans les unités du niveau, garantit que les
    voisines partagent exactement les sommets de leur frontière.
    """
    kind = LAYERS[name]["kind"]
    side = tiles.grid_side(zoom)
    world = float(side * extent)
    first_row, last_row = rows
    window = (-float(buffer), -float(buffer),
              float(extent + buffer), float(extent + buffer))
    out: dict[tuple[int, int], list] = {}

    for index, record in enumerate(records):
        scaled = []
        for part in record["parts"]:
            x, y = grid_units(part[:, 0], part[:, 1], zoom, extent)
            points = list(zip(x.tolist(), y.tolist()))
            if kind != POINT and tolerance > 0:
                points = douglas_peucker(points, tolerance)
            scaled.append(points)

        flat = [point for part in scaled for point in part]
        if not flat:
            continue
        xs = [point[0] for point in flat]
        ys = [point[1] for point in flat]
        # Les colonnes peuvent sortir de [0, side[ : c'est le déroulement, et
        # c'est le repli modulo qui les remet en place.
        column_first = int(math.floor((min(xs) - buffer) / extent))
        column_last = int(math.floor((max(xs) + buffer) / extent))
        row_first = max(first_row, int(math.floor((min(ys) - buffer) / extent)))
        row_last = min(last_row, int(math.floor((max(ys) + buffer) / extent)))

        for column in range(column_first, column_last + 1):
            for row in range(row_first, row_last + 1):
                origin_x = column * extent
                origin_y = row * extent
                pieces = []
                for points in scaled:
                    local = [(px - origin_x, py - origin_y)
                             for px, py in points]
                    if kind == POINT:
                        inside = [point for point in local
                                  if window[0] <= point[0] <= window[2]
                                  and window[1] <= point[1] <= window[3]]
                        if inside:
                            pieces.append(inside)
                    elif kind == LINESTRING:
                        pieces.extend(clip_line(local, window))
                    else:
                        ring = clip_ring(local, window)
                        if len(ring) >= 3:
                            pieces.append(ring)
                if not pieces:
                    continue
                quantised = []
                for piece in pieces:
                    points = quantise(piece)
                    minimum = 1 if kind == POINT else (
                        3 if kind == POLYGON else 2)
                    if len(points) < minimum:
                        continue
                    quantised.append(points)
                if quantised:
                    key = (column % side, row)
                    out.setdefault(key, []).append((index, quantised))
    return out


# ─────────────────────────────────────────────────────────────────────────
#  La politique — la matrice, puis le seuil
# ─────────────────────────────────────────────────────────────────────────


def rank_matrix(placed: dict, records: Sequence[dict],
                thresholds: Sequence[float]) -> list[tuple[float, int, int]]:
    """Charge de la tuile la plus lourde, pour chaque seuil candidat.

    Renvoie ``[(seuil, entités retenues, charge maximale), …]``. La découpe
    étant déjà faite, un seuil ne coûte qu'une somme : c'est ce qui permet
    d'explorer toute la colonne au lieu d'en deviner une valeur.
    """
    out = []
    for threshold in thresholds:
        kept = {index for index, record in enumerate(records)
                if record["rank"] >= threshold}
        if not kept:
            out.append((threshold, 0, 0))
            continue
        worst = 0
        for entries in placed.values():
            load = sum(1 for index, _ in entries if index in kept)
            worst = max(worst, load)
        out.append((threshold, len(kept), worst))
    return out


def choose_threshold(matrix: Sequence[tuple[float, int, int]],
                     budget: int) -> float:
    """Le seuil le plus **bas** dont la tuile la plus lourde tient au budget.

    Plus bas veut dire plus riche : on cherche le maximum de détail compatible
    avec le plafond, et non un compromis. Si aucun ne tient, on prend le plus
    sévère — la couche sort alors trop chargée, et le bilan le dit plutôt que de
    le taire.
    """
    admissible = [threshold for threshold, _, worst in matrix
                  if 0 < worst <= budget]
    if admissible:
        return min(admissible)
    return max(threshold for threshold, _, _ in matrix)


def candidate_thresholds(records: Sequence[dict], count: int = 24
                         ) -> list[float]:
    """Quantiles du rang, du plus permissif au plus sévère.

    Des quantiles plutôt qu'une progression géométrique : ils s'adaptent à la
    distribution réelle au lieu de la supposer, et le premier candidat est
    toujours « tout garder ».
    """
    ranks = np.asarray([record["rank"] for record in records], dtype=float)
    if ranks.size == 0:
        return [0.0]
    quantiles = np.linspace(0.0, 99.5, count)
    return sorted({float(value) for value in np.percentile(ranks, quantiles)})


# ─────────────────────────────────────────────────────────────────────────
#  L'écriture — la pyramide vectorielle et son contrat
# ─────────────────────────────────────────────────────────────────────────


def write_tilejson(path: Path, *, rows: dict, split_zoom: int,
                   thresholds: dict, matrices: dict, extent: int,
                   epoch_a: float, min_zoom: int, max_zoom: int) -> None:
    """Le contrat TileJSON 3.0, plus la trace de la politique.

    ``vector_layers`` est **obligatoire** pour une source vectorielle, quand il
    n'existe pas pour une source raster : le client doit connaître les noms de
    couches et de champs avant d'avoir vu la moindre tuile, puisque c'est lui
    qui les met en forme. Une source vectorielle sans ``vector_layers`` se
    charge, ne rend rien, et ne se plaint pas.

    ``aeonir:generalisation`` n'appartient pas à la spécification et n'est lu
    par personne — c'est délibéré. Le seuil appliqué à chaque niveau est le
    seul renseignement qui permette de relire une tuile pour ce qu'elle est :
    sans lui, une couche clairsemée au dézoom se lit comme une donnée pauvre
    au lieu d'une donnée généralisée.
    """
    # ⚠️ ``bounds`` annonce le MONDE, et non la bande — parce que la pyramide
    # couvre bien le monde entier jusqu'à ``split_zoom``. Déclarer la bande
    # ferait renoncer le client aux niveaux grossiers hors terminateur, où les
    # tuiles existent pourtant.
    #
    # « Global jusqu'à 4, ruban au-delà » ne s'écrit dans aucun champ standard :
    # TileJSON n'a qu'une seule ``bounds``. Le client le reconstitue à partir de
    # ``split_zoom`` et ``band_bounds``, exactement comme pour la pyramide
    # raster — c'est le même découpage de couches, sur les mêmes latitudes.
    document = {
        "tilejson": "3.0.0",
        "name": "aeonir-hydro",
        "description": "Hydrographie d'Aeonir, repère Étoile.",
        "scheme": "xyz",
        "format": "pbf",
        "tiles": ["{z}/{x}/{y}.pbf"],
        "minzoom": min_zoom,
        "maxzoom": max_zoom,
        "bounds": [-180.0, -tiles.WEB_MERCATOR_LIMIT_DEG,
                   180.0, tiles.WEB_MERCATOR_LIMIT_DEG],
        "center": [0.0, 0.0, min(max_zoom, 4)],
        "vector_layers": [
            {
                "id": name,
                "description": f"{name} — généralisé par {spec['rank']}",
                "minzoom": min_zoom,
                "maxzoom": max_zoom,
                "fields": {key: ("Number" if key != "nom" else "String")
                           for key in spec["keep"]},
            }
            for name, spec in LAYERS.items()
        ],
        "aeonir:epoch_a": epoch_a,
        "aeonir:extent": extent,
        "aeonir:frame": "star",
        "aeonir:split_zoom": split_zoom,
        "aeonir:band_bounds": pyramid.band_bounds(rows, split_zoom),
        "aeonir:generalisation": {
            name: {str(zoom): round(thresholds[name][zoom], 1)
                   for zoom in sorted(thresholds[name])}
            for name in thresholds
        },
    }
    path.write_text(json.dumps(document, indent=2, ensure_ascii=False),
                    encoding="utf-8")

    # ⚠️ La matrice complète ne va PAS dans le TileJSON. Elle y pesait 58 Ko —
    # soit, à chaque chargement de carte, plus que quinze tuiles de bande, pour
    # une donnée qu'aucun client ne lit. Le TileJSON ne garde que le seuil
    # appliqué, qui est le seul renseignement nécessaire pour relire une tuile.
    (path.parent / "generalisation.json").write_text(
        json.dumps({"budget": FEATURE_BUDGET, "matrice": matrices},
                   indent=2, ensure_ascii=False), encoding="utf-8")


def build(gpkg: Path, directory: Path, *, min_zoom: int = 0,
          max_zoom: int = MAX_ZOOM, split_zoom: int = SPLIT_ZOOM,
          epoch_a: float = 0.0, budget: int = FEATURE_BUDGET,
          extent: int = EXTENT, tolerance: float = SIMPLIFY_TOLERANCE) -> dict:
    """Produit la pyramide vectorielle complète et renvoie son bilan.

    Une tuile porte **toutes les couches** — une seule requête, un seul fichier.
    C'est l'écart le plus net avec la pyramide raster, où chaque grandeur a sa
    propre source : le vecteur regroupe parce que le client sait trier, le
    raster sépare parce qu'il ne le sait pas.
    """
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    rows = pyramid.plan(min_zoom, max_zoom, split_zoom)

    records = {name: read_layer(gpkg, name, epoch_a=epoch_a)
               for name in LAYERS}
    thresholds: dict[str, dict[int, float]] = {name: {} for name in LAYERS}
    matrices: dict[str, dict] = {name: {} for name in LAYERS}
    report: dict[int, dict] = {}

    for zoom in range(min_zoom, max_zoom + 1):
        started = time.time()
        placed = {}
        kept_indices = {}
        for name, layer_records in records.items():
            placed[name] = tile_layer(layer_records, name, zoom, rows[zoom],
                                      extent=extent, tolerance=tolerance)
            matrix = rank_matrix(placed[name], layer_records,
                                 candidate_thresholds(layer_records))
            threshold = choose_threshold(matrix, budget)
            thresholds[name][zoom] = threshold
            matrices[name][str(zoom)] = [
                {"seuil": round(seuil, 3), "entites": kept, "charge_max": worst}
                for seuil, kept, worst in matrix
            ]
            kept_indices[name] = {
                index for index, record in enumerate(layer_records)
                if record["rank"] >= threshold
            }

        coordinates = {key for layer in placed.values() for key in layer}
        written = total_bytes = features = 0
        for x, y in sorted(coordinates):
            layers = []
            for name in LAYERS:
                entries = placed[name].get((x, y), ())
                kind = LAYERS[name]["kind"]
                encoded = []
                for index, parts in entries:
                    if index not in kept_indices[name]:
                        continue
                    geometry = to_geometry(kind, parts)
                    if geometry is None or geometry.is_empty:
                        continue
                    encoded.append({
                        "geometry": geometry,
                        "properties": records[name][index]["properties"],
                    })
                if encoded:
                    layers.append({"name": name, "features": encoded})
                    features += len(encoded)
            if not layers:
                continue
            payload = encode_tile(
                layers, default_options={**ENCODE_OPTIONS, "extents": extent})
            target = directory / str(zoom) / str(x)
            target.mkdir(parents=True, exist_ok=True)
            (target / f"{y}.pbf").write_bytes(payload)
            written += 1
            total_bytes += len(payload)

        report[zoom] = {
            "tiles": written, "bytes": total_bytes, "features": features,
            "seconds": time.time() - started,
            "thresholds": {name: thresholds[name][zoom] for name in LAYERS},
        }

    write_tilejson(directory / "hydro.json", rows=rows, split_zoom=split_zoom,
                   thresholds=thresholds, matrices=matrices, extent=extent,
                   epoch_a=epoch_a, min_zoom=min_zoom, max_zoom=max_zoom)
    return report


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(
        prog="python -m aeonir_gis.mvt",
        description="Pyramide de tuiles vectorielles MVT, repère Étoile.")
    parser.add_argument("-i", "--gpkg", type=Path,
                        default=Path("out/aeonir_hydro.gpkg"))
    parser.add_argument("-o", "--out", type=Path, default=Path("out/vector"))
    parser.add_argument("--max-zoom", type=int, default=MAX_ZOOM)
    parser.add_argument("--split-zoom", type=int, default=SPLIT_ZOOM,
                        help="dernier niveau tuilé sur le monde entier")
    parser.add_argument("--budget", type=int, default=FEATURE_BUDGET,
                        help="entités admises dans la tuile la plus lourde")
    parser.add_argument("--epoch", type=float, default=0.0,
                        help="époque du repère Étoile, en années")
    args = parser.parse_args(argv)

    print(f"Tuiles vectorielles z=0..{args.max_zoom}, "
          f"époque {args.epoch:g} a")
    print(f"  monde entier jusqu'à z={args.split_zoom}, bande au-delà")
    print(f"  budget {args.budget} entités par tuile")

    report = build(args.gpkg, args.out, max_zoom=args.max_zoom,
                   split_zoom=args.split_zoom, epoch_a=args.epoch,
                   budget=args.budget)

    header = " ".join(f"{name[:9]:>9}" for name in LAYERS)
    print(f"\n{'z':>3} {'tuiles':>7} {'entités':>8} {'volume':>9} "
          f"{'Kio/tuile':>10} {'o/entité':>9} {'durée':>7}   seuils {header}")
    total_bytes = total_tiles = total_features = 0
    for zoom in sorted(report):
        line = report[zoom]
        total_bytes += line["bytes"]
        total_tiles += line["tiles"]
        total_features += line["features"]
        per_tile = line["bytes"] / line["tiles"] / 1024 if line["tiles"] else 0
        per_feature = line["bytes"] / line["features"] if line["features"] else 0
        seuils = " ".join(f"{line['thresholds'][name]:>9.0f}"
                          for name in LAYERS)
        print(f"{zoom:>3} {line['tiles']:>7,d} {line['features']:>8,d} "
              f"{line['bytes'] / 2**20:>8.2f}M {per_tile:>10.1f} "
              f"{per_feature:>9.0f} {line['seconds']:>6.1f}s          {seuils}")
    print(f"\n  {total_tiles:,d} tuiles, {total_features:,d} entités, "
          f"{total_bytes / 2**20:.1f} Mio")
    print(f"  → {args.out} (+ hydro.json)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
