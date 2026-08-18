"""Bruit de gradient tridimensionnel, et le pont qui l'amène sur la sphère.

Ce module ne connaît ni Aeonir, ni les CRS, ni rasterio. Il fabrique un champ
scalaire continu sur ℝ³, et fournit la fonction qui y envoie une grille
géographique.

**Pourquoi la troisième dimension.** Un bruit évalué sur le plan `(lon, lat)`
hérite des défauts de la grille : discontinuité à l'antiméridien, et pincement
au pôle, où toute une ligne de pixels balaie le domaine du bruit alors qu'elle
décrit un seul point du monde. Évalué sur la sphère unité plongée dans ℝ³, le
bruit ignore la grille : les deux pixels de bord sont des voisins ordinaires, et
la ligne polaire tient dans une calotte de deux kilomètres. Les tests
`test_noise.py` montrent les deux, et le contre-exemple 2D à côté.

Le coût est un facteur trois sur le nombre de cellules du réseau — on
échantillonne une surface dans un champ volumique. C'est le prix de l'absence de
couture, et il n'y en a pas d'autre.

**Flottants 64 bits.** À la dixième octave la fréquence vaut 1 024 : en float32
la partie fractionnaire d'une coordonnée n'y garderait que quatre décimales, et
le résultat dépendrait de l'ordre des opérations. Le débit mesuré reste
suffisant, la reproductibilité prime.
"""

import numpy as np

# Les douze arêtes du cube unité. Le choix classique de Perlin : ces vecteurs
# évitent les directions privilégiées des diagonales, et surtout ils vont par
# paires opposées — c'est cette symétrie qui rend le champ d'espérance nulle,
# donc le terrain à moyenne nulle SANS recentrage a posteriori. Le datum du
# point 6 en dépend directement.
_GRADIENTS = np.array([
    (1, 1, 0), (-1, 1, 0), (1, -1, 0), (-1, -1, 0),
    (1, 0, 1), (-1, 0, 1), (1, 0, -1), (-1, 0, -1),
    (0, 1, 1), (0, -1, 1), (0, 1, -1), (0, -1, -1),
], dtype=np.float64)

_GX, _GY, _GZ = _GRADIENTS[:, 0], _GRADIENTS[:, 1], _GRADIENTS[:, 2]

SINGLE_OCTAVE_STD: float = 0.2702
"""Écart-type d'une octave seule de :class:`GradientNoise3D`.

**Mesuré, pas théorique** — c'est une propriété de cette implémentation (douze
gradients d'arête, interpolation quintique) : moyenne sur douze graines, huit
millions de points chacune. Il sert à normaliser le fBm *analytiquement*, sans
quoi il faudrait diviser par l'écart-type observé du terrain — et l'échelle des
altitudes dépendrait alors de la graine, exactement le travers que le datum du
point 6 refuse.

⚠️ La dispersion d'une graine à l'autre vaut **1,5 %** : le tirage de la
permutation change légèrement la distribution des gradients. La normalisation
est donc exacte en espérance et bonne à quelques pour cent en réalisation.
`test_noise.py` tient les deux bornes.
"""


def _fade(t):
    """Quintique de Perlin, `6t⁵ − 15t⁴ + 10t³`.

    Dérivées première et seconde nulles aux entiers : sans elle, les frontières
    de cellule du réseau restent visibles comme un quadrillage.
    """
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def _lerp(a, b, t):
    return a + t * (b - a)


class GradientNoise3D:
    """Bruit de gradient (Perlin) sur ℝ³, vectorisé numpy.

    D'espérance nulle, de période 256 sur chaque axe entier. On reste très loin
    de cette période : à la fréquence de base 2, la sphère unité tient dans
    quatre cellules.
    """

    def __init__(self, seed: int) -> None:
        permutation = np.random.default_rng(seed).permutation(256)
        # Dupliquée : les index atteignent 511 après trois additions chaînées,
        # ce qui évite un modulo à chaque niveau du hachage.
        self._perm = np.concatenate([permutation, permutation]).astype(np.intp)
        self.seed = seed

    def _grad(self, h, x, y, z):
        g = h % 12
        return _GX[g] * x + _GY[g] * y + _GZ[g] * z

    def __call__(self, x, y, z):
        """Évalue le bruit en des points quelconques. Formes diffusables."""
        x, y, z = np.broadcast_arrays(np.asarray(x, dtype=np.float64),
                                      np.asarray(y, dtype=np.float64),
                                      np.asarray(z, dtype=np.float64))

        x0, y0, z0 = np.floor(x), np.floor(y), np.floor(z)
        xf, yf, zf = x - x0, y - y0, z - z0
        # `& 255` sur des entiers négatifs donne bien le résidu positif.
        xi = x0.astype(np.intp) & 255
        yi = y0.astype(np.intp) & 255
        zi = z0.astype(np.intp) & 255

        u, v, w = _fade(xf), _fade(yf), _fade(zf)

        p = self._perm
        a, b = p[xi], p[xi + 1]
        aa, ab = p[a + yi], p[a + yi + 1]
        ba, bb = p[b + yi], p[b + yi + 1]

        # Les huit coins de la cellule, chacun projetant son gradient sur le
        # vecteur qui le sépare du point évalué.
        n000 = self._grad(p[aa + zi], xf, yf, zf)
        n100 = self._grad(p[ba + zi], xf - 1.0, yf, zf)
        n010 = self._grad(p[ab + zi], xf, yf - 1.0, zf)
        n110 = self._grad(p[bb + zi], xf - 1.0, yf - 1.0, zf)
        n001 = self._grad(p[aa + zi + 1], xf, yf, zf - 1.0)
        n101 = self._grad(p[ba + zi + 1], xf - 1.0, yf, zf - 1.0)
        n011 = self._grad(p[ab + zi + 1], xf, yf - 1.0, zf - 1.0)
        n111 = self._grad(p[bb + zi + 1], xf - 1.0, yf - 1.0, zf - 1.0)

        return _lerp(
            _lerp(_lerp(n000, n100, u), _lerp(n010, n110, u), v),
            _lerp(_lerp(n001, n101, u), _lerp(n011, n111, u), v),
            w,
        )


def fbm(noise: GradientNoise3D, x, y, z, *,
        octaves: int, base_frequency: float,
        lacunarity: float, persistence: float):
    """Somme fractale de bruit — *fractional Brownian motion*.

    Chaque octave double la fréquence et divise l'amplitude, de sorte que le
    relief porte du détail à toutes les échelles jusqu'à celle du pixel.

    Le résultat est **normalisé à écart-type unité, analytiquement** : les
    octaves étant décorrélées, leurs variances s'ajoutent, d'où le facteur
    `σ₁·√Σp²ⁱ`. Aucune statistique du terrain produit n'entre dans le calcul —
    c'est ce qui garantit qu'une même altitude signifie la même chose d'une
    graine à l'autre.

    L'espérance reste nulle : somme de champs d'espérance nulle.
    """
    if octaves < 1:
        raise ValueError("il faut au moins une octave")

    total = None
    frequency, amplitude = base_frequency, 1.0
    for _ in range(octaves):
        octave = noise(x * frequency, y * frequency, z * frequency)
        total = octave * amplitude if total is None else total + octave * amplitude
        frequency *= lacunarity
        amplitude *= persistence

    variance = sum(persistence ** (2 * i) for i in range(octaves))
    return total / (SINGLE_OCTAVE_STD * np.sqrt(variance))


def unit_vectors(longitude_deg, latitude_deg):
    """Grille géographique → points de la sphère unité dans ℝ³.

    **C'est ici que la couture et le pincement polaire disparaissent.** Le
    couple `(−180°, φ)` et `(+180°, φ)` produit le même vecteur ; toute la ligne
    `φ = 90°` produit `(0, 0, 1)`. Le bruit, qui ne voit que ces vecteurs, ne
    peut donc pas être discontinu à l'antiméridien ni tourbillonner au pôle.

    Les formes se diffusent : passer `lon[None, :]` et `lat[:, None]` rend une
    bande de raster complète.
    """
    lam = np.radians(np.asarray(longitude_deg, dtype=np.float64))
    phi = np.radians(np.asarray(latitude_deg, dtype=np.float64))
    cos_phi = np.cos(phi)
    return (cos_phi * np.cos(lam),
            cos_phi * np.sin(lam),
            np.broadcast_to(np.sin(phi), np.broadcast(lam, phi).shape))
