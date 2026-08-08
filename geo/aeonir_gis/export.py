"""Passage du raster au vecteur, et écriture GeoPackage — Lot 2.

Le GeoPackage est le seul format de la chaîne qui porte `AEONIR:1` **comme
donnée** : sa table `gpkg_spatial_ref_sys` a des colonnes `organization` et
`organization_coordsys_id`, où l'autorité privée survit. Le GeoTIFF, lui, ne
garde le WKT que noyé dans un en-tête, et `to_authority()` y renvoie `None`.

## L'antiméridien

Toute polyligne franchissant `lon = ±180` est **coupée** avant écriture. Sans
ça, deux sommets consécutifs à `+179,9` et `−179,9` seraient reliés à travers
toute la carte au lieu de sortir par un bord et de rentrer par l'autre.

C'est le pendant vectoriel de la couture que le raster évite en échantillonnant
en 3D : le raster transforme chaque pixel isolément, le vecteur porte de la
**topologie** entre ses sommets et doit donc la découper lui-même.
"""

import argparse
import sys
import time
from pathlib import Path

import fiona
import numpy as np
import rasterio
from fiona.crs import CRS as FionaCRS
from rasterio import features

from . import constants as k
from . import hydro
from .crs import CRUST_WKT

STREAM_THRESHOLD_KM2: float = 5_000.0
"""Surface drainée à partir de laquelle une cellule est un cours d'eau.

**Choix de densité, pas de fait physique** — c'est un des points que le métier
sait et que les tutoriels taisent : il n'existe pas de « vrai » nombre de
fleuves, seulement une densité de drainage qu'on décide. Exprimé en km² plutôt
qu'en cellules pour survivre à un changement de résolution.
"""

_LAYERS = {
    "fleuves": {"geometry": "LineString",
                "properties": {"strahler": "int", "drainage_km2": "float"}},
    "exutoires": {"geometry": "Point",
                  "properties": {"bassin": "int", "drainage_km2": "float",
                                 "altitude_m": "float"}},
    "bassins": {"geometry": "Polygon",
                "properties": {"bassin": "int", "aire_km2": "float"}},
}


def cell_centres(flat_index, height: int, width: int):
    """Index plats → `(longitude, latitude)` des centres de cellule."""
    rows, cols = np.divmod(np.asarray(flat_index), width)
    return (-180.0 + (cols + 0.5) * (360.0 / width),
            90.0 - (rows + 0.5) * (180.0 / height))


def split_at_antimeridian(longitudes, latitudes):
    """Découpe une polyligne aux franchissements de ±180°.

    Détection par le **saut** entre sommets consécutifs : sur une grille dont le
    pas vaut au plus quelques degrés, un écart supérieur à 180° ne peut être
    qu'un enroulement. Renvoie une liste de morceaux d'au moins deux sommets.
    """
    jumps = np.flatnonzero(np.abs(np.diff(longitudes)) > 180.0) + 1
    pieces = []
    for part_lon, part_lat in zip(np.split(longitudes, jumps),
                                  np.split(latitudes, jumps)):
        if part_lon.size >= 2:
            pieces.append(list(zip(part_lon.tolist(), part_lat.tolist())))
    return pieces


MIN_BASIN_KM2: float = 50_000.0
"""Aire en deçà de laquelle un bassin n'est pas polygonisé.

**Choix de lisibilité, pas de physique** — comme le seuil du réseau. Le terrain
fBm produit des dizaines de milliers de bassins dont la médiane fait 1 963 km²,
soit six cellules de côté : ce sont les minima locaux d'un champ lisse, pas des
dépressions. Les polygoniser tous donnerait une couche illisible, lente à
écrire, et dont les contours ne sont que l'escalier de la grille.

À 50 000 km² il en reste quelques centaines — l'ordre de grandeur d'une couche
vectorielle qu'on peut tuiler et regarder.
"""


def write_geopackage(path, *, segments, order, drainage_km2, basins,
                     elevation, height: int, width: int,
                     min_basin_km2: float = MIN_BASIN_KM2) -> dict[str, int]:
    """Écrit les trois couches et renvoie le compte de chaque.

    `drainage_km2` et `order` sont des rasters aplatis, `basins` un
    :class:`~aeonir_gis.hydro.Basins`.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()

    crs = FionaCRS.from_wkt(CRUST_WKT)
    written = {}

    # ⚠️ **`writerecords` et jamais `write` en boucle.** Mesuré : 58 578 points
    # prennent 41 s un par un contre 0,5 s en lot, un facteur 82. Chaque appel
    # isolé engage sa propre transaction SQLite, et le GeoPackage EST une base
    # SQLite. On accumule donc les entités avant d'ouvrir la couche.
    #
    # ⚠️ Chaque couche s'ouvre en `"w"`, pas en `"a"`. Contre-intuitif, et
    # vérifié : avec un `layer=` différent, `"w"` **ajoute** la couche au
    # GeoPackage existant sans toucher aux précédentes. Le mode `"a"` sert à
    # ajouter des *entités* à une couche qui existe déjà, et échoue en
    # `NULL pointer error` si on lui demande d'en créer une. C'est le
    # `path.unlink()` ci-dessus qui garantit un fichier propre.

    # ── Fleuves ──────────────────────────────────────────────────────────
    records = []
    for segment in segments:
        lon, lat = cell_centres(segment, height, width)
        for piece in split_at_antimeridian(lon, lat):
            records.append({
                "geometry": {"type": "LineString", "coordinates": piece},
                "properties": {
                    # L'ordre est constant le long d'un tronçon ; la surface
                    # drainée est prise à l'aval, la plus grande.
                    "strahler": int(order[segment[0]]),
                    "drainage_km2": float(drainage_km2[segment[-1]]),
                },
            })
    with fiona.open(path, "w", driver="GPKG", layer="fleuves", crs=crs,
                    schema=_LAYERS["fleuves"]) as dst:
        dst.writerecords(records)
    written["fleuves"] = len(records)

    # ── Exutoires ────────────────────────────────────────────────────────
    lon, lat = cell_centres(basins.sink, height, width)
    flat_elevation = elevation.ravel()
    records = [
        {"geometry": {"type": "Point",
                      "coordinates": (float(lon[index]), float(lat[index]))},
         "properties": {"bassin": index,
                        "drainage_km2": float(drainage_km2[sink]),
                        "altitude_m": float(flat_elevation[sink])}}
        for index, sink in enumerate(basins.sink.tolist())
    ]
    with fiona.open(path, "w", driver="GPKG", layer="exutoires", crs=crs,
                    schema=_LAYERS["exutoires"]) as dst:
        dst.writerecords(records)
    written["exutoires"] = len(records)

    # ── Bassins ──────────────────────────────────────────────────────────
    # `features.shapes` suit les frontières de valeur égale ; la géotransformation
    # lui fait rendre des coordonnées géographiques plutôt que des pixels.
    from rasterio.transform import from_origin
    transform = from_origin(-180.0, 90.0, 360.0 / width, 180.0 / height)

    # Le masque n'est pas qu'un filtre de sortie : `features.shapes` ne suit
    # alors que les frontières retenues, et c'est ce qui rend l'opération
    # tenable. Sans lui, il trace les contours des cinquante-huit mille bassins.
    keep = basins.area_m2 / 1e6 >= min_basin_km2
    mask = keep[basins.labels]

    records = [
        {"geometry": geometry,
         "properties": {"bassin": int(value),
                        "aire_km2": float(basins.area_m2[int(value)] / 1e6)}}
        for geometry, value in features.shapes(basins.labels, mask=mask,
                                               transform=transform)
    ]
    with fiona.open(path, "w", driver="GPKG", layer="bassins", crs=crs,
                    schema=_LAYERS["bassins"]) as dst:
        dst.writerecords(records)
    written["bassins"] = len(records)

    return written


def cell_areas_m2(height: int, width: int) -> np.ndarray:
    """Aire de chaque cellule, aplatie — les poids de l'accumulation.

    Pondérer par l'aire plutôt que compter des cellules est ce qui rend le
    seuil du réseau exprimable en km², donc indépendant de la résolution.
    """
    edges = np.radians(90.0 - np.arange(height + 1) * (180.0 / height))
    row_area = (k.RADIUS_M ** 2 * np.radians(360.0 / width)
                * (np.sin(edges[:-1]) - np.sin(edges[1:])))
    return np.repeat(row_area, width)


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(
        prog="python -m aeonir_gis.export",
        description="Hydrologie d'Aeonir — géométrie du drainage, sans époque.")
    parser.add_argument("-i", "--dem", type=Path,
                        default=Path("out/aeonir_crust_dem.tif"))
    parser.add_argument("-o", "--out", type=Path,
                        default=Path("out/aeonir_hydro.gpkg"))
    parser.add_argument("--width", type=int, default=4096,
                        help="largeur de travail ; le MNT est sous-échantillonné")
    parser.add_argument("--stream-km2", type=float, default=STREAM_THRESHOLD_KM2)
    parser.add_argument("--basin-km2", type=float, default=MIN_BASIN_KM2)
    args = parser.parse_args(argv)

    started = time.perf_counter()
    height, width = args.width // 2, args.width
    with rasterio.open(args.dem) as src:
        elevation = src.read(1, out_shape=(1, height, width)).astype(np.float32)

    directions, _ = hydro.flow_direction(elevation)
    link = hydro.receivers(directions)
    depths = hydro.resolve_depths(link)
    basins = hydro.label_basins(directions)
    drainage_km2 = hydro.flow_accumulation(
        link, depths, cell_areas_m2(height, width)) / 1e6

    is_stream = (drainage_km2 >= args.stream_km2).reshape(height, width)
    order = hydro.strahler_order(link, depths, is_stream)
    segments = hydro.stream_segments(link, is_stream, order)
    analysed = time.perf_counter()

    counts = write_geopackage(
        args.out, segments=segments, order=order.ravel(),
        drainage_km2=drainage_km2, basins=basins, elevation=elevation,
        height=height, width=width, min_basin_km2=args.basin_km2)

    print(f"Grille {width} × {height} — {elevation.size / 1e6:.1f} Mpx")
    print(f"  bassins            {basins.count:>9d}")
    print(f"  réseau ≥ {args.stream_km2:.0f} km²   {int(is_stream.sum()):>9d} cellules, "
          f"ordre de Strahler max {int(order.max())}")
    print(f"  chemin le plus long {int(depths.max()):>8d} cellules")
    for layer, count in counts.items():
        print(f"  {layer:<18} {count:>9d}")
    print(f"  analyse {analysed - started:.1f} s, écriture "
          f"{time.perf_counter() - analysed:.1f} s")
    print(f"  → {args.out} ({args.out.stat().st_size / 2**20:.1f} Mio)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
