"""La calibration : son contrat avec le code, et ses quatre mesures.

Le principe qui gouverne ce fichier : **le critère vit dans le code, la valeur
vit dans `calibration.json`, et les tests rejouent l'un sur l'autre.** Une
graine recopiée à la main dans un module est indistinguable, à la lecture,
d'une graine inventée ; une graine produite par une commande et re-vérifiée par
la suite ne l'est pas.

Les mesures coûteuses tournent sur de petites grilles. C'est légitimé par le
contrôle d'invariance en résolution, qui est lui-même testé ici.
"""

import numpy as np
import pytest

from aeonir_gis import calibrate
from aeonir_gis import calibration
from aeonir_gis import constants as k
from aeonir_gis import dem


@pytest.fixture(scope="module")
def recorded():
    return calibration.load()


# ─────────────────────────────────────────────────────────────────────────
#  Le contrat : le fichier décrit-il encore le générateur du code ?
# ─────────────────────────────────────────────────────────────────────────

def test_the_calibration_describes_the_current_generator(recorded):
    """**Le garde-fou principal.**

    `calibration.json` n'est valable que pour la cascade qui l'a produit.
    Changer `PERSISTENCE`, `OCTAVES` ou la fréquence de base sans relancer
    `python -m aeonir_gis.calibrate` laisserait une graine choisie pour un
    autre terrain — et un datum faux, silencieusement.
    """
    assert recorded.octaves == dem.OCTAVES
    assert recorded.base_frequency == pytest.approx(dem.BASE_FREQUENCY)
    assert recorded.lacunarity == pytest.approx(dem.LACUNARITY)
    assert recorded.persistence == pytest.approx(dem.PERSISTENCE, abs=1e-6)
    assert recorded.hurst_target == pytest.approx(dem.HURST_TARGET)
    assert recorded.relief_ceiling_m == pytest.approx(k.MAX_RELIEF_M)


def test_the_modules_read_the_file_rather_than_a_copy(recorded):
    """`dem` ne doit porter aucune copie des valeurs calibrées."""
    assert dem.default_seed() == recorded.seed
    assert dem.default_relief_sigma_m() == pytest.approx(
        k.MAX_RELIEF_M / recorded.peak_to_sigma)
    assert not hasattr(dem, "DEFAULT_SEED")
    assert not hasattr(dem, "RELIEF_SIGMA_M")


# ─────────────────────────────────────────────────────────────────────────
#  Les quatre mesures
# ─────────────────────────────────────────────────────────────────────────

def test_the_scan_returns_the_first_acceptable_seed_not_the_best():
    """On ne cherche pas la meilleure graine, on prend la première qui passe.

    Chercher le minimum ferait dépendre le terrain de la taille du balayage,
    donc d'un détail d'implémentation. Ici : toutes les graines écartées
    doivent effectivement violer le critère.
    """
    cascade = {"octaves": 3, "base_frequency": 2.0, "lacunarity": 2.0,
               "persistence": 0.5}
    seed, offset, scale, offsets_seen = calibrate.scan_seeds(
        64, 50, 60.0, **cascade)

    assert abs(offset) <= 60.0
    # Le balayage s'arrête à la première réussite, et rend tout ce qu'il a vu.
    assert len(offsets_seen) == seed + 1
    assert offsets_seen[-1] == pytest.approx(offset)
    # Chaque graine écartée devait effectivement l'être.
    assert all(abs(v) > 60.0 for v in offsets_seen[:-1])
    # L'échelle rendue est celle de CETTE graine, pas d'un échantillon.
    assert scale > 0.0


def test_the_scan_fails_loudly_rather_than_returning_a_bad_seed():
    """Un échec franc vaut mieux qu'un terrain silencieusement décalé."""
    with pytest.raises(RuntimeError, match="aucune graine"):
        calibrate.scan_seeds(64, 3, 0.0001, octaves=3, base_frequency=2.0,
                             lacunarity=2.0, persistence=0.5)


def test_the_recorded_offset_is_stable_across_resolutions(recorded):
    """Ce qui autorise à choisir sur une petite grille.

    Sans cette propriété, un balayage à 512 px ne dirait rien du raster de
    production, et le critère ne serait qu'un rituel.
    """
    values = list(recorded.resolution_offsets_m.values())
    assert max(values) - min(values) <= recorded.offset_tolerance_m


def test_the_measured_hurst_follows_the_target(recorded):
    """La rugosité demandée par construction est bien celle qu'on obtient.

    ⚠️ `p = l^(−H)` est une identité de la cascade **idéale**, à octaves
    infinies. Un fBm à dix octaves n'en est qu'une approximation, et l'écart
    n'est pas constant : mesuré **0,499 pour H = 0,5** et **0,884 pour
    H = 1,0**. Il grandit avec l'exposant, parce qu'à `H` élevé ce sont les
    octaves les plus basses qui portent l'énergie — précisément celles que la
    fréquence de base tronque.

    D'où une tolérance large et assumée : ce test garde l'ordre de grandeur et
    la direction, pas une égalité que la cascade finie ne peut pas tenir.
    """
    assert recorded.hurst_measured == pytest.approx(dem.HURST_TARGET,
                                                      abs=0.15)
    # Et surtout : la mesure ne doit jamais DÉPASSER la cible. Un fBm tronqué
    # est toujours plus lisse que son idéal, jamais plus rugueux.
    assert recorded.hurst_measured <= dem.HURST_TARGET + 0.01


def test_a_flatter_cascade_would_measure_a_higher_hurst():
    """Le contre-exemple, sans quoi le test précédent ne prouverait rien.

    À `p = 0,5` l'exposant vaut 1 : le relief devient invariant d'échelle, et
    c'est exactement la plaine que le Lot 1 produisait avant cette révision.
    """
    plat = calibrate.measure_hurst(1024, seed=0, octaves=8,
                                   base_frequency=2.0, lacunarity=2.0,
                                   persistence=0.5, relief_sigma_m=1000.0)
    rugueux = calibrate.measure_hurst(1024, seed=0, octaves=8,
                                      base_frequency=2.0, lacunarity=2.0,
                                      persistence=2.0 ** -0.5,
                                      relief_sigma_m=1000.0)
    assert plat > rugueux + 0.2


def test_the_peak_is_measured_on_the_normalised_field():
    """Le pic ne doit pas dépendre de l'échelle qu'il sert à calculer.

    Mesuré en unités normalisées, il est identique quelle que soit la valeur de
    `relief_sigma_m` passée par ailleurs — c'est ce qui rend l'enchaînement
    non circulaire.
    """
    cascade = {"octaves": 4, "base_frequency": 2.0, "lacunarity": 2.0,
               "persistence": 0.5}
    pic = calibrate.measure_peak_to_sigma(128, range(2), **cascade)

    _, bas, haut = calibrate.area_weighted_mean(128, seed=0,
                                                relief_sigma_m=1.0, **cascade)
    assert pic >= max(abs(bas), abs(haut))
    assert 1.0 < pic < 10.0


# ─────────────────────────────────────────────────────────────────────────
#  Lecture et écriture du fichier
# ─────────────────────────────────────────────────────────────────────────

def test_a_missing_calibration_names_the_command_that_produces_it(tmp_path):
    """Le message d'erreur doit rendre la panne réparable sans lire le code."""
    with pytest.raises(FileNotFoundError, match="aeonir_gis.calibrate"):
        calibration.load(tmp_path / "absent.json")


def test_the_calibration_round_trips(tmp_path, recorded):
    path = tmp_path / "calibration.json"
    calibration.save(recorded, path)
    assert calibration.load(path) == recorded


def test_the_file_stays_readable_in_diff(tmp_path, recorded):
    """Indenté et trié : un résultat de mesure se relit en revue de code."""
    path = tmp_path / "calibration.json"
    calibration.save(recorded, path)
    lines = path.read_text(encoding="utf-8").splitlines()
    assert len(lines) > 10
    keys = [line.split('"')[1] for line in lines if line.startswith('  "')]
    assert keys == sorted(keys)
