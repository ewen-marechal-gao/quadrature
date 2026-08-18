"""Le tuileur — chaque propriété avec son contre-exemple.

Vérifier qu'une fonction rend le bon chiffre ne prouve pas grand-chose. Ce qui
prouve, c'est qu'une version *plausible mais fausse* de la même fonction serait
attrapée. Chaque test ci-dessous nomme l'erreur qu'il interdit.
"""

import math

import numpy as np
import pytest

from aeonir_gis import constants as k
from aeonir_gis import tiles
from aeonir_gis.crs import star_to_crust


# ─────────────────────────────────────────────────────────────────────────
#  La grille
# ─────────────────────────────────────────────────────────────────────────


def test_mercator_y_worked_example_at_45_degrees():
    """Le calcul pas à pas, à 45° — la latitude où tan φ vaut 1.

        φ = 45° = 0,785398 rad
        tan φ + sec φ = 1,000000 + 1,414214 = 2,414214
        ln(…)         = 0,881374
        / π           = 0,280550
        y = (1 − 0,280550) / 2 = 0,359725

    À z = 2 la grille fait quatre lignes : ⌊0,359725 × 4⌋ = 1, donc 45° tombe
    dans la deuxième ligne en partant du nord.
    """
    phi = math.radians(45.0)
    assert math.tan(phi) + 1 / math.cos(phi) == pytest.approx(2.414214, abs=1e-6)
    assert math.log(2.414213562) / math.pi == pytest.approx(0.280550, abs=1e-6)
    assert tiles.mercator_y(45.0) == pytest.approx(0.359725, abs=1e-6)
    assert int(tiles.mercator_y(45.0) * tiles.grid_side(2)) == 1


def test_mercator_y_puts_north_at_zero():
    """L'origine est en HAUT — convention XYZ, pas TMS.

    Contre-exemple : un tuileur en convention TMS mettrait le nord à 1. La
    carte s'afficherait sans erreur, simplement retournée.
    """
    assert tiles.mercator_y(tiles.WEB_MERCATOR_LIMIT_DEG) == pytest.approx(0.0,
                                                                           abs=1e-9)
    assert tiles.mercator_y(-tiles.WEB_MERCATOR_LIMIT_DEG) == pytest.approx(1.0,
                                                                            abs=1e-9)
    assert tiles.mercator_y(0.0) == pytest.approx(0.5)


def test_the_limit_latitude_is_a_closed_form_not_a_convention():
    """φ_max = gd(π) = arctan(sinh π) = 2·arctan(e^π) − π/2.

    Le seul arbitraire est en amont — « le monde doit être carré », donc
    ``ln(tan φ + sec φ) = π``. Le nombre, lui, n'est pas choisi : les deux
    formes closes retombent sur la constante **au bit près**.

    Contre-exemple : couper à 85° tout rond décalerait la grille, et les tuiles
    ne seraient plus carrées — donc plus divisibles en quadrants.
    """
    assert math.degrees(math.atan(math.sinh(math.pi))) == \
        tiles.WEB_MERCATOR_LIMIT_DEG
    assert math.degrees(2 * math.atan(math.exp(math.pi)) - math.pi / 2) == \
        tiles.WEB_MERCATOR_LIMIT_DEG

    # La définition dont tout découle : la latitude isométrique y vaut π.
    phi = math.radians(tiles.WEB_MERCATOR_LIMIT_DEG)
    assert math.log(math.tan(phi) + 1 / math.cos(phi)) == pytest.approx(
        math.pi, abs=1e-14)

    assert tiles.mercator_y(85.0) != pytest.approx(0.0, abs=1e-6)
    assert tiles.mercator_y(tiles.WEB_MERCATOR_LIMIT_DEG) == pytest.approx(
        0.0, abs=1e-12)


def test_mercator_latitude_inverts_mercator_y():
    latitudes = np.linspace(-85.0, 85.0, 401)
    assert np.allclose(tiles.mercator_latitude(tiles.mercator_y(latitudes)),
                       latitudes, atol=1e-9)


def test_resolution_is_only_nominal_at_the_equator():
    """La résolution annoncée d'un zoom est celle de l'équateur.

    Contre-exemple : traiter 1,83 km/px comme valable partout ferait croire que
    les tuiles polaires portent autant d'information — elles en portent
    `1/cos φ` fois moins.
    """
    step = tiles.resolution_deg(6)
    assert step == pytest.approx(360.0 / 16384)
    # Un degré de longitude vaut cos φ fois moins de terrain vers le pôle.
    assert np.cos(np.radians(60.0)) == pytest.approx(0.5, abs=1e-9)


# ─────────────────────────────────────────────────────────────────────────
#  Quelles tuiles existent
# ─────────────────────────────────────────────────────────────────────────


def test_row_range_worked_example_at_zoom_6():
    """La bande du terminateur à z = 6, pas à pas.

        y(+6°)  = 0,483303  → ⌊0,483303 × 64⌋ = ⌊30,93⌋ = 30
        y(−21°) = 0,559685  → ⌊0,559685 × 64⌋ = ⌊35,82⌋ = 35

    soit les lignes 30 à 35 — six lignes — donc 6 × 64 = 384 tuiles.
    """
    assert tiles.mercator_y(6.0) == pytest.approx(0.483303, abs=1e-6)
    assert tiles.mercator_y(-21.0) == pytest.approx(0.559685, abs=1e-6)
    assert tiles.row_range(6) == (30, 35)
    assert tiles.tile_count(6) == 6 * 64 == 384


def test_the_band_is_derived_from_the_lore_not_typed_in():
    """Les bornes viennent des seuils climatiques, pas d'un chiffre saisi.

    Contre-exemple : écrire −21 et +6 en dur ferait diverger le tuileur le jour
    où `climat.md` bougerait un seuil.
    """
    assert tiles.BAND_NORTH_DEG == k.LEVANT_LIMIT_DEG
    assert tiles.BAND_SOUTH_DEG == k.COUCHANT_LIMIT_DEG
    # Les deux extrêmes viennent de MOITIÉS DIFFÉRENTES — c'est l'hystérésis.
    assert k.COUCHANT_LIMIT_DEG < k.LEVANT_EMERGENCE_DEG


def test_the_discretisation_overhead_shrinks_with_zoom():
    """La bande occupe 7,64 % de la hauteur Mercator — mais en tuiles ENTIÈRES.

    Une bande ne peut jamais tenir dans moins que sa part exacte, et une ligne
    entamée est une ligne payée. L'excédent est donc toujours positif, et il
    s'amenuise à mesure que les tuiles rapetissent : 23 % de gâchis à z=6, 2 %
    à z=10.

    Contre-exemple : croire que 384 tuiles à z=6 valent 7,64 % du globe. C'est
    9,4 %, et l'écart est la découpe, pas la géographie.
    """
    exact = float(tiles.mercator_y(tiles.BAND_SOUTH_DEG)
                  - tiles.mercator_y(tiles.BAND_NORTH_DEG))
    assert exact == pytest.approx(0.0764, abs=1e-4)

    overheads = {}
    for zoom in range(4, 11):
        first, last = tiles.row_range(zoom)
        share = (last - first + 1) / tiles.grid_side(zoom)
        assert share >= exact          # jamais moins que la part exacte
        overheads[zoom] = share / exact - 1.0

    assert overheads[6] > 0.15
    assert overheads[10] < 0.05
    assert overheads[10] < overheads[6]


def test_deeper_levels_dominate_the_pyramid():
    """Le dernier niveau pèse l'essentiel — la loi en 4^z.

    C'est le seul paramètre qui compte pour le coût, et la raison pour laquelle
    `maxzoom` se choisit sur des chiffres.
    """
    cumulative = sum(tiles.tile_count(z) for z in range(7))
    assert tiles.tile_count(6) / cumulative > 0.70


def test_tile_bounds_tile_the_world_without_gap_or_overlap():
    zoom = 3
    side = tiles.grid_side(zoom)
    for y in range(side - 1):
        _, south, _, _ = tiles.tile_bounds_deg(zoom, 0, y)
        _, _, _, north_below = tiles.tile_bounds_deg(zoom, 0, y + 1)
        assert south == pytest.approx(north_below, abs=1e-12)
    west, _, _, _ = tiles.tile_bounds_deg(zoom, 0, 0)
    _, _, east, _ = tiles.tile_bounds_deg(zoom, side - 1, 0)
    assert (west, east) == (-180.0, 180.0)


def test_tile_bounds_order_is_west_south_east_north():
    west, south, east, north = tiles.tile_bounds_deg(6, 32, 30)
    assert west < east and south < north


def test_pixel_centres_sit_inside_their_tile_not_on_its_corner():
    """Convention de centre de pixel.

    Contre-exemple : caler les pixels sur les coins décale la pyramide d'un
    demi-pixel, ce qui ne se voit qu'aux coutures entre tuiles voisines.
    """
    zoom, x, y = 6, 32, 30
    west, south, east, north = tiles.tile_bounds_deg(zoom, x, y)
    lon, lat = tiles.tile_pixel_lonlat(zoom, x, y, tile_size=4)
    assert lon.min() > west and lon.max() < east
    assert lat.min() > south and lat.max() < north
    # Et le premier pixel est à un demi-pas du bord, pas dessus.
    step = (east - west) / 4
    assert lon[0, 0] == pytest.approx(west + step / 2)


def test_adjacent_tiles_do_not_share_pixel_centres():
    """Deux tuiles voisines se touchent sans se recouvrir."""
    left = tiles.tile_pixel_lonlat(4, 5, 8, tile_size=8)[0]
    right = tiles.tile_pixel_lonlat(4, 6, 8, tile_size=8)[0]
    assert left.max() < right.min()


# ─────────────────────────────────────────────────────────────────────────
#  L'échantillonnage
# ─────────────────────────────────────────────────────────────────────────


def test_sampling_recovers_pixel_centres_exactly():
    grid = np.arange(8 * 4, dtype=np.float64).reshape(4, 8)
    for row in range(4):
        for col in range(8):
            lon = -180.0 + (col + 0.5) * (360.0 / 8)
            lat = 90.0 - (row + 0.5) * (180.0 / 4)
            assert tiles.sample_bilinear(grid, lon, lat) == pytest.approx(
                grid[row, col])


def test_longitude_wraps_at_the_antimeridian():
    """La colonne après la dernière est la première.

    Contre-exemple, et c'est le vrai piège : borner la longitude au lieu de
    l'enrouler fige une bande de pixels sur tout l'antiméridien. Ici, un
    échantillon pile sur ±180° doit valoir la moyenne des deux bords.
    """
    grid = np.array([[0.0, 10.0, 20.0, 30.0]])
    at_seam = tiles.sample_bilinear(grid, 180.0, 0.0)
    assert at_seam == pytest.approx((30.0 + 0.0) / 2)

    clipped = (grid[0, -1] + grid[0, -1]) / 2      # ce que ferait un clip
    assert at_seam != pytest.approx(clipped)


def test_latitude_clamps_at_the_poles():
    """Au-delà du pôle il n'y a rien — surtout pas l'antipode.

    Contre-exemple : enrouler la latitude comme la longitude enverrait un pixel
    polaire chercher sa valeur de l'autre côté du monde.
    """
    grid = np.array([[1.0, 1.0], [9.0, 9.0]])
    assert tiles.sample_bilinear(grid, 0.0, 89.999) == pytest.approx(1.0)
    assert tiles.sample_bilinear(grid, 0.0, -89.999) == pytest.approx(9.0)


def test_sampling_is_linear_between_two_pixels():
    grid = np.array([[0.0, 100.0]])
    middle = tiles.sample_bilinear(grid, 0.0, 0.0)
    assert middle == pytest.approx(50.0)


def test_sampling_worked_example_on_a_four_by_two_grid():
    """Grille 4 × 2 — Δ = 90° en longitude, 90° en latitude — à (170°, 0°).

        col = (170 + 180) · 4/360 − ½ = 3,389   → colonnes 3 et 4→0, poids 0,389
        lig = (90 − 0)   · 2/180 − ½ = 0,5      → lignes 0 et 1, poids 0,5

    La colonne 4 n'existe pas et redevient la colonne 0 : le pixel interpole
    entre le bord est et le bord ouest, ce qui est le comportement voulu à
    l'antiméridien.
    """
    grid = np.array([[0.0, 1.0, 2.0, 3.0],
                     [10.0, 11.0, 12.0, 13.0]])
    col = (170.0 + 180.0) * 4 / 360.0 - 0.5
    row = (90.0 - 0.0) * 2 / 180.0 - 0.5
    assert col == pytest.approx(3.3889, abs=1e-4)
    assert row == pytest.approx(0.5)

    fx, fy = col - 3, row - 0
    haut = grid[0, 3] * (1 - fx) + grid[0, 0] * fx      # 4 → 0, l'enroulement
    bas = grid[1, 3] * (1 - fx) + grid[1, 0] * fx
    attendu = haut * (1 - fy) + bas * fy

    assert tiles.sample_bilinear(grid, 170.0, 0.0) == pytest.approx(attendu)


# ─────────────────────────────────────────────────────────────────────────
#  Le noyau bicubique
# ─────────────────────────────────────────────────────────────────────────


def test_catmull_rom_weights_sum_to_one():
    """Sans quoi l'interpolation décalerait le niveau du terrain."""
    for t in np.linspace(0.0, 0.999, 41):
        assert sum(tiles._catmull_rom_weights(t)) == pytest.approx(1.0)


def test_catmull_rom_passes_through_its_control_points():
    """En t=0 le poids est entièrement sur le voisin central.

    C'est ce qui distingue Catmull-Rom d'une B-spline, qui lisserait les
    points de contrôle au lieu de les traverser.
    """
    assert tiles._catmull_rom_weights(0.0) == pytest.approx((0.0, 1.0, 0.0, 0.0))


def test_bicubic_recovers_pixel_centres_exactly():
    grid = np.arange(8 * 4, dtype=np.float64).reshape(4, 8)
    for row in range(4):
        for col in range(8):
            lon = -180.0 + (col + 0.5) * (360.0 / 8)
            lat = 90.0 - (row + 0.5) * (180.0 / 4)
            assert tiles.sample_bicubic(grid, lon, lat) == pytest.approx(
                grid[row, col])


def test_bicubic_wraps_and_clamps_like_bilinear():
    grid = np.array([[0.0, 10.0, 20.0, 30.0]])
    seam = tiles.sample_bicubic(grid, 180.0, 0.0)
    assert 0.0 <= seam <= 30.0            # interpole entre les deux bords
    tall = np.array([[1.0, 1.0], [9.0, 9.0]])
    assert tiles.sample_bicubic(tall, 0.0, 89.999) == pytest.approx(1.0)
    assert tiles.sample_bicubic(tall, 0.0, -89.999) == pytest.approx(9.0)


def test_bilinear_gradients_are_piecewise_constant_and_bicubic_ones_are_not():
    """Le défaut qui a produit des blocs dans l'ombrage, réduit à sa cause.

    Un ombrage est une DÉRIVÉE. Le bilinéaire est C⁰ : sa dérivée est
    constante à l'intérieur de chaque cellule source et saute aux frontières,
    ce qui dessine des rectangles de la taille du pixel source. Catmull-Rom
    est C¹, donc sa dérivée varie continûment.

    On suréchantillonne ici une petite grille d'un facteur 16 — la situation
    d'une tuile Mercator à haute latitude — et on compte les valeurs
    distinctes prises par la dérivée seconde le long d'une ligne.
    """
    rng = np.random.default_rng(0)
    grid = rng.normal(0.0, 100.0, (8, 16))

    lon = np.linspace(-179.0, 179.0, 512)
    lat = np.zeros_like(lon)

    lineaire = tiles.sample_bilinear(grid, lon, lat)
    cubique = tiles.sample_bicubic(grid, lon, lat)

    # La dérivée seconde d'une interpolation bilinéaire est nulle presque
    # partout : la fonction est affine par morceaux.
    d2_lineaire = np.abs(np.diff(lineaire, n=2))
    d2_cubique = np.abs(np.diff(cubique, n=2))

    assert (d2_lineaire < 1e-9).mean() > 0.90      # affine par morceaux
    assert (d2_cubique < 1e-9).mean() < 0.05       # courbure partout

    # Et les deux restent proches en VALEUR : c'est bien la dérivée qui
    # diffère, pas le terrain.
    assert np.abs(lineaire - cubique).max() < 4 * grid.std()


# ─────────────────────────────────────────────────────────────────────────
#  La tuile d'altitudes
# ─────────────────────────────────────────────────────────────────────────


def _synthetic_dem(height=180, width=360):
    """MNT jouet dont l'altitude EST la latitude Croûte, en mètres.

    Ce choix rend l'assertion possible : on connaît analytiquement ce que doit
    valoir chaque pixel après la rotation, sans dépendre du bruit.
    """
    latitudes = 90.0 - (np.arange(height) + 0.5) * (180.0 / height)
    return np.repeat(latitudes[:, None], width, axis=1)


def test_elevation_tile_follows_the_crust_rotation():
    """La tuile lit bien la Croûte, pas l'Étoile.

    Contre-exemple : un tuileur qui oublierait `star_to_crust` rendrait la
    latitude ÉTOILE. À l'époque 0 les deux repères diffèrent de 87° au pôle, ce
    qui est indiscutable.
    """
    dem = _synthetic_dem()
    zoom, x, y = 4, 3, 8
    tile = tiles.elevation_tile(dem, zoom, x, y, tile_size=8)

    lon_star, lat_star = tiles.tile_pixel_lonlat(zoom, x, y, tile_size=8)
    _, lat_crust = star_to_crust(lon_star, lat_star, 0.0)
    assert np.allclose(tile, lat_crust, atol=1.0)

    # Et surtout : ce n'est PAS la latitude Étoile.
    assert not np.allclose(tile, lat_star, atol=5.0)


def test_elevation_tile_has_the_requested_shape():
    dem = _synthetic_dem()
    assert tiles.elevation_tile(dem, 6, 32, 30, tile_size=16).shape == (16, 16)


def test_the_epoch_moves_the_terrain_under_the_tiles():
    """Un jeu de tuiles vaut pour une époque.

    Contre-exemple : des tuiles identiques à deux époques signifieraient que la
    rotation n'est pas appliquée, donc que le repère Étoile ne sert à rien.
    """
    dem = _synthetic_dem()
    now = tiles.elevation_tile(dem, 4, 3, 8, epoch_a=0.0, tile_size=8)
    later = tiles.elevation_tile(dem, 4, 3, 8, epoch_a=200.0, tile_size=8)
    assert not np.allclose(now, later, atol=1.0)


# ─────────────────────────────────────────────────────────────────────────
#  L'encodage terrarium
# ─────────────────────────────────────────────────────────────────────────


def test_terrarium_worked_example_at_1234_56_metres():
    """L'encodage pas à pas, sur une altitude qui use les trois canaux.

        v = 1 234,56 + 32 768 = 34 002,56
        R = 34 002 // 256 = 132        (soit 132 × 256 = 33 792 m)
        G = 34 002 %  256 = 210        (le reste entier)
        B = 0,56 × 256    = 143        (la fraction, pas de 4 mm)

    Relecture : (132 × 256 + 210 + 143/256) − 32 768 = 1 234,56 m.
    """
    assert 1234.56 + 32768 == pytest.approx(34002.56)
    assert 34002 // 256 == 132 and 34002 % 256 == 210
    assert 132 * 256 == 33792

    rgb = tiles.terrarium(np.array([[1234.56]]), full_precision=True)
    assert rgb[0, 0, 0] == 132
    assert rgb[1, 0, 0] == 210
    assert rgb[2, 0, 0] == 143
    assert tiles.decode_terrarium(rgb)[0, 0] == pytest.approx(1234.56, abs=1 / 256)


def test_terrarium_round_trips_to_the_metre():
    heights = np.linspace(-11800.0, 11800.0, 2001).reshape(1, -1)
    decoded = tiles.decode_terrarium(tiles.terrarium(heights))
    assert np.abs(decoded - heights).max() < 1.0


def test_full_precision_round_trips_to_the_encoding_step():
    heights = np.linspace(-11800.0, 11800.0, 2001).reshape(1, -1)
    decoded = tiles.decode_terrarium(
        tiles.terrarium(heights, full_precision=True))
    assert np.abs(decoded - heights).max() < 1.0 / 256


def test_dropping_the_blue_channel_costs_less_than_a_metre():
    """Le choix par défaut : 1 m de précision contre 60 % du volume.

    Contre-exemple : croire que le canal B est gratuit. Il code 4 mm sur un
    monde qui a 11 800 m de relief, et son contenu est du bruit incompressible.
    """
    heights = np.array([[1234.56, -987.65, 0.0]])
    coarse = tiles.decode_terrarium(tiles.terrarium(heights))
    assert np.all(np.abs(coarse - heights) < 1.0)
    assert np.all(tiles.terrarium(heights)[2] == 0)


def test_nodata_is_the_exact_floor_of_the_encoding():
    """`NODATA` ne demande aucun cas particulier — c'est voulu.

    À −32 768 m, les trois canaux valent 0. La valeur « pas de mesure » est le
    plancher exact de terrarium, ce qui évite une branche dans le tuileur.
    """
    rgb = tiles.terrarium(np.array([[k.NODATA]]), full_precision=True)
    assert rgb[:, 0, 0].tolist() == [0, 0, 0]


def test_a_red_channel_error_is_worth_256_metres():
    """Pourquoi la compression avec perte est interdite sur du terrain-RGB.

    Un JPEG ne dégrade pas l'image : il fabrique des altitudes fausses.
    """
    rgb = tiles.terrarium(np.array([[1000.0]]))
    damaged = rgb.copy()
    damaged[0, 0, 0] += 1
    delta = tiles.decode_terrarium(damaged) - tiles.decode_terrarium(rgb)
    assert delta == pytest.approx(256.0)
