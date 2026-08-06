"""Constantes physiques d'Aeonir.

Source de vérité : `rules/fr/univers/astronomie.md` et `rules/fr/univers/climat.md`.

Aucune de ces valeurs ne doit être recopiée ailleurs. Tout module qui en a
besoin importe d'ici — c'est la règle du dépôt : « une même valeur calculée à
deux endroits doit être testée par égalité ».

Les valeurs *dérivées* sont calculées, jamais saisies : l'excentricité découle
du périhélie et de l'aphélie, pas d'un chiffre recopié du texte. La suite de
tests vérifie qu'elles retombent bien sur ce que le lore annonce.
"""

import math
from typing import Final

# ─────────────────────────────────────────────────────────────────────────
#  Le corps
# ─────────────────────────────────────────────────────────────────────────

RADIUS_M: Final[float] = 4_775_000.0
"""Rayon d'Aeonir. `astronomie.md` : « quatre mille sept cent soixante-quinze
kilomètres »."""

SURFACE_GRAVITY_MS2: Final[float] = 7.34
"""Pesanteur de surface, `astronomie.md`."""

FLATTENING: Final[float] = 0.0
"""Aplatissement **nul** : Aeonir est une sphère exacte, pas approchée.

Une rotation de 56 ans et un verrouillage synchrone à 17,5 UA produisent une
déformation totale de ~0,09 mm sur 4 775 km. Voir le README, section « Aeonir
est une sphère ».
"""

CIRCUMFERENCE_M: Final[float] = 2 * math.pi * RADIUS_M

# ─────────────────────────────────────────────────────────────────────────
#  Rapport à la Terre — nécessaire au rendu, jamais à l'analyse
# ─────────────────────────────────────────────────────────────────────────

EARTH_RADIUS_M: Final[float] = 6_378_137.0
"""Demi-grand axe de WGS84. Aeonir n'en a pas besoin, mais MapLibre si."""

RADIUS_RATIO: Final[float] = RADIUS_M / EARTH_RADIUS_M

TERRAIN_EXAGGERATION: Final[float] = EARTH_RADIUS_M / RADIUS_M
"""Facteur à passer à `terrain.exaggeration` dans le style MapLibre.

C'est le **seul** endroit où le mensonge de rayon vit : le COG conserve les
altitudes vraies, et ce coefficient restitue à l'écran la proportion angulaire
correcte pour une planète plus petite que la Terre.
"""

# ─────────────────────────────────────────────────────────────────────────
#  Les deux horloges
# ─────────────────────────────────────────────────────────────────────────

ROTATION_PERIOD_A: Final[float] = 56.75
"""Période de rotation propre, en années. `astronomie.md` : 56 ans 9 mois.

Pilote la position du terminateur sur la croûte, donc le pôle du repère Étoile.
"""

ORBITAL_PERIOD_A: Final[float] = 54.5
"""Période orbitale, en années. `astronomie.md` : « cinquante-quatre ans et
demi ».

Pilote la déclinaison du point substellaire — donc les jours et nuits polaires —
et le flux reçu via l'excentricité.
"""

AXIAL_TILT_DEG: Final[float] = 3.0
"""Inclinaison de l'axe de rotation sur le plan orbital, `astronomie.md`."""

SOLAR_DAY_A: Final[float] = 1.0 / abs(1.0 / ORBITAL_PERIOD_A
                                      - 1.0 / ROTATION_PERIOD_A)
"""Jour solaire — battement entre les deux horloges, et **période fondamentale
du déplacement du terminateur**.

C'est ici que se joue le quasi-verrouillage : la rotation et l'orbite ne
diffèrent que de 4 %, et c'est cet écart, non la rotation elle-même, qui promène
le point substellaire autour de la croûte.

Erreur à ne pas refaire : le terminateur **ne se déplace pas** à la vitesse de
rotation. Le confondre donne 2,8 ans pour franchir la zone habitée au lieu de 71,
soit un facteur 25.

⚠️ **Extrêmement sensible aux arrondis** : 54,5 ans donnent 1 375 ans, 54,56 ans
donnent les 1 414 d'`astronomie.md`. Les durées de traversée en héritent — on les
teste à quelques pour cent, jamais à la décimale.
"""

TERMINATOR_SPEED_MS: Final[float] = CIRCUMFERENCE_M / (SOLAR_DAY_A
                                                       * 365.25 * 86400)
"""Vitesse de déplacement du terminateur à l'équateur géographique.

Ailleurs elle vaut ceci multiplié par `cos β` — d'où les durées de traversée en
`1/cos β` du lore.
"""

# ─────────────────────────────────────────────────────────────────────────
#  L'orbite
# ─────────────────────────────────────────────────────────────────────────

PERIHELION_AU: Final[float] = 14.0
"""`climat.md` : le périhélie, où coïncide l'été du Pôle Nord."""

APHELION_AU: Final[float] = 21.0
"""`climat.md` : l'aphélie, où coïncide l'été du Pôle Sud."""

SEMI_MAJOR_AXIS_AU: Final[float] = (PERIHELION_AU + APHELION_AU) / 2

ECCENTRICITY: Final[float] = ((APHELION_AU - PERIHELION_AU)
                              / (APHELION_AU + PERIHELION_AU))
"""Dérivée, pas recopiée. Retombe sur les 0,20 annoncés par `climat.md`."""

# ─────────────────────────────────────────────────────────────────────────
#  Le terminateur : DEUX moitiés, qui ne se ressemblent pas
# ─────────────────────────────────────────────────────────────────────────
#
#  Dans le repère Étoile, la latitude EST l'angle d'élévation de l'étoile. Mais
#  la latitude ne suffit pas à dire le climat : il faut savoir de quel côté du
#  monde on se trouve.
#
#  La croûte traverse la bande deux fois par rotation, dans des sens opposés :
#
#    • LEVANT   (lon' < 0) — la terre MONTE vers l'étoile.
#                Elle émerge des glaces au Front du Levant (−18°) et disparaît
#                dans la face brûlante au Mur des Tempêtes (+6°), où les mers
#                et les nappes qu'elle a accumulées en zone tempérée
#                s'évaporent d'un coup.
#
#    • COUCHANT (lon' > 0) — la terre DESCEND vers la nuit.
#                Elle émerge de la face brûlante au Front du Couchant, entre
#                +3° et +6° selon l'hygrométrie du terrain — sèche, donc sans
#                mur d'orages — et disparaît au Linceul (−21°), où l'azote
#                atmosphérique se solidifie.
#
#  Les deux seuils froids diffèrent de 3° : on émerge des glaces à −18°, on y
#  retourne à −21°. C'est une HYSTÉRÉSIS, et elle est physiquement banale — le
#  seuil de dégel n'est jamais celui du gel.

INHABITED_WIDTH_M: Final[float] = 1_500_000.0
"""Largeur de la zone **habitée et explorée**, ordre de grandeur.

À ne pas confondre avec l'étendue traversable, qui va de 2 000 à 2 125 km selon
la moitié : les extrémités du terminateur sont franchies, pas peuplées — trop
hostiles.

C'est cette largeur-ci que `climat.md` utilise pour ses durées de traversée :
« soixante et onze ans à l'équateur pour franchir les mille cinq cents
kilomètres ». Le lore ne fixe pas ses bornes en latitude, et le pipeline ne les
invente pas.
"""


def traversal_duration_a(geographic_latitude_deg: float,
                         width_m: float = INHABITED_WIDTH_M) -> float:
    """Années pour qu'un lieu franchisse une bande de largeur donnée.

    Le terminateur défile à `TERMINATOR_SPEED_MS · cos β`, d'où la loi en
    `1/cos β` du lore — 71 ans à l'équateur, 100 à 45°, 140 à 60°.
    """
    speed = TERMINATOR_SPEED_MS * math.cos(
        math.radians(geographic_latitude_deg))
    return width_m / speed / (365.25 * 86400)


LEVANT_EMERGENCE_DEG: Final[float] = -18.0
"""Front du Levant — la terre sort des glaces et redevient accessible."""

LEVANT_LIMIT_DEG: Final[float] = 6.0
"""Mur des Tempêtes — fin du Levant. `climat.md` : « franchissable en urgence
seulement »."""

COUCHANT_EMERGENCE_MIN_DEG: Final[float] = 3.0
COUCHANT_EMERGENCE_MAX_DEG: Final[float] = 6.0
"""Front du Couchant — la terre émerge de la face brûlante. Sa position dépend
de l'hygrométrie du terrain, d'où une plage et non un seuil."""

COUCHANT_LIMIT_DEG: Final[float] = -21.0
"""Le Linceul — fin du Couchant. `climat.md` : « azote atmosphérique solide,
mort instantanée »."""

SOLAR_ELEVATION_ZONES: Final[tuple[tuple[float, str], ...]] = (
    (3.0, "Savane aride"),
    (0.0, "Cœur tempéré"),
    (-3.0, "Jungle Indigo"),
    (-6.0, "Steppes crépusculaires"),
    (-12.0, "Zone d'absorption"),
)
"""Gradient **commun aux deux moitiés**, en latitude Étoile décroissante.

Les extrémités n'y figurent pas : elles sont propres à chaque moitié, et
:func:`zone_at` les ajoute selon l'hémisphère.

Les noms deviendront des `Locale` le jour où ils seront affichés sur le site ;
tant qu'ils ne servent qu'au pipeline, le français brut suffit.

⚠️ Que les zones intermédiaires soient identiques des deux côtés est une
**hypothèse de travail**, pas une donnée du vault : le lore ne décrit
explicitement que les quatre seuils extrêmes.
"""

LEVANT: Final[str] = "levant"
COUCHANT: Final[str] = "couchant"


def hemisphere_at(star_longitude_deg: float) -> str:
    """Moitié de terminateur à une longitude Étoile donnée.

    Les pôles géographiques, à `lon' = 0` et `180`, sont la charnière : la
    vitesse de la croûte y est nulle, donc la terre n'y monte ni n'y descend.
    """
    normalised = (star_longitude_deg + 180.0) % 360.0 - 180.0
    return LEVANT if normalised < 0 else COUCHANT


def traversable_band(hemisphere: str) -> tuple[float, float]:
    """Bornes en latitude Étoile de la bande traversable, `(basse, haute)`.

    Elles ne sont pas les mêmes des deux côtés — voir l'hystérésis décrite
    plus haut.
    """
    if hemisphere == LEVANT:
        return (LEVANT_EMERGENCE_DEG, LEVANT_LIMIT_DEG)
    return (COUCHANT_LIMIT_DEG, COUCHANT_EMERGENCE_MAX_DEG)


def zone_at(star_latitude_deg: float, hemisphere: str) -> str:
    """Nom de la zone climatique, à une latitude Étoile et dans une moitié.

    L'hémisphère est **obligatoire** : à −18°, le Levant voit la terre sortir
    des glaces tandis que le Couchant agonise vers le Linceul. La même latitude
    n'y décrit pas le même monde.

    Convention : **chaque seuil est la borne inférieure de sa zone.** La Jungle
    Indigo (−3°) couvre donc [−3°, 0°[, et un point à −5° relève des Steppes
    crépusculaires (−6°). Le vault ne donne que des angles représentatifs ; il
    fallait trancher, et découper en bandes montantes est ce qui sert une
    classification raster.
    """
    low, high = traversable_band(hemisphere)

    if star_latitude_deg > high:
        return "Face Ardente"
    if star_latitude_deg < low:
        return "Face Obscure"

    # Extrémités : chaque moitié a les siennes, et le vault les nomme.
    if star_latitude_deg >= COUCHANT_EMERGENCE_MIN_DEG:
        return ("Mur des Tempêtes" if hemisphere == LEVANT
                else "Front du Couchant")
    if hemisphere == LEVANT and star_latitude_deg < -12.0:
        return "Front du Levant"
    if hemisphere == COUCHANT and star_latitude_deg < LEVANT_EMERGENCE_DEG:
        return "Le Linceul"

    for threshold, name in SOLAR_ELEVATION_ZONES:
        if star_latitude_deg >= threshold:
            return name

    # Couchant, entre −12° et −18° : le vault ne nomme rien ici. On prolonge la
    # Zone d'absorption faute de mieux — mais sa description dans climat.md (les
    # troncs pétrifiés libérant leurs semences) est un phénomène de DÉGEL, donc
    # du Levant. Zone à nommer côté règles.
    return "Zone d'absorption"


def arc_degrees_to_metres(degrees: float) -> float:
    """Longueur d'un arc de grand cercle, en mètres."""
    return math.radians(degrees) * RADIUS_M


def metres_to_arc_degrees(metres: float) -> float:
    """Réciproque de :func:`arc_degrees_to_metres`."""
    return math.degrees(metres / RADIUS_M)
