"""Les deux référentiels d'Aeonir, et la rotation datée qui les relie.

*Aeonir Crust* est fixé à la planète : le relief, les fleuves et les villes
bâties y ont une adresse permanente.

*Aeonir Star* est fixé à l'étoile : son pôle nord **est** le point substellaire,
donc sa latitude **est** l'angle d'élévation de l'étoile au-dessus de l'horizon.
Le terminateur y est l'équateur, et la table du gradient solaire de `climat.md`
devient une table de latitudes.

La croûte tourne sous le climat. Le repère Étoile dépend donc de l'époque, et
c'est le point substellaire — dont la longitude et la déclinaison varient — qui
porte cette dépendance.

Conventions retenues (voir README pour le raisonnement) :

* **Époque 0** = un passage au périhélie, c'est-à-dire le solstice d'été du pôle
  Nord. L'unité est l'année d'Aeonir.
* **Méridien origine de la Croûte** = celui qui fait face à l'étoile à l'époque
  0, d'où ``substellar_longitude(0) == 0``.
* **Origine des longitudes Étoile** = le pôle Nord géographique, qui reçoit
  ``lon' = 0`` à toute époque — y compris avec l'inclinaison.
* **Ordre des axes déclaré** : latitude puis longitude, la convention ISO. C'est
  celle que les formats imposent de toute façon (un GeoTIFF réordonne
  silencieusement). L'ordre se gère explicitement à la frontière du code, avec
  ``always_xy=True`` — ce que font tous les helpers de ce module.
"""

import math
from functools import lru_cache
from typing import Final

from pyproj import CRS, Transformer

from . import constants as k

# ─────────────────────────────────────────────────────────────────────────
#  Identité
# ─────────────────────────────────────────────────────────────────────────

AUTHORITY: Final[str] = "AEONIR"
"""Espace de noms maison.

On **ne squatte pas** de code EPSG libre : le registre évolue, et un code
emprunté finirait par désigner autre chose. `AEONIR` est à nous.
"""

CRUST_SRID: Final[int] = 1
STAR_SRID: Final[int] = 2
MERCATOR_SRID: Final[int] = 3

_DEG: Final[str] = 'ANGLEUNIT["degree",0.0174532925199433]'
_METRE: Final[str] = 'LENGTHUNIT["metre",1]'

_DATUM: Final[str] = f'''DATUM["Aeonir Crust Reference Frame",
            ELLIPSOID["Aeonir Sphere",{k.RADIUS_M:.0f},{k.FLATTENING:.0f},
                {_METRE}]],
        PRIMEM["Reference Meridian",0,{_DEG}]'''

# ─────────────────────────────────────────────────────────────────────────
#  Repère Croûte
# ─────────────────────────────────────────────────────────────────────────

CRUST_WKT: Final[str] = f'''GEOGCRS["Aeonir Crust",
        {_DATUM},
    CS[ellipsoidal,2],
        AXIS["geodetic latitude (Lat)",north,ORDER[1],{_DEG}],
        AXIS["geodetic longitude (Lon)",east,ORDER[2],{_DEG}],
    ID["{AUTHORITY}",{CRUST_SRID}]]'''


@lru_cache(maxsize=1)
def crust_crs() -> CRS:
    """Référentiel géographique fixé à la planète."""
    return CRS.from_wkt(CRUST_WKT)


# ─────────────────────────────────────────────────────────────────────────
#  Mécanique céleste
# ─────────────────────────────────────────────────────────────────────────


def true_anomaly(epoch_a: float) -> float:
    """Anomalie vraie, en radians, à l'époque donnée (années depuis le périhélie).

    Résolution de l'équation de Kepler par Newton. Converge en une poignée
    d'itérations pour une excentricité de 0,2.
    """
    mean_anomaly = 2 * math.pi * ((epoch_a / k.ORBITAL_PERIOD_A) % 1.0)
    eccentric = mean_anomaly
    for _ in range(64):
        delta = ((eccentric - k.ECCENTRICITY * math.sin(eccentric) - mean_anomaly)
                 / (1 - k.ECCENTRICITY * math.cos(eccentric)))
        eccentric -= delta
        if abs(delta) < 1e-14:
            break
    return 2 * math.atan2(
        math.sqrt(1 + k.ECCENTRICITY) * math.sin(eccentric / 2),
        math.sqrt(1 - k.ECCENTRICITY) * math.cos(eccentric / 2),
    )


def substellar_declination(epoch_a: float) -> float:
    """Latitude géographique du point substellaire, en degrés.

    Maximale au périhélie — c'est la convention qui donne au pôle Nord son été
    intense et court, et au pôle Sud son été long et tiède.
    """
    return k.AXIAL_TILT_DEG * math.cos(true_anomaly(epoch_a))


def substellar_longitude(epoch_a: float) -> float:
    """Longitude Croûte du point substellaire, en degrés dans [-180, 180[.

    ⚠️ La période est le **jour solaire** (~1 375 ans), pas la rotation sidérale
    (56,75 ans). Sur un monde quasi-verrouillé, c'est l'écart de 4 % entre
    rotation et orbite qui promène le point substellaire, non la rotation
    elle-même. Les confondre donne un terminateur vingt-cinq fois trop rapide.

    Croissante avec le temps : c'est le sens qui place le Levant — la terre qui
    sort des glaces — du côté des longitudes Étoile négatives, comme le veut le
    lore.
    """
    return (360.0 * epoch_a / k.SOLAR_DAY_A + 180.0) % 360.0 - 180.0


def star_elevation(lon_deg: float, lat_deg: float, epoch_a: float) -> float:
    """Élévation de l'étoile au-dessus de l'horizon, en un lieu de la croûte.

    Calcul direct par distance angulaire au point substellaire, sans passer par
    PROJ. Sert de **contrôle indépendant** : la latitude Étoile doit lui être
    égale, et la suite de tests le vérifie.
    """
    sub_lat = math.radians(substellar_declination(epoch_a))
    sub_lon = substellar_longitude(epoch_a)
    lat = math.radians(lat_deg)
    delta_lon = math.radians(lon_deg - sub_lon)
    cos_distance = (math.sin(lat) * math.sin(sub_lat)
                    + math.cos(lat) * math.cos(sub_lat) * math.cos(delta_lon))
    return math.degrees(math.asin(max(-1.0, min(1.0, cos_distance))))


def star_latitude_amplitude(geographic_latitude_deg: float) -> float:
    """Amplitude de l'oscillation de latitude Étoile d'un lieu fixe.

    Deux effets s'additionnent : la rotation le fait osciller de ±(90° − β), et
    l'inclinaison ajoute ±3°. Mesuré exact sur 3 000 ans.

    Rappel : **aucun lieu de la croûte n'est immobile dans le repère Étoile**,
    pas même le pôle géographique — dont la latitude Étoile suit la déclinaison,
    ce qui est précisément le jour et la nuit polaires.
    """
    return (90.0 - abs(geographic_latitude_deg)) + k.AXIAL_TILT_DEG


# ─────────────────────────────────────────────────────────────────────────
#  Repère Étoile
# ─────────────────────────────────────────────────────────────────────────
#
#  Déclaré par la convention netCDF CF « rotated_latitude_longitude » — celle
#  des grilles climatiques CORDEX et COSMO. Deux raisons de la préférer à la
#  chaîne `+proj=ob_tran` :
#
#  1. La méthode est NORMALISÉE. PROJ sait aussi émettre un CRS dérivé pour
#     ob_tran, mais avec METHOD["PROJ ob_tran o_proj=longlat"] — un nom privé
#     qu'aucun autre logiciel ne saurait lire.
#  2. Les paramètres sont NATURELS : le pôle est donné directement par les
#     coordonnées du point substellaire, sans le détour par `lon_0 = λs − 180`
#     qu'impose ob_tran.
#
#  Les deux donnent le même résultat — écart mesuré 1,1 × 10⁻¹³ degré.


def star_wkt(epoch_a: float = 0.0) -> str:
    """WKT2 du repère Étoile à une époque donnée.

    L'époque n'est pas rangée dans un champ à part : elle **est** la position du
    pôle. Un CRS Étoile se date donc en lisant ses propres paramètres.
    """
    pole_lat = substellar_declination(epoch_a)
    pole_lon = substellar_longitude(epoch_a)
    return f'''GEOGCRS["Aeonir Star (epoch {epoch_a:g} a)",
    BASEGEOGCRS["Aeonir Crust",
        {_DATUM}],
    DERIVINGCONVERSION["Substellar pole rotation",
        METHOD["Pole rotation (netCDF CF convention)"],
        PARAMETER["Grid north pole latitude (netCDF CF convention)",
            {pole_lat!r},{_DEG}],
        PARAMETER["Grid north pole longitude (netCDF CF convention)",
            {pole_lon!r},{_DEG}],
        PARAMETER["North pole grid longitude (netCDF CF convention)",
            0,{_DEG}]],
    CS[ellipsoidal,2],
        AXIS["latitude",north,ORDER[1],{_DEG}],
        AXIS["longitude",east,ORDER[2],{_DEG}],
    ID["{AUTHORITY}",{STAR_SRID}]]'''


@lru_cache(maxsize=32)
def star_crs(epoch_a: float = 0.0) -> CRS:
    """Référentiel géographique fixé à l'étoile, à l'époque donnée."""
    return CRS.from_wkt(star_wkt(epoch_a))


# ─────────────────────────────────────────────────────────────────────────
#  Repère projeté, pour tout ce qui se mesure en mètres
# ─────────────────────────────────────────────────────────────────────────

MERCATOR_WKT: Final[str] = f'''PROJCRS["Aeonir Mercator",
    BASEGEOGCRS["Aeonir Crust",
        {_DATUM}],
    CONVERSION["Aeonir Pseudo-Mercator",
        METHOD["Popular Visualisation Pseudo Mercator",ID["EPSG",1024]],
        PARAMETER["Latitude of natural origin",0,{_DEG},ID["EPSG",8801]],
        PARAMETER["Longitude of natural origin",0,{_DEG},ID["EPSG",8802]],
        PARAMETER["False easting",0,{_METRE},ID["EPSG",8806]],
        PARAMETER["False northing",0,{_METRE},ID["EPSG",8807]]],
    CS[Cartesian,2],
        AXIS["easting (X)",east,ORDER[1],{_METRE}],
        AXIS["northing (Y)",north,ORDER[2],{_METRE}],
    ID["{AUTHORITY}",{MERCATOR_SRID}]]'''
"""Mercator d'Aeonir.

`EPSG:3857` ne convient **pas** : il est défini sur WGS84, rayon 6 378 137 m
gravé dans sa définition.

À ne pas confondre avec le tuilage : passer de (lon, lat) à (z, x, y) n'utilise
que des angles et un logarithme, sans aucun rayon. Les tuiles n'ont donc pas
besoin de ce CRS — il sert à l'analyse métrique.
"""


@lru_cache(maxsize=1)
def mercator_crs() -> CRS:
    """Référentiel projeté d'Aeonir, en mètres."""
    return CRS.from_wkt(MERCATOR_WKT)


# ─────────────────────────────────────────────────────────────────────────
#  Transformations
# ─────────────────────────────────────────────────────────────────────────
#
#  Tous les helpers travaillent en (longitude, latitude) — l'ordre « GIS
#  traditionnel » — quel que soit l'ordre déclaré dans le CRS. C'est le rôle de
#  always_xy, et c'est la seule façon de ne pas se faire piéger.


@lru_cache(maxsize=32)
def crust_to_star_transformer(epoch_a: float = 0.0) -> Transformer:
    return Transformer.from_crs(crust_crs(), star_crs(epoch_a), always_xy=True)


@lru_cache(maxsize=32)
def star_to_crust_transformer(epoch_a: float = 0.0) -> Transformer:
    return Transformer.from_crs(star_crs(epoch_a), crust_crs(), always_xy=True)


def crust_to_star(lon_deg, lat_deg, epoch_a: float = 0.0):
    """(longitude, latitude) Croûte → (longitude, latitude) Étoile.

    Accepte scalaires ou tableaux numpy.
    """
    return crust_to_star_transformer(epoch_a).transform(lon_deg, lat_deg)


def star_to_crust(lon_deg, lat_deg, epoch_a: float = 0.0):
    """(longitude, latitude) Étoile → (longitude, latitude) Croûte."""
    return star_to_crust_transformer(epoch_a).transform(lon_deg, lat_deg)
