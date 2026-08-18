"""Écoulement de surface — Lot 2, géométrie sans époque.

Ce module ne calcule **que la géométrie du drainage** : par où l'eau descend, et
vers quel puits. Rien ici ne dépend d'une époque ni d'un climat. C'est de la
roche, donc du repère **Croûte**, et le résultat sert à toutes les époques.

## Pourquoi on ne comble pas les cuvettes

Le comblement classique suppose un exutoire — l'océan, ou le bord du MNT. Sur
une sphère fermée sans océan global, il n'y en a aucun : chaque bassin se
remplirait jusqu'à son seuil, déverserait dans le voisin, et de proche en proche
la planète entière deviendrait un lac unique au point le plus haut. Le
prétraitement standard n'a pas de solution ici.

La physique d'Aeonir en fournit une autre : **c'est l'évaporation qui termine
les bassins.** Un lac endoréique s'équilibre là où sa surface évapore ce que son
bassin versant lui apporte — la Caspienne, le Tchad, la mer Morte. Le niveau est
donc en général *inférieur* au seuil de débordement, et le comblement cesse
d'être un prétraitement subi pour devenir un résultat du bilan hydrique.

D'où l'ordre : directions → puits → bassins → *(bilan, plus tard)* → débordement
seulement là où le niveau dépasse le seuil.

## Ce que la sphère impose

Deux corrections que la grille équirectangulaire rend obligatoires, et qu'un
portage naïf d'un code terrestre oublierait :

- **Les huit voisins ne sont pas équidistants.** Le pas E-O vaut `cos φ` fois le
  pas N-S, et l'écart atteint un facteur 11 à la coupure de Mercator. Prendre la
  plus forte dénivelée au lieu de la plus forte *pente* enverrait l'eau vers
  l'est ou l'ouest dans toutes les hautes latitudes.
- **La grille s'enroule en longitude.** Les colonnes 0 et W−1 sont voisines.

Les distances sont calculées en **orthodromie exacte** plutôt qu'en plan
tangent : elles ne dépendent que de la ligne et du décalage, donc une table de
`H × 8` suffit, et l'approximation ne coûtait rien à éviter.
"""

from dataclasses import dataclass

import numpy as np

from . import constants as k

# (dj, di) — dj > 0 va vers le sud, puisque la ligne 0 est au nord.
NEIGHBOUR_OFFSETS: tuple[tuple[int, int], ...] = (
    (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1),
)
"""E, SE, S, SO, O, NO, N, NE — dans cet ordre.

Choisi pour que le code ESRI classique soit exactement `2 ** index` : E=1, SE=2,
S=4, SO=8, O=16, NO=32, N=64, NE=128. On stocke l'index 0-7, mais la conversion
vers la convention répandue est un décalage de bit.
"""

SINK: int = 255
"""Marqueur de puits dans le raster de directions — aucun voisin plus bas."""


def neighbour_distances(height: int, width: int) -> np.ndarray:
    """Distances orthodromiques aux huit voisins, `(height, 8)`, en mètres.

    Elles ne dépendent pas de la longitude : la grille est régulière en `λ`, et
    une rotation autour de l'axe polaire conserve les distances. Une table par
    ligne suffit donc, et elle tient dans quelques kilooctets.

    Calculées en **haversine** plutôt que par la formule au cosinus, qui perd
    ses chiffres significatifs sur les petits angles — et ici tous les angles
    sont petits.
    """
    latitudes = 90.0 - (np.arange(height) + 0.5) * (180.0 / height)
    phi = np.radians(latitudes)
    delta_lambda = np.radians(360.0 / width)

    distances = np.empty((height, 8), dtype=np.float64)
    for index, (dj, di) in enumerate(NEIGHBOUR_OFFSETS):
        # Latitude **extrapolée** au-delà du pôle plutôt qu'écrêtée sur la
        # dernière ligne. Écrêter donnerait une distance nulle vers le nord
        # depuis la ligne 0, donc une division par zéro — masquée par
        # l'altitude infinie de la bordure, mais fausse quand même. L'écart
        # angulaire, lui, vaut un pas quoi qu'il arrive.
        phi2 = np.radians(90.0 - (np.arange(height) + dj + 0.5)
                          * (180.0 / height))
        a = (np.sin((phi2 - phi) / 2) ** 2
             + np.cos(phi) * np.cos(phi2) * np.sin(di * delta_lambda / 2) ** 2)
        distances[:, index] = 2 * k.RADIUS_M * np.arcsin(np.sqrt(a))
    return distances


def flow_direction(elevation: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Direction D8 de chaque cellule, et masque des puits.

    Renvoie `(directions uint8, puits booléen)`. Une cellule sans voisin
    strictement plus bas porte :data:`SINK` et termine un bassin.

    Le critère est la **plus forte pente**, pas la plus forte dénivelée — voir
    l'en-tête du module.
    """
    height, width = elevation.shape
    distances = neighbour_distances(height, width)

    # Bordure à +∞ : au nord de la première ligne et au sud de la dernière, il
    # n'y a pas de voisin. Une altitude infinie n'est jamais plus basse, donc
    # elle ne peut pas être choisie — et la ligne polaire n'invente pas
    # d'exutoire.
    padded = np.full((height + 2, width), np.inf, dtype=elevation.dtype)
    padded[1:-1] = elevation

    best_slope = np.full(elevation.shape, 0.0, dtype=np.float64)
    directions = np.full(elevation.shape, SINK, dtype=np.uint8)

    for index, (dj, di) in enumerate(NEIGHBOUR_OFFSETS):
        neighbour = np.roll(padded[1 + dj:1 + dj + height], -di, axis=1)
        slope = (elevation - neighbour) / distances[:, index][:, None]
        steeper = slope > best_slope
        best_slope = np.where(steeper, slope, best_slope)
        directions = np.where(steeper, np.uint8(index), directions)

    return directions, directions == SINK


def receivers(directions: np.ndarray) -> np.ndarray:
    """Index plat de la cellule réceptrice de chacune. Un puits se reçoit lui-même.

    C'est la représentation en **forêt** du réseau : chaque cellule pointe vers
    sa suivante, chaque puits est une racine.
    """
    height, width = directions.shape

    # int32 et non int64 : l'index plat maximal vaut H·W − 1, soit 134 millions
    # à la résolution de production, très en deçà des 2,1 milliards que porte un
    # int32. Le doublement de pointeurs tient deux copies de ce tableau en même
    # temps — c'est le pic mémoire du module. Tient jusqu'à z=7, casse à z=8.
    if height * width > np.iinfo(np.int32).max:
        raise ValueError("grille trop grande pour un index plat int32")

    # Table de correspondance direction → décalage, indexée par la valeur du
    # code. SINK y vaut (0, 0), donc un puits se reçoit lui-même sans cas
    # particulier.
    row_step = np.zeros(256, dtype=np.int32)
    col_step = np.zeros(256, dtype=np.int32)
    for index, (dj, di) in enumerate(NEIGHBOUR_OFFSETS):
        row_step[index], col_step[index] = dj, di

    # Ligne par ligne, pour ne jamais matérialiser de tableau intermédiaire à la
    # taille de la grille. La version vectorisée d'un seul bloc en fabriquait
    # six en int64, soit huit gigaoctets de pointe à z=6.
    out = np.empty(directions.shape, dtype=np.int32)
    columns = np.arange(width, dtype=np.int32)
    for row in range(height):
        codes = directions[row]
        target_row = min(max(row, 0), height - 1) + row_step[codes]
        np.clip(target_row, 0, height - 1, out=target_row)
        target_col = (columns + col_step[codes]) % width   # enroulement
        out[row] = target_row * width + target_col

    return out.ravel()


@dataclass(frozen=True)
class Basins:
    """Découpage de la planète en bassins, **une ligne par bassin**.

    Deux représentations complémentaires, et c'est voulu :

    - :attr:`labels` vit sur la grille — une carte, à écrire en raster ;
    - :attr:`sink`, :attr:`cells`, :attr:`area_m2` sont des tableaux compacts de
      longueur `count` — une table, à joindre et à écrire en attributs.

    L'étiquette compacte `0..count-1` remplace ici l'index plat du puits, qui
    servait d'identifiant dans les fonctions de bas niveau. `sink[b]` la
    retrouve quand on en a besoin.
    """

    labels: np.ndarray
    """`(H, W)` int32 — numéro de bassin de chaque cellule."""

    sink: np.ndarray
    """`(count,)` int64 — index **plat** du puits de chaque bassin."""

    cells: np.ndarray
    """`(count,)` int64 — nombre de cellules."""

    area_m2: np.ndarray
    """`(count,)` float64 — aire réelle. **Pas proportionnelle à** :attr:`cells`
    : une cellule polaire couvre `cos φ` fois moins de sol qu'une équatoriale."""

    @property
    def count(self) -> int:
        return self.sink.size

    def sink_rowcol(self, width: int) -> tuple[np.ndarray, np.ndarray]:
        """Puits en coordonnées de grille, pour les exporter en points."""
        return self.sink // width, self.sink % width


def label_basins(directions: np.ndarray, *, block_rows: int = 256) -> Basins:
    """Étiquette les bassins et mesure chacun. Le point d'entrée à utiliser.

    **On n'a pas besoin de découvrir les bassins : ce sont les puits**, et le
    raster de directions les désigne déjà. Un `np.unique` sur les racines
    trierait 134 millions d'entiers pour retrouver une information qu'on
    possède — et son tri interne alloue à lui seul un gigaoctet.

    Les aires s'accumulent par blocs de lignes : l'aire d'une cellule ne dépend
    que de sa ligne, mais `bincount` veut un poids par cellule, et le
    matérialiser sur toute la grille coûterait un gigaoctet de plus.
    """
    height, width = directions.shape
    roots = basin_roots(directions)

    # Les puits, dans l'ordre de leur index plat — exactement ce qu'un
    # `np.unique` aurait rendu, sans le tri.
    sink = np.flatnonzero(directions.ravel() == SINK).astype(np.int64)

    compact = np.full(directions.size, -1, dtype=np.int32)
    compact[sink] = np.arange(sink.size, dtype=np.int32)
    labels = compact[roots]              # (H, W) — `roots` est déjà une grille
    del compact, roots

    edges = np.radians(90.0 - np.arange(height + 1) * (180.0 / height))
    row_area = (k.RADIUS_M ** 2 * np.radians(360.0 / width)
                * (np.sin(edges[:-1]) - np.sin(edges[1:])))

    area_m2 = np.zeros(sink.size, dtype=np.float64)
    for first in range(0, height, block_rows):
        last = min(first + block_rows, height)
        weights = np.repeat(row_area[first:last], width)
        area_m2 += np.bincount(labels[first:last].ravel(), weights=weights,
                               minlength=sink.size)

    return Basins(
        labels=labels,
        sink=sink,
        # `ravel` d'une grille contiguë est une vue, pas une copie.
        cells=np.bincount(labels.ravel(), minlength=sink.size),
        area_m2=area_m2,
    )


def resolve_roots(link: np.ndarray) -> np.ndarray:
    """Racine de chaque nœud d'une forêt, par **doublement de pointeurs**.

    Attend un tableau **plat** où `link[i]` est le successeur de `i`, et où
    chaque racine pointe sur elle-même. Renvoie, pour chaque nœud, la racine de
    son arbre.

    « Pointeur » est ici au sens de la littérature algorithmique — un lien dans
    une structure chaînée — et non au sens d'une adresse mémoire : ce sont des
    index de tableau. C'est ce qui permet à `link[link]` d'être une opération
    numpy unique, appliquée à tous les nœuds en même temps.

    **Le principe.** `link[i]` est « où va `i` ». Donc `link[link[i]]` est « où
    va celui où va `i` », soit deux pas. En réaffectant `link = link[link]`,
    chaque entrée avance de la distance qu'elle avait déjà parcourue : 1, 2, 4,
    8… La racine est atteinte en `log₂` de la plus longue chaîne.

    **Exemple** — une chaîne de neuf nœuds, `0 → 1 → … → 8`, où `8` est racine ::

        départ            [1 2 3 4 5 6 7 8 8]     1 pas
        passe 1  l=l[l]   [2 3 4 5 6 7 8 8 8]     2 pas
        passe 2  l=l[l]   [4 5 6 7 8 8 8 8 8]     4 pas
        passe 3  l=l[l]   [8 8 8 8 8 8 8 8 8]     8 pas
        passe 4  l=l[l]   [8 8 8 8 8 8 8 8 8]     figé → on s'arrête

    **Pourquoi ça s'arrête tout seul** : une racine pointe sur elle-même, donc
    une fois arrivé, `link[racine] = racine` et doubler ne change plus rien. Le
    tableau se fige exactement quand le dernier nœud est arrivé — d'où l'égalité
    comme critère, plutôt qu'un nombre de passes qu'on ne connaît pas d'avance.

    ⚠️ **Les états intermédiaires n'ont aucun sens.** Après la passe 2 ci-dessus,
    `l[0] = 4` ne dit pas que 0 se déverse dans 4. Le tableau ne redevient
    interprétable qu'à convergence.

    Mesuré sur la grille z=4 : **13 passes** au lieu des 8 192 d'un parcours pas
    à pas, soit 630 fois moins de travail.

    C'est l'algorithme de **Wyllie (1979)**, du modèle PRAM — en anglais
    *pointer jumping* ou *pointer doubling*. Cousin de la compression de chemin
    de l'union-find : même idée de raccourcir les liens, mais appliquée
    avidement à tous les nœuds à la fois plutôt que paresseusement à chaque
    requête. La première convient à un tableau qu'on traite en bloc.
    """
    if link.ndim != 1:
        raise ValueError("le doublement de pointeurs exige un tableau plat")
    while True:
        jumped = link[link]
        if np.array_equal(jumped, link):
            return jumped
        link = jumped


def resolve_depths(link: np.ndarray) -> np.ndarray:
    """Nombre de pas séparant chaque nœud de sa racine.

    Même doublement que :func:`resolve_roots`, en transportant un compteur : si
    `link` mène à `d` pas et que sa cible en mène à `d'`, alors le lien doublé
    en mène à `d + d'`. Les racines comptent zéro, ce qui fait que le compteur
    cesse de croître dès qu'on est arrivé.

    **Exemple** — la même chaîne `0 → 1 → … → 8` de :func:`resolve_roots` ::

        départ    lien [1 2 3 4 5 6 7 8 8]   pas [1 1 1 1 1 1 1 1 0]
        passe 1   lien [2 3 4 5 6 7 8 8 8]   pas [2 2 2 2 2 2 1 1 0]
        passe 2   lien [4 5 6 7 8 8 8 8 8]   pas [4 4 4 4 3 2 1 1 0]
        passe 3   lien [8 8 8 8 8 8 8 8 8]   pas [8 7 6 5 4 3 2 1 0]

    À convergence, `pas[i]` est la profondeur exacte de `i` — ici sa distance à
    l'exutoire, en cellules.

    **À quoi ça sert.** Deux nœuds de même profondeur ne peuvent pas s'alimenter
    l'un l'autre : un pas de plus les sépare forcément de la racine. Ils sont
    donc **indépendants**, et se traitent en une seule opération vectorisée.
    C'est ce qui rend l'accumulation calculable sans boucle sur les cellules.
    """
    if link.ndim != 1:
        raise ValueError("le doublement de pointeurs exige un tableau plat")
    steps = (link != np.arange(link.size, dtype=link.dtype)).astype(np.int32)
    while True:
        jumped = link[link]
        steps = steps + steps[link]
        if np.array_equal(jumped, link):
            return steps
        link = jumped


def flow_accumulation(link: np.ndarray, depths: np.ndarray,
                      weights: np.ndarray | None = None) -> np.ndarray:
    """Débit cumulé de chaque cellule, elle-même comprise.

    Sans `weights`, chaque cellule pèse 1 et le résultat est un **nombre de
    cellules drainées**. Le Lot 2 s'en tient là : les précipitations sont
    uniformes, faute d'un modèle climatique — il viendra au Lot 6, et il
    passera par ce paramètre sans que l'algorithme change.

    ⚠️ Pour une surface drainée en **m²**, passer l'aire des cellules en poids.
    Compter des cellules surestime les bassins de haute latitude d'un facteur
    `1/cos φ`.

    **L'ordre de traitement est la seule subtilité.** Une cellule ne peut être
    additionnée qu'après tous ses affluents, ce qui rend le calcul séquentiel
    par nature. On le contourne en traitant les cellules **par profondeur
    décroissante** : à profondeur égale elles sont indépendantes, donc un seul
    `add.at` vectorisé suffit par niveau. Le tri est fait une fois, et la boucle
    a la longueur du plus long chemin d'écoulement — quelques milliers de tours
    sur des tableaux, au lieu de millions de tours sur des cellules.
    """
    accumulated = (np.ones(link.size, dtype=np.float64) if weights is None
                   else weights.ravel().astype(np.float64).copy())

    order = np.argsort(depths, kind="stable")
    per_depth = np.bincount(depths)
    ends = np.cumsum(per_depth)

    for depth in range(per_depth.size - 1, 0, -1):
        cells = order[ends[depth] - per_depth[depth]:ends[depth]]
        np.add.at(accumulated, link[cells], accumulated[cells])

    return accumulated


def strahler_order(link: np.ndarray, depths: np.ndarray,
                   is_stream: np.ndarray) -> np.ndarray:
    """Ordre de Strahler de chaque cellule du réseau ; 0 hors réseau.

    La règle, qui date de 1952 et sert à hiérarchiser un réseau hydrographique :

    - une **source** — aucun affluent — est d'ordre 1 ;
    - deux affluents de **même** ordre `n` donnent `n + 1` ;
    - des affluents d'ordres **différents** donnent le maximum, inchangé.

    Autrement dit un ordre ne monte que quand deux branches d'égale importance
    se rejoignent. C'est ce qui en fait une mesure de la ramification et non de
    la longueur : un ruisseau qui rejoint un fleuve ne le grandit pas.

    **Exemple** — deux sources qui confluent, puis reçoivent une troisième ::

        1 ─┐
           ├─ 2 ─┐
        1 ─┘     ├─ 2      ← ordres différents (2 et 1) : le maximum passe
              1 ─┘

    L'implémentation réutilise l'astuce de :func:`flow_accumulation` : les
    affluents d'une cellule sont **exactement** les cellules de profondeur `d+1`
    qui pointent sur elle, donc traiter les profondeurs en ordre décroissant
    garantit qu'une cellule est finalisée après tous ses affluents. On ne
    transporte que deux nombres par cellule — le meilleur ordre reçu, et
    combien d'affluents l'atteignent — ce qui suffit à trancher la règle.
    """
    best = np.zeros(link.size, dtype=np.int16)
    ties = np.zeros(link.size, dtype=np.int32)
    order = np.zeros(link.size, dtype=np.int16)

    stream = is_stream.ravel()
    sequence = np.argsort(depths, kind="stable")
    per_depth = np.bincount(depths)
    ends = np.cumsum(per_depth)

    for depth in range(per_depth.size - 1, -1, -1):
        cells = sequence[ends[depth] - per_depth[depth]:ends[depth]]
        cells = cells[stream[cells]]
        if cells.size == 0:
            continue

        # Finaliser : sans affluent c'est une source, sinon la règle de 1952.
        received = ties[cells]
        order[cells] = np.where(received == 0, 1,
                                np.where(received >= 2, best[cells] + 1,
                                         best[cells]))

        # Propager vers l'aval, en gardant le meilleur ordre et sa multiplicité.
        targets = link[cells]
        np.maximum.at(best, targets, order[cells])
        np.add.at(ties, targets, (order[cells] == best[targets]).astype(np.int32))

    return order.reshape(is_stream.shape)


def stream_segments(link: np.ndarray, is_stream: np.ndarray,
                    order: np.ndarray) -> list[np.ndarray]:
    """Découpe le réseau en tronçons, chacun d'ordre de Strahler constant.

    Un tronçon va d'une **source** ou d'une **confluence** jusqu'à la confluence
    ou l'exutoire suivant. C'est le découpage qui convient au rendu : MapLibre
    donnera une épaisseur par ordre, et un ordre constant le long d'un trait
    évite de couper la ligne à chaque pixel.

    Renvoie une liste de tableaux d'index plats, dans le sens de l'écoulement.
    """
    stream = is_stream.ravel()
    flat_order = order.ravel()
    cells = np.flatnonzero(stream)

    inflow = np.zeros(link.size, dtype=np.int32)
    moving = cells[link[cells] != cells]          # hors exutoires
    np.add.at(inflow, link[moving], 1)

    # Un tronçon démarre à une source (aucun affluent) ou à une confluence.
    starts = cells[(inflow[cells] == 0) | (inflow[cells] >= 2)]

    segments = []
    for start in starts.tolist():
        path = [start]
        cell = start
        while True:
            nxt = int(link[cell])
            if nxt == cell or not stream[nxt]:    # exutoire, ou sortie du réseau
                break
            path.append(nxt)
            if inflow[nxt] >= 2:                  # la confluence ferme le tronçon
                break
            cell = nxt
        if len(path) > 1:
            segments.append(np.array(path, dtype=np.int64))
    return segments


def basin_roots(directions: np.ndarray) -> np.ndarray:
    """Puits terminal de chaque cellule, `(H, W)`.

    Les puits se recevant eux-mêmes, le réseau d'écoulement *est* une forêt
    dont ils sont les racines : :func:`resolve_roots` fait le reste.
    """
    return resolve_roots(receivers(directions)).reshape(directions.shape)


