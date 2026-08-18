"""Les deux référentiels et la rotation datée qui les relie."""

import pytest
from pyproj import CRS

from aeonir_gis import constants as k
from aeonir_gis import crs as c


# ─────────────────────────────────────────────────────────────────────────
#  Définitions
# ─────────────────────────────────────────────────────────────────────────

def test_crust_crs_parses_and_carries_the_sphere():
    crust = c.crust_crs()
    assert crust.name == "Aeonir Crust"
    assert crust.is_geographic
    assert crust.ellipsoid.semi_major_metre == k.RADIUS_M
    assert crust.ellipsoid.semi_minor_metre == k.RADIUS_M
    assert crust.ellipsoid.inverse_flattening == 0.0


def test_crust_crs_declares_our_own_authority():
    """On ne squatte aucun code EPSG : le registre évolue, et un code emprunté
    finirait par désigner autre chose.

    Nuance mesurée sur PROJ 9.5.1 : l'identifiant **est** dans le WKT et y
    survit à toute re-sérialisation, mais `to_authority()` renvoie `None` et
    `list_authority()` une liste vide. Ces méthodes interrogent la **base de
    données** de PROJ plutôt que de relire le nœud `ID` — et une autorité maison
    n'y est pas enregistrée. L'identité est donc dans le fichier, jamais
    confirmée par l'API.
    """
    wkt = c.crust_crs().to_wkt().replace(" ", "")
    assert f'ID["{c.AUTHORITY}",{c.CRUST_SRID}]' in wkt
    assert c.crust_crs().to_authority() is None
    assert c.crust_crs().list_authority() == []


def test_crust_axis_order_is_the_iso_convention():
    """Latitude d'abord — celle que les formats imposent de toute façon."""
    abbrevs = [axis.abbrev for axis in c.crust_crs().axis_info]
    assert abbrevs == ["Lat", "Lon"]


def test_star_crs_is_derived_from_the_crust():
    star = c.star_crs(0.0)
    assert star.is_derived
    assert star.is_geographic
    assert star.ellipsoid.semi_major_metre == k.RADIUS_M


def test_star_crs_uses_the_standardised_cf_method():
    """PROJ sait aussi émettre METHOD["PROJ ob_tran o_proj=longlat"] — un nom
    privé qu'aucun autre logiciel ne lirait. On veut la méthode normalisée."""
    wkt = c.star_crs(0.0).to_wkt(version="WKT2_2019")
    assert "Pole rotation (netCDF CF convention)" in wkt
    assert "PROJ ob_tran" not in wkt


def test_star_crs_name_carries_its_epoch():
    """L'époque n'a pas de champ dédié : elle EST la position du pôle. Le nom
    la rappelle pour qui relit le fichier."""
    assert "epoch 0" in c.star_crs(0.0).name
    assert "epoch 20" in c.star_crs(20.0).name


def test_mercator_is_not_epsg_3857():
    """`EPSG:3857` est défini SUR WGS84 : son rayon est gravé dans sa
    définition. Il ne peut pas servir pour Aeonir."""
    mercator = c.mercator_crs()
    assert mercator.is_projected
    assert mercator.ellipsoid.semi_major_metre == k.RADIUS_M
    assert not mercator.equals(CRS.from_epsg(3857))
    assert CRS.from_epsg(3857).ellipsoid.semi_major_metre == k.EARTH_RADIUS_M


@pytest.mark.parametrize("factory", [
    c.crust_crs,
    c.mercator_crs,
    lambda: c.star_crs(0.0),
    lambda: c.star_crs(13.5),
])
def test_wkt_round_trip_is_lossless(factory):
    original = factory()
    assert CRS.from_wkt(original.to_wkt()).equals(original)


# ─────────────────────────────────────────────────────────────────────────
#  Mécanique céleste
# ─────────────────────────────────────────────────────────────────────────

def test_epoch_zero_is_a_perihelion_facing_the_prime_meridian():
    """Les deux origines libres sont posées ensemble : le temps compte depuis un
    passage au périhélie, et le méridien origine de la Croûte est celui qui fait
    alors face à l'étoile."""
    assert c.substellar_longitude(0.0) == pytest.approx(0.0)
    assert c.substellar_declination(0.0) == pytest.approx(k.AXIAL_TILT_DEG)


def test_substellar_longitude_completes_one_turn_per_solar_day():
    """Et non par rotation sidérale — vingt-cinq fois plus lent."""
    assert c.substellar_longitude(k.SOLAR_DAY_A) == pytest.approx(0.0, abs=1e-9)
    assert c.substellar_longitude(k.SOLAR_DAY_A / 2) == pytest.approx(-180.0)

    # Sur une seule rotation sidérale, le terminateur a à peine bougé.
    assert abs(c.substellar_longitude(k.ROTATION_PERIOD_A)) < 15.0


def test_declination_stays_within_the_axial_tilt():
    for i in range(400):
        epoch = i * k.ORBITAL_PERIOD_A / 400
        assert abs(c.substellar_declination(epoch)) <= k.AXIAL_TILT_DEG + 1e-9


def test_polar_day_and_night_durations_match_the_lore():
    """`climat.md` : 20,4 ans de jour polaire Nord, 34,2 de nuit.

    Contrôle indépendant de celui par l'angle balayé de Kepler : on compte ici
    les années où la déclinaison est positive.
    """
    step = 0.005
    samples = int(k.ORBITAL_PERIOD_A / step)
    day = sum(1 for i in range(samples)
              if c.substellar_declination(i * step) > 0) * step
    assert day == pytest.approx(20.4, abs=0.1)
    assert k.ORBITAL_PERIOD_A - day == pytest.approx(34.2, abs=0.15)


# ─────────────────────────────────────────────────────────────────────────
#  Géométrie du repère Étoile
# ─────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("epoch", [0.0, 7.3, 21.0, 40.0, 56.75, 123.4])
def test_substellar_point_is_the_star_north_pole(epoch):
    """Le pôle est un point numériquement dégénéré.

    La distance angulaire s'y calcule par un arc-sinus au voisinage de 1, où la
    précision s'effondre : `d ≈ √(2ε)` donne ~10⁻⁶ degré même en double.
    L'écart résiduel mesuré vaut 7 cm à l'époque 0 et exactement zéro aux
    autres. On teste donc une **distance physique**, pas une égalité machine.
    """
    _, lat = c.crust_to_star(c.substellar_longitude(epoch),
                             c.substellar_declination(epoch), epoch)
    assert k.arc_degrees_to_metres(abs(90.0 - lat)) < 1.0


@pytest.mark.parametrize("epoch", [0.0, 7.3, 21.0, 40.0, 56.75, 123.4])
def test_geographic_north_pole_never_leaves_longitude_zero(epoch):
    """La propriété qui a décidé de l'origine des longitudes.

    Les pôles géographiques sont les points fixes de la rotation. Leur longitude
    Étoile ne dérive donc jamais — et cela reste vrai avec l'inclinaison, qui ne
    déplace que leur latitude.
    """
    lon, lat = c.crust_to_star(0.0, 90.0, epoch)
    assert lon == pytest.approx(0.0, abs=1e-9)
    assert lat == pytest.approx(c.substellar_declination(epoch), abs=1e-9)


@pytest.mark.parametrize("epoch", [0.0, 21.0, 123.4])
def test_geographic_south_pole_sits_at_longitude_180(epoch):
    lon, _ = c.crust_to_star(0.0, -90.0, epoch)
    assert abs(lon) == pytest.approx(180.0, abs=1e-9)


@pytest.mark.parametrize("epoch", [0.0, 13.7, 44.2, 200.0])
def test_star_latitude_is_exactly_the_star_elevation(epoch):
    """L'identité qui justifie tout le repère.

    Contrôlée contre un calcul de distance angulaire qui n'emprunte rien à PROJ.
    """
    worst = 0.0
    for lon in range(-180, 180, 23):
        for lat in range(-85, 86, 13):
            _, star_lat = c.crust_to_star(float(lon), float(lat), epoch)
            expected = c.star_elevation(float(lon), float(lat), epoch)
            worst = max(worst, abs(star_lat - expected))
    assert worst < 1e-9


@pytest.mark.parametrize("epoch", [0.0, 13.7, 44.2])
def test_transformation_is_invertible(epoch):
    worst = 0.0
    for lon in range(-180, 180, 29):
        for lat in range(-80, 81, 17):
            x, y = c.crust_to_star(float(lon), float(lat), epoch)
            back_lon, back_lat = c.star_to_crust(x, y, epoch)
            delta_lon = abs(((back_lon - lon + 180) % 360) - 180)
            worst = max(worst, delta_lon, abs(back_lat - lat))
    assert worst < 1e-9


def test_levant_is_on_negative_star_longitudes():
    """Fixe le sens de rotation.

    Le Levant est la moitié du terminateur où la terre sort des glaces, donc où
    la latitude Étoile croît. Le lore la place sur `lon' ∈ (−180, 0)`. C'était
    une chance sur deux : si `substellar_longitude` tournait dans l'autre sens,
    Levant et Couchant seraient intervertis.
    """
    step = k.SOLAR_DAY_A / 400
    checked = 0
    for i in range(400):
        epoch = i * step
        lon, lat = c.crust_to_star(45.0, 0.0, epoch)
        _, lat_next = c.crust_to_star(45.0, 0.0, epoch + step)
        if abs(lat) > 45:          # près des pôles Étoile, lon' est dégénérée
            continue
        checked += 1
        rising = lat_next > lat
        assert rising == (lon < 0), f"epoch={epoch:.2f} lon'={lon:.1f}"
    assert checked > 100


# ─────────────────────────────────────────────────────────────────────────
#  Ce que voit un lieu fixe de la croûte
# ─────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("beta, expected", [
    (90.0, 3.0),
    (87.0, 6.0),
    (84.0, 9.0),
    (80.0, 13.0),
    (45.0, 48.0),
])
def test_star_latitude_amplitude_law(beta, expected):
    """Rotation et inclinaison s'additionnent exactement : ±[(90−β) + 3°].

    On échantillonne sur trois mille ans — soit plus de deux battements — pour
    attraper le maximum réel. Le calcul passe par `star_elevation`, dont un
    autre test établit qu'il est identique à la transformation PROJ, mais qui
    est mille fois plus rapide.
    """
    assert c.star_latitude_amplitude(beta) == pytest.approx(expected)

    step = 0.25
    values = [c.star_elevation(0.0, beta, i * step)
              for i in range(int(3000 / step))]
    assert max(values) == pytest.approx(expected, abs=0.05)
    assert min(values) == pytest.approx(-expected, abs=0.05)


def test_no_place_on_the_crust_is_fixed_in_the_star_frame():
    """Pas même le pôle géographique exact.

    Sa latitude Étoile suit la déclinaison du point substellaire, entre −3° et
    +3° — ce qui EST le jour et la nuit polaires. Il ne serait immobile que si
    l'inclinaison était nulle.
    """
    latitudes = [c.star_elevation(0.0, 90.0, i * 0.5) for i in range(400)]
    assert max(latitudes) == pytest.approx(k.AXIAL_TILT_DEG, abs=0.05)
    assert min(latitudes) == pytest.approx(-k.AXIAL_TILT_DEG, abs=0.05)
    assert max(latitudes) - min(latitudes) > 5.0


def test_star_latitude_oscillates_on_the_solar_day_not_the_rotation():
    """La période du voyage climatique d'un lieu est le **jour solaire**.

    Sur une seule rotation sidérale, une montagne de l'équateur géographique n'a
    parcouru qu'un quinzième de son cycle — alors qu'un modèle calé sur la
    rotation lui ferait faire le tour complet.
    """
    over_a_rotation = [c.star_elevation(0.0, 0.0, i * k.ROTATION_PERIOD_A / 50)
                       for i in range(50)]
    assert max(over_a_rotation) - min(over_a_rotation) < 40.0

    over_a_solar_day = [c.star_elevation(0.0, 0.0, i * k.SOLAR_DAY_A / 400)
                        for i in range(400)]
    assert max(over_a_solar_day) > 85.0
    assert min(over_a_solar_day) < -85.0
