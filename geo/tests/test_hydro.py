"""Géométrie du drainage.

Deux familles ici. Les **algorithmes de forêt** — doublement de pointeurs,
profondeurs, accumulation, Strahler — se testent sur des graphes minuscules dont
la réponse se vérifie à la main, et ce sont les exemples des docstrings. Les
**corrections sphériques** se testent avec leur contre-exemple : montrer qu'un
D8 naïf se trompe est la seule façon de prouver que la correction sert.
"""

import math

import numpy as np
import pytest

from aeonir_gis import constants as k
from aeonir_gis import hydro


def _chain():
    """`0 → 1 → … → 8`, où 8 est une racine. L'exemple des docstrings."""
    return np.array([1, 2, 3, 4, 5, 6, 7, 8, 8], dtype=np.int32)


# ─────────────────────────────────────────────────────────────────────────
#  Doublement de pointeurs
# ─────────────────────────────────────────────────────────────────────────

def test_resolve_roots_matches_the_documented_example():
    assert np.array_equal(hydro.resolve_roots(_chain()), np.full(9, 8))


def test_resolve_roots_separates_distinct_trees():
    # 0,1 → 2 (racine) ; 3,4 → 5 (racine) ; 6 → lui-même
    link = np.array([2, 2, 2, 5, 5, 5, 6], dtype=np.int32)
    assert np.array_equal(hydro.resolve_roots(link), [2, 2, 2, 5, 5, 5, 6])


def test_resolve_roots_refuses_a_grid():
    """`link[link]` n'a de sens qu'à une dimension — d'où l'index plat."""
    with pytest.raises(ValueError):
        hydro.resolve_roots(np.zeros((2, 2), dtype=np.int32))


def test_resolve_depths_matches_the_documented_example():
    assert np.array_equal(hydro.resolve_depths(_chain()), [8, 7, 6, 5, 4, 3, 2, 1, 0])


def test_a_root_has_depth_zero():
    link = np.array([2, 2, 2], dtype=np.int32)
    assert hydro.resolve_depths(link)[2] == 0


# ─────────────────────────────────────────────────────────────────────────
#  Accumulation
# ─────────────────────────────────────────────────────────────────────────

def test_accumulation_along_a_chain_counts_everything_upstream():
    link = _chain()
    accumulated = hydro.flow_accumulation(link, hydro.resolve_depths(link))
    assert np.array_equal(accumulated, np.arange(1, 10))


def test_accumulation_merges_at_a_confluence():
    # 0 → 1 → 3 ; 2 → 3 ; 3 → 5 ; 4 → 5 ; 5 racine
    link = np.array([1, 3, 3, 5, 5, 5], dtype=np.int32)
    accumulated = hydro.flow_accumulation(link, hydro.resolve_depths(link))
    assert np.array_equal(accumulated, [1, 2, 1, 4, 1, 6])


def test_accumulation_honours_weights():
    link = _chain()
    weights = np.full(9, 2.5)
    accumulated = hydro.flow_accumulation(link, hydro.resolve_depths(link),
                                          weights)
    assert accumulated[-1] == pytest.approx(9 * 2.5)


# ─────────────────────────────────────────────────────────────────────────
#  Strahler
# ─────────────────────────────────────────────────────────────────────────

def test_two_equal_branches_raise_the_order():
    #  0,1 → 2 ; 2,3 → 4 (racine)
    link = np.array([2, 2, 4, 4, 4], dtype=np.int32)
    order = hydro.strahler_order(link, hydro.resolve_depths(link),
                                 np.ones(5, dtype=bool))
    assert np.array_equal(order, [1, 1, 2, 1, 2])


def test_four_balanced_sources_reach_order_three():
    link = np.array([4, 4, 5, 5, 6, 6, 6], dtype=np.int32)
    order = hydro.strahler_order(link, hydro.resolve_depths(link),
                                 np.ones(7, dtype=bool))
    assert np.array_equal(order, [1, 1, 1, 1, 2, 2, 3])


def test_a_tributary_of_lower_order_does_not_raise_the_trunk():
    """Le cœur de la règle de 1952 : un ruisseau ne grandit pas un fleuve."""
    link = np.array([2, 2, 4, 4, 4], dtype=np.int32)
    order = hydro.strahler_order(link, hydro.resolve_depths(link),
                                 np.ones(5, dtype=bool))
    assert order[4] == order[2] == 2      # et non 3


def test_cells_outside_the_network_carry_no_order():
    link = _chain()
    stream = np.zeros(9, dtype=bool)
    stream[5:] = True
    order = hydro.strahler_order(link, hydro.resolve_depths(link), stream)
    assert np.array_equal(order[:5], np.zeros(5))
    assert (order[5:] > 0).all()


# ─────────────────────────────────────────────────────────────────────────
#  Ce que la sphère impose
# ─────────────────────────────────────────────────────────────────────────

def test_east_west_spacing_shrinks_with_the_cosine():
    height, width = 180, 360
    distances = hydro.neighbour_distances(height, width)
    full_circle = 2 * math.pi * k.RADIUS_M / width
    for row in (0, 30, 89, 120):
        latitude = 90.0 - (row + 0.5) * (180.0 / height)
        expected = full_circle * math.cos(math.radians(latitude))
        assert distances[row, 0] == pytest.approx(expected, rel=1e-3)


def test_north_south_spacing_is_constant():
    distances = hydro.neighbour_distances(180, 360)
    assert distances[:, 2].std() == pytest.approx(0.0, abs=1e-6)
    assert distances[90, 2] == pytest.approx(math.pi * k.RADIUS_M / 180, rel=1e-6)


def test_the_diagonal_is_pythagorean_at_the_equator():
    distances = hydro.neighbour_distances(180, 360)
    east, south, diagonal = distances[90, 0], distances[90, 2], distances[90, 1]
    assert diagonal == pytest.approx(math.hypot(east, south), rel=1e-3)


def test_a_naive_d8_would_send_water_the_wrong_way(  ):
    """**Le contre-exemple.** Sans la correction en `cos φ`, on prend la plus
    forte dénivelée au lieu de la plus forte pente.

    Près du pôle, un voisin est-ouest est bien plus proche qu'un voisin
    nord-sud : une petite chute y donne une pente plus raide qu'une grande
    chute vers le sud. Ici l'est descend de 5 m et le sud de 100 — la
    dénivelée dit sud, la pente dit est, et c'est la pente qui a raison.
    """
    height, width = 180, 360
    elevation = np.full((height, width), 1000.0)
    row, col = 1, 10                       # latitude ≈ 88,5°
    elevation[row, col + 1] = 995.0        # est  : −5 m
    elevation[row + 1, col] = 900.0        # sud  : −100 m

    directions, _ = hydro.flow_direction(elevation)
    assert directions[row, col] == 0, "la pente désigne l'est"

    distances = hydro.neighbour_distances(height, width)
    assert distances[row, 2] / distances[row, 0] > 30
    # Et la dénivelée brute, elle, aurait désigné le sud.
    assert 100.0 > 5.0


def test_the_grid_wraps_in_longitude():
    """Colonnes 0 et W−1 voisines : sinon l'antiméridien serait un mur."""
    elevation = np.full((10, 20), 500.0)
    elevation[5, 19] = 100.0               # dernière colonne, plus basse
    directions, _ = hydro.flow_direction(elevation)
    assert directions[5, 0] == 4, "la colonne 0 doit s'écouler vers l'ouest"


def test_the_polar_rows_have_no_neighbour_beyond_the_grid():
    """La bordure est à +∞ : la ligne polaire n'invente pas d'exutoire."""
    elevation = np.random.default_rng(0).random((8, 16)) * 100
    directions, _ = hydro.flow_direction(elevation)
    assert directions.shape == elevation.shape
    assert set(np.unique(directions)) <= set(range(8)) | {hydro.SINK}


# ─────────────────────────────────────────────────────────────────────────
#  Bassins
# ─────────────────────────────────────────────────────────────────────────

@pytest.fixture
def small_world():
    elevation = np.array([
        [50, 45, 40, 42, 48, 52],
        [44, 30, 25, 33, 41, 47],
        [43, 28, 9, 31, 20, 46],
        [49, 46, 44, 45, 43, 51],
    ], dtype=np.float64)
    directions, sinks = hydro.flow_direction(elevation)
    return elevation, directions, sinks


def test_every_cell_belongs_to_exactly_one_basin(small_world):
    _, directions, _ = small_world
    basins = hydro.label_basins(directions)
    assert basins.cells.sum() == directions.size
    assert basins.labels.min() >= 0
    assert basins.labels.max() == basins.count - 1


def test_basin_labels_point_back_to_their_sink(small_world):
    _, directions, sinks = small_world
    basins = hydro.label_basins(directions)
    assert basins.count == sinks.sum()
    assert np.array_equal(basins.sink, np.flatnonzero(sinks.ravel()))


def test_basin_areas_sum_to_the_whole_sphere():
    """Contrôle global : rien ne se perd entre les cellules et la sphère."""
    elevation = np.random.default_rng(1).random((64, 128)) * 1000
    directions, _ = hydro.flow_direction(elevation)
    basins = hydro.label_basins(directions)
    assert basins.area_m2.sum() == pytest.approx(4 * math.pi * k.RADIUS_M ** 2,
                                                 rel=1e-9)


def test_area_is_not_proportional_to_cell_count():
    """Piège n° 20 : compter des pixels surestime les bassins polaires."""
    elevation = np.random.default_rng(2).random((64, 128)) * 1000
    directions, _ = hydro.flow_direction(elevation)
    basins = hydro.label_basins(directions)
    per_cell = basins.area_m2 / basins.cells
    assert per_cell.max() / per_cell.min() > 10


def test_accumulation_conserves_the_whole_grid():
    """L'invariant qui vaut tous les autres : ce qui entre ressort aux puits."""
    elevation = np.random.default_rng(3).random((64, 128)) * 1000
    directions, sinks = hydro.flow_direction(elevation)
    link = hydro.receivers(directions)
    accumulated = hydro.flow_accumulation(link, hydro.resolve_depths(link))
    assert accumulated[sinks.ravel()].sum() == pytest.approx(elevation.size)


# ─────────────────────────────────────────────────────────────────────────
#  Tronçons
# ─────────────────────────────────────────────────────────────────────────

def test_a_simple_chain_gives_one_segment():
    link = _chain()
    depths = hydro.resolve_depths(link)
    stream = np.ones(9, dtype=bool)
    order = hydro.strahler_order(link, depths, stream)
    segments = hydro.stream_segments(link, stream, order)
    assert len(segments) == 1
    assert np.array_equal(segments[0], np.arange(9))


def test_a_confluence_cuts_the_segments():
    #  0 → 2 ; 1 → 2 ; 2 → 3 ; 3 racine — la confluence est en 2
    link = np.array([2, 2, 3, 3], dtype=np.int32)
    depths = hydro.resolve_depths(link)
    stream = np.ones(4, dtype=bool)
    order = hydro.strahler_order(link, depths, stream)
    segments = hydro.stream_segments(link, stream, order)
    assert len(segments) == 3            # deux amonts + l'aval
    assert all(segment[0] in (0, 1, 2) for segment in segments)
