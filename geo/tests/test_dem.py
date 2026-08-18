"""Le MNT : sa grille, son écriture, et ce qu'il vaut face au datum.

Les tests d'écriture travaillent sur de petites grilles — la géométrie et les
en-têtes ne dépendent pas de la taille, et le raster de production met plusieurs
minutes.
"""

import math

import numpy as np
import pytest
import rasterio
from rasterio.crs import CRS

from aeonir_gis import calibration
from aeonir_gis import constants as k
from aeonir_gis import dem
from aeonir_gis.crs import CRUST_WKT

SMALL = 256


def _weighted_mean(width, seed):
    """Moyenne **de surface**, la seule qui juge le datum."""
    height = width // 2
    total = weight_total = 0.0
    for first_row, band in dem.elevation_bands(width, height, seed=seed):
        latitudes = 90.0 - (np.arange(first_row, first_row + band.shape[0])
                            + 0.5) * (180.0 / height)
        weights = np.cos(np.radians(latitudes))
        total += float((band.astype(np.float64).sum(axis=1) * weights).sum())
        weight_total += float(weights.sum()) * width
    return total / weight_total


# ─────────────────────────────────────────────────────────────────────────
#  La grille se déduit de la pyramide
# ─────────────────────────────────────────────────────────────────────────

def test_the_width_comes_from_the_pyramid_and_nothing_else():
    """`W = 2^z · T`. Aucun nombre rond saisi à la main."""
    assert dem.WIDTH == dem.TILE_SIZE * 2 ** dem.MAX_ZOOM == 16384
    assert dem.HEIGHT == dem.WIDTH // 2 == 8192
    assert dem.grid_width(zoom=0) == dem.TILE_SIZE
    assert dem.grid_width(zoom=10, tile_size=512) == 512 * 1024


def test_the_grid_matches_a_mercator_tile_at_the_equator():
    """L'égalité qui justifie tout le dimensionnement.

    Une grille équirectangulaire et une pyramide Mercator ont le même pas E-O à
    toute latitude dès lors que `W = 2^z · T` — les deux portent le même
    `cos φ`. On le vérifie ici à l'équateur, où le facteur vaut 1.
    """
    tile_pixel_m = k.CIRCUMFERENCE_M / (2 ** dem.MAX_ZOOM * dem.TILE_SIZE)
    assert dem.RESOLUTION_M == pytest.approx(tile_pixel_m)
    assert dem.RESOLUTION_M / 1000 == pytest.approx(1.831, abs=1e-3)


@pytest.mark.parametrize("latitude, factor", [
    (0.0, 1.00), (21.0, 1.07), (60.0, 2.00), (85.0511, 11.59),
])
def test_mercator_demands_a_finer_north_south_step_at_high_latitude(latitude,
                                                                    factor):
    """Le coût qu'on accepte, et où il tombe.

    En E-O l'accord est exact ; en N-S, Mercator étant conforme, il réclame
    `1/cos φ` fois plus fin que le pas constant de l'équirectangulaire. Comme la
    pyramide sera en repère Étoile, ces hautes latitudes sont les faces mortes,
    et la bande habitée tombe sur l'équateur Mercator où le facteur vaut 1.
    """
    assert 1 / math.cos(math.radians(latitude)) == pytest.approx(factor,
                                                                 abs=0.01)


def test_the_transform_bridges_pixel_space_and_geography():
    transform = dem.crust_transform(SMALL, SMALL // 2)
    assert transform.c == -180.0 and transform.f == 90.0
    assert transform.a == pytest.approx(360.0 / SMALL)
    # Y descend dans l'espace pixel et monte dans l'espace projeté : le pas est
    # NÉGATIF. C'est tout ce que la géotransformation a d'astucieux.
    assert transform.e < 0
    assert transform.e == pytest.approx(-360.0 / SMALL)


def test_the_raster_covers_the_whole_sphere_without_a_cut():
    """Le ±85,0511° de Mercator ampute le rendu, jamais la donnée.

    C'est ce qui permet à la roche actuellement sous le point substellaire de
    réapparaître dans la bande quand la croûte l'y aura menée, sans régénérer.
    """
    transform = dem.crust_transform(SMALL, SMALL // 2)
    west, north = transform * (0, 0)
    east, south = transform * (SMALL, SMALL // 2)
    assert (west, east) == (-180.0, 180.0)
    assert (north, south) == (90.0, -90.0)


def test_pixel_centres_are_offset_by_half_a_pixel():
    """Sans le demi-pixel, la première ligne tomberait *sur* le pôle et la
    dernière un pixel avant l'autre — un raster asymétrique."""
    height = SMALL // 2
    first, *_, last = [90.0 - (j + 0.5) * (180.0 / height)
                       for j in range(height)]
    assert first == pytest.approx(-last)
    assert first < 90.0


# ─────────────────────────────────────────────────────────────────────────
#  Le terrain face au datum
# ─────────────────────────────────────────────────────────────────────────

def test_the_surface_offset_does_not_depend_on_resolution():
    """Le décalage est une propriété de la **réalisation**, pas de la grille.

    C'est ce qui rend le choix de graine bon marché : on mesure sur une petite
    grille, et le résultat vaut pour le raster de production.
    """
    enregistre = calibration.load()
    seed = enregistre.seed
    grossier = _weighted_mean(enregistre.scan_width, seed)
    fin = _weighted_mean(enregistre.scan_width * 2, seed)
    assert grossier == pytest.approx(fin, abs=enregistre.offset_tolerance_m)

    # ⚠️ L'invariance vaut **à partir de la grille de balayage**, pas en
    # dessous : à 128 px le pas fait 234 km, plus grossier que l'octave la plus
    # basse du bruit, et la moyenne de surface s'en trouve biaisée de plusieurs
    # mètres. Mesurer plus grossier que ce qu'on échantillonne ne dit rien.
    assert enregistre.scan_width >= 512


def test_the_chosen_seed_sits_on_the_reference_sphere():
    """**Le critère de `calibrate`, rejoué sur la graine qu'il a retenue.**

    C'est le contrat entre le code et `calibration.json` : le critère vit ici,
    la valeur vit là-bas. Changer un paramètre du générateur sans relancer la
    calibration fait tomber ce test, au lieu de produire silencieusement un
    terrain décalé sous son propre datum.
    """
    enregistre = calibration.load()
    mesure = _weighted_mean(enregistre.scan_width, enregistre.seed)

    assert abs(mesure) <= enregistre.offset_tolerance_m
    # Et la valeur consignée doit être celle qu'on retrouve, pas une autre.
    assert mesure == pytest.approx(enregistre.area_weighted_offset_m, abs=0.01)


def test_an_arbitrary_seed_would_not_have():
    """Le contre-exemple, sans quoi le test précédent ne prouverait rien.

    L'espérance est nulle, la réalisation ne l'est pas : les décalages ont un
    écart-type de 305 m. Ne pas choisir, c'est accepter un sol moyen à quelques
    centaines de mètres de son propre datum.
    """
    offsets = [abs(_weighted_mean(128, seed)) for seed in (1310, 3, 5, 12)]
    assert max(offsets) > 100.0


def test_the_terrain_is_not_recentred_after_the_fact():
    """Le point 6 en dépend : le zéro est la sphère, pas la moyenne du terrain.

    Deux graines doivent donner deux décalages *différents*. S'ils étaient
    égaux — nuls, en particulier — c'est qu'on aurait recentré, et le datum
    dépendrait alors de la donnée.
    """
    assert _weighted_mean(128, 1310) != pytest.approx(_weighted_mean(128, 3),
                                                      abs=10.0)


def test_the_relief_scale_is_derived_from_the_measured_peak():
    """`RELIEF_SIGMA_M = MAX_RELIEF_M / pic`, et pas une convention à 4σ.

    Le Lot 1 posait `MAX_RELIEF_M / 4`. Ce n'était juste que pour `p = 0,5` :
    le rapport pic/σ suit la cascade, et il vaut 4,23 à la persistance
    actuelle. Conservée, la convention faisait sortir le relief à ±12,7 km
    pour un plafond de 11,8.
    """
    enregistre = calibration.load()
    assert dem.default_relief_sigma_m() == pytest.approx(
        k.MAX_RELIEF_M / enregistre.peak_to_sigma)
    # Le contre-exemple : l'ancienne convention ne convient plus.
    assert dem.default_relief_sigma_m() != pytest.approx(k.MAX_RELIEF_M / 4,
                                                         rel=0.01)


def test_the_relief_never_reaches_the_gravity_ceiling():
    """Le générateur n'écrête pas — c'est l'échelle qui doit tenir.

    Un écrêtage créerait des plateaux et briserait la moyenne nulle. La seule
    protection est donc que `RELIEF_SIGMA_M` soit assez petit, ce que
    `calibrate` garantit en mesurant le pic au lieu de le supposer.
    """
    enregistre = calibration.load()
    assert max(abs(enregistre.minimum_m),
               abs(enregistre.maximum_m)) <= k.MAX_RELIEF_M


def test_the_generated_relief_has_the_scale_it_claims():
    values = np.concatenate([band.ravel() for _, band
                             in dem.elevation_bands(512, 256)])
    assert values.std() == pytest.approx(dem.default_relief_sigma_m(),
                                         rel=0.10)


def test_the_persistence_is_derived_from_the_hurst_exponent():
    """`p = l^(−H)` — la persistance ne se saisit pas, elle se déduit.

    Même discipline que `W = 2^z·T` : le paramètre libre est celui qui a un
    sens — l'exposant de Hurst, qui gouverne la rugosité — et le réglage du
    générateur s'en déduit. Écrire 0,7071 en ferait un chiffre orphelin.
    """
    assert dem.PERSISTENCE == pytest.approx(
        dem.LACUNARITY ** (-dem.HURST_TARGET))

    # Le contre-exemple porte sur la DÉRIVATION, pas sur une valeur : deux
    # exposants distincts doivent donner deux persistances distinctes, sans
    # quoi la formule ne piloterait rien.
    #
    # Repères mesurés : H = 1 → p = 0,5, un relief invariant d'échelle (0,3° de
    # pente à toutes les portées) ; H = 0,5 → p = 0,7071, essayé puis écarté
    # pour ce qu'il faisait à l'hydrologie. Voir la docstring de HURST_TARGET.
    assert dem.LACUNARITY ** (-1.0) == pytest.approx(0.5)
    assert dem.LACUNARITY ** (-0.5) == pytest.approx(0.70710678)
    assert dem.LACUNARITY ** (-1.0) != pytest.approx(dem.LACUNARITY ** (-0.5))


def test_the_finest_octave_stays_above_nyquist():
    """Dix octaves depuis la fréquence 2 portent la plus fine à 1 024, soit une
    cellule de 4,7 km — 2,5 pixels. Une octave de plus replierait."""
    finest = dem.BASE_FREQUENCY * dem.LACUNARITY ** (dem.OCTAVES - 1)
    cell_m = k.RADIUS_M / finest
    assert cell_m / dem.RESOLUTION_M > 2.0


# ─────────────────────────────────────────────────────────────────────────
#  Écriture et relecture
# ─────────────────────────────────────────────────────────────────────────

def test_the_dem_round_trips_through_rasterio(tmp_path):
    path = tmp_path / "dem.tif"
    stats = dem.write_dem(path, width=SMALL, height=SMALL // 2, cog=False)

    with rasterio.open(path) as src:
        assert src.shape == (SMALL // 2, SMALL)
        assert src.dtypes == ("float32",)
        assert src.nodata == k.NODATA
        assert src.transform.e < 0
        assert CRS.from_user_input(src.crs).equals(CRS.from_wkt(CRUST_WKT))
        band = src.read(1)

    assert band.min() == pytest.approx(stats.minimum)
    assert band.max() == pytest.approx(stats.maximum)


def test_the_written_crs_is_still_a_sphere(tmp_path):
    path = tmp_path / "dem.tif"
    dem.write_dem(path, width=SMALL, height=SMALL // 2, cog=False)
    with rasterio.open(path) as src:
        assert CRS.from_user_input(src.crs).to_dict()["R"] == pytest.approx(
            k.RADIUS_M)


def test_no_pixel_is_nodata(tmp_path):
    """Un MNT synthétique n'a aucun trou. La valeur est déclarée pour l'aval,
    jamais portée par un pixel."""
    path = tmp_path / "dem.tif"
    dem.write_dem(path, width=SMALL, height=SMALL // 2, cog=False)
    with rasterio.open(path) as src:
        assert not (src.read(1) == k.NODATA).any()


def test_the_cog_is_tiled_and_carries_overviews(tmp_path):
    """Ce qui distingue un COG d'un GeoTIFF : des tuiles internes et des
    aperçus, donc une lecture partielle par requêtes HTTP Range."""
    plain = tmp_path / "plain.tif"
    cog = tmp_path / "cog.tif"
    dem.write_dem(plain, width=1024, height=512, cog=False)
    dem.write_dem(cog, width=1024, height=512, cog=True)

    with rasterio.open(plain) as src:
        assert src.overviews(1) == []
    with rasterio.open(cog) as src:
        assert src.overviews(1), "un COG doit porter des aperçus"
        assert src.profile["tiled"] is True
        assert src.block_shapes == [(512, 512)]

    assert not cog.with_suffix(".plain.tif").exists(), "l'intermédiaire reste"


def test_the_overviews_average_rather_than_sample(tmp_path):
    """Rééchantillonnage d'une grandeur **continue** : moyenne, pas plus proche
    voisin. Le plus proche voisin est pour le catégoriel — il inventerait des
    falaises en décimant."""
    path = tmp_path / "cog.tif"
    dem.write_dem(path, width=1024, height=512, cog=True)
    with rasterio.open(path) as src:
        full = src.read(1)
        coarse = src.read(1, out_shape=(1, src.height // 2, src.width // 2))
    # Une moyenne resserre la distribution ; un sous-échantillonnage la
    # conserverait.
    assert coarse.std() < full.std()
    assert coarse.mean() == pytest.approx(full.mean(), abs=0.02 * full.std())


def test_the_same_seed_rewrites_the_same_raster(tmp_path):
    first, second = tmp_path / "a.tif", tmp_path / "b.tif"
    for path in (first, second):
        dem.write_dem(path, width=SMALL, height=SMALL // 2, cog=False,
                      seed=99)
    with rasterio.open(first) as a, rasterio.open(second) as b:
        assert np.array_equal(a.read(1), b.read(1))


def test_the_statistics_report_the_area_weighted_mean(tmp_path):
    """La moyenne par pixel n'est pas la moyenne de surface : sur une grille
    équirectangulaire un pixel polaire couvre `cos φ` fois moins de sol."""
    stats = dem.write_dem(tmp_path / "dem.tif", width=512, height=256,
                          cog=False)
    assert stats.mean != pytest.approx(stats.area_weighted_mean, abs=1e-6)
    assert abs(stats.area_weighted_mean) < 2.0
