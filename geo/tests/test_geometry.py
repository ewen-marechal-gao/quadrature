"""Les algorithmes géométriques — chaque propriété avec son contre-exemple.

Aucun de ces tests ne connaît Aeonir, et c'est la contrepartie exacte de la
règle du module : :mod:`aeonir_gis.geometry` n'importe rien du projet, donc rien
du projet n'est nécessaire pour l'éprouver. Des suites de couples de nombres
suffisent.
"""

import math

import numpy as np

from aeonir_gis import geometry


# ─────────────────────────────────────────────────────────────────────────
#  Le découpage
# ─────────────────────────────────────────────────────────────────────────


BOX = (0.0, 0.0, 100.0, 100.0)


def test_a_line_that_leaves_and_returns_gives_two_pieces():
    """Et non un seul morceau recousu à travers la fenêtre."""
    line = [(-50, 50), (50, 50), (50, 150), (150, 150), (150, 50), (50, 50),
            (50, -50)]
    pieces = geometry.clip_line(line, BOX)
    assert len(pieces) == 2
    assert pieces[0][0] == (0.0, 50.0)
    assert pieces[1][-1] == (50.0, 0.0)


def test_a_line_entirely_outside_gives_nothing():
    assert geometry.clip_line([(200, 200), (300, 300)], BOX) == []


def test_a_line_entirely_inside_is_untouched():
    line = [(10, 10), (50, 50), (90, 20)]
    assert geometry.clip_line(line, BOX) == [line]


def test_clipping_a_ring_keeps_it_closed():
    """Un anneau plus grand que la fenêtre rend la fenêtre, pas un morceau."""
    ring = geometry.clip_ring([(-10, -10), (110, -10), (110, 110), (-10, 110)], BOX)
    assert len(ring) == 4
    assert set(ring) == {(0.0, 0.0), (100.0, 0.0), (100.0, 100.0),
                         (0.0, 100.0)}


def test_a_ring_entirely_outside_gives_nothing():
    assert geometry.clip_ring([(200, 200), (300, 200), (300, 300)], BOX) == []


# ─────────────────────────────────────────────────────────────────────────
#  La simplification
# ─────────────────────────────────────────────────────────────────────────


def test_douglas_peucker_collapses_what_stays_under_the_tolerance():
    noisy = [(index, 0.4 * math.sin(index)) for index in range(101)]
    assert len(geometry.douglas_peucker(noisy, 1.0)) == 2


def test_douglas_peucker_keeps_a_real_step():
    step = [(0, 0), (50, 0), (50, 50), (100, 50), (100, 0)]
    assert geometry.douglas_peucker(step, 1.0) == step


def test_douglas_peucker_always_keeps_the_ends():
    """Ce qu'un sous-échantillonnage régulier ne garantit pas."""
    line = [(index, index * index / 100.0) for index in range(50)]
    simplified = geometry.douglas_peucker(line, 5.0)
    assert simplified[0] == line[0]
    assert simplified[-1] == line[-1]


def test_quantise_drops_vertices_that_fall_on_the_same_integer():
    assert geometry.quantise([(0.1, 0.2), (0.3, 0.4), (5.0, 5.0), (5.2, 4.9)]) == \
        [(0, 0), (5, 5)]


# ─────────────────────────────────────────────────────────────────────────
#  Le déroulement angulaire
# ─────────────────────────────────────────────────────────────────────────


def test_unwrapping_removes_the_jump_at_the_antimeridian():
    """+179 → −179 est un pas de +2°, pas de −358°."""
    unwrapped = geometry.unwrap_longitudes([178.0, 179.0, -179.0, -178.0])
    assert np.allclose(unwrapped, [178.0, 179.0, 181.0, 182.0])


def test_unwrapping_leaves_an_ordinary_line_alone():
    line = [10.0, 11.0, 12.0]
    assert np.allclose(geometry.unwrap_longitudes(line), line)
