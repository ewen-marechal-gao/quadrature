"""Calibration du générateur — la procédure qui remplace le nombre magique.

    python -m aeonir_gis.calibrate

Produit `calibration.json`. Quatre mesures, dans cet ordre, chacune servant à
autoriser la suivante :

1. **le balayage de graines** retient la première dont la moyenne de surface
   tombe sous la tolérance ;
2. **le contrôle d'invariance en résolution** vérifie que ce décalage est une
   propriété du tirage et non de l'échantillonnage — c'est lui, et lui seul,
   qui autorise à choisir sur une petite grille ;
3. **le contrôle d'écrêtage** vérifie que les extrêmes tiennent sous le plafond
   de relief, puisque le générateur n'écrête jamais ;
4. **la mesure de Hurst** vérifie que le terrain produit a bien la rugosité
   qu'on lui a demandée par construction.

## Pourquoi la moyenne pondérée par l'aire

Sur une grille équirectangulaire un pixel polaire couvre `cos φ` fois moins de
sol qu'un pixel équatorial. La moyenne par pixel n'est donc **pas** la moyenne
de surface, et c'est la seconde qui juge un datum. L'écart n'est pas anecdotique
— mesuré à un facteur 77 sur le MNT de production.

## Ce que ce module n'est pas

Ce n'est pas une optimisation : on ne cherche pas la *meilleure* graine, on
retient la **première acceptable**. Chercher le minimum ferait dépendre le
terrain d'un classement, donc de la taille du balayage, donc d'un détail
d'implémentation.
"""

import argparse
import math
import sys
import time

import numpy as np

from . import calibration
from . import constants as k
from . import dem

SCAN_WIDTH: int = 512
"""Largeur de la grille de balayage. Le choix est légitimé par le contrôle
d'invariance, pas supposé : si les décalages divergent d'une résolution à
l'autre, la calibration le signale et le balayage n'a plus de sens."""

OFFSET_TOLERANCE_M: float = 2.0
"""Tolérance sur la moyenne de surface, en mètres.

Deux mètres pour un relief d'écart-type ~2 800 : le datum tombe à 0,07 % de σ,
indiscernable d'un zéro exact à toute échelle d'affichage. C'est un **choix de
modélisation**, et le seul de ce module."""

SCAN_SEEDS: int = 1000
"""Nombre de graines à essayer — **dimensionné sur le critère, et non
l'inverse**.

Le décalage d'un tirage suit approximativement une loi normale ; son écart-type
est mesuré par le balayage lui-même et consigné dans `offset_std_m`, plutôt que
supposé. La probabilité qu'une graine tombe dans la tolérance vaut alors
`2·tolérance / (σ √(2π))`, de l'ordre de 1/200 — trois cents essais ne
réussissent que dans 79 % des cas, mille dans 99,5 %.

C'est le sens de la marche à suivre : la tolérance ne se relâche pas parce que
le balayage est trop court ; c'est le balayage qui s'allonge.
"""

VERIFY_WIDTHS: tuple[int, ...] = (1024, 2048)


def area_weighted_mean(width: int, *, seed: int, **generator) -> tuple:
    """Moyenne pondérée par l'aire, et extrêmes, d'une grille complète.

    Renvoie `(moyenne, minimum, maximum)`. La pondération est `cos φ`, évaluée
    au centre de chaque ligne comme le reste du pipeline.
    """
    height = width // 2
    weighted_total = weight_total = 0.0
    minimum, maximum = np.inf, -np.inf

    for first_row, band in dem.elevation_bands(width, height, seed=seed,
                                               **generator):
        values = band.astype(np.float64)
        rows = np.arange(first_row, first_row + band.shape[0])
        weights = np.cos(np.radians(90.0 - (rows + 0.5) * (180.0 / height)))
        weighted_total += float((values.sum(axis=1) * weights).sum())
        weight_total += float(weights.sum()) * width
        minimum = min(minimum, float(values.min()))
        maximum = max(maximum, float(values.max()))

    return weighted_total / weight_total, minimum, maximum


def scan_seeds(width: int = SCAN_WIDTH, count: int = SCAN_SEEDS,
               tolerance: float = OFFSET_TOLERANCE_M, growth: float = 1.0,
               **cascade):
    """Première graine dont le décalage au datum tient dans la tolérance.

    Renvoie `(graine, décalage en m, échelle, décalages rencontrés)`. Lève si
    aucune ne convient — mieux vaut un échec franc qu'un terrain
    silencieusement décalé.

    ## Chaque graine est jugée avec SA propre échelle

    ⚠️ C'est le piège qui a coûté une régénération. Le balayage tourne en
    unités **normalisées**, et l'échelle métrique d'une graine se déduit de son
    propre pic : `σ = MAX_RELIEF_M / pic`. Mesurer le pic sur un échantillon de
    graines puis l'appliquer à celle qu'on retient donne un terrain qui crève
    le plafond dès que la retenue est plus extrême que l'échantillon — observé
    à −12 552 m pour un plafond de 11 800.

    La passe qui calcule le décalage rend déjà les extrêmes : juger chaque
    graine avec son échelle ne coûte donc rien.

    `growth` extrapole le pic jusqu'à la résolution de production, le pic
    croissant avec le nombre d'échantillons.

    Les décalages écartés ne sont pas jetés : leur dispersion est **la mesure
    qui justifie tout l'exercice**. Sans elle, « il faut choisir une graine »
    reste une affirmation ; avec elle, on sait de combien on manquerait le
    datum en ne choisissant pas.
    """
    offsets_seen = []
    for seed in range(count):
        normalise, low, high = area_weighted_mean(width, seed=seed,
                                                  relief_sigma_m=1.0,
                                                  **cascade)
        scale = k.MAX_RELIEF_M / (max(abs(low), abs(high)) * growth)
        offset = normalise * scale
        offsets_seen.append(offset)
        if abs(offset) <= tolerance:
            return seed, offset, scale, offsets_seen
    raise RuntimeError(
        f"aucune graine parmi {count} ne tient dans ±{tolerance} m — "
        "élargir le balayage ou revoir le générateur")


def measure_peak_to_sigma(width: int, seeds, **generator) -> float:
    """Pic du champ **normalisé** — le rapport `max|h| / σ` de la cascade.

    Mesuré sur plusieurs graines et retenu au maximum : c'est lui qui fixera
    `RELIEF_SIGMA_M`, et une sous-estimation ferait sortir le relief au-dessus
    du plafond physique.

    ⚠️ Se mesure en unités normalisées (`relief_sigma_m = 1`), sans quoi la
    mesure dépendrait de la valeur qu'elle sert à calculer.
    """
    peak = 0.0
    for seed in seeds:
        _, low, high = area_weighted_mean(width, seed=seed,
                                          relief_sigma_m=1.0, **generator)
        peak = max(peak, abs(low), abs(high))
    return peak


def measure_hurst(width: int = 4096, *, seed: int, **generator) -> float:
    """Exposant de la fonction de structure, mesuré sur une bande équatoriale.

    La fonction de structure est l'écart d'altitude **typique** entre deux
    points séparés de `d`. Pour un fBm elle croît comme `d^H`, donc `H` est la
    pente de `log Δh` contre `log d`.

    ⚠️ Bande équatoriale, et pas la grille entière : ailleurs le pas en
    longitude vaut `cos φ` fois moins, donc une séparation exprimée en pixels
    ne désigne pas la même distance selon la ligne. Mélanger les latitudes
    mesurerait la géométrie de la grille et non le terrain.

    ⚠️ **La plage d'ajustement est déduite, pas choisie.** Un fBm n'a aucune
    structure plus grande que son octave de base : à la fréquence `f` sur la
    sphère unité, la plus grande cellule mesure `R/f` au sol, soit 2 387 km
    ici. Au-delà, la fonction de structure **sature** et la pente ajustée
    s'effondre — mesuré 0,326 au lieu de 0,5 en ajustant jusqu'à la moitié du
    globe. On s'arrête donc au quart de cette échelle.
    """
    height = width // 2
    middle = height // 2
    rows = []
    for first_row, band in dem.elevation_bands(width, height, seed=seed,
                                               **generator):
        lo = max(0, middle - 8 - first_row)
        hi = min(band.shape[0], middle + 8 - first_row)
        if hi > lo:
            rows.append(band[lo:hi].astype(np.float64))
    strip = np.vstack(rows)

    metres_per_px = k.CIRCUMFERENCE_M / width
    largest_structure_m = k.RADIUS_M / generator["base_frequency"]
    separation_max = max(4, int(largest_structure_m / 4 / metres_per_px))

    separations, deltas = [], []
    step = 1
    while step <= separation_max:
        separations.append(step)
        deltas.append(float(np.median(np.abs(strip[:, step:] - strip[:, :-step]))))
        step *= 2

    slope, _ = np.polyfit(np.log(separations), np.log(deltas), 1)
    return float(slope)


def calibrate(*, scan_width: int = SCAN_WIDTH, count: int = SCAN_SEEDS,
              tolerance: float = OFFSET_TOLERANCE_M,
              verify_widths=VERIFY_WIDTHS) -> calibration.Calibration:
    """Enchaîne les quatre mesures et rend le résultat."""
    cascade = {
        "octaves": dem.OCTAVES,
        "base_frequency": dem.BASE_FREQUENCY,
        "lacunarity": dem.LACUNARITY,
        "persistence": dem.PERSISTENCE,
    }

    # ── 1. la croissance du pic avec la résolution ───────────────────────
    # ⚠️ Le pic **croît avec la résolution** : plus on tire d'échantillons,
    # plus on a de chances d'en toucher un extrême. Le mesurer sur la grille de
    # balayage et s'arrêter là ferait sortir le raster de production au-dessus
    # du plafond. On mesure donc la croissance sur un échantillon de graines,
    # entre deux résolutions, pour l'extrapoler ensuite jusqu'à la production.
    #
    # Seule la CROISSANCE se mesure ici, jamais le pic lui-même : celui-ci est
    # propre à chaque graine, et c'est le balayage qui l'établit.
    wide = max(verify_widths)
    print(f"Croissance du pic entre {scan_width} et {wide} px")
    peak_narrow = measure_peak_to_sigma(scan_width, range(8), **cascade)
    peak_wide = measure_peak_to_sigma(wide, range(8), **cascade)
    per_step = peak_wide / peak_narrow
    steps = math.log(dem.WIDTH / scan_width) / math.log(wide / scan_width)
    growth_to_full = per_step ** steps
    print(f"  {peak_narrow:.3f} σ  puis  {peak_wide:.3f} σ "
          f"— ×{per_step:.4f} par cran")
    print(f"  extrapolation sur {steps:.2f} cran(s) jusqu'à {dem.WIDTH} px : "
          f"×{growth_to_full:.4f}")

    # ── 2. la graine, jugée avec SA propre échelle ───────────────────────
    print(f"Balayage de {count} graines, tolérance ±{tolerance:g} m")
    seed, offset, relief_sigma, offsets_seen = scan_seeds(
        scan_width, count, tolerance, growth_to_full, **cascade)
    offset_std = float(np.std(offsets_seen))
    peak = k.MAX_RELIEF_M / relief_sigma
    print(f"  graine {seed} retenue au bout de {len(offsets_seen)} essais "
          f"— décalage {offset:+.2f} m")
    print(f"  pic {peak:.3f} σ  →  RELIEF_SIGMA_M = {relief_sigma:.1f} m")
    print(f"  dispersion des décalages écartés : σ = {offset_std:.0f} m, "
          f"pire {max(abs(v) for v in offsets_seen):.0f} m")

    generator = {**cascade, "relief_sigma_m": relief_sigma}

    # ── 3. l'invariance en résolution ────────────────────────────────────
    print("Contrôle d'invariance en résolution")
    offsets, minimum, maximum = {str(scan_width): offset}, np.inf, -np.inf
    for width in verify_widths:
        value, low, high = area_weighted_mean(width, seed=seed, **generator)
        offsets[str(width)] = value
        minimum, maximum = min(minimum, low), max(maximum, high)
        print(f"  {width:>5} × {width // 2:<5} {value:+.2f} m")

    # ── 4. la rugosité obtenue ───────────────────────────────────────────
    print("Mesure de l'exposant de Hurst")
    hurst = measure_hurst(seed=seed, **generator)
    print(f"  visé {dem.HURST_TARGET:.3f}, mesuré {hurst:.3f}")

    return calibration.Calibration(
        seed=seed,
        peak_to_sigma=round(peak, 4),
        area_weighted_offset_m=round(offset, 4),
        offset_tolerance_m=tolerance,
        seeds_scanned=count,
        seeds_tried=len(offsets_seen),
        offset_std_m=round(offset_std, 1),
        offset_worst_m=round(max(abs(v) for v in offsets_seen), 1),
        scan_width=scan_width,
        resolution_offsets_m={w: round(v, 4) for w, v in offsets.items()},
        minimum_m=round(minimum, 1),
        maximum_m=round(maximum, 1),
        relief_ceiling_m=k.MAX_RELIEF_M,
        hurst_target=dem.HURST_TARGET,
        hurst_measured=round(hurst, 4),
        persistence=round(dem.PERSISTENCE, 6),
        octaves=dem.OCTAVES,
        base_frequency=dem.BASE_FREQUENCY,
        lacunarity=dem.LACUNARITY,
        relief_sigma_m=round(relief_sigma, 2),
    )


def main(argv=None) -> int:
    # La console Windows est en cp1252. `stderr` aussi : sans ça, un message
    # d'échec contenant « ± » se corrompt dans la trace, au moment précis où on
    # a besoin de le lire.
    for flux in (sys.stdout, sys.stderr):
        if hasattr(flux, "reconfigure"):
            flux.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(
        prog="python -m aeonir_gis.calibrate",
        description="Calibre le générateur et écrit calibration.json.")
    parser.add_argument("--scan-width", type=int, default=SCAN_WIDTH)
    parser.add_argument("--seeds", type=int, default=SCAN_SEEDS)
    parser.add_argument("--tolerance", type=float, default=OFFSET_TOLERANCE_M)
    parser.add_argument("--dry-run", action="store_true",
                        help="mesure sans écrire le fichier")
    args = parser.parse_args(argv)

    started = time.perf_counter()
    result = calibrate(scan_width=args.scan_width, count=args.seeds,
                       tolerance=args.tolerance)
    print(f"\n{result}")

    extreme = max(abs(result.minimum_m), abs(result.maximum_m))
    if extreme > result.relief_ceiling_m:
        print(f"\n  ⚠️  les extrêmes dépassent le plafond de relief "
              f"({extreme:.0f} > {result.relief_ceiling_m:.0f} m). Le "
              f"générateur n'écrête pas : revoir RELIEF_SIGMA_M ou le plafond.")

    # Le balayage sur petite grille n'est légitime que si le décalage ne bouge
    # pas d'une résolution à l'autre. S'il bouge plus que la tolérance, le
    # critère ne veut plus rien dire : la graine retenue pourrait le violer à
    # la résolution de production.
    values = list(result.resolution_offsets_m.values())
    spread = max(values) - min(values)
    if spread > result.offset_tolerance_m:
        print(f"\n  ⚠️  le décalage varie de {spread:.2f} m selon la "
              f"résolution, soit plus que la tolérance de "
              f"±{result.offset_tolerance_m:g} m. Le choix sur petite grille "
              f"ne garantit alors rien : élargir --scan-width.")

    if args.dry_run:
        print("\n  (--dry-run : rien n'a été écrit)")
    else:
        calibration.save(result)
        print(f"\n  → {calibration.PATH.name}")
    print(f"  durée {time.perf_counter() - started:.1f} s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
