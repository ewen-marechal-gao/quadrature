"""Les algorithmes géométriques, sans rien savoir d'Aeonir.

Simplification, découpage, quantification, déroulement angulaire : des
opérations sur des suites de couples de nombres, qui ne connaissent ni le repère
Étoile, ni l'hydrologie, ni le format des tuiles.

## Le critère d'appartenance

**Ce module n'importe rien du projet.** C'est le test, et il est mécanique : si
une fonction a besoin de :mod:`aeonir_gis.tiles`, de :mod:`aeonir_gis.crs` ou de
la moindre constante du monde, elle relève du métier et sa place est dans
:mod:`aeonir_gis.mvt`. Le jour où cette ligne se franchit, la séparation cesse
de vouloir dire quelque chose.

C'est aussi pourquoi les tolérances et les marges ne vivent PAS ici : leurs
valeurs se justifient par la grille des tuiles et par ce qu'on accepte de
perdre, ce qui sont des décisions de pipeline. Les fonctions les reçoivent en
paramètre ; le pipeline décide.

## Ce que ces algorithmes ont en commun

Aucun n'est original — Douglas-Peucker, Cohen-Sutherland, Sutherland-Hodgman
sont des classiques des années 1970. Ils sont écrits ici plutôt qu'importés
parce qu'ils sont exactement la matière du chantier : ce qu'un tuileur fait
entre la donnée source et l'encodeur.

Ils partagent une convention : une **fenêtre** est le quadruplet
``(ouest, sud, est, nord)``, l'ordre de GDAL, de Shapely et du GeoJSON. Le
renverser est l'erreur silencieuse classique.
"""

from __future__ import annotations

import math

import numpy as np


# ─────────────────────────────────────────────────────────────────────────
#  La simplification — préserver les inflexions, pas les sommets
# ─────────────────────────────────────────────────────────────────────────


def douglas_peucker(points, tolerance: float):
    """Simplification par la distance à la corde, en itératif.

    L'algorithme conserve le sommet le plus éloigné du segment joignant les deux
    extrémités, et recommence de part et d'autre. Il préserve donc les
    **extrémités** et les points d'inflexion, ce qu'un sous-échantillonnage
    régulier ne fait pas : un méandre décimé un sommet sur deux reste un méandre
    de même amplitude, décalé.

    Écrit en pile plutôt qu'en récursion — la plus longue polyligne d'ici tient
    en 204 sommets, mais rien ne garantit qu'un réseau plus fin tienne dans la
    limite de récursion de Python, et le dépassement serait une panne, non une
    dégradation.
    """
    count = len(points)
    if count < 3:
        return list(points)
    keep = [False] * count
    keep[0] = keep[-1] = True
    stack = [(0, count - 1)]
    while stack:
        first, last = stack.pop()
        if last <= first + 1:
            continue
        x0, y0 = points[first]
        x1, y1 = points[last]
        dx, dy = x1 - x0, y1 - y0
        span = math.hypot(dx, dy)
        worst = 0.0
        worst_index = -1
        for index in range(first + 1, last):
            px, py = points[index]
            if span == 0.0:
                distance = math.hypot(px - x0, py - y0)
            else:
                # Deux fois l'aire du triangle divisée par sa base : la distance
                # du point à la DROITE, sans racine par sommet.
                distance = abs(dx * (y0 - py) - (x0 - px) * dy) / span
            if distance > worst:
                worst, worst_index = distance, index
        if worst > tolerance:
            keep[worst_index] = True
            stack.append((first, worst_index))
            stack.append((worst_index, last))
    return [point for point, kept in zip(points, keep) if kept]


# ─────────────────────────────────────────────────────────────────────────
#  Le découpage — deux algorithmes, parce que deux topologies
# ─────────────────────────────────────────────────────────────────────────

_INSIDE, _LEFT, _RIGHT, _BOTTOM, _TOP = 0, 1, 2, 4, 8


def _outcode(x: float, y: float, box) -> int:
    """Position d'un point vis-à-vis de la fenêtre, en quatre bits."""
    west, south, east, north = box
    code = _INSIDE
    if x < west:
        code |= _LEFT
    elif x > east:
        code |= _RIGHT
    if y < south:
        code |= _BOTTOM
    elif y > north:
        code |= _TOP
    return code


def clip_segment(x0, y0, x1, y1, box):
    """Cohen-Sutherland : un segment contre un rectangle, ou ``None``.

    Les quatre bits servent à **rejeter sans calculer** : si les deux extrémités
    partagent un bit, le segment est entièrement du mauvais côté de ce bord et
    sort en une conjonction. C'est ce test qui rend le découpage praticable sur
    190 834 sommets repris à sept niveaux.
    """
    west, south, east, north = box
    code0, code1 = _outcode(x0, y0, box), _outcode(x1, y1, box)
    while True:
        if not (code0 | code1):
            return x0, y0, x1, y1
        if code0 & code1:
            return None
        code = code0 or code1
        if code & _TOP:
            x, y = x0 + (x1 - x0) * (north - y0) / (y1 - y0), north
        elif code & _BOTTOM:
            x, y = x0 + (x1 - x0) * (south - y0) / (y1 - y0), south
        elif code & _RIGHT:
            x, y = east, y0 + (y1 - y0) * (east - x0) / (x1 - x0)
        else:
            x, y = west, y0 + (y1 - y0) * (west - x0) / (x1 - x0)
        if code == code0:
            x0, y0, code0 = x, y, _outcode(x, y, box)
        else:
            x1, y1, code1 = x, y, _outcode(x, y, box)


def clip_line(points, box):
    """Découpe une polyligne, en recousant les segments contigus.

    ⚠️ Une polyligne qui sort de la fenêtre et y revient donne **plusieurs
    morceaux**, et c'est pourquoi on ne peut pas se contenter de découper chaque
    segment isolément : recoudre demande de comparer la fin du morceau courant
    au début du suivant. Sans cette couture, un fleuve traversant un coin
    ressortirait en autant d'entités que de segments.
    """
    pieces = []
    current: list[tuple[float, float]] = []
    for index in range(len(points) - 1):
        (x0, y0), (x1, y1) = points[index], points[index + 1]
        clipped = clip_segment(x0, y0, x1, y1, box)
        if clipped is None:
            if len(current) >= 2:
                pieces.append(current)
            current = []
            continue
        cx0, cy0, cx1, cy1 = clipped
        if current and current[-1] == (cx0, cy0):
            current.append((cx1, cy1))
        else:
            if len(current) >= 2:
                pieces.append(current)
            current = [(cx0, cy0), (cx1, cy1)]
    if len(current) >= 2:
        pieces.append(current)
    return pieces


def clip_ring(points, box):
    """Sutherland-Hodgman : un anneau contre un rectangle.

    Un polygone ne se découpe pas comme une ligne : il doit rester **fermé**.
    L'algorithme le passe donc par les quatre demi-plans l'un après l'autre, en
    ajoutant à chaque bord ses points d'entrée et de sortie — la fermeture se
    reconstitue seule le long du bord.

    ⚠️ Valide pour une fenêtre **convexe** seulement, ce qu'un rectangle est.
    Sur un anneau concave — ce qu'un bassin versant est toujours — il relie deux
    morceaux disjoints par une liaison qui longe le bord. Cette liaison est
    invisible au rendu parce qu'elle tombe exactement sur la limite de tuile,
    et c'est la seule raison pour laquelle l'algorithme simple suffit ici. Un
    calcul d'aire sur la tuile, lui, serait faux.
    """
    west, south, east, north = box
    edges = ((0, west), (1, east), (2, south), (3, north))

    def inside(point, which, value):
        x, y = point
        return (x >= value, x <= value, y >= value, y <= value)[which]

    def crossing(a, b, which, value):
        (ax, ay), (bx, by) = a, b
        if which < 2:
            return value, ay + (by - ay) * (value - ax) / (bx - ax)
        return ax + (bx - ax) * (value - ay) / (by - ay), value

    ring = list(points)
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    for which, value in edges:
        if not ring:
            return []
        output = []
        for index, current in enumerate(ring):
            previous = ring[index - 1]
            current_in = inside(current, which, value)
            previous_in = inside(previous, which, value)
            if current_in:
                if not previous_in:
                    output.append(crossing(previous, current, which, value))
                output.append(current)
            elif previous_in:
                output.append(crossing(previous, current, which, value))
        ring = output
    return ring


def quantise(points):
    """Arrondit à l'entier et retire les sommets devenus identiques.

    ⚠️ La déduplication n'est pas cosmétique. Deux sommets tombés sur le même
    entier produisent un déplacement ``(0, 0)`` que le décodeur accepte, mais
    qui compte dans le nombre annoncé par l'entier de commande : la géométrie
    reste lisible et le volume paie des sommets qui ne dessinent rien.
    """
    out = []
    for x, y in points:
        point = (int(round(x)), int(round(y)))
        if not out or point != out[-1]:
            out.append(point)
    return out


# ─────────────────────────────────────────────────────────────────────────
#  Le déroulement angulaire — la couture, prise par le bon bout
# ─────────────────────────────────────────────────────────────────────────


def unwrap_longitudes(longitudes):
    """Déroule une suite de longitudes pour la rendre continue.

    ⚠️ C'est la **couture**, et c'est le piège 16 — mais pris par l'autre bout.
    Le GeoPackage doit la *couper*, parce qu'il n'a pas de tuiles pour absorber
    le débordement. Un tuileur n'a pas à couper : il lui suffit de laisser la
    longitude sortir de ``[−180, 180]``, puis de replier les colonnes de tuiles
    modulo la largeur du monde. Le morceau qui traverse retombe alors dans la
    bonne tuile par construction, et aucune entité n'est scindée.

    Couper *et* tuiler serait même nuisible : la coupure tombe à un méridien du
    repère de sortie, alors que la donnée est stockée dans un autre — donc au
    mauvais endroit (corollaire du piège 16).
    """
    longitudes = np.asarray(longitudes, dtype=float)
    if longitudes.size < 2:
        return longitudes
    steps = np.diff(longitudes)
    steps -= 360.0 * np.round(steps / 360.0)
    return np.concatenate(([longitudes[0]], longitudes[0] + np.cumsum(steps)))
