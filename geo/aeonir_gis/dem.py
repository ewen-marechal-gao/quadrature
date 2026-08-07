"""MNT global d'Aeonir — Lot 1.

Produit un modèle numérique de terrain couvrant toute la sphère, dans le
référentiel **Croûte** (`AEONIR:1`), au format GeoTIFF puis COG.

## La résolution ne se choisit pas, elle se déduit

Une grille équirectangulaire et une pyramide Mercator ont le même pas au
facteur `cos φ` près :

    équirectangulaire   E-O : C·cos φ / W        N-S : C / W   (constant)
    Mercator, zoom z    les deux : C·cos φ / (2^z · T)   — conforme, isotrope

En posant **W = 2^z · T**, l'accord E-O devient exact à *toutes* les latitudes
d'un coup. C'est de là, et seulement de là, que sort la largeur du raster.

Le zoom maximal retenu est **6**, ce qui donne 16 384 × 8 192 et 1,83 km/px.
Ce n'est ni le disque ni le temps de calcul qui plafonnent — z=8 tiendrait — mais
le **Lot 2** : comblement de cuvettes et accumulation D8 restent tractables en
mémoire sur 134 Mpx, et deviennent un problème hors-mémoire au-delà.

En N-S, Mercator réclame `1/cos φ` fois plus fin que ce que la grille fournit :
1,07 à ±21°, 2,0 à 60°, 11,6 à la coupure. Le tuileur interpolera donc en N-S
dans les hautes latitudes. Comme la pyramide sera en repère **Étoile**, ces
hautes latitudes sont les deux faces mortes, et la bande habitée tombe sur
l'équateur Mercator où l'accord est exact dans les deux directions.

## Le raster est global, seules les tuiles seront coupées

L'équirectangulaire n'a aucune singularité aux pôles — seulement de la
redondance. Le ±85,0511° de Web Mercator est une amputation du **rendu**, jamais
de la donnée : la roche actuellement sous le point substellaire porte son
altitude ici, et réapparaîtra dans la bande quand la croûte l'y aura menée, sans
qu'on régénère quoi que ce soit. C'est ce qui fait de la Croûte l'ancre
sémantique : sans époque, elle ne peut pas perdre ce qui servira plus tard.
"""

import argparse
import math
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.shutil import copy as rio_copy
from rasterio.transform import from_origin
from rasterio.windows import Window

from . import constants as k
from .crs import CRUST_WKT
from .noise import GradientNoise3D, fbm, unit_vectors

# ─────────────────────────────────────────────────────────────────────────
#  La grille — dérivée de la pyramide, jamais saisie
# ─────────────────────────────────────────────────────────────────────────

TILE_SIZE: int = 256
"""Côté d'une tuile, en pixels. 256 parce que terrarium est un format 256 — et
parce qu'une tuile plus petite donne une échelle de zoom plus fine."""

MAX_ZOOM: int = 6
"""Profondeur de la pyramide globale. Voir l'en-tête du module."""


def grid_width(zoom: int = MAX_ZOOM, tile_size: int = TILE_SIZE) -> int:
    """`W = 2^z · T` — la seule origine légitime de la largeur du raster."""
    return tile_size * 2 ** zoom


WIDTH: int = grid_width()
HEIGHT: int = WIDTH // 2
RESOLUTION_M: float = k.CIRCUMFERENCE_M / WIDTH
"""Pas métrique **à l'équateur de la grille**. Ailleurs il vaut ceci fois
`cos φ` en E-O, et reste constant en N-S."""

# ─────────────────────────────────────────────────────────────────────────
#  Le générateur — paramètres de modélisation, absents du lore
# ─────────────────────────────────────────────────────────────────────────
#
#  Volontairement pauvre. La géographie d'Aeonir sera tectonique — pas d'océan
#  global donc l'essentiel de la surface est du plancher, chaînes de collision
#  massives, fosses en eau dans le seul terminateur, croûte dilatée en face
#  chaude et contractée en face froide. Aucun empilement d'octaves ne produit
#  ça : le tenter donnerait un faux réalisme plus coûteux qu'un bruit
#  franchement synthétique. Repoussé au Lot 6.

DEFAULT_SEED: int = 77
"""Graine **choisie, et sur un critère explicite** : parmi les trois cents
premières, celles dont la moyenne de surface tombe à moins de deux mètres de la
sphère de référence. Celle-ci vaut −1,5 m, pour des extrêmes symétriques
(−9 241 / +9 237 m à basse résolution).

Pourquoi il faut choisir. Le champ est d'espérance nulle, mais une *réalisation*
ne l'est pas : le décalage de surface d'un tirage a un écart-type de **305 m**,
et peut atteindre 869 m. La première graine essayée donnait −445 m, ce qui
aurait mis le sol moyen d'Aeonir un demi-kilomètre sous son propre datum.

Sélectionner une réalisation n'est pas recentrer la donnée : le zéro reste la
sphère, il ne bouge pas, et il ne dépend d'aucune statistique du terrain. Le
point 6 est respecté.

Le balayage est bon marché parce que le décalage est **invariant en
résolution** — mesuré identique à 0,1 m près de z=2 à z=5. On choisit donc sur
une grille 1 024 × 512 en une seconde, et le choix vaut pour le raster complet.
"""

OCTAVES: int = 10
BASE_FREQUENCY: float = 2.0
LACUNARITY: float = 2.0
PERSISTENCE: float = 0.5
"""Dix octaves depuis la fréquence 2 portent la plus fine à 1 024, soit une
cellule de 4,7 km — **2,5 pixels**. On s'arrête juste au-dessus de Nyquist :
descendre plus bas ne fabriquerait que du repliement."""

RELIEF_SIGMA_M: float = k.MAX_RELIEF_M / 4.0
"""Écart-type visé du relief, en mètres.

Convention à 4σ : `MAX_RELIEF_M` est le plafond physique d'un pic, et le fBm
étant borné par la somme de ses amplitudes, ses extrêmes s'en approchent sans
qu'on ait à écrêter. **On n'écrête pas** — un écrêtage créerait des plateaux et
briserait la moyenne nulle.
"""

BAND_ROWS: int = 128
"""Hauteur d'une passe. Le raster complet ferait 512 Mio en float32 et bien
davantage en float64 pendant le calcul : on le fabrique par bandes, et la
hauteur de bloc du GeoTIFF intermédiaire est calée dessus pour qu'une bande
remplisse exactement une rangée de blocs."""


@dataclass(frozen=True)
class DemStats:
    """Ce que la génération a réellement produit."""

    minimum: float
    maximum: float
    mean: float
    std: float
    area_weighted_mean: float
    seconds: float

    def __str__(self) -> str:
        return (
            f"  min / max          {self.minimum:+10.1f} / {self.maximum:+.1f} m\n"
            f"  écart-type         {self.std:10.1f} m\n"
            f"  moyenne par pixel  {self.mean:+10.1f} m\n"
            f"  moyenne par aire   {self.area_weighted_mean:+10.1f} m"
            f"   ({100 * self.area_weighted_mean / self.std:+.2f} % de σ)\n"
            f"  durée              {self.seconds:10.1f} s"
        )


def elevation_bands(width: int = WIDTH, height: int = HEIGHT, *,
                    seed: int = DEFAULT_SEED,
                    octaves: int = OCTAVES,
                    base_frequency: float = BASE_FREQUENCY,
                    lacunarity: float = LACUNARITY,
                    persistence: float = PERSISTENCE,
                    relief_sigma_m: float = RELIEF_SIGMA_M,
                    band_rows: int = BAND_ROWS):
    """Produit le MNT bande par bande — `(première ligne, altitudes float32)`.

    Les coordonnées sont celles des **centres** de pixel, seule convention qui
    rende le raster symétrique : sans le demi-pixel, la première ligne
    tomberait exactement sur le pôle et la dernière un pixel avant l'autre.
    """
    noise = GradientNoise3D(seed)
    longitudes = -180.0 + (np.arange(width) + 0.5) * (360.0 / width)

    for first_row in range(0, height, band_rows):
        last_row = min(first_row + band_rows, height)
        latitudes = 90.0 - (np.arange(first_row, last_row) + 0.5) * (180.0 / height)

        x, y, z = unit_vectors(longitudes[None, :], latitudes[:, None])
        field = fbm(noise, x, y, z, octaves=octaves,
                    base_frequency=base_frequency, lacunarity=lacunarity,
                    persistence=persistence)

        yield first_row, (field * relief_sigma_m).astype(np.float32)


def crust_transform(width: int = WIDTH, height: int = HEIGHT):
    """Géotransformation de la grille globale.

    Le coin haut-gauche est `(−180°, +90°)` et le pas en Y est **négatif** : la
    ligne 0 est la plus au nord. C'est le pont entre l'espace projeté, où Y
    monte, et l'espace pixel, où la ligne descend.
    """
    return from_origin(-180.0, 90.0, 360.0 / width, 180.0 / height)


def write_dem(path, *, width: int = WIDTH, height: int = HEIGHT,
              seed: int = DEFAULT_SEED, cog: bool = True,
              **generator) -> DemStats:
    """Écrit le MNT et renvoie ses statistiques réelles.

    Deux temps, parce que le pilote COG de GDAL ne sait pas créer un fichier
    vide puis le remplir fenêtre par fenêtre : il ne fait que du `CreateCopy`.
    On écrit donc un GeoTIFF tuilé ordinaire, puis on le recopie en COG — c'est
    cette recopie qui construit les aperçus et range l'en-tête en tête de
    fichier, les deux choses qui rendent le COG lisible par requêtes HTTP Range.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    intermediate = path.with_suffix(".plain.tif") if cog else path

    profile = {
        "driver": "GTiff", "dtype": "float32", "count": 1,
        "width": width, "height": height,
        "crs": CRS.from_wkt(CRUST_WKT),
        "transform": crust_transform(width, height),
        "nodata": k.NODATA,
        "tiled": True, "blockxsize": 512, "blockysize": BAND_ROWS,
        "compress": "deflate", "predictor": 3,
        "BIGTIFF": "IF_SAFER",
    }

    started = time.perf_counter()
    minimum, maximum = math.inf, -math.inf
    total = total_squared = weighted_total = weight_total = 0.0

    with rasterio.open(intermediate, "w", **profile) as dst:
        for first_row, band in elevation_bands(width, height, seed=seed,
                                               **generator):
            dst.write(band, 1,
                      window=Window(0, first_row, width, band.shape[0]))

            minimum = min(minimum, float(band.min()))
            maximum = max(maximum, float(band.max()))
            values = band.astype(np.float64)
            total += values.sum()
            total_squared += (values ** 2).sum()

            # Pondération par l'aire : sur une grille équirectangulaire un pixel
            # polaire couvre `cos φ` fois moins de sol qu'un pixel équatorial.
            # La moyenne par pixel n'est donc PAS la moyenne de surface, et
            # c'est la seconde qui juge le datum.
            latitudes = 90.0 - (np.arange(first_row, first_row + band.shape[0])
                                + 0.5) * (180.0 / height)
            weights = np.cos(np.radians(latitudes))
            weighted_total += float((values.sum(axis=1) * weights).sum())
            weight_total += float(weights.sum()) * width

    cells = width * height
    mean = total / cells
    stats = DemStats(
        minimum=minimum, maximum=maximum, mean=mean,
        std=math.sqrt(total_squared / cells - mean ** 2),
        area_weighted_mean=weighted_total / weight_total,
        seconds=time.perf_counter() - started,
    )

    if cog:
        rio_copy(str(intermediate), str(path), driver="COG",
                 COMPRESS="DEFLATE", PREDICTOR="YES", BLOCKSIZE=512,
                 OVERVIEW_RESAMPLING="AVERAGE", BIGTIFF="IF_SAFER")
        intermediate.unlink()

    return stats


def main(argv=None) -> int:
    # La console Windows est en cp1252 : sans ça, le premier σ affiché fait
    # tomber le programme alors que le raster est déjà écrit.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(
        prog="python -m aeonir_gis.dem",
        description="MNT global d'Aeonir, référentiel Croûte (AEONIR:1).")
    parser.add_argument("-o", "--out", default="out/aeonir_crust_dem.tif",
                        type=Path, help="fichier de sortie")
    parser.add_argument("-z", "--zoom", type=int, default=MAX_ZOOM,
                        help="zoom maximal visé ; fixe la taille du raster")
    parser.add_argument("-s", "--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--octaves", type=int, default=OCTAVES)
    parser.add_argument("--plain", action="store_true",
                        help="GeoTIFF simple, sans conversion COG")
    args = parser.parse_args(argv)

    width = grid_width(args.zoom)
    height = width // 2
    print(f"Grille {width} × {height} — W = 2^{args.zoom} × {TILE_SIZE}")
    print(f"  {k.CIRCUMFERENCE_M / width / 1000:.3f} km/px à l'équateur, "
          f"{width * height / 1e6:.1f} Mpx, graine {args.seed}")

    stats = write_dem(args.out, width=width, height=height, seed=args.seed,
                      octaves=args.octaves, cog=not args.plain)
    print(stats)
    print(f"  → {args.out} ({args.out.stat().st_size / 2**20:.1f} Mio)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
