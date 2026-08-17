"""Le tuileur — de la grille du monde à la grille des tuiles.

Un tuileur est une fonction ``(z, x, y) → octets``. Ce module en écrit la
moitié géométrique : où se trouve une tuile, et quelles altitudes remplissent
ses pixels. L'encodage et l'empilement de la pyramide sont dans
:mod:`aeonir_gis.pyramid`.

## Le schéma XYZ n'a pas de rayon

C'est le point qui autorise Aeonir à utiliser `WebMercatorQuad` sans mentir :
passer de ``(lon, lat)`` à ``(z, x, y)`` n'emploie que des angles et un
logarithme. Le rayon de la planète n'y figure pas — il ne réapparaît qu'au
moment de convertir en mètres, ce que le tuilage ne fait jamais.

Corollaire : ``crs.MERCATOR_WKT`` ne sert **pas** ici. Il est là pour
l'analyse métrique, et les confondre mènerait à croire qu'il faut un CRS par
planète pour tuiler.

## La cartographie inverse : la donnée et la transformation vont en sens opposés

La donnée va de la Croûte vers l'Étoile. La transformation employée fait le
chemin **inverse**, et ce n'est pas une inadvertance : c'est ainsi que tout
rééchantillonnage d'image fonctionne.

On **itère sur les pixels de destination**, jamais sur ceux de la source :

    pour chaque pixel de la tuile (Étoile)
        où est-ce que je viens, sur la croûte ?      ← star_to_crust
        lire le MNT à cet endroit                     ← sample_bilinear

Le sens direct — parcourir le MNT et projeter chaque pixel vers sa tuile —
s'appelle *forward mapping* et ne marche pas : la grille d'arrivée ne reçoit ni
exactement un échantillon par case, ni au moins un. On récolte des **trous** là
où aucun pixel source n'atterrit et des **collisions** là où plusieurs se
superposent, et il faut ensuite boucher les trous.

La cartographie inverse rend au contraire exactement une valeur par pixel de
destination, et laisse interpoler proprement dans la source. C'est ce que fait
le gauchisseur de GDAL, et c'est aussi l'*inverse texture mapping* des cartes
graphiques.

C'est donc ``star_to_crust`` qui sert ici, et non ``crust_to_star`` : dans
``crs``, la réciproque n'est pas une commodité symétrique, c'est **celle dont
le rééchantillonnage a besoin**.

⚠️ Un gauchissement en une passe vers un « Mercator Étoile » aurait évité la
question, mais PROJ le refuse : un ``PROJCRS`` exige une base portant un
``DATUM``, et le repère Étoile est un CRS géographique *dérivé*. La tentative
rend ``Missing DATUM or ENSEMBLE node``. L'autre voie — gauchir vers une grille
Étoile puis remapper ses lignes en Mercator — coûterait **deux interpolations
successives** là où la cartographie inverse n'en demande qu'une.

## Sources

* Schéma de tuilage : https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
* Web Mercator (EPSG:3857) : https://epsg.io/3857
* Encodage terrarium : https://github.com/tilezen/joerd/blob/master/docs/formats.md

## Ce que le repère implique sur la durée de vie des tuiles

Les tuiles sont rendues dans le repère **Étoile**, qui dépend de l'époque. Un
jeu de tuiles vaut donc pour une date, et changer d'époque impose de retuiler.
C'est voulu : le terrain, cher, est sans époque et se calcule une fois ; les
tuiles, bon marché, portent l'époque et se jettent.
"""

import math
from typing import Final

import numpy as np

from . import constants as k
from .crs import star_to_crust
from .dem import TILE_SIZE

WEB_MERCATOR_LIMIT_DEG: Final[float] = 85.0511287798066
"""Latitude où la grille Mercator se coupe — **forme close, pas convention**.

Une seule décision est arbitraire : *le monde doit être carré*, pour être
divisible en quadrants. Le nombre en découle sans choix.

Mercator envoie la latitude sur ``y = ln(tan φ + sec φ)``, qui diverge aux
pôles, tandis que la longitude parcourt ``[−π, +π]``. Carré impose donc :

    ln(tan φ + sec φ) = π

dont l'inverse est la fonction de Gudermann :

    φ_max = gd(π) = arctan(sinh π) = 2·arctan(e^π) − π/2
          = 85,05112877980660357480…°

La constante ci-dessus en est l'arrondi float64. Vérifié par les deux formes
dans ``test_tiles``.
"""

BAND_NORTH_DEG: Final[float] = max(k.LEVANT_LIMIT_DEG,
                                   k.COUCHANT_EMERGENCE_MAX_DEG)
BAND_SOUTH_DEG: Final[float] = min(k.COUCHANT_LIMIT_DEG,
                                   k.LEVANT_EMERGENCE_DEG)
"""Bornes en latitude Étoile de la bande à tuiler — **dérivées, pas saisies**.

L'union des deux moitiés du terminateur : du Mur des Tempêtes (+6°, la borne
haute du Levant) au Linceul (−21°, la borne basse du Couchant). Les deux
extrêmes viennent de moitiés différentes, ce qui est l'hystérésis décrite dans
``constants``.
"""


# ─────────────────────────────────────────────────────────────────────────
#  La grille : latitude ↔ y normalisé
# ─────────────────────────────────────────────────────────────────────────


def mercator_y(latitude_deg):
    """Latitude → ``y`` normalisé dans [0, 1], **0 au nord**.

        y(φ) = ½ · (1 − ln(tan φ + sec φ) / π)

    Le logarithme est la latitude isométrique — l'inverse de Gudermann — et le
    cadrage ramène ``[−φ_max, +φ_max]`` sur ``[1, 0]``.

    L'origine en haut est la convention XYZ (« slippy map ») : OSM, Google,
    MapLibre. TMS place la sienne en bas, d'où ``y_tms = 2**z − 1 − y_xyz``.

    ⚠️ C'est le bug d'initiation du métier, et il est **silencieux** : les
    tuiles se chargent, s'affichent, et la carte est simplement retournée.

    https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
    """
    phi = np.radians(latitude_deg)
    return (1.0 - np.log(np.tan(phi) + 1.0 / np.cos(phi)) / np.pi) / 2.0


def mercator_latitude(y):
    """Réciproque de :func:`mercator_y` — ``y`` normalisé → latitude en degrés.

        φ(y) = gd((1 − 2y)·π) = arctan(sinh((1 − 2y)·π))

    C'est la fonction de Gudermann, celle-là même qui donne
    :data:`WEB_MERCATOR_LIMIT_DEG` en ``y = 0``.
    """
    return np.degrees(np.arctan(np.sinh((1.0 - 2.0 * np.asarray(y)) * np.pi)))


def grid_side(zoom: int) -> int:
    """Nombre de tuiles sur un côté du monde, à ce niveau."""
    return 1 << zoom


def resolution_deg(zoom: int, tile_size: int = TILE_SIZE) -> float:
    """Pas d'un pixel en longitude, en degrés — exact à toute latitude.

    En latitude, le pas vaut ceci multiplié par ``cos φ`` : c'est toute la
    distorsion de Mercator, et la raison pour laquelle « z=6 vaut 1,83 km/px »
    n'est vrai qu'à l'équateur.
    """
    return 360.0 / (grid_side(zoom) * tile_size)


# ─────────────────────────────────────────────────────────────────────────
#  Quelles tuiles existent
# ─────────────────────────────────────────────────────────────────────────


def row_range(zoom: int, north_deg: float = BAND_NORTH_DEG,
              south_deg: float = BAND_SOUTH_DEG) -> tuple[int, int]:
    """Premières et dernières lignes de tuiles couvrant une bande de latitudes.

    Renvoie ``(première, dernière)`` **inclusives**. Les colonnes ne sont pas
    renvoyées : la bande fait le tour du monde, donc toutes les colonnes de
    ``0`` à ``2**z − 1`` en font partie.

        première = ⌊ y(nord) · 2^z ⌋        dernière = ⌊ y(sud) · 2^z ⌋

    ⚠️ Une ligne entamée est une ligne payée : le plancher fait toujours coûter
    la bande **plus** que sa part exacte de la hauteur Mercator, et l'excédent
    ne s'amenuise qu'en descendant dans la pyramide. Chiffré dans
    ``test_tiles``.
    """
    if north_deg <= south_deg:
        raise ValueError("north_deg doit être au nord de south_deg")
    side = grid_side(zoom)
    first = int(math.floor(mercator_y(north_deg) * side))
    last = int(math.floor(mercator_y(south_deg) * side))
    return max(0, first), min(side - 1, last)


def tile_count(zoom: int, north_deg: float = BAND_NORTH_DEG,
               south_deg: float = BAND_SOUTH_DEG) -> int:
    """Nombre de tuiles de la bande à ce niveau."""
    first, last = row_range(zoom, north_deg, south_deg)
    return (last - first + 1) * grid_side(zoom)


def tile_bounds_deg(zoom: int, x: int, y: int) -> tuple[float, float,
                                                        float, float]:
    """Emprise d'une tuile en degrés Étoile : ``(ouest, sud, est, nord)``.

    Noter l'ordre — c'est celui de GDAL, de Shapely et du GeoJSON. Le renverser
    est l'autre erreur silencieuse classique.
    """
    side = grid_side(zoom)
    west = x / side * 360.0 - 180.0
    east = (x + 1) / side * 360.0 - 180.0
    north = float(mercator_latitude(y / side))
    south = float(mercator_latitude((y + 1) / side))
    return west, south, east, north


def tile_pixel_lonlat(zoom: int, x: int, y: int,
                      tile_size: int = TILE_SIZE):
    """Longitudes et latitudes **Étoile** des centres de pixel d'une tuile.

    Renvoie deux tableaux ``(tile_size, tile_size)``. Convention de centre de
    pixel, la même que le MNT : le pixel ``(i, j)`` est au milieu de sa case,
    pas sur son coin. Se tromper décale toute la pyramide d'un demi-pixel, ce
    qui ne se voit que sur les coutures entre tuiles voisines.
    """
    side = grid_side(zoom)
    offsets = (np.arange(tile_size) + 0.5) / tile_size

    longitudes = ((x + offsets) / side) * 360.0 - 180.0
    latitudes = mercator_latitude((y + offsets) / side)

    return np.broadcast_to(longitudes, (tile_size, tile_size)), \
        np.broadcast_to(latitudes[:, None], (tile_size, tile_size))


# ─────────────────────────────────────────────────────────────────────────
#  L'échantillonnage du MNT
# ─────────────────────────────────────────────────────────────────────────


def sample_bilinear(grid: np.ndarray, longitude_deg, latitude_deg):
    """Échantillonne une grille équirectangulaire globale, en bilinéaire.

    ``grid`` couvre le monde entier : ``(0, 0)`` est le pixel dont le **centre**
    est à ``(−180 + Δ/2, 90 − Δ/2)``.

    Deux bords, deux traitements — et c'est la subtilité :

    * **en longitude, on enroule.** La colonne qui suit la dernière est la
      première : le monde n'a pas de bord est. Un ``clip`` y créerait une bande
      figée sur tout l'antiméridien.
    * **en latitude, on borne.** Il n'y a rien au-delà du pôle, et l'enroulement
      y enverrait le pixel à l'antipode.

    Les positions fractionnaires, en convention de centre de pixel :

        col = (λ + 180) · L/360 − ½        lig = (90 − φ) · H/180 − ½

    Les deux cas de bord sont couverts par contre-exemple dans ``test_tiles``.
    """
    height, width = grid.shape
    longitude = np.asarray(longitude_deg, dtype=np.float64)
    latitude = np.asarray(latitude_deg, dtype=np.float64)

    col = (longitude + 180.0) / (360.0 / width) - 0.5
    row = (90.0 - latitude) / (180.0 / height) - 0.5

    # ⚠️ On borne la LIGNE, pas seulement son indice. Borner `row0` en laissant
    # `fy` libre est un bug subtil : au-delà du pôle, `row0` retombe sur 0 mais
    # `fy` vaut encore 0,5, et le pixel mélange à parts égales les deux
    # premières lignes au lieu de prendre la première. Mesuré sur la grille
    # jouet [[1,1],[9,9]] : 5,0 au lieu de 1,0.
    row = np.clip(row, 0.0, height - 1.0)

    col0 = np.floor(col)
    row0 = np.floor(row)
    fx = col - col0
    fy = row - row0

    c0 = col0.astype(np.int64) % width
    c1 = (c0 + 1) % width
    r0 = np.clip(row0.astype(np.int64), 0, height - 1)
    r1 = np.clip(r0 + 1, 0, height - 1)

    top = grid[r0, c0] * (1.0 - fx) + grid[r0, c1] * fx
    bottom = grid[r1, c0] * (1.0 - fx) + grid[r1, c1] * fx
    return top * (1.0 - fy) + bottom * fy


def _catmull_rom_weights(t):
    """Poids cubiques de Catmull-Rom pour quatre voisins, ``t`` dans [0, 1[.

        w₋₁ = ½(−t³ + 2t² − t)
        w₀  = ½( 3t³ − 5t² + 2)
        w₁  = ½(−3t³ + 4t² + t)
        w₂  = ½( t³ − t²)

    Deux propriétés en font le bon choix ici : la courbe **passe par** les
    points de contrôle — contrairement à une B-spline, qui les lisserait — et
    sa dérivée est **continue**, ce que le bilinéaire n'offre pas.

    https://en.wikipedia.org/wiki/Cubic_Hermite_spline
    """
    t2 = t * t
    t3 = t2 * t
    return (0.5 * (-t3 + 2.0 * t2 - t),
            0.5 * (3.0 * t3 - 5.0 * t2 + 2.0),
            0.5 * (-3.0 * t3 + 4.0 * t2 + t),
            0.5 * (t3 - t2))


def sample_bicubic(grid: np.ndarray, longitude_deg, latitude_deg):
    """Échantillonne une grille équirectangulaire globale, en bicubique.

    Mêmes règles de bord que :func:`sample_bilinear` — on enroule en longitude,
    on borne en latitude — mais sur un voisinage 4 × 4.

    ## Pourquoi ce n'est pas un raffinement esthétique

    Le bilinéaire est **C⁰** : la surface est continue, mais sa dérivée est
    constante par morceaux et saute à chaque frontière de cellule source.

    Un ombrage **est** une dérivée. Il rend donc ces sauts visibles sous forme
    de blocs rectangulaires de la taille du pixel source — d'autant plus gros
    que Mercator étire la latitude, puisqu'une ligne de tuile y couvre alors
    moins de degrés qu'une ligne de source. Mesuré à −79° de latitude Étoile :
    des blocs de cinq pixels.

    Catmull-Rom est **C¹**, et l'artefact disparaît entièrement — à source
    identique. Ce n'était donc pas un problème de résolution.

    ⚠️ Contrepartie d'un noyau cubique : il **dépasse** légèrement l'intervalle
    de ses voisins près d'une rupture de pente. Sans conséquence sur un champ
    fBm, à surveiller le jour où le relief aura des arêtes franches.
    """
    height, width = grid.shape
    longitude = np.asarray(longitude_deg, dtype=np.float64)
    latitude = np.asarray(latitude_deg, dtype=np.float64)

    col = (longitude + 180.0) / (360.0 / width) - 0.5
    row = np.clip((90.0 - latitude) / (180.0 / height) - 0.5,
                  0.0, height - 1.0)

    col0 = np.floor(col)
    row0 = np.floor(row)
    weights_x = _catmull_rom_weights(col - col0)
    weights_y = _catmull_rom_weights(row - row0)
    col0 = col0.astype(np.int64)
    row0 = row0.astype(np.int64)

    total = np.zeros(col.shape, dtype=np.float64)
    for j in range(4):
        rows = np.clip(row0 + j - 1, 0, height - 1)
        line = np.zeros(col.shape, dtype=np.float64)
        for i in range(4):
            line += grid[rows, (col0 + i - 1) % width] * weights_x[i]
        total += line * weights_y[j]
    return total


def elevation_tile(dem: np.ndarray, zoom: int, x: int, y: int, *,
                   epoch_a: float = 0.0,
                   tile_size: int = TILE_SIZE) -> np.ndarray:
    """Altitudes d'une tuile, en mètres — le cœur de la cartographie inverse.

    Trois étapes, et aucune n'est réversible dans l'autre sens sans perte :

    1. la grille de la tuile donne des ``(lon', lat')`` **Étoile** exacts ;
    2. ``star_to_crust`` les ramène sur la croûte, où vit le relief ;
    3. une interpolation **bicubique** lit le MNT à ces positions.

    Bicubique et non bilinéaire : la sortie sera dérivée pour produire un
    ombrage, et un noyau C⁰ y ferait apparaître ses frontières de cellule.
    Voir :func:`sample_bicubic`.

    ``dem`` est la grille équirectangulaire globale du repère Croûte, telle que
    :mod:`aeonir_gis.dem` la produit.
    """
    lon_star, lat_star = tile_pixel_lonlat(zoom, x, y, tile_size)
    lon_crust, lat_crust = star_to_crust(lon_star, lat_star, epoch_a)
    return sample_bicubic(dem, lon_crust, lat_crust).astype(np.float32)


# ─────────────────────────────────────────────────────────────────────────
#  L'encodage terrarium
# ─────────────────────────────────────────────────────────────────────────

TERRARIUM_OFFSET_M: Final[float] = 32768.0
"""Décalage qui rend toute altitude positive avant encodage."""

FULL_PRECISION: Final[bool] = False
"""Faut-il encoder le canal bleu, qui porte la précision sous le mètre ?

**Non, et c'est mesuré.** Le canal B code des pas de 1/256 m — soit 4 mm — sur
un monde qui a 11,8 km de relief. La partie fractionnaire d'un champ flottant
est du bruit : incompressible par construction.

Mesuré sur 36 tuiles réelles : 137,0 Kio avec le canal B, **54,9 Kio sans**,
soit **−60 %** pour une précision qui n'a aucun sens physique ici.

Ce n'est pas un écart au standard : un décodeur terrarium lit ``B = 0`` et rend
des mètres entiers. La source MapLibre reste ``"encoding": "terrarium"``.
"""


def terrarium(elevation_m: np.ndarray,
              full_precision: bool = FULL_PRECISION) -> np.ndarray:
    """Altitudes en mètres → trois canaux 8 bits, encodage terrarium.

    ⚠️ **Jamais de compression avec perte sur ce résultat.** Un JPEG sur du
    terrain-RGB ne dégrade pas l'image, il fabrique des altitudes fausses de
    plusieurs centaines de mètres : une erreur de 1 sur le canal rouge vaut
    256 m. PNG ou WebP sans perte, rien d'autre.

    Posant ``v = h + 32768`` :

        R = ⌊v⌋ // 256        G = ⌊v⌋ mod 256        B = ⌊(v − ⌊v⌋)·256⌋

    et la relecture vaut ``h = 256·R + G + B/256 − 32768``.

    Et pourquoi ``k.NODATA`` n'a pas besoin de cas particulier : à −32 768 m,
    ``v`` vaut 0, donc ``R = G = B = 0``. La valeur « pas de mesure » est le
    plancher exact de l'encodage — c'est ce que dit déjà sa docstring dans
    ``constants``.

    https://github.com/tilezen/joerd/blob/master/docs/formats.md
    """
    shifted = np.asarray(elevation_m, dtype=np.float64) + TERRARIUM_OFFSET_M
    np.clip(shifted, 0.0, 65535.999, out=shifted)
    whole = np.floor(shifted)

    red = (whole // 256).astype(np.uint8)
    green = (whole % 256).astype(np.uint8)
    if full_precision:
        blue = ((shifted - whole) * 256.0).astype(np.uint8)
    else:
        blue = np.zeros(red.shape, dtype=np.uint8)

    return np.stack([red, green, blue])


def decode_terrarium(rgb: np.ndarray) -> np.ndarray:
    """Réciproque de :func:`terrarium`, en mètres.

    Existe pour que les tests puissent boucler : encoder puis décoder doit
    rendre l'altitude au pas près. Un encodeur qu'on ne sait pas relire est un
    encodeur qu'on ne sait pas vérifier.
    """
    red, green, blue = rgb.astype(np.float64)
    return red * 256.0 + green + blue / 256.0 - TERRARIUM_OFFSET_M
