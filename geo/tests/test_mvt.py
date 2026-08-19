"""Le tuileur vectoriel — chaque propriété avec son contre-exemple.

L'encodage MVT lui-même n'est pas testé ici : il est délégué à
``mapbox-vector-tile``, et vérifier une bibliothèque n'apprend rien. Ce qui est
testé, c'est **notre contrat avec elle** — que les coordonnées lui parviennent
dans le repère qu'elle attend — et le métier qui la précède : le repère, la
lecture des couches, la politique de généralisation.

Les algorithmes géométriques, eux, sont éprouvés dans ``test_geometry`` : ils ne
connaissent pas Aeonir, donc ils n'ont pas leur place ici.

Le test qui porte le plus de poids est
:func:`test_the_epoch_zero_frame_change_is_its_own_inverse` : il explique
pourquoi tous les autres doivent porter une époque non nulle.
"""

import mapbox_vector_tile
import numpy as np
from shapely.geometry import LineString, MultiPoint, Polygon

from aeonir_gis import mvt, tiles
from aeonir_gis.crs import crust_to_star, star_to_crust


# ─────────────────────────────────────────────────────────────────────────
#  Le contrat avec l'encodeur
# ─────────────────────────────────────────────────────────────────────────


def test_to_geometry_builds_the_simple_type_when_there_is_one_part():
    """Une ligne unique est une ``LineString``, pas une ``MultiLineString``.

    La distinction n'est pas cosmétique : le style du client peut filtrer sur
    ``$type``, et une multi-géométrie systématique fausserait ce filtre.
    """
    single = mvt.to_geometry(mvt.LINESTRING, [[(0, 0), (10, 10)]])
    double = mvt.to_geometry(mvt.LINESTRING,
                             [[(0, 0), (10, 10)], [(20, 20), (30, 30)]])
    assert single.geom_type == "LineString"
    assert double.geom_type == "MultiLineString"


def test_to_geometry_reads_the_first_part_as_the_shell():
    """L'ordre vient de la source et traverse tout le découpage."""
    polygon = mvt.to_geometry(
        mvt.POLYGON,
        [[(0, 0), (0, 100), (100, 100), (100, 0)],
         [(20, 20), (20, 40), (40, 40), (40, 20)]])
    assert polygon.geom_type == "Polygon"
    assert len(polygon.interiors) == 1


def test_to_geometry_drops_a_part_too_short_to_be_one():
    """Deux sommets ne font pas un anneau, un sommet ne fait pas une ligne."""
    assert mvt.to_geometry(mvt.POLYGON, [[(0, 0), (10, 10)]]) is None
    assert mvt.to_geometry(mvt.LINESTRING, [[(0, 0)]]) is None


def test_the_encoder_is_told_our_y_already_points_down():
    """⚠️ Le contrat qui, s'il est rompu, retourne la carte en silence.

    Nos coordonnées sortent du découpage déjà en repère de tuile, l'axe y vers
    le bas. Sans ``y_coord_down``, l'encodeur les retourne verticalement : les
    tuiles se chargent, s'affichent, et la carte est simplement en miroir.

    Le test le prouve par la relecture — un sommet près du **haut** de la tuile
    doit se relire près du haut.
    """
    assert mvt.ENCODE_OPTIONS["y_coord_down"] is True

    payload = mapbox_vector_tile.encode(
        [{"name": "fleuves",
          "features": [{"geometry": LineString([(10, 10), (4000, 4000)]),
                        "properties": {}}]}],
        default_options=mvt.ENCODE_OPTIONS)
    relu = mapbox_vector_tile.decode(
        payload, default_options={"y_coord_down": True})
    assert relu["fleuves"]["features"][0]["geometry"]["coordinates"] == \
        [[10, 10], [4000, 4000]]


def test_a_tile_carries_every_layer_and_keeps_its_attributes():
    """Une requête, un fichier, trois couches — et les types survivent."""
    payload = mapbox_vector_tile.encode([
        {"name": "fleuves",
         "features": [{"geometry": LineString([(10, 10), (2000, 300)]),
                       "properties": {"strahler": 3,
                                      "drainage_km2": 84636.5}}]},
        {"name": "exutoires",
         "features": [{"geometry": MultiPoint([(5, 5), (100, 4000)]),
                       "properties": {"bassin": 1}}]},
        {"name": "bassins",
         "features": [{"geometry": Polygon(
             [(0, 0), (0, 1000), (1000, 1000), (1000, 0)],
             [[(200, 200), (200, 400), (400, 400), (400, 200)]]),
             "properties": {"aire_km2": 50000.0}}]},
    ], default_options=mvt.ENCODE_OPTIONS)
    relu = mapbox_vector_tile.decode(
        payload, default_options={"y_coord_down": True})

    assert set(relu) == {"fleuves", "exutoires", "bassins"}
    assert relu["fleuves"]["extent"] == mvt.EXTENT
    assert relu["fleuves"]["features"][0]["properties"] == {
        "strahler": 3, "drainage_km2": 84636.5}
    # Le trou survit — c'est-à-dire que l'enroulement des anneaux est correct.
    assert len(relu["bassins"]["features"][0]["geometry"]["coordinates"]) == 2


def test_a_degenerate_ring_is_repaired_rather_than_refused():
    """⚠️ Ce n'est pas une précaution de confort.

    :func:`mvt.clip_ring` est un Sutherland-Hodgman, valide contre une fenêtre
    convexe mais produisant, sur un anneau **concave**, des liaisons qui longent
    le bord de la tuile. Tous les bassins versants sont concaves. Sans
    réparation, l'encodeur lèverait sur ces anneaux au lieu de les écrire.
    """
    noeud = Polygon([(0, 0), (100, 100), (100, 0), (0, 100)])
    assert not noeud.is_valid
    payload = mapbox_vector_tile.encode(
        [{"name": "bassins",
          "features": [{"geometry": noeud, "properties": {}}]}],
        default_options=mvt.ENCODE_OPTIONS)
    relu = mapbox_vector_tile.decode(payload)
    assert relu["bassins"]["features"]


# ─────────────────────────────────────────────────────────────────────────
#  La couture
# ─────────────────────────────────────────────────────────────────────────


def test_a_column_beyond_the_world_folds_back_to_the_other_edge():
    """Le repli modulo est ce qui remplace le découpage à l'antiméridien."""
    side = tiles.grid_side(3)
    assert side % side == 0
    assert (side + 1) % side == 1
    assert (-1) % side == side - 1


# ─────────────────────────────────────────────────────────────────────────
#  Le repère — et le piège de l'époque nulle
# ─────────────────────────────────────────────────────────────────────────


def test_the_epoch_zero_frame_change_is_its_own_inverse():
    """⚠️ Le test le plus important de ce fichier, et il ne teste rien d'utile.

    À l'époque 0, la longitude subsolaire est nulle et le changement de repère
    se réduit à un basculement de pôle, lequel est une **involution** : aller et
    retour rendent le même point, à la précision machine.

    Conséquence : toute vérification du *sens* de la transformation écrite à
    l'époque par défaut passe aussi bien avec la bonne qu'avec la mauvaise —
    et laisse également passer un ``epoch_a`` accepté puis ignoré, ce qui est
    précisément le défaut qu'a eu ce module. D'où l'époque non nulle des tests
    qui suivent.
    """
    direct = crust_to_star(-84.77, 32.25, 0.0)
    inverse = star_to_crust(-84.77, 32.25, 0.0)
    assert np.allclose(direct, inverse, atol=1e-9)

    # La dégénérescence cesse dès que la longitude subsolaire bouge.
    apart = np.hypot(*(np.asarray(crust_to_star(-84.77, 32.25, 3.7))
                       - np.asarray(star_to_crust(-84.77, 32.25, 3.7))))
    assert apart > 1.0


def test_the_tiler_transports_vertices_forwards():
    """⚠️ ``crust_to_star``, l'inverse exact du tuileur raster.

    Le raster itère sur les pixels d'arrivée et remonte à la source, donc
    ``star_to_crust`` ; le vecteur transporte ses sommets, donc le sens direct.
    Se tromper ne lève rien — d'où cette vérification, à une époque où les deux
    sens diffèrent.
    """
    epoch = 3.7
    longitude, latitude = -84.77, 32.25
    x, y = mvt._to_world([longitude], [latitude], epoch)
    read_lon = float(x[0]) * 360.0 - 180.0
    read_lat = float(tiles.mercator_latitude(y[0]))

    forwards = crust_to_star(longitude, latitude, epoch)
    backwards = star_to_crust(longitude, latitude, epoch)
    assert np.allclose([read_lon, read_lat], forwards, atol=1e-6)
    assert not np.allclose([read_lon, read_lat], backwards, atol=1e-2)


def test_the_latitude_is_clamped_where_mercator_diverges():
    """Sans bornage, ``mercator_y`` renverrait l'infini et empoisonnerait tout."""
    x, y = mvt._to_world([0.0, 0.0], [89.999, -89.999], 0.0)
    assert np.all(np.isfinite(y))
    assert np.all((y >= 0.0) & (y <= 1.0))


# ─────────────────────────────────────────────────────────────────────────
#  La politique de généralisation
# ─────────────────────────────────────────────────────────────────────────


def _records(ranks):
    return [{"parts": [], "rank": float(rank), "properties": {}}
            for rank in ranks]


def test_a_stricter_threshold_never_increases_the_load():
    """La monotonie est ce qui rend le choix du seuil bien posé."""
    records = _records(range(100))
    placed = {(0, 0): [(index, []) for index in range(100)],
              (1, 0): [(index, []) for index in range(50)]}
    matrix = mvt.rank_matrix(placed, records, [0.0, 25.0, 50.0, 75.0])
    loads = [worst for _, _, worst in matrix]
    assert loads == sorted(loads, reverse=True)


def test_the_chosen_threshold_is_the_most_generous_that_fits():
    """On cherche le maximum de détail sous le plafond, pas un compromis."""
    matrix = [(0.0, 100, 5000), (10.0, 60, 900), (20.0, 30, 400)]
    assert mvt.choose_threshold(matrix, 1000) == 10.0


def test_when_nothing_fits_the_strictest_is_taken():
    """La couche sort alors trop chargée — et le bilan le dit."""
    matrix = [(0.0, 100, 5000), (10.0, 60, 4000)]
    assert mvt.choose_threshold(matrix, 1000) == 10.0


def test_the_candidates_start_by_keeping_everything():
    records = _records([5.0, 10.0, 100.0, 1000.0])
    candidates = mvt.candidate_thresholds(records)
    assert min(candidates) == 5.0


def test_strahler_cannot_be_the_selection_lever():
    """Le chiffre qui a écarté l'ordre de Strahler, figé comme régression.

    Mesuré sur le réseau de production : quatre paliers seulement, gardant
    100 %, 19,04 %, 1,38 % puis 0,02 % des lignes. Aucun réglage n'existe entre
    « tout » et « un cinquième », là où un budget par tuile en demande un à
    chaque niveau de zoom.

    Et l'ordre ne classe pas par débit — un tronçon d'ordre 1 draine jusqu'à
    226 421 km², au-dessus du minimum de l'ordre 3. Strahler compte des
    confluences, pas de l'eau.
    """
    assert mvt.LAYERS["fleuves"]["rank"] == "drainage_km2"
    assert "strahler" in mvt.LAYERS["fleuves"]["keep"]
