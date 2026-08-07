"""Le bruit, et surtout le pont qui l'amène sur la sphère.

Le cœur de ces tests n'est pas la qualité du bruit — elle n'a aucune importance
pour le chantier — mais le fait que l'échantillonner **en 3D sur la sphère**
supprime deux défauts que la grille impose sinon. Chaque fois, le contre-exemple
2D est testé à côté : sans lui on vérifierait qu'un problème est absent sans
avoir montré qu'il pouvait être présent.
"""

import math

import numpy as np
import pytest

from aeonir_gis.noise import (GradientNoise3D, SINGLE_OCTAVE_STD, _GRADIENTS,
                              _fade, fbm, unit_vectors)

WIDTH = 4096
POLE_LATITUDE = 90.0 - 0.5 * 180.0 / (WIDTH // 2)
"""Centre de la première ligne d'un raster de 4 096 px de large."""


def _longitudes(width=WIDTH):
    return -180.0 + (np.arange(width) + 0.5) * (360.0 / width)


# ─────────────────────────────────────────────────────────────────────────
#  Le pont vers la sphère
# ─────────────────────────────────────────────────────────────────────────

def test_unit_vectors_are_unit():
    lon, lat = np.meshgrid(np.linspace(-180, 180, 37),
                           np.linspace(-90, 90, 19))
    x, y, z = unit_vectors(lon, lat)
    assert np.allclose(x * x + y * y + z * z, 1.0)


def test_the_antimeridian_is_a_single_point():
    """`−180°` et `+180°` désignent le même lieu. La grille l'ignore, pas ℝ³."""
    west = np.array(unit_vectors(-180.0, 17.0))
    east = np.array(unit_vectors(180.0, 17.0))
    assert np.allclose(west, east)


def test_the_pole_is_a_single_point():
    """Toute la ligne `φ = 90°` s'effondre sur `(0, 0, 1)`.

    C'est la propriété qui rend le pincement polaire impossible : le bruit ne
    peut pas varier le long d'une ligne qu'il voit comme un point.
    """
    x, y, z = unit_vectors(_longitudes(), 90.0)
    assert np.allclose(x, 0.0, atol=1e-15)
    assert np.allclose(y, 0.0, atol=1e-15)
    assert np.allclose(z, 1.0)


# ─────────────────────────────────────────────────────────────────────────
#  Les deux défauts que la 3D supprime
# ─────────────────────────────────────────────────────────────────────────

def test_the_antimeridian_is_not_a_seam():
    """Les deux pixels de bord sont des voisins **ordinaires**.

    On ne teste pas qu'ils sont égaux — ils ne le sont pas, ils sont distants
    d'un pas de grille — mais que leur écart ressemble à celui de n'importe
    quel couple voisin. C'est ça, l'absence de couture.
    """
    noise = GradientNoise3D(1)
    lon = _longitudes()
    x, y, z = unit_vectors(lon, 12.0)
    values = noise(x * 8, y * 8, z * 8)

    across_the_seam = abs(values[0] - values[-1])
    ordinary = np.abs(np.diff(values))

    assert across_the_seam <= ordinary.max()
    assert across_the_seam == pytest.approx(ordinary.mean(), abs=4 * ordinary.std())


def test_the_pole_row_behaves_like_a_few_pixels_not_like_a_world_tour():
    """La première ligne parcourt un cercle de quelques pixels de long.

    La bonne référence n'est pas « constante » — le cercle a un rayon non nul,
    donc le bruit y varie un peu, et il *doit* varier. C'est un segment
    équatorial **de même longueur d'arc** qu'il faut comparer : le bruit ne sait
    pas où il est, seulement quelle distance on parcourt.

    La ligne polaire fait `W·cos φ` pixels de tour, soit trois ici. Son
    amplitude doit donc ressembler à celle d'une fenêtre de trois pixels à
    l'équateur — et non à celle du tour du monde.
    """
    noise = GradientNoise3D(1)
    x, y, z = unit_vectors(_longitudes(), POLE_LATITUDE)
    polar = noise(x * 8, y * 8, z * 8)

    equator_x, equator_y, equator_z = unit_vectors(_longitudes(), 0.0)
    equator = noise(equator_x * 8, equator_y * 8, equator_z * 8)

    window = int(np.ceil(WIDTH * math.cos(math.radians(POLE_LATITUDE)))) + 1
    spans = np.array([np.ptp(equator[i:i + window])
                      for i in range(0, WIDTH - window, 7)])

    assert np.ptp(polar) <= spans.max()
    assert np.ptp(polar) == pytest.approx(np.median(spans), rel=1.0)
    # Et le tour du monde, lui, est cent fois plus ample.
    assert np.ptp(polar) < 0.02 * np.ptp(equator)


def test_a_flat_lon_lat_sampling_would_pinch_and_tear():
    """Le contre-exemple : le bruit 2D que le chantier a écarté.

    À échelle de motif comparable — 14° d'arc — un bruit évalué sur le plan
    `(lon, lat)` balaie tout son domaine le long de la ligne polaire, et
    présente une discontinuité franche à l'antiméridien. Les deux tests
    précédents ne prouveraient rien sans celui-ci.
    """
    noise = GradientNoise3D(1)
    lon = _longitudes()
    degrees_per_cell = math.degrees(1 / 4.0)          # ≈ 14,3°

    x, y, z = unit_vectors(lon, POLE_LATITUDE)
    spherical = noise(x * 4, y * 4, z * 4)
    flat = noise(lon / degrees_per_cell,
                 np.full_like(lon, POLE_LATITUDE / degrees_per_cell),
                 np.zeros_like(lon))

    # Pincement : la ligne polaire varie autant qu'ailleurs, alors qu'elle
    # décrit un point unique du monde.
    assert np.ptp(flat) > 100 * np.ptp(spherical)

    # Déchirure : les deux bords ne sont plus des voisins.
    ordinary = np.abs(np.diff(flat))
    assert abs(flat[0] - flat[-1]) > 50 * ordinary.mean()


# ─────────────────────────────────────────────────────────────────────────
#  Propriétés du bruit lui-même
# ─────────────────────────────────────────────────────────────────────────

def test_gradients_come_in_opposite_pairs():
    """La symétrie d'où sort l'espérance nulle — donc le datum du point 6.

    Sans elle il faudrait recentrer le terrain après coup, et le zéro des
    altitudes dépendrait de la donnée.
    """
    as_set = {tuple(g) for g in _GRADIENTS}
    assert len(as_set) == 12
    assert all(tuple(-np.array(g)) in as_set for g in as_set)
    assert np.allclose(_GRADIENTS.sum(axis=0), 0.0)


def test_fade_is_the_quintic():
    assert _fade(0.0) == 0.0
    assert _fade(1.0) == 1.0
    assert _fade(0.5) == pytest.approx(0.5)


def test_noise_vanishes_on_the_lattice():
    """Propriété du bruit de gradient : nul à chaque nœud entier."""
    noise = GradientNoise3D(4)
    grid = np.arange(-3.0, 4.0)
    values = noise(grid[:, None, None], grid[None, :, None], grid[None, None, :])
    assert np.allclose(values, 0.0, atol=1e-12)


def test_the_same_seed_gives_the_same_field():
    points = np.random.default_rng(0).uniform(-20, 20, (3, 5000))
    assert np.array_equal(GradientNoise3D(99)(*points),
                          GradientNoise3D(99)(*points))


def test_different_seeds_give_different_fields():
    points = np.random.default_rng(0).uniform(-20, 20, (3, 5000))
    assert not np.allclose(GradientNoise3D(1)(*points),
                           GradientNoise3D(2)(*points))


def test_single_octave_std_is_what_we_claim():
    """La constante de normalisation est mesurée, donc elle se re-mesure.

    Tolérance à 5 % : la dispersion d'une graine à l'autre vaut 1,5 %.
    """
    points = np.random.default_rng(5).uniform(-500, 500, (3, 400_000))
    for seed in (0, 1, 2, 3):
        assert GradientNoise3D(seed)(*points).std() == pytest.approx(
            SINGLE_OCTAVE_STD, rel=0.05)


def test_noise_expectation_is_zero():
    points = np.random.default_rng(6).uniform(-500, 500, (3, 400_000))
    values = GradientNoise3D(7)(*points)
    assert abs(values.mean()) < 0.02 * values.std()


# ─────────────────────────────────────────────────────────────────────────
#  fBm
# ─────────────────────────────────────────────────────────────────────────

def test_one_octave_of_fbm_is_the_noise_itself():
    points = np.random.default_rng(8).uniform(-20, 20, (3, 5000))
    noise = GradientNoise3D(11)
    single = fbm(noise, *points, octaves=1, base_frequency=1.0,
                 lacunarity=2.0, persistence=0.5)
    assert np.allclose(single * SINGLE_OCTAVE_STD, noise(*points))


def test_fbm_is_normalised_analytically_not_empirically():
    """L'écart-type sort à 1 sans qu'aucune statistique du champ n'ait servi.

    C'est ce qui garantit qu'une altitude signifie la même chose d'une graine à
    l'autre. Diviser par l'écart-type observé donnerait 1 exactement — et une
    échelle qui bouge à chaque tirage.
    """
    points = np.random.default_rng(9).uniform(-200, 200, (3, 300_000))
    field = fbm(GradientNoise3D(13), *points, octaves=8, base_frequency=1.0,
                lacunarity=2.0, persistence=0.5)
    assert field.std() == pytest.approx(1.0, rel=0.10)


def test_more_octaves_add_detail_without_changing_the_scale():
    points = np.random.default_rng(10).uniform(-200, 200, (3, 200_000))
    noise = GradientNoise3D(17)
    scales = [fbm(noise, *points, octaves=n, base_frequency=1.0,
                  lacunarity=2.0, persistence=0.5).std() for n in (4, 8, 12)]
    assert max(scales) / min(scales) < 1.15


def test_fbm_rejects_zero_octaves():
    with pytest.raises(ValueError):
        fbm(GradientNoise3D(1), 0.0, 0.0, 0.0, octaves=0, base_frequency=1.0,
            lacunarity=2.0, persistence=0.5)
