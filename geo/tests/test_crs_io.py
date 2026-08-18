"""Aller-retour des CRS à travers les formats de fichier.

Un CRS n'a d'intérêt que s'il survit à l'écriture. Ces tests sont pour partie
des **tests de caractérisation** : ils épinglent ce que GDAL fait réellement,
y compris ce qu'il dégrade, pour qu'un changement de version se voie tout de
suite plutôt que six mois plus tard sur une carte de travers.
"""

import numpy as np
import pytest
import rasterio
from pyproj import CRS, Transformer
from rasterio.transform import from_origin

from aeonir_gis import constants as k
from aeonir_gis import crs as c

PIXELS = np.arange(64, dtype="float32").reshape(8, 8)
TRANSFORM = from_origin(-180.0, 90.0, 45.0, 22.5)


def _write_then_read(path, crs, driver="GTiff"):
    """Écrit un petit raster avec ce CRS, le relit, renvoie (CRS relu, données)."""
    with rasterio.open(path, "w", driver=driver, height=8, width=8, count=1,
                       dtype="float32", crs=crs, transform=TRANSFORM) as dst:
        dst.write(PIXELS, 1)
    with rasterio.open(path) as src:
        return CRS.from_user_input(src.crs), src.read(1), src.transform


# ─────────────────────────────────────────────────────────────────────────
#  Ce qui survit
# ─────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("name, factory", [
    ("crust", c.crust_crs),
    ("star", lambda: c.star_crs(0.0)),
    ("star-late", lambda: c.star_crs(42.0)),
    ("mercator", c.mercator_crs),
])
def test_geotiff_preserves_the_sphere(tmp_path, name, factory):
    """Le rayon est la chose à ne jamais perdre : tout le reste en dépend."""
    original = factory()
    back, _, _ = _write_then_read(tmp_path / f"{name}.tif", original)
    assert back.ellipsoid.semi_major_metre == pytest.approx(k.RADIUS_M)
    assert back.ellipsoid.semi_minor_metre == pytest.approx(k.RADIUS_M)


@pytest.mark.parametrize("name, factory", [
    ("crust", c.crust_crs),
    ("mercator", c.mercator_crs),
])
def test_geotiff_preserves_the_name(tmp_path, name, factory):
    original = factory()
    back, _, _ = _write_then_read(tmp_path / f"{name}.tif", original)
    assert back.name == original.name


def test_geotiff_preserves_pixels_and_geotransform(tmp_path):
    _, data, transform = _write_then_read(tmp_path / "data.tif", c.crust_crs())
    assert np.array_equal(data, PIXELS)
    assert transform == TRANSFORM
    assert transform.e < 0, "la taille de pixel en Y doit rester négative"


def test_star_crs_still_transforms_identically_after_a_round_trip(tmp_path):
    """Le test qui compte vraiment : la sémantique, pas la sérialisation.

    Peu importe que le WKT relu soit octet pour octet le même — ce qui importe
    est qu'il place les points au même endroit.
    """
    original = c.star_crs(17.5)
    back, _, _ = _write_then_read(tmp_path / "star.tif", original)

    before = Transformer.from_crs(c.crust_crs(), original, always_xy=True)
    after = Transformer.from_crs(c.crust_crs(), back, always_xy=True)

    worst = 0.0
    for lon in range(-180, 180, 31):
        for lat in range(-80, 81, 19):
            bx, by = before.transform(float(lon), float(lat))
            ax, ay = after.transform(float(lon), float(lat))
            worst = max(worst, abs(((bx - ax + 180) % 360) - 180), abs(by - ay))
    assert worst < 1e-9


# ─────────────────────────────────────────────────────────────────────────
#  Ce qui se dégrade — caractérisation
# ─────────────────────────────────────────────────────────────────────────

def test_declaring_the_iso_axis_order_makes_the_round_trip_lossless(tmp_path):
    """Justification mesurée du choix d'ordre des axes.

    GeoTIFF n'a aucun moyen d'enregistrer un ordre non standard pour un CRS
    géographique : il reconstruit la convention ISO à la lecture. En déclarant
    `lat, lon` dès le départ, l'aller-retour devient **sans perte**.
    """
    back, _, _ = _write_then_read(tmp_path / "axes.tif", c.crust_crs())
    assert back.equals(c.crust_crs())

    # Seuls les libellés sont normalisés — « geodetic latitude (Lat) » devient
    # « latitude ». L'ordre, lui, est bien celui qu'on a déclaré.
    assert [axis.abbrev for axis in back.axis_info] == ["lat", "lon"]
    assert [axis.abbrev for axis in c.crust_crs().axis_info] == ["Lat", "Lon"]


def test_the_lon_lat_order_would_not_have_survived(tmp_path):
    """Le contrefactuel qui montre que le choix n'était pas gratuit.

    Le même CRS déclaré en `lon, lat` — la convention de GeoJSON, de MapLibre et
    d'OGC:CRS84 — ressort du fichier avec ses axes intervertis. Le code dirait
    une chose, le fichier une autre : deux vérités, exactement ce qu'on refuse.
    """
    swapped = CRS.from_wkt(f'''GEOGCRS["Aeonir Crust (lon,lat)",
        DATUM["Aeonir Crust Reference Frame",
            ELLIPSOID["Aeonir Sphere",{k.RADIUS_M:.0f},0,
                LENGTHUNIT["metre",1]]],
        PRIMEM["Reference Meridian",0,
            ANGLEUNIT["degree",0.0174532925199433]],
        CS[ellipsoidal,2],
            AXIS["geodetic longitude (Lon)",east,ORDER[1],
                ANGLEUNIT["degree",0.0174532925199433]],
            AXIS["geodetic latitude (Lat)",north,ORDER[2],
                ANGLEUNIT["degree",0.0174532925199433]]]''')
    assert [axis.abbrev for axis in swapped.axis_info] == ["Lon", "Lat"]

    back, _, _ = _write_then_read(tmp_path / "swapped.tif", swapped)
    assert [axis.abbrev for axis in back.axis_info] == ["lat", "lon"]
    assert not back.equals(swapped)
    assert back.equals(swapped, ignore_axis_order=True)


def test_geotiff_drops_our_private_authority(tmp_path):
    """Dégradation connue et acceptée.

    La clé GeoTIFF prévue pour le CRS attend un code EPSG ou la valeur « défini
    par l'utilisateur » : une autorité maison n'a nulle part où loger. Sans
    conséquence, le WKT restant auto-descriptif — l'identité n'est qu'un
    confort de lecture.
    """
    assert f'ID["{c.AUTHORITY}"' in c.crust_crs().to_wkt().replace(" ", "")
    back, _, _ = _write_then_read(tmp_path / "auth.tif", c.crust_crs())
    assert c.AUTHORITY not in back.to_wkt()


def test_geopackage_keeps_what_geotiff_loses(tmp_path):
    """Contraste utile : `gpkg_spatial_ref_sys` a des colonnes `organization`
    et `organization_coordsys_id`, donc le GeoPackage sait porter une autorité
    maison là où le GeoTIFF ne le peut pas.
    """
    if "GPKG" not in rasterio.drivers.raster_driver_extensions().values():
        pytest.skip("pilote GPKG raster indisponible")
    back, _, _ = _write_then_read(tmp_path / "aeonir.gpkg", c.crust_crs(),
                                  driver="GPKG")
    assert back.ellipsoid.semi_major_metre == pytest.approx(k.RADIUS_M)
    assert back.equals(c.crust_crs(), ignore_axis_order=True)
