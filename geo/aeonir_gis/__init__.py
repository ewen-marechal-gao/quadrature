"""Pipeline géomatique d'Aeonir.

Voir `geo/README.md` pour les décisions et leur justification, et
`geo/GLOSSAIRE.md` pour le vocabulaire du domaine.
"""

from . import constants
from .crs import (
    AUTHORITY,
    CRUST_SRID,
    MERCATOR_SRID,
    STAR_SRID,
    crust_crs,
    crust_to_star,
    mercator_crs,
    star_crs,
    star_elevation,
    star_to_crust,
    substellar_declination,
    substellar_longitude,
)

__all__ = [
    "constants",
    "AUTHORITY",
    "CRUST_SRID",
    "STAR_SRID",
    "MERCATOR_SRID",
    "crust_crs",
    "star_crs",
    "mercator_crs",
    "crust_to_star",
    "star_to_crust",
    "star_elevation",
    "substellar_declination",
    "substellar_longitude",
]
