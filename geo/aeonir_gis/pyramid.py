"""La pyramide — deux régimes, et la couture entre eux.

:mod:`aeonir_gis.tiles` sait fabriquer *une* tuile. Ce module en fabrique la
pyramide, écrit les PNG et le contrat TileJSON qui va avec.

## Pourquoi deux régimes

Les niveaux fins ne servent qu'au terminateur : rendre le reste du monde à
z=6 serait payer 4 096 tuiles pour un ruban qui en occupe 384. Les niveaux
grossiers, eux, ne coûtent presque rien — le monde entier de z=0 à z=4 tient en
341 tuiles — et sans eux la carte ne se dézoome pas.

    z ≤ SPLIT_ZOOM   monde entier, rendu DIRECTEMENT depuis le MNT
    z >  SPLIT_ZOOM  bande seule, construite PAR LE BAS

## Pourquoi la bascule tombe à 4, et pas ailleurs

Construire par le bas exige que **les quatre enfants d'un parent existent** :

    parent [a, b] à z−1   exige   enfants [2a, 2b+1] à z

La bande vérifie cette fermeture entre z=6 et z=5 — les enfants de
``row_range(5) = (15, 17)`` sont exactement ``(30, 35) = row_range(6)``. Elle la
**rompt** au passage à z=4, dont les parents ``(7, 8)`` réclament des lignes
``(14, 17)`` que la bande ne contient pas.

Poursuivre par le bas au-delà imposerait d'élargir le ruban à chaque niveau,
jusqu'à rendre le globe entier à z=6 pour atteindre z=1. Le régime direct
prend donc le relais exactement là où la fermeture cesse d'être gratuite.

Conséquence heureuse : **aucune moyenne n'est jamais partielle**, donc le
``NODATA`` n'apparaît pas. Une valeur manquante moyennée à −32 768 m creuserait
une falaise dans le relief.

## Le crénelage, et pourquoi on lit les aperçus

Un pixel de destination à z=2 couvre 16 × 16 pixels source. L'interpolation
bilinéaire n'en regarde que quatre : les 252 autres sont ignorés, et leur
énergie se replie en crénelage.

Le remède ne coûte rien : lire le MNT **à la résolution du niveau**. GDAL
choisit alors l'aperçu du COG adapté, et nos aperçus sont en moyenne — donc une
vraie moyenne d'aire, pas un échantillonnage ponctuel.

⚠️ Mesuré sur le terrain actuel, l'écart entre les deux vaut 1,6 % de
l'écart-type. C'est faible **parce que ce terrain-ci est lisse** — bande limitée
à 4,66 km, dominé par ses basses fréquences. Ne pas en conclure que le
crénelage est négligeable en général : un relief tectonique à arêtes franches
changerait ce chiffre.

## La bordure dentelée, et ce qu'elle coûte au client

Au-delà de ``SPLIT_ZOOM``, seule la bande existe. Un client qui demande une
tuile z=6 ailleurs reçoit un 404 — MapLibre retombe alors sur la tuile parente
z=4, floue mais présente.

C'est acceptable, pas satisfaisant : TileJSON n'a qu'une seule ``bounds`` et ne
sait pas décrire « global jusqu'à 4, ruban au-delà ». **PMTiles le sait**, son
index recensant exactement les tuiles présentes — c'est un argument de plus
pour le conteneur, au-delà du fichier unique.

## Sources

* TileJSON 3.0.0 : https://github.com/mapbox/tilejson-spec/tree/master/3.0.0
* Source ``raster-dem`` : https://maplibre.org/maplibre-style-spec/sources/#raster-dem
"""

import argparse
import json
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import rasterio
from rasterio.errors import NotGeoreferencedWarning
from rasterio.io import MemoryFile
from rasterio.shutil import copy as rio_copy

from . import constants as k
from . import tiles
from .dem import MAX_ZOOM, TILE_SIZE

SPLIT_ZOOM: int = 4
"""Dernier niveau rendu sur le monde entier.

**Imposé par la fermeture, pas choisi.** C'est le niveau où la bande cesse de
contenir les quatre enfants de chacun de ses parents ; au-delà, poursuivre par
le bas obligerait à élargir le ruban jusqu'au globe. Vérifié dans
``test_pyramid``.
"""


def plan(min_zoom: int = 0, max_zoom: int = MAX_ZOOM,
         split_zoom: int = SPLIT_ZOOM) -> dict[int, tuple[int, int]]:
    """Jeu de tuiles complet : ``{zoom: (première ligne, dernière ligne)}``.

    Bornes **inclusives**. Toutes les colonnes existent à chaque niveau : la
    bande fait le tour du monde.

    ⚠️ Les niveaux de bande ne se déduisent **pas** de :func:`tiles.row_range`
    appliqué à chacun. Il faut les descendre par la fermeture :

        rang(split+1) = row_range(split+1)      puis      [2a, 2b+1]

    Les deux définitions coïncident entre z=5 et z=6, ce qui est une
    **coïncidence** de cette bande-ci et non une propriété : à z=7,
    ``row_range`` commence à la ligne 61 quand la fermeture en réclame 60, et
    la réduction manquerait un enfant. Épinglé par ``test_pyramid``.
    """
    rows = {zoom: (0, tiles.grid_side(zoom) - 1)
            for zoom in range(min_zoom, min(split_zoom, max_zoom) + 1)}

    if max_zoom > split_zoom:
        first, last = tiles.row_range(split_zoom + 1)
        rows[split_zoom + 1] = (first, last)
        for zoom in range(split_zoom + 2, max_zoom + 1):
            first, last = first * 2, last * 2 + 1
            rows[zoom] = (first, last)

    return rows


def level_rows(zoom: int, split_zoom: int = SPLIT_ZOOM,
               max_zoom: int = MAX_ZOOM) -> tuple[int, int]:
    """Lignes à rendre à un niveau donné — vue individuelle de :func:`plan`."""
    return plan(min(zoom, 0), max(zoom, max_zoom), split_zoom)[zoom]


def tile_total(rows: dict[int, tuple[int, int]]) -> int:
    """Nombre total de tuiles de la pyramide."""
    return sum((last - first + 1) * tiles.grid_side(zoom)
               for zoom, (first, last) in rows.items())


def band_bounds(rows: dict[int, tuple[int, int]],
                split_zoom: int = SPLIT_ZOOM) -> list[float] | None:
    """Emprise **réellement rendue** des niveaux de bande, `[O, S, E, N]`.

    Ce n'est pas ``[−180, BAND_SOUTH, 180, BAND_NORTH]`` : une ligne entamée
    est une ligne rendue en entier, donc les tuiles débordent la bande
    climatique de quelques degrés. Annoncer les seuils du lore ferait renoncer
    le client à des tuiles qui existent — et annoncer trop large lui ferait
    demander des tuiles absentes.

    L'emprise est identique à tous les niveaux de bande : doubler les indices
    de ligne préserve l'intervalle en ``y`` normalisé.
    """
    zoom = split_zoom + 1
    if zoom not in rows:
        return None
    first, last = rows[zoom]
    _, south, _, _ = tiles.tile_bounds_deg(zoom, 0, last)
    _, _, _, north = tiles.tile_bounds_deg(zoom, 0, first)
    return [-180.0, south, 180.0, north]


def closure_holds(rows: dict[int, tuple[int, int]], zoom: int) -> bool:
    """Les quatre enfants de chaque parent de ``zoom`` sont-ils rendus ?

    C'est l'invariant qui dispense de traiter le ``NODATA`` : sans lui, une
    moyenne partielle creuserait une falaise à −32 768 m.
    """
    if zoom not in rows or zoom + 1 not in rows:
        return False
    parent_first, parent_last = rows[zoom]
    child_first, child_last = rows[zoom + 1]
    return child_first <= 2 * parent_first and 2 * parent_last + 1 <= child_last


# ─────────────────────────────────────────────────────────────────────────
#  Rendu et réduction
# ─────────────────────────────────────────────────────────────────────────


def source_shape(zoom: int, tile_size: int = TILE_SIZE) -> tuple[int, int]:
    """Dimensions du MNT à lire pour rendre ce niveau sans créneler.

    Une grille de même pas que le niveau : ``2**z × tile_size`` en longitude,
    moitié en latitude. Lire ainsi fait choisir à GDAL l'aperçu adapté du COG.
    """
    width = tiles.grid_side(zoom) * tile_size
    return width // 2, width


def read_dem_for(dataset, zoom: int,
                 tile_size: int = TILE_SIZE) -> np.ndarray:
    """Lit le MNT à la résolution du niveau, jamais plus fin que la source."""
    height, width = source_shape(zoom, tile_size)
    height = min(height, dataset.height)
    width = min(width, dataset.width)
    return dataset.read(1, out_shape=(1, height, width)).astype(np.float32)


def render_level(dem: np.ndarray, zoom: int, row_range: tuple[int, int], *,
                 epoch_a: float = 0.0,
                 tile_size: int = TILE_SIZE) -> dict[tuple[int, int], np.ndarray]:
    """Rend un niveau depuis le MNT, par cartographie inverse."""
    first, last = row_range
    return {(x, y): tiles.elevation_tile(dem, zoom, x, y, epoch_a=epoch_a,
                                         tile_size=tile_size)
            for y in range(first, last + 1)
            for x in range(tiles.grid_side(zoom))}


def halve(tile: np.ndarray) -> np.ndarray:
    """Réduit une tuile d'un facteur 2 par moyenne de blocs 2 × 2.

    Moyenner est correct pour une altitude — grandeur continue. Ça ne le serait
    **pas** pour une donnée catégorielle : un code de zone climatique moyenné ne
    désigne rien. Ce serait alors le mode, ou le plus proche voisin.
    """
    height, width = tile.shape
    return tile.reshape(height // 2, 2, width // 2, 2).mean(axis=(1, 3))


def reduce_level(children: dict[tuple[int, int], np.ndarray],
                 row_range: tuple[int, int],
                 zoom: int) -> dict[tuple[int, int], np.ndarray]:
    """Construit le niveau ``zoom`` par moyenne des tuiles de ``zoom + 1``.

    Les quatre enfants de ``(x, y)`` sont ``(2x + dx, 2y + dy)``. La fermeture
    garantit leur présence : leur absence est une erreur de programmation, pas
    un cas à traiter, et on la signale plutôt que de la masquer.
    """
    first, last = row_range
    side = tiles.grid_side(zoom)
    parents = {}
    for y in range(first, last + 1):
        for x in range(side):
            quadrants = []
            for dy in (0, 1):
                for dx in (0, 1):
                    key = ((2 * x + dx) % tiles.grid_side(zoom + 1),
                           2 * y + dy)
                    child = children.get(key)
                    if child is None:
                        raise KeyError(
                            f"enfant {key} manquant à z={zoom + 1} : la "
                            f"fermeture est fausse")
                    quadrants.append(halve(child))
            top = np.hstack((quadrants[0], quadrants[1]))
            bottom = np.hstack((quadrants[2], quadrants[3]))
            parents[(x, y)] = np.vstack((top, bottom)).astype(np.float32)
    return parents


# ─────────────────────────────────────────────────────────────────────────
#  Écriture
# ─────────────────────────────────────────────────────────────────────────


def write_png(path: Path, rgb: np.ndarray) -> int:
    """Écrit trois canaux 8 bits en PNG, et renvoie la taille en octets.

    Le pilote PNG de GDAL ne sait que ``CreateCopy`` — il ne peut pas ouvrir un
    fichier en écriture directe. On passe donc par un GeoTIFF **en mémoire**
    plutôt que par un temporaire sur disque, qui coûterait deux écritures par
    tuile.

    ⚠️ Jamais de format avec perte ici : une erreur de 1 sur le canal rouge vaut
    256 m d'altitude.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    profile = {"driver": "GTiff", "width": rgb.shape[2], "height": rgb.shape[1],
               "count": 3, "dtype": "uint8"}
    # Une tuile n'est PAS géoréférencée, et c'est correct : sa position est son
    # nom de fichier, `{z}/{x}/{y}`. On tait donc l'avertissement de GDAL, qui
    # signalerait une anomalie là où il n'y en a pas — sinon 821 lignes de
    # bruit par construction.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        with MemoryFile() as memory:
            with memory.open(**profile) as scratch:
                scratch.write(rgb)
                rio_copy(scratch, str(path), driver="PNG")
    return path.stat().st_size


def write_tilejson(path: Path, *, rows: dict[int, tuple[int, int]],
                   epoch_a: float, url_template: str) -> None:
    """Écrit le contrat que le client lit avant de demander quoi que ce soit.

    ⚠️ ``bounds`` est global alors que les niveaux fins sont dentelés : TileJSON
    ne sait pas exprimer « global jusqu'à 4, ruban au-delà ». Le client
    récoltera donc des 404 hors bande à z > ``SPLIT_ZOOM``, que MapLibre couvre
    en conservant la tuile parente.
    """
    document = {
        "tilejson": "3.0.0",
        "name": f"Aeonir — relief (époque {epoch_a:g} a)",
        "description": ("Relief d'Aeonir dans le repère Étoile. Monde entier "
                        f"jusqu'à z={SPLIT_ZOOM}, terminateur au-delà."),
        "scheme": "xyz",
        "format": "png",
        "encoding": "terrarium",
        "tiles": [url_template],
        "minzoom": min(rows),
        "maxzoom": max(rows),
        "bounds": [-180.0, -tiles.WEB_MERCATOR_LIMIT_DEG,
                   180.0, tiles.WEB_MERCATOR_LIMIT_DEG],
        "center": [0.0, 0.0, SPLIT_ZOOM],

        # Champ maison — TileJSON tolère les clés inconnues, les clients les
        # ignorent. Il porte ce qu'un client d'Aeonir doit savoir et que le
        # standard ne prévoit pas. Sans lui, le visualiseur recopierait des
        # constantes qui vivent dans `constants.py`, et les deux dériveraient.
        "aeonir": {
            "epoch_a": epoch_a,
            "frame": "star",
            "radius_m": k.RADIUS_M,
            "terrain_exaggeration": k.TERRAIN_EXAGGERATION,
            "max_relief_m": k.MAX_RELIEF_M,
            "split_zoom": SPLIT_ZOOM,
            # Les seuils du lore — ce que la bande SIGNIFIE.
            "band": {"north_deg": tiles.BAND_NORTH_DEG,
                     "south_deg": tiles.BAND_SOUTH_DEG},
            # L'emprise des tuiles réellement rendues — ce que le client peut
            # DEMANDER. Plus large que la précédente, à cause des lignes
            # entamées. Les confondre produit soit des trous, soit des 404.
            "band_bounds": band_bounds(rows, SPLIT_ZOOM),
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2),
                    encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────
#  Orchestration
# ─────────────────────────────────────────────────────────────────────────


def build(dem_path: Path, directory: Path, *, min_zoom: int = 0,
          max_zoom: int = MAX_ZOOM, split_zoom: int = SPLIT_ZOOM,
          epoch_a: float = 0.0, tile_size: int = TILE_SIZE,
          full_precision: bool = tiles.FULL_PRECISION) -> dict[int, dict]:
    """Construit la pyramide et l'écrit. Renvoie les statistiques par niveau.

    On descend du plus fin au plus grossier : c'est l'ordre qu'impose la
    construction par le bas, et il permet de ne garder qu'un niveau en mémoire.
    """
    rows = plan(min_zoom, max_zoom, split_zoom)
    directory = Path(directory)
    report: dict[int, dict] = {}
    level = None

    with rasterio.open(dem_path) as source:
        for zoom in range(max_zoom, min_zoom - 1, -1):
            started = time.perf_counter()
            if zoom > split_zoom and level is not None:
                level = reduce_level(level, rows[zoom], zoom)
                origin = f"z={zoom + 1}"
            else:
                dem = read_dem_for(source, zoom, tile_size)
                level = render_level(dem, zoom, rows[zoom], epoch_a=epoch_a,
                                     tile_size=tile_size)
                origin = f"MNT {dem.shape[1]}px"

            written = 0
            for (x, y), elevation in level.items():
                rgb = tiles.terrarium(elevation, full_precision=full_precision)
                written += write_png(
                    directory / str(zoom) / str(x) / f"{y}.png", rgb)

            report[zoom] = {"tiles": len(level), "bytes": written,
                            "origin": origin,
                            "seconds": time.perf_counter() - started}

    write_tilejson(directory / "tiles.json", rows=rows, epoch_a=epoch_a,
                   url_template="{z}/{x}/{y}.png")
    return report


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(
        prog="python -m aeonir_gis.pyramid",
        description="Pyramide de tuiles terrarium d'Aeonir, repère Étoile.")
    parser.add_argument("-i", "--dem", type=Path,
                        default=Path("out/aeonir_crust_dem.tif"))
    parser.add_argument("-o", "--out", type=Path, default=Path("out/tiles"))
    parser.add_argument("--max-zoom", type=int, default=MAX_ZOOM)
    parser.add_argument("--split-zoom", type=int, default=SPLIT_ZOOM,
                        help="dernier niveau rendu sur le monde entier")
    parser.add_argument("--epoch", type=float, default=0.0,
                        help="époque du repère Étoile, en années")
    parser.add_argument("--full-precision", action="store_true",
                        help="encode le canal bleu (4 mm) — +60 %% de volume")
    args = parser.parse_args(argv)

    rows = plan(0, args.max_zoom, args.split_zoom)
    print(f"Pyramide z=0..{args.max_zoom}, époque {args.epoch:g} a")
    print(f"  monde entier jusqu'à z={args.split_zoom}, bande au-delà")
    print(f"  {tile_total(rows):,d} tuiles")

    report = build(args.dem, args.out, max_zoom=args.max_zoom,
                   split_zoom=args.split_zoom, epoch_a=args.epoch,
                   full_precision=args.full_precision)

    print(f"\n{'z':>3} {'origine':>12} {'tuiles':>8} {'volume':>10} "
          f"{'Kio/tuile':>10} {'durée':>8}")
    total_bytes = total_tiles = 0
    for zoom in sorted(report, reverse=True):
        line = report[zoom]
        total_bytes += line["bytes"]
        total_tiles += line["tiles"]
        print(f"{zoom:>3} {line['origin']:>12} {line['tiles']:>8,d} "
              f"{line['bytes'] / 2**20:>9.1f}M "
              f"{line['bytes'] / line['tiles'] / 1024:>9.1f} "
              f"{line['seconds']:>7.1f}s")
    print(f"\n  {total_tiles:,d} tuiles, {total_bytes / 2**20:.1f} Mio")
    print(f"  → {args.out} (+ tiles.json)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
