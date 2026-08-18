"""Le résultat de la calibration du générateur — lu, jamais écrit à la main.

`calibration.json` est **produit** par `python -m aeonir_gis.calibrate` et
**versionné**. Il porte la graine retenue et, avec elle, les mesures qui la
justifient : sans ces mesures, une graine n'est qu'un nombre magique de plus.

## Pourquoi un fichier et pas une constante

Une valeur obtenue en lançant une sonde puis recopiée dans le code est
indistinguable, à la lecture, d'une valeur inventée. Le fichier rend la
provenance explicite — il n'a pas d'auteur, il a une commande — et il se
compare d'une exécution à l'autre en diff.

Le contrat qui va avec : **le critère vit dans le code et dans les tests**, la
valeur vit ici. `tests/test_calibrate.py` rejoue le critère sur la graine
enregistrée. Changer un paramètre du générateur sans relancer la calibration
fait donc tomber la suite, au lieu de produire un terrain silencieusement
décalé sous son propre datum.

⚠️ Ce module n'importe **rien** du pipeline. C'est délibéré : `dem` le lit pour
connaître sa graine, `calibrate` l'écrit après avoir importé `dem`. Lui donner
la moindre dépendance vers l'un des deux fermerait le cycle.
"""

import json
from dataclasses import asdict, dataclass
from pathlib import Path

PATH: Path = Path(__file__).with_name("calibration.json")


@dataclass(frozen=True)
class Calibration:
    """Ce que `calibrate` a établi, et sous quelles hypothèses."""

    seed: int
    """Graine retenue — la première du balayage à satisfaire le critère."""

    peak_to_sigma: float
    """Pic du champ normalisé, en unités d'écart-type. C'est lui qui fixe
    `RELIEF_SIGMA_M = MAX_RELIEF_M / peak_to_sigma`, de sorte que les extrêmes
    atteignent le plafond physique sans jamais le franchir."""

    area_weighted_offset_m: float
    """Moyenne de surface du terrain, pondérée par l'aire. C'est le critère :
    elle doit tomber sous `offset_tolerance_m` en valeur absolue."""

    offset_tolerance_m: float
    seeds_scanned: int
    seeds_tried: int
    scan_width: int

    offset_std_m: float
    offset_worst_m: float
    """Dispersion des décalages rencontrés pendant le balayage — **la mesure
    qui justifie l'exercice**. Sans elle, « il faut choisir une graine » reste
    une affirmation ; avec elle, on sait de combien on manquerait le datum en
    ne choisissant pas."""

    resolution_offsets_m: dict[str, float]
    """Le même décalage recalculé à d'autres résolutions. C'est ce qui autorise
    à choisir sur une petite grille : si les valeurs coïncident, le décalage est
    une propriété du tirage et non de l'échantillonnage."""

    minimum_m: float
    maximum_m: float
    relief_ceiling_m: float
    """Extrêmes observés et plafond physique. Le générateur n'écrête pas — si
    les extrêmes s'approchent du plafond, c'est le plafond ou l'écart-type visé
    qu'il faut revoir, jamais un `clip`."""

    hurst_target: float
    hurst_measured: float
    """Visé par construction (`persistance = lacunarité^−H`) et mesuré sur la
    fonction de structure. L'écart est attendu : le nombre fini d'octaves fait
    saturer les grandes échelles."""

    persistence: float
    octaves: int
    base_frequency: float
    lacunarity: float
    relief_sigma_m: float

    def __str__(self) -> str:
        others = "  ".join(f"{w}:{v:+.2f}"
                           for w, v in self.resolution_offsets_m.items())
        return (
            f"  graine                {self.seed:>10d}"
            f"   (essai {self.seeds_tried} sur {self.seeds_scanned},"
            f" grille {self.scan_width})\n"
            f"  décalage au datum     {self.area_weighted_offset_m:>+10.2f} m"
            f"   (tolérance ±{self.offset_tolerance_m:g} m)\n"
            f"  décalages écartés     σ = {self.offset_std_m:.0f} m,"
            f" pire {self.offset_worst_m:.0f} m\n"
            f"  invariance résolution {others:>10}\n"
            f"  extrêmes              {self.minimum_m:>+10.0f} /"
            f" {self.maximum_m:+.0f} m   (plafond ±{self.relief_ceiling_m:.0f})\n"
            f"  pic / écart-type      {self.peak_to_sigma:>10.3f}"
            f"   → σ = {self.relief_sigma_m:.0f} m\n"
            f"  Hurst visé / mesuré   {self.hurst_target:>10.3f} /"
            f" {self.hurst_measured:.3f}\n"
            f"  persistance           {self.persistence:>10.4f}"
            f"   (= {self.lacunarity:g}^−{self.hurst_target:g})"
        )


def load(path: Path = PATH) -> Calibration:
    """Relit la calibration. Échoue franchement si elle manque."""
    if not path.exists():
        raise FileNotFoundError(
            f"{path} est absent — lancer `python -m aeonir_gis.calibrate`. "
            "La graine du générateur est un résultat de mesure, pas une "
            "constante qu'on écrit à la main.")
    return Calibration(**json.loads(path.read_text(encoding="utf-8")))


def save(calibration: Calibration, path: Path = PATH) -> None:
    """Écrit la calibration, triée et indentée pour rester lisible en diff."""
    path.write_text(
        json.dumps(asdict(calibration), indent=2, ensure_ascii=False,
                   sort_keys=True) + "\n",
        encoding="utf-8")
