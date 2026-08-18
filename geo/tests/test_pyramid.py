"""La pyramide — chaque propriété avec son contre-exemple."""

import json

import numpy as np
import pytest
import rasterio

from aeonir_gis import pyramid, tiles
from aeonir_gis.dem import MAX_ZOOM


# ─────────────────────────────────────────────────────────────────────────
#  Le plan
# ─────────────────────────────────────────────────────────────────────────


def test_the_plan_counts_821_tiles():
    """1 + 4 + 16 + 64 + 256 pour le monde, 96 + 384 pour la bande.

    Le régime direct sur les niveaux grossiers coûte 341 tuiles et donne une
    pyramide globale complète. La fermeture par le bas jusqu'à z=0 en aurait
    coûté 5 460, dont le globe entier au niveau le plus fin.
    """
    rows = pyramid.plan(0, 6, 4)
    assert [(last - first + 1) * tiles.grid_side(z)
            for z, (first, last) in sorted(rows.items())] == \
        [1, 4, 16, 64, 256, 96, 384]
    assert pyramid.tile_total(rows) == 821


def test_below_the_split_the_world_is_whole():
    rows = pyramid.plan(0, 6, 4)
    for zoom in range(5):
        assert rows[zoom] == (0, tiles.grid_side(zoom) - 1)


def test_above_the_split_only_the_band_is_rendered():
    rows = pyramid.plan(0, 6, 4)
    assert rows[5] == tiles.row_range(5)
    assert rows[6] == tiles.row_range(6)


def test_the_split_is_where_the_closure_breaks():
    """SPLIT_ZOOM = 4 est imposé, pas choisi.

    Si la bande gouvernait tous les niveaux (split = max), la fermeture
    tiendrait entre 5 et 6 mais casserait à 4 : les parents (7, 8) réclament
    des lignes (14, 17) que la bande ne contient pas.
    """
    band_everywhere = {zoom: tiles.row_range(zoom) for zoom in range(1, 7)}
    assert pyramid.closure_holds(band_everywhere, 5)
    assert not pyramid.closure_holds(band_everywhere, 4)

    # Le détail : les parents (7, 8) réclament (14, 17), la bande n'a que
    # (15, 17). La ligne 14 est au-dessus du Mur des Tempêtes.
    assert tiles.row_range(4) == (7, 8)
    assert tiles.row_range(5) == (15, 17)
    assert 2 * 7 < tiles.row_range(5)[0]

    assert pyramid.SPLIT_ZOOM == 4


def test_every_reduced_level_is_closed():
    """L'invariant qui dispense du NODATA, à toute profondeur.

    Contre-exemple, et c'est le bug qu'il a attrapé : définir chaque niveau de
    bande par `row_range(z)` au lieu de descendre la fermeture. Les deux
    coïncident entre 5 et 6 — coïncidence de cette bande-ci — mais divergent
    à z=7, où `row_range` commence à 61 quand la fermeture réclame 60.
    """
    for max_zoom in range(5, 10):
        rows = pyramid.plan(0, max_zoom, 4)
        for zoom in range(pyramid.SPLIT_ZOOM + 1, max_zoom):
            assert pyramid.closure_holds(rows, zoom), f"rompue à z={zoom}"


def test_the_naive_definition_would_have_broken_at_zoom_7():
    """Le contre-exemple chiffré, pour qu'il ne se reperde pas."""
    assert tiles.row_range(6) == (30, 35)
    assert tiles.row_range(7) == (61, 71)
    closure_from_6 = (2 * 30, 2 * 35 + 1)
    assert closure_from_6 == (60, 71)
    assert closure_from_6[0] < tiles.row_range(7)[0]      # la ligne 60 manque

    rows = pyramid.plan(0, 7, 4)
    assert rows[7] == (60, 71)                            # la fermeture, elle


def test_the_rendered_extent_is_wider_than_the_lore_band():
    """Deux emprises distinctes, et les confondre coûte cher.

    Les seuils de `climat.md` disent ce que la bande SIGNIFIE ; l'emprise
    rendue dit ce que le client peut DEMANDER. Une ligne de tuiles entamée
    étant rendue en entier, la seconde déborde toujours la première.

    Contre-exemple : annoncer les seuils du lore au client lui ferait renoncer
    à des tuiles qui existent ; annoncer plus large lui ferait réclamer des
    tuiles absentes, donc des 404.
    """
    rows = pyramid.plan(0, 6, 4)
    west, south, east, north = pyramid.band_bounds(rows, 4)

    assert (west, east) == (-180.0, 180.0)
    assert south < tiles.BAND_SOUTH_DEG      # déborde vers le Linceul
    assert north > tiles.BAND_NORTH_DEG      # déborde vers la face ardente
    assert south == pytest.approx(-21.94, abs=0.01)
    assert north == pytest.approx(11.18, abs=0.01)


def test_the_rendered_extent_is_the_same_at_every_band_level():
    """Doubler les indices de ligne préserve l'intervalle en y normalisé.

    C'est ce qui permet de n'annoncer qu'une seule emprise pour la source de
    bande, quel que soit le zoom.
    """
    rows = pyramid.plan(0, 9, 4)
    reference = pyramid.band_bounds(rows, 4)
    for zoom in range(5, 10):
        first, last = rows[zoom]
        _, south, _, _ = tiles.tile_bounds_deg(zoom, 0, last)
        _, _, _, north = tiles.tile_bounds_deg(zoom, 0, first)
        assert south == pytest.approx(reference[1], abs=1e-9)
        assert north == pytest.approx(reference[3], abs=1e-9)


def test_there_is_no_band_extent_without_band_levels():
    assert pyramid.band_bounds(pyramid.plan(0, 4, 4), 4) is None


def test_the_plan_covers_the_band_it_claims_to():
    rows = pyramid.plan(0, MAX_ZOOM, 4)
    band_first, band_last = tiles.row_range(MAX_ZOOM)
    first, last = rows[MAX_ZOOM]
    assert first <= band_first and last >= band_last


# ─────────────────────────────────────────────────────────────────────────
#  La réduction
# ─────────────────────────────────────────────────────────────────────────


def test_halve_averages_rather_than_subsamples():
    """Moyenner, pas décimer.

    Contre-exemple : prendre un pixel sur deux jette les trois autres et
    crénèle. Sur un damier, la décimation rend une image uniforme — donc
    fausse — quand la moyenne rend le gris exact.
    """
    board = np.indices((4, 4)).sum(axis=0) % 2 * 100.0
    assert pyramid.halve(board).tolist() == [[50.0, 50.0], [50.0, 50.0]]

    decimated = board[::2, ::2]
    assert decimated.tolist() == [[0.0, 0.0], [0.0, 0.0]]   # tout le relief perdu


def test_halve_preserves_the_mean():
    rng = np.random.default_rng(0)
    tile = rng.normal(0.0, 1000.0, (64, 64))
    assert pyramid.halve(tile).mean() == pytest.approx(tile.mean())


def test_a_parent_is_exactly_the_mean_of_its_four_children():
    """La garantie que la construction par le bas achète.

    Contre-exemple : évaluer le parent directement depuis le MNT donnerait une
    valeur *proche* mais différente, et l'écart se voit — l'ombrage saute au
    franchissement du seuil de zoom.
    """
    rng = np.random.default_rng(1)
    children = {(x, y): rng.normal(0.0, 500.0, (8, 8)).astype(np.float32)
                for x in range(2) for y in range(2)}
    parent = pyramid.reduce_level(children, (0, 0), 0)[(0, 0)]

    assert parent.shape == (8, 8)
    quadrant = parent[:4, :4]
    assert quadrant == pytest.approx(pyramid.halve(children[(0, 0)]), abs=1e-4)


def test_a_missing_child_raises_instead_of_being_filled():
    """Une moyenne partielle creuserait une falaise à −32 768 m.

    On refuse donc de la calculer. L'absence d'un enfant est une erreur de
    plan, pas un cas de figure.
    """
    children = {(x, y): np.zeros((8, 8), dtype=np.float32)
                for x in range(2) for y in range(2)}
    del children[(1, 1)]
    with pytest.raises(KeyError, match="fermeture"):
        pyramid.reduce_level(children, (0, 0), 0)


# ─────────────────────────────────────────────────────────────────────────
#  La source lue à chaque niveau
# ─────────────────────────────────────────────────────────────────────────


def test_the_source_matches_the_level_resolution():
    """Lire à la résolution du niveau, pour que GDAL prenne le bon aperçu.

    Contre-exemple : lire toujours en pleine résolution ferait échantillonner
    4 pixels source là où le pixel de destination en couvre 256 — les 252
    autres se replieraient en crénelage.
    """
    for zoom in range(0, 7):
        height, width = pyramid.source_shape(zoom)
        assert width == tiles.grid_side(zoom) * 256
        assert height == width // 2


# ─────────────────────────────────────────────────────────────────────────
#  Bout en bout
# ─────────────────────────────────────────────────────────────────────────


@pytest.fixture
def tiny_dem(tmp_path):
    """MNT jouet global, assez fin pour z=3."""
    height, width = 512, 1024
    latitudes = 90.0 - (np.arange(height) + 0.5) * (180.0 / height)
    longitudes = -180.0 + (np.arange(width) + 0.5) * (360.0 / width)
    grid = (1000.0 * np.sin(np.radians(3 * longitudes))[None, :]
            + 2000.0 * np.cos(np.radians(2 * latitudes))[:, None])

    path = tmp_path / "dem.tif"
    with rasterio.open(path, "w", driver="GTiff", width=width, height=height,
                       count=1, dtype="float32") as dst:
        dst.write(grid.astype(np.float32), 1)
    return path


def test_build_writes_every_planned_tile(tiny_dem, tmp_path):
    out = tmp_path / "tiles"
    report = pyramid.build(tiny_dem, out, max_zoom=3, split_zoom=1)

    rows = pyramid.plan(0, 3, 1)
    assert sum(line["tiles"] for line in report.values()) == \
        pyramid.tile_total(rows)

    for zoom, (first, last) in rows.items():
        for y in range(first, last + 1):
            for x in range(tiles.grid_side(zoom)):
                assert (out / str(zoom) / str(x) / f"{y}.png").exists()


def test_the_written_tiles_decode_back_to_elevations(tiny_dem, tmp_path):
    out = tmp_path / "tiles"
    pyramid.build(tiny_dem, out, max_zoom=3, split_zoom=1)

    first, _ = pyramid.plan(0, 3, 1)[3]
    with rasterio.open(out / "3" / "0" / f"{first}.png") as src:
        assert src.count == 3 and src.dtypes[0] == "uint8"
        elevation = tiles.decode_terrarium(src.read())

    assert elevation.shape == (256, 256)
    assert -4000.0 < elevation.min() and elevation.max() < 4000.0


def test_the_reduced_level_survives_the_round_trip(tiny_dem, tmp_path):
    """Le parent relu sur disque reste la moyenne de ses enfants relus.

    L'écart ne peut venir que de la quantification : quatre valeurs arrondies
    au mètre ont une moyenne multiple de ¼ de mètre.
    """
    out = tmp_path / "tiles"
    pyramid.build(tiny_dem, out, max_zoom=3, split_zoom=1)

    def load(zoom, x, y):
        with rasterio.open(out / str(zoom) / str(x) / f"{y}.png") as src:
            return tiles.decode_terrarium(src.read())

    x, y = 1, pyramid.plan(0, 3, 1)[2][0]
    parent = load(2, x, y)
    quadrants = [[pyramid.halve(load(3, 2 * x + dx, 2 * y + dy))
                  for dx in (0, 1)] for dy in (0, 1)]
    expected = np.vstack([np.hstack(row) for row in quadrants])

    assert np.abs(parent - expected).max() <= 0.75


def test_the_tilejson_tells_the_client_what_exists(tiny_dem, tmp_path):
    out = tmp_path / "tiles"
    pyramid.build(tiny_dem, out, max_zoom=3, split_zoom=1)
    document = json.loads((out / "tiles.json").read_text(encoding="utf-8"))

    assert document["tilejson"] == "3.0.0"
    assert document["scheme"] == "xyz"
    assert document["encoding"] == "terrarium"
    assert (document["minzoom"], document["maxzoom"]) == (0, 3)
    assert document["bounds"][0] == -180.0 and document["bounds"][2] == 180.0
    # L'emprise s'arrête à la limite de Mercator, jamais au pôle.
    assert document["bounds"][3] == pytest.approx(tiles.WEB_MERCATOR_LIMIT_DEG)


def test_lossless_only_a_red_channel_slip_is_worth_256_metres(tiny_dem,
                                                              tmp_path):
    """Pourquoi le PNG et jamais le JPEG.

    On ne peut pas tester GDAL sur ce point, alors on teste la conséquence :
    l'encodage n'a aucune redondance, donc aucune tolérance à la perte.
    """
    out = tmp_path / "tiles"
    pyramid.build(tiny_dem, out, max_zoom=3, split_zoom=1)
    with rasterio.open(out / "0" / "0" / "0.png") as src:
        rgb = src.read()

    damaged = rgb.copy()
    damaged[0] += 1
    delta = (tiles.decode_terrarium(damaged)
             - tiles.decode_terrarium(rgb))
    assert np.all(delta == pytest.approx(256.0))
