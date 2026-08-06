"""Les constantes dérivées retombent-elles sur ce que le lore annonce ?

Ces tests ne vérifient pas du code : ils vérifient que le modèle numérique et
le texte de `rules/fr/univers/` disent la même chose. Un échec ici signale soit
une constante saisie de travers, soit une incohérence à trancher côté règles.
"""

import math

import pytest

from aeonir_gis import constants as k


def test_orbit_derives_the_eccentricity_announced_by_the_lore():
    """`climat.md` annonce 0,20. On ne la saisit pas, on la calcule."""
    assert k.SEMI_MAJOR_AXIS_AU == pytest.approx(17.5)
    assert k.ECCENTRICITY == pytest.approx(0.20, abs=5e-3)


def test_circumference():
    assert k.CIRCUMFERENCE_M / 1000 == pytest.approx(30_003, abs=1)


def test_terrain_exaggeration_is_the_inverse_radius_ratio():
    """Le seul endroit où le mensonge de rayon vit."""
    assert k.TERRAIN_EXAGGERATION == pytest.approx(1.336, abs=5e-4)
    assert k.RADIUS_RATIO * k.TERRAIN_EXAGGERATION == pytest.approx(1.0)


def test_the_two_half_terminators_have_different_bounds():
    """Le point de fond : les deux moitiés ne sont pas symétriques.

    On émerge des glaces à −18° côté Levant, on y retourne à −21° côté
    Couchant. Trois degrés d'hystérésis — le seuil de dégel n'est pas celui du
    gel.
    """
    levant = k.traversable_band(k.LEVANT)
    couchant = k.traversable_band(k.COUCHANT)
    assert levant == (-18.0, 6.0)
    assert couchant == (-21.0, 6.0)
    assert levant[0] != couchant[0]


def test_each_half_terminator_is_about_2000_km_wide():
    """⚠️ Ne correspond PAS aux 1 500 km annoncés par `climat.md`.

    Question ouverte côté règles : les 1 500 km désignent-ils le cœur vivable
    plutôt que l'étendue front à front ? Ce test épingle ce que la géométrie
    donne, sans prétendre trancher.
    """
    for hemisphere, expected_km in ((k.LEVANT, 2000), (k.COUCHANT, 2250)):
        low, high = k.traversable_band(hemisphere)
        width = k.arc_degrees_to_metres(high - low) / 1000
        assert width == pytest.approx(expected_km, abs=5)


@pytest.mark.parametrize("longitude, expected", [
    (-90.0, k.LEVANT),
    (-1.0, k.LEVANT),
    (-179.0, k.LEVANT),
    (1.0, k.COUCHANT),
    (90.0, k.COUCHANT),
    (179.0, k.COUCHANT),
    (270.0, k.LEVANT),          # normalisation
])
def test_hemisphere_at(longitude, expected):
    assert k.hemisphere_at(longitude) == expected


def test_arc_conversions_are_inverse():
    for degrees in (0.0, 1.0, 18.0, -21.0, 90.0):
        metres = k.arc_degrees_to_metres(degrees)
        assert k.metres_to_arc_degrees(metres) == pytest.approx(degrees)


def test_one_degree_along_the_ring():
    """83,3 km par degré de longitude Étoile, le long du terminateur."""
    assert k.arc_degrees_to_metres(1.0) / 1000 == pytest.approx(83.3, abs=0.1)


def test_solar_day_is_the_beat_of_the_two_clocks():
    """`astronomie.md` annonce un jour solaire de 1 414 ans.

    ⚠️ Très sensible aux arrondis : une orbite de 54,5 ans donne 1 375 ans,
    54,56 donne 1 414. On teste l'ordre de grandeur, jamais la décimale.
    """
    assert k.SOLAR_DAY_A == pytest.approx(1375, abs=5)
    assert 1300 < k.SOLAR_DAY_A < 1500


def test_terminator_moves_at_the_solar_day_rate_not_the_rotation_rate():
    """L'erreur à ne pas refaire.

    Sur un monde quasi-verrouillé, c'est l'écart de 4 % entre rotation et orbite
    qui promène le terminateur, pas la rotation. Confondre les deux le rend
    vingt-cinq fois trop rapide.
    """
    per_year_m = k.TERMINATOR_SPEED_MS * 365.25 * 86400
    assert per_year_m / 1000 == pytest.approx(21.8, abs=0.5)

    naive = k.CIRCUMFERENCE_M / k.ROTATION_PERIOD_A
    assert naive / (per_year_m) == pytest.approx(24.2, abs=1.0)


@pytest.mark.parametrize("beta, expected", [(0.0, 71), (45.0, 100), (60.0, 140)])
def test_traversal_durations_match_the_lore(beta, expected):
    """Les trois durées de `climat.md` sortent du jour solaire et des 1 500 km.

    Rien d'autre n'est fourni au calcul : ni les 71 ans, ni la loi en `1/cos β`.
    Tolérance de 5 %, qui absorbe l'écart d'arrondi entre notre jour solaire de
    1 375 ans et les 1 414 du vault.
    """
    assert k.traversal_duration_a(beta) == pytest.approx(expected, rel=0.05)


def test_traversing_the_full_band_takes_longer_than_the_inhabited_core():
    """Les 1 500 km sont la zone habitée, pas l'étendue franchissable.

    Les extrémités sont traversées mais pas peuplées — trop hostiles. Un nomade
    qui suivrait la bande de bout en bout y passerait un tiers de temps de plus.
    """
    low, high = k.traversable_band(k.LEVANT)
    full_m = k.arc_degrees_to_metres(high - low)
    assert full_m > k.INHABITED_WIDTH_M
    assert (k.traversal_duration_a(0.0, full_m)
            / k.traversal_duration_a(0.0)) == pytest.approx(4 / 3, rel=0.05)


def test_the_two_clocks_are_close_but_not_equal():
    """C'est leur quasi-égalité qui fait le quasi-verrouillage."""
    assert k.ROTATION_PERIOD_A != k.ORBITAL_PERIOD_A
    ratio = k.ROTATION_PERIOD_A / k.ORBITAL_PERIOD_A
    assert ratio == pytest.approx(1.041, abs=1e-3)


@pytest.mark.parametrize("latitude, hemisphere, expected", [
    # Au-delà de la bande, des deux côtés
    (90.0, k.LEVANT, "Face Ardente"),
    (7.0, k.COUCHANT, "Face Ardente"),
    (-40.0, k.LEVANT, "Face Obscure"),

    # Le gradient commun, identique des deux côtés
    (0.0, k.LEVANT, "Cœur tempéré"),
    (0.0, k.COUCHANT, "Cœur tempéré"),
    (-1.0, k.LEVANT, "Jungle Indigo"),      # [−3°, 0°[ appartient à l'Indigo
    (-5.0, k.LEVANT, "Steppes crépusculaires"),   # seuil = borne INFÉRIEURE

    # Les extrémités, où les deux moitiés divergent
    (5.0, k.LEVANT, "Mur des Tempêtes"),
    (5.0, k.COUCHANT, "Front du Couchant"),
    (-16.0, k.LEVANT, "Front du Levant"),
    (-20.0, k.COUCHANT, "Le Linceul"),
])
def test_zone_at(latitude, hemisphere, expected):
    assert k.zone_at(latitude, hemisphere) == expected


def test_the_same_latitude_describes_two_different_worlds():
    """Le cœur de la correction : le climat n'est pas `f(lat')` seule.

    À −20°, le Levant n'a pas encore livré ses terres — elles sont sous la
    glace — pendant que le Couchant y voit l'azote se solidifier.
    """
    assert k.zone_at(-20.0, k.LEVANT) == "Face Obscure"
    assert k.zone_at(-20.0, k.COUCHANT) == "Le Linceul"

    assert k.zone_at(5.0, k.LEVANT) == "Mur des Tempêtes"
    assert k.zone_at(5.0, k.COUCHANT) == "Front du Couchant"


def test_solar_elevation_zones_are_ordered_downwards():
    thresholds = [threshold for threshold, _ in k.SOLAR_ELEVATION_ZONES]
    assert thresholds == sorted(thresholds, reverse=True)


def test_aeonir_is_a_sphere():
    assert k.FLATTENING == 0.0


def test_rotational_flattening_is_negligible():
    """Justification du test précédent, refaite ici plutôt que recopiée.

    f ≈ 5/4 · ω²a³/GM pour un corps fluide homogène. Avec une rotation de
    56 ans, on attend moins d'un dixième de millimètre sur 4 775 km.
    """
    omega = 2 * math.pi / (k.ROTATION_PERIOD_A * 365.25 * 86400)
    gm = k.SURFACE_GRAVITY_MS2 * k.RADIUS_M ** 2
    flattening = 1.25 * omega ** 2 * k.RADIUS_M ** 3 / gm
    assert flattening * k.RADIUS_M * 1000 < 0.1     # millimètres
