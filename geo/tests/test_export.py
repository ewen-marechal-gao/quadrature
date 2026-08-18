"""Sortie vectorielle : GeoPackage, SCR maison, et l'antiméridien.

Le point qui compte ici n'est pas que fiona sache écrire, c'est que le
GeoPackage **conserve l'identité `AEONIR:1`** là où le GeoTIFF la perd, et que
les polylignes ne soient pas recousues à travers la carte.
"""

import sqlite3

import fiona
import numpy as np
import pytest
from pyproj import CRS

from aeonir_gis import export, hydro
from aeonir_gis.crs import CRUST_WKT


@pytest.fixture
def written(tmp_path):
    """Un petit monde complet, écrit sur disque."""
    rng = np.random.default_rng(4)
    elevation = rng.random((32, 64)) * 1000
    height, width = elevation.shape

    directions, _ = hydro.flow_direction(elevation)
    link = hydro.receivers(directions)
    depths = hydro.resolve_depths(link)
    basins = hydro.label_basins(directions)
    drainage = hydro.flow_accumulation(link, depths)
    is_stream = (drainage >= 5).reshape(elevation.shape)
    order = hydro.strahler_order(link, depths, is_stream)
    segments = hydro.stream_segments(link, is_stream, order)

    path = tmp_path / "hydro.gpkg"
    counts = export.write_geopackage(
        path, segments=segments, order=order.ravel(), drainage_km2=drainage,
        basins=basins, elevation=elevation, height=height, width=width,
        min_basin_km2=0.0)
    return path, counts, basins


# ─────────────────────────────────────────────────────────────────────────
#  Le SCR survit — et mieux qu'en GeoTIFF
# ─────────────────────────────────────────────────────────────────────────

def test_the_three_layers_exist(written):
    path, counts, _ = written
    assert set(fiona.listlayers(path)) == {"fleuves", "exutoires", "bassins"}
    assert all(count > 0 for count in counts.values())


@pytest.mark.parametrize("layer", ["fleuves", "exutoires", "bassins"])
def test_every_layer_keeps_the_crust_crs(written, layer):
    path, _, _ = written
    with fiona.open(path, layer=layer) as src:
        assert CRS.from_user_input(src.crs).equals(CRS.from_wkt(CRUST_WKT))


def test_the_geopackage_carries_the_private_authority(written):
    """**Ce que le GeoTIFF perd.**

    `gpkg_spatial_ref_sys` a des colonnes dédiées à l'organisation et à son
    code, donc `AEONIR:1` y survit **comme donnée** interrogeable en SQL. En
    GeoTIFF, l'identité n'existe que noyée dans le WKT, et `to_authority()`
    renvoie `None` — voir `test_crs_io.py`.
    """
    path, _, _ = written
    connection = sqlite3.connect(path)
    rows = connection.execute(
        "SELECT organization, organization_coordsys_id, srs_name "
        "FROM gpkg_spatial_ref_sys WHERE organization = 'AEONIR'").fetchall()
    connection.close()
    assert rows, "l'autorité AEONIR doit figurer dans la table des SCR"
    assert rows[0][1] == 1
    assert "Aeonir" in rows[0][2]


def test_the_sphere_survives_the_round_trip(written):
    path, _, _ = written
    with fiona.open(path, layer="fleuves") as src:
        ellipsoid = CRS.from_user_input(src.crs).ellipsoid
    assert ellipsoid.semi_major_metre == pytest.approx(4_775_000.0)
    assert ellipsoid.inverse_flattening in (0.0, None)


# ─────────────────────────────────────────────────────────────────────────
#  L'antiméridien
# ─────────────────────────────────────────────────────────────────────────

def test_a_line_that_does_not_cross_is_left_alone():
    longitudes = np.array([10.0, 11.0, 12.0])
    latitudes = np.array([0.0, 1.0, 2.0])
    pieces = export.split_at_antimeridian(longitudes, latitudes)
    assert len(pieces) == 1
    assert len(pieces[0]) == 3


def test_a_line_that_crosses_is_cut_in_two():
    longitudes = np.array([178.0, 179.5, -179.5, -178.0])
    latitudes = np.array([0.0, 1.0, 2.0, 3.0])
    pieces = export.split_at_antimeridian(longitudes, latitudes)
    assert len(pieces) == 2
    assert [len(piece) for piece in pieces] == [2, 2]


def test_a_stub_of_one_vertex_is_dropped():
    """Un morceau à un seul sommet n'est pas une ligne."""
    longitudes = np.array([179.5, -179.5, -178.0])
    pieces = export.split_at_antimeridian(longitudes, np.zeros(3))
    assert len(pieces) == 1
    assert len(pieces[0]) == 2


def test_no_written_river_spans_the_whole_map(written):
    """Le contre-exemple rendu impossible : sans découpe, une ligne relierait
    `+179` à `−179` en traversant toute la carte."""
    path, _, _ = written
    with fiona.open(path, layer="fleuves") as src:
        for feature in src:
            longitudes = [x for x, _ in feature["geometry"]["coordinates"]]
            assert max(np.abs(np.diff(longitudes))) < 180.0


# ─────────────────────────────────────────────────────────────────────────
#  Filtrage des bassins
# ─────────────────────────────────────────────────────────────────────────

def test_the_area_filter_drops_the_small_basins(tmp_path):
    rng = np.random.default_rng(5)
    elevation = rng.random((32, 64)) * 1000
    directions, _ = hydro.flow_direction(elevation)
    link = hydro.receivers(directions)
    depths = hydro.resolve_depths(link)
    basins = hydro.label_basins(directions)
    drainage = hydro.flow_accumulation(link, depths)
    order = hydro.strahler_order(link, depths, np.zeros(elevation.shape, bool))

    median_km2 = float(np.median(basins.area_m2)) / 1e6
    counts = {}
    for name, threshold in (("tout", 0.0), ("median", median_km2)):
        counts[name] = export.write_geopackage(
            tmp_path / f"{name}.gpkg", segments=[], order=order.ravel(),
            drainage_km2=drainage, basins=basins, elevation=elevation,
            height=32, width=64, min_basin_km2=threshold)["bassins"]

    assert counts["median"] < counts["tout"]


def test_attributes_are_the_ones_maplibre_will_style_on(written):
    """`strahler` porte l'épaisseur du trait, `drainage_km2` sa hiérarchie."""
    path, _, _ = written
    with fiona.open(path, layer="fleuves") as src:
        assert set(src.schema["properties"]) == {"strahler", "drainage_km2"}
        orders = {feature["properties"]["strahler"] for feature in src}
    assert orders and min(orders) >= 1
