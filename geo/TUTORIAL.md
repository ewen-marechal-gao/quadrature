# `geo/` — feuille de route, enseignements et pièges

Ce que le chantier vise, ce qu'il a livré, ce qu'il a coûté d'apprendre.

Les trois fichiers de `geo/` ont des rôles disjoints, et s'y tenir est ce qui
les empêche de regonfler :

| | |
|---|---|
| [GLOSSAIRE.md](GLOSSAIRE.md) | **le vocabulaire** du domaine |
| [README.md](README.md) | **le code** — organisation, pipeline, décisions de conception |
| ce fichier | **la trajectoire** — lots, enseignements, pièges |

> **Règle anti-duplication.** Une mesure n'apparaît qu'une fois : au README si
> elle justifie la forme du code, ici si elle raconte une erreur et son coût.
>
> **Et aucun nombre de tirage n'est écrit en prose.** Graine, décalage au
> datum, extrêmes, écart-type, pic : tout cela vit dans
> [`aeonir_gis/calibration.json`](aeonir_gis/calibration.json), produit par une
> commande. Ce qui reste écrit ici, ce sont les nombres de *conception* —
> `W = 2^z·T`, la coupure à 85,0511°, le rapport de rayons 1,336.

---

# La feuille de route

| Lot | Contenu | État |
|---|---|---|
| **0** | Référentiels Croûte et Étoile, rotation datée entre eux | ✅ |
| **1** | MNT global — fBm échantillonné en 3D sur la sphère → GeoTIFF → COG | ✅ |
| **2** | Hydrologie — D8, accumulation, réseau, Strahler, bassins → GeoPackage | ✅ |
| **3** | Tuileur maison — pyramide XYZ, terrarium, TileJSON | ✅ |
| **4** | Viewer MapLibre — style spec, `hillshade`, `terrain` | ✅ porté en React à la route `/sig` ; tests en CI, tuiles produites au déploiement |
| **5** | Tuiles vectorielles MVT — fleuves, lacs, biomes | |
| **6** | Tuileur **dynamique** — le même code déclenché par requête HTTP, lisant des plages dans le COG, l'époque en paramètre d'URL | |
| **7** | Relief tectonique — plancher dominant, chaînes de collision, fosses en eau dans le seul terminateur, croûte dilatée/contractée | |

Les lots 6 et 7 ont **échangé leurs numéros** : le poste visé porte sur
l'analyse d'images satellite, où la donnée est dynamique et servie. Exercer ce
régime prime sur l'embellissement de la géographie.

## Ce qui est conçu, et volontairement reporté

**Le modèle hydrique complet** — évaporation comme exutoire, lacs endoréiques à
l'équilibre, cycle fermé Levant → Mur des Tempêtes → Couchant → Linceul, point
fixe en deux passes. Établi avec l'auteur du lore, consigné au README, reporté
au **Lot 7** : le Lot 2 ne devait produire qu'une couche vectorielle honnête à
tuiler, la cible étant un poste frontend.

**PMTiles** — attendu pour régler la bordure dentelée d'une pyramide creuse.
Un découpage de couches déclaré côté client le fait sans lui et supprime les
404, sans rien coûter au rendu (piège 41).
L'argument du fichier unique redevient décisif au **Lot 6**, quand les tuiles
seront *servies* plutôt que posées à côté du viewer.

**Le tuileur dynamique** — le même code déclenché par requête, l'époque en
paramètre d'URL. C'est le pendant de la dimension temporelle d'une archive
satellite, et la forme *batch* écrite ici en est l'exercice préparatoire.

## Le critère d'acceptation du Lot 7, obtenu gratuitement

Le fBm ne produit **aucune dépression fermée**. Mesuré avant de construire
l'hydrologie : la profondeur médiane d'une cuvette vaut le sixième de l'écart
d'altitude ordinaire entre deux cellules voisines, et le nombre de bassins
décroît continûment avec le seuil de fusion — aucun plateau, aucun décrochement.
Il n'y a pas deux populations à séparer : ce sont les minima locaux d'un champ
aléatoire lisse, pas des dépressions.

> Le jour où la tectonique arrivera, relancer cette mesure doit donner une
> distribution **bimodale** : un mode de bruit peu profond, un mode de vraies
> dépressions à des centaines de mètres, séparés par un creux. Les vraies
> dépressions fermées d'une planète sont tectoniques — rifts, grabens,
> calderas.

⚠️ Ce critère se re-mesure à chaque changement de générateur. Il a déjà été
invalidé une fois, par l'essai `H = 0,5` décrit plus bas.

---

# Les enseignements

Ceux qui valent au-delà de ce chantier.

## Un chiffre qu'on ne sait pas dériver est un chiffre orphelin

La largeur du raster a longtemps été « 16 384 », reprise de session en session.
Elle tombait juste, mais **par accident** : personne ne pouvait la déduire.
Elle vient en réalité de l'accord entre la grille équirectangulaire et la
pyramide Mercator, `W = 2^z · T`, et la contrainte qui plafonne le zoom n'est
ni le disque ni le calcul mais la mémoire de l'analyse hydrologique.

La même discipline s'applique partout où elle peut : la persistance du bruit se
déduit de l'exposant de Hurst visé (`p = l^(−H)`), l'échelle du relief se déduit
du pic mesuré, la plage d'ajustement d'une mesure de rugosité se déduit de la
fréquence de base du bruit.

## « Par construction » se vérifie sur la réalisation, pas sur l'espérance

Le générateur est d'espérance nulle — les gradients vont par paires opposées, et
un test le vérifie plutôt que de le supposer. Mais **une réalisation ne l'est
pas** : le décalage de surface d'un tirage a un écart-type de plusieurs
centaines de mètres, et la première graine essayée mettait le sol moyen
d'Aeonir un demi-kilomètre sous son propre datum.

D'où la calibration : le critère vit dans le code et dans les tests, la valeur
vit dans `calibration.json`. Sélectionner une réalisation n'est **pas** recentrer
la donnée — le zéro reste la sphère, et ne dépend d'aucune statistique du
terrain.

## Une mesure prouve ce qu'elle englobe, et rien d'autre

L'enseignement le plus cher du chantier, appris trois fois de suite en
diagnostiquant un défaut d'ombrage :

- une fenêtre de mesure masquée sur sa moitié gauche a fait comparer des
  colonnes qui n'intégraient pas les mêmes lignes ;
- les **étiquettes de débogage** de `showTileBoundaries`, tracées en blanc en
  haut à gauche de chaque tuile, ont fabriqué un dégradé gauche→droite de
  −20 % qui n'existait pas ;
- une zone d'analyse restreinte aux colonnes centrales a « prouvé » qu'un
  défaut avait disparu, alors qu'il n'affectait que les colonnes de bord.

Chaque fois, le chiffre était juste et la conclusion fausse. **Avant de
conclure, se demander ce que la fenêtre de mesure exclut.**

Et une quatrième, au portage du viewer : une sonde lisait des pixels *dans* le
canevas et y trouvait bien du relief — ce qui prouvait que le canevas rendait,
pas que la carte occupait la page. Elle en faisait 300 px de haut sur 1 270
(piège 39). La mesure avait raison ; elle ne portait simplement pas sur la
question posée, qui était « pourquoi l'écran est-il noir ».

Et une cinquième, au premier déploiement : tout avait été vérifié en local, sur
un serveur de développement qui n'est pas celui de la production. Le défaut
vivait précisément dans l'écart entre les deux (piège 40). Une vérification qui
n'interroge jamais l'hôte réel ne dit rien de l'hôte réel.

Et une sixième, en comparant deux montages de sources : le compteur de 404
était remis à zéro **après** le déplacement, donc la fenêtre excluait exactement
les requêtes à compter. Les deux montages sortaient à zéro, et la conclusion
aurait été qu'ils ne diffèrent pas — alors que l'un réclame seize tuiles
inexistantes et l'autre aucune.

## Lire la console avant de sonder

Trois heures de rétro-ingénierie du moteur de rendu de MapLibre pour arriver à
une conclusion que la bibliothèque affichait elle-même :

```
You are using the same source for a hillshade layer and for 3D terrain.
Please consider using two separate sources to improve rendering quality.
```

## Ce que le tuilage a mesuré, et qui a changé le code

| mesure | ce qu'elle a changé |
|---|---|
| *forward mapping* : **39,6 % de trous**, 27,9 % de collisions, jusqu'à 1 221 échantillons dans une cellule polaire | la cartographie inverse, seule praticable |
| bilinéaire → **blocs de 5 px** à −79° de latitude | Catmull-Rom, C¹, sur toute sortie dérivée |
| canal bleu de terrarium : **−60 % de volume** pour 4 mm de précision | canal B à zéro |
| poids réel d'une tuile : **129,6 Kio et non 40** | toutes les projections de volume étaient fausses d'un facteur 3,2 |
| autocorrélation du relief : demi-valeur à **491 km** | à z=1 le motif fait 4 px — le fBm ne tient pas la vue planétaire |

## Ce que l'hydrologie a mesuré, et qui a changé le code

**Le doublement de pointeurs rend tout tractable.** Résoudre les bassins prend
13 passes vectorisées au lieu de 8 192 pas à pas — 630 fois moins de travail.
L'accumulation, séquentielle par nature, se déplie par **profondeur** : deux
cellules de même profondeur ne peuvent pas s'alimenter.

**Les tableaux plats de zéros étaient un mur.** Compter les bassins par
`bincount` sur les racines produisait 2 Go remplis à 99,4 % de zéros — et il n'y
avait rien à découvrir, **les bassins sont les puits**, que le raster de
directions désigne déjà. Pic mémoire ramené de 8,13 Go à 1,65 Go.

**`writerecords`, jamais `write` en boucle.** Un facteur 82, parce que chaque
appel isolé engage sa propre transaction SQLite. Sur l'écriture complète :
411,7 s → 1,7 s.

---

# L'essai `H = 0,5`, et pourquoi il a été écarté

Le terrain paraissait plat en 3D. Diagnostic : la pente médiane du relief vaut
**0,3° à toutes les portées**, de 4 km à 900 km. C'est la signature d'un
exposant de Hurst égal à 1 — l'invariance d'échelle parfaite —, et aucun
changement de résolution n'y remédie.

L'exposant terrestre valant plutôt 0,5, on a régénéré la planète entière avec
`p = 2^(−1/2)`. Mesuré : `H = 0,499`, exactement la cible.

**Le résultat a été écarté sur pièces.** Le gain de lisibilité 3D était
marginal ; le coût hydrologique ne l'était pas :

| | `H = 1` | `H = 0,5` |
|---|---:|---:|
| bassins | 58 244 | **287 657** |
| réseau ≥ 5 000 km² | 186 317 cellules | **3 379** |
| ordre de Strahler max | 4 | **2** |
| fleuves | 19 162 | **370** |
| bassins polygonisés | 645 | **0** |

Un terrain plus rugueux à petite échelle a plus de minima locaux, donc plus de
cuvettes, donc rien qui draine. La couche des bassins devenait vide.

**Et le gain ne pouvait pas payer ce prix**, pour une raison qui n'a rien à voir
avec l'exposant : le relief n'est pas plat à cause de sa rugosité, il est plat
parce qu'à ce zoom et cette altitude de caméra son déplacement vertical vaut
quelques pixels quoi qu'on fasse. **La lisibilité 3D se règle à l'affichage** —
le curseur d'exagération du visualiseur — et le vrai remède est un zoom plus
profond dans le terminateur, de l'ordre de z=10. C'est le Lot 7.

## Ce que la tentative laisse quand même

Trois améliorations qui survivent au retour en arrière, parce qu'elles portent
sur la **méthode** et non sur la valeur :

- la persistance se **déduit** de l'exposant visé au lieu d'être saisie ;
- l'échelle du relief se **déduit du pic mesuré** au lieu d'une convention à 4σ
  — qui n'était juste que pour `p = 0,5`, et laissait dormir 21 % du budget de
  relief ;
- la graine sort d'une **procédure versionnée**, avec ses justifications.

Et un défaut de conception attrapé au passage : la calibration mesurait le pic
sur un échantillon de graines puis l'appliquait à celle qu'elle retenait. La
graine retenue étant plus extrême que l'échantillon, le terrain crevait le
plafond de relief. Chaque graine est désormais jugée avec **son propre** pic —
et c'est gratuit, la passe qui calcule le décalage rendait déjà les extrêmes.

## Ce qui se fabrique au déploiement, et pas à l'intégration

Les tuiles ne sont ni versionnées ni produites par `ci.yml` : elles se
fabriquent dans le workflow de déploiement, en **deux étapes séparables** —
obtenir le MNT, puis le tuiler — avec un cache indexé sur l'empreinte de
`calibration.json` et des cinq modules qui déterminent le résultat.

La séparation n'est pas cosmétique. Au Lot 7 le terrain sera défini à la main :
le MNT cessera d'être une sortie reproductible pour devenir un **actif**, et
c'est la première étape seule qui changera — « produire » deviendra
« récupérer ». Le tuilage, le cache et le site n'auront pas à bouger.

Le prix assumé : une régression du tuileur se voit au déploiement et non à
l'intégration. C'est ce qui justifie que la suite pytest couvre `tiles.py` et
`pyramid.py` plutôt que de se reposer sur un tuilage de bout en bout.

---

# Les dettes ouvertes

- **Aucun code versionné ne produit les `out/*.wkt`** dont le README a besoin
  pour déclarer les SCR dans QGIS. À intégrer à `export.py`.
- **`.claude/launch.json` est versionné avec des chemins absolus** : trois de
  ses quatre configurations sont inopérantes sur une autre machine.
- **`requirements.txt` épingle les bibliothèques mais pas l'interpréteur.** La
  version ne vit que dans le job `geo` de `ci.yml` ; rien n'empêche une machine
  locale d'installer les mêmes roues sur un autre Python — donc un autre GDAL.
- **L'anisotropie polaire du D8** est mesurée et documentée, pas corrigée : le
  remède professionnel est de traiter les calottes en stéréographique polaire.
- **`aeonir_gis/calibrate.py` porte des identifiants français** (`echelle`,
  `crans`, `rencontres`, `valeurs`, `par_cran`…), contre la règle du dépôt —
  code en anglais, commentaires en français.
- **L'artefact d'ombrage de MapLibre** — les colonnes de tuiles ne s'ombrent pas
  toutes pareil dès qu'une copie du monde entre dans le champ. Contourné en
  conditionnant le relief 3D au zoom, pas réparé.

---

# Les pièges

Les erreurs qui coûtent une demi-journée, rangées par fréquence. **La
numérotation est stable** : les nouveaux pièges s'ajoutent à la fin, on ne
renumérote pas — du code et des documents y renvoient.

1. **Ordre des axes.** `EPSG:4326` définit officiellement **latitude, longitude**.
   GeoJSON, MapLibre, PostGIS utilisent **longitude, latitude**. Selon la
   bibliothèque et sa version, la même chaîne donne l'un ou l'autre. Symptôme :
   des points dans l'océan Indien. Remède : `always_xy=True` en pyproj.

2. **Degrés traités comme des mètres.** Une distance euclidienne sur des degrés
   est fausse, et fausse différemment selon la latitude. Toujours projeter avant
   de mesurer, ou utiliser une fonction géodésique.

3. **XYZ vs TMS.** Y inversé → carte retournée verticalement. MBTiles stocke en
   TMS, MapLibre consomme en XYZ.

4. **`GT[5]` positif.** La taille de pixel en Y doit être négative dans le cas
   normal. Positive → image à l'envers.

5. **Nodata dans un calcul.** Une moyenne qui avale des −9999 donne n'importe
   quoi. Masquer avant d'agréger.

6. **Interpolation sur des catégories.** Rééchantillonner une carte de biomes en
   bilinéaire crée des biomes qui n'existent pas. Plus proche voisin, toujours.

7. **Transformation de datum implicite.** Il en existe plusieurs, d'exactitudes
   différentes ; le résultat dépend des grilles installées. À documenter.

8. **La tuile vectorielle prise pour la vérité.** Géométrie quantifiée sur 4096
   unités, clippée, attributs partiels. La source de vérité est le GeoPackage.

9. **PROJ ignore silencieusement les paramètres inconnus.** Vérifié sur
   PROJ 9.5.1 : `+c=6300000`, `+axis_rot=45` et `+ceci_nexiste_pas=42` sont
   acceptés sans erreur et sans le moindre effet sur le résultat. **Une chaîne
   `+proj=` qui ne lève pas d'exception ne prouve rien sur ce qu'elle fait.**
   Toujours contrôler la sortie, jamais la syntaxe.

10. **`ob_tran` avec `+o_proj=longlat` renvoie des radians.** Rien dans la chaîne
    ne l'annonce. Les sorties métriques (`eqc`, `merc`) se comportent
    normalement.

11. **`ob_tran` est sphérique par construction.** L'ellipsoïde passé en paramètre
    est ignoré — écart mesuré nul à la précision machine entre `+ellps=WGS84` et
    `+R=6378137`. Pour de l'oblique réellement ellipsoïdal, il faut `omerc`
    (Hotine), qui incline la *projection* et non l'ellipsoïde.

12. **Le garde-fou du corps céleste, et sa dérogation trompeuse.** PROJ refuse de
    transformer entre un SCR non terrestre et un SCR terrestre : *« Source and
    target ellipsoid do not belong to the same celestial body »*. Le refus est
    **correct**. La dérogation `PROJ_IGNORE_CELESTIAL_BODY=YES` existe et ne
    répare rien : mesurée, elle produit un `Ballpark geographic offset`,
    c'est-à-dire l'identité — `(60, 45) → (60, 45)`. Elle superpose deux mondes
    en prétendant que leurs rayons sont égaux.

13. **Plus proche voisin + opérateur de dérivée = maillage fantôme.** En zoom
    avant, le plus proche voisin fait de chaque pixel un plateau constant. La
    pente y vaut zéro et explose à la frontière : l'ombrage dessine alors la
    grille de pixels en cernes noirs et blancs. Ce ne sont pas les marches qui
    sont grandes — quelques mètres entre voisins sur Aeonir — c'est le diviseur
    qui rétrécit du facteur de zoom : 0,31° de pente réelle affichée à 4,71° au
    zoom ×15. **Tout produit dérivé** — pente, exposition, courbure, **D8** —
    partage cette sensibilité. Corollaire dur : l'hydrologie tourne sur la
    grille native, jamais sur un raster reprojeté ou rééchantillonné.

14. **L'étirement de contraste calculé sur l'emprise visible.** Défaut de QGIS.
    La rampe se recalcule à chaque déplacement, donc deux endroits de même
    altitude n'ont pas la même couleur, et le contraste local révèle des
    artefacts invisibles à l'échelle globale — sur Aeonir, une marche de 10 m
    vaut 0,14 niveau de gris sur la plage complète et 2,3 niveaux sur une
    fenêtre de 140 km. Régler *Étendue* sur **emprise entière**.

15. **La reprojection vectorielle ne densifie pas.** Seuls les *sommets* sont
    transformés ; ils restent reliés par des segments droits. Un parallèle
    stocké comme une ligne à deux sommets devient une corde rectiligne dans le
    repère cible. Densifier **avant** reprojection. Le raster n'a pas ce
    problème : chaque pixel étant transformé isolément, la courbure sort seule.

16. **L'enroulement à l'antiméridien.** Une géométrie dont deux sommets
    consécutifs tombent de part et d'autre de ±180° est dessinée en reliant
    `+179` à `−179` *à travers* la carte. Symptôme : de longues droites
    horizontales traversant toute la vue. C'est le pendant vectoriel de la
    couture que le raster évite en échantillonnant en 3D — le vecteur l'a parce
    qu'il porte de la **topologie** entre ses sommets.

    ⚠️ **Et l'antiméridien qui compte est celui du repère d'AFFICHAGE, pas celui
    du fichier.** Découper une fois ne met à l'abri de rien : une géométrie
    propre dans son repère natif est déchirée dès qu'un autre SCR la reprojette,
    puisque son antiméridien tombe ailleurs sur le globe. Vérifié sur le
    GeoPackage d'Aeonir, découpé en Croûte : affiché en repère Étoile, 18
    tronçons et 5 anneaux de bassin repartent en sauts de 360°, à des latitudes
    qui prédisent au pixel près les bandes observées. **Le découpage est un
    produit dérivé du repère de rendu**, au même titre que les tuiles.

    Corollaire qui n'est pas évident : le clippage par tuile du MVT **n'absorbe
    pas** le problème, alors même que l'antiméridien est une frontière de tuile.
    Le segment reliant `+179` à `−179` traverse, en espace tuile, toutes les
    tuiles de sa ligne, et le clippage y dépose un éclat dans chacune. Couper au
    niveau du repère **avant** de tuiler.

17. **Le facteur Z d'ombrage en SCR géographique.** Les pixels sont en degrés,
    les altitudes en mètres : sans facteur correctif, le calcul de pente divise
    des mètres par des degrés et l'image sort noire. Le facteur neutre vaut
    `1/(mètres par degré)`, donc **1,2 × 10⁻⁵ sur Aeonir** contre 9 × 10⁻⁶ sur
    Terre. Il est **propre à la planète** : recopier la valeur terrestre écrase
    le relief d'un tiers.

18. **Un SCR de fichier n'est pas un SCR enregistré.** Un WKT porté par l'en-tête
    d'un GeoTIFF est lu et utilisé pour la couche, mais n'entre pas dans la base
    de SCR du logiciel : il n'apparaît dans aucun sélecteur. Même racine que le
    `to_authority()` qui renvoie `None` alors qu'`ID["AEONIR",1]` survit dans le
    WKT — ces API interrogent la **base de données**, pas le nœud `ID`. Pour
    qu'un SCR maison soit choisissable, il faut le déclarer séparément.

19. **Espérance nulle n'est pas moyenne d'échantillon nulle.** Un générateur
    « à moyenne nulle par construction » l'est en *espérance* ; une réalisation
    donnée ne l'est pas. Sur Aeonir le décalage d'un tirage a un écart-type de
    plusieurs centaines de mètres — chiffres exacts dans `calibration.json`,
    champs `offset_std_m` et `offset_worst_m`. Vérifier la propriété sur la
    réalisation, pas sur la théorie.

20. **Moyenne par pixel ≠ moyenne par aire.** Sur une grille équirectangulaire,
    un pixel polaire couvre `cos φ` fois moins de sol qu'un pixel équatorial.
    Sur le MNT d'Aeonir l'écart atteint deux ordres de grandeur. C'est la
    seconde qui juge un datum. Pondérer par `cos φ`.

21. **Le pilote COG de GDAL ne sait que `CreateCopy`.** Impossible d'ouvrir un
    COG en écriture pour le remplir fenêtre par fenêtre. Il faut écrire un
    GeoTIFF tuilé ordinaire puis le recopier — c'est cette recopie qui construit
    les aperçus et remonte l'en-tête en tête de fichier, les deux propriétés qui
    rendent le COG lisible par requêtes HTTP Range.

22. **Le D8 sur la plus forte dénivelée au lieu de la plus forte pente.** Il faut
    diviser par la distance au voisin, et ce n'est pas une correction sphérique :
    **la diagonale est √2 fois plus longue**, donc comparer des dénivelées brutes
    la privilégie systématiquement, même sur une grille projetée parfaitement
    carrée. Mesuré sur Aeonir : les deux méthodes divergent sur **35 % des
    cellules à l'équateur**, là où le `cos φ` ne joue pourtant aucun rôle.

23. **L'anisotropie polaire d'une grille géographique.** Le pas E-O vaut
    `cos φ` fois le pas N-S : sur Aeonir, 16,9 m contre 7 325 m à 89,87°, un
    facteur 434. La grille résout la direction tangentielle absurdement finement
    et la méridienne grossièrement, ce qui étire les bassins en bandes zonales —
    la part d'écoulement restant dans sa ligne passe de 28,7 % à l'équateur à
    51,6 % près du pôle. Ce n'est pas un bug du D8, c'est la grille : le remède
    professionnel est de traiter les calottes dans une **projection
    stéréographique polaire**, où les cellules redeviennent isotropes.

    ⚠️ Piège de diagnostic rencontré : classer les directions en « zonal /
    méridien / diagonal » **ment près du pôle**, où le voisin sud-est est à 17 m
    à l'est pour 7 325 m au sud — donc méridien à 99,8 %. Mesurer si la cellule
    **change de ligne**, pas quelle étiquette porte sa direction.

24. **Un `PROJCRS` ne peut pas se bâtir sur un CRS géographique dérivé.** PROJ
    exige une base portant un `DATUM` ; une base obtenue par rotation de pôle
    n'en a pas, et la tentative rend `Missing DATUM or ENSEMBLE node`. Il n'y a
    donc pas de « Mercator Étoile », et le gauchissement en une passe vers un
    repère dérivé est impossible. Bonne nouvelle déguisée : la cartographie
    inverse, qui reste seule praticable, divise par deux le nombre
    d'interpolations.

25. **La donnée et la transformation vont en sens opposés.** Tout
    rééchantillonnage d'image itère sur les pixels de **destination** et demande
    d'où ils viennent — donc on emploie `star_to_crust` alors que la donnée va
    Croûte → Étoile. Le sens direct (*forward mapping*) ne marche pas : mesuré
    avec **40 % de pixels source de plus** que de cases de destination,
    **39,6 % des cellules restent vides** et 27,9 % en reçoivent plusieurs,
    jusqu'à 1 221 pour la pire — les pôles géographiques. Corollaire de lecture
    de code : dans une paire aller/retour, **c'est souvent la réciproque qui
    travaille**, l'aller ne servant qu'aux contrôles.

26. **Le bilinéaire ne suffit pas dès qu'on va DÉRIVER le résultat.** Il est
    C⁰ : sa dérivée est constante dans chaque cellule source et saute aux
    frontières. Un ombrage étant une dérivée, il dessine ces frontières en
    **blocs rectangulaires** de la taille du pixel source — cinq pixels mesurés
    à −79° de latitude, là où Mercator étire la latitude. Catmull-Rom est C¹ et
    l'artefact disparaît **à source identique**. Vaut pour toute sortie dérivée :
    ombrage, pente, exposition, courbure. ⚠️ Contrepartie d'un noyau cubique :
    il dépasse légèrement près d'une rupture de pente.

27. **Lire la source à la résolution du niveau, pas en pleine résolution.**
    Contre-intuitif : la pleine résolution rend le résultat *pire* — du
    crénelage à la place des blocs — parce qu'un pixel de destination couvre
    alors des centaines de pixels source dont l'interpolation n'en regarde que
    quatre. Lire à la bonne taille fait choisir à GDAL l'aperçu adapté du COG,
    qui est en moyenne. ⚠️ L'écart mesuré ici n'est que de 1,6 % de σ, mais
    **parce que ce terrain-ci est lisse** : ne pas généraliser.

28. **Une ligne qui remplit l'étendue mondiale ne survit pas au retuilage
    GeoJSON.** Symptôme : les parallèles ne s'affichaient que dans les tuiles
    `x = 0`, alors que les méridiens s'affichaient partout. La source GeoJSON de
    MapLibre duplique les entités dans les **copies du monde**, et cette
    duplication n'opère qu'en longitude — d'où l'asymétrie entre les deux
    familles. **Tracer les parallèles par tronçons**, comme le font les vraies
    graticules.

29. **`line-dasharray` n'est pas pilotable par entité.** Le motif est rendu via
    une texture construite **par calque**, donc un `["get", …]` y est refusé à
    la validation — alors que `line-color` et `line-width` l'acceptent.
    Contournement : deux calques et un filtre.

30. **MapLibre 6 est ESM uniquement.** Plus de bundle UMD, plus de variable
    globale `maplibregl`, et **aucun export `default`** : il faut
    `import * as maplibregl`. Corollaire — un module ES ne se charge **jamais**
    depuis `file://`, l'origine y étant opaque et la requête n'étant pas HTTP.
    Toute page qui en importe exige un serveur statique.

31. **Ne pas comparer une jointure de tuiles à la moyenne d'une tuile.** En
    Mercator l'espacement des lignes varie du simple au décuple entre le haut et
    le bas d'une tuile ; l'écart médian sous-estime donc la référence locale et
    fait conclure à une couture inexistante — rapports de 2,5 à 3,3 obtenus
    ainsi. La bonne référence est l'écart entre les **deux dernières lignes**, à
    la même latitude : les vingt jointures testées retombent alors entre 0,89 et
    1,14. Vaut au-delà du tuilage — **une mesure de discontinuité n'a de sens
    que contre une référence prise au même endroit.**

32. **La circonférence terrestre est en dur dans le nuanceur d'ombrage de
    MapLibre.** La constante `28.2562` du nuanceur de préparation vaut
    `log₂(8 × 40 075 016,7)` — vérifié à 0,1 ppm. Aucun uniforme ne l'expose.
    Sur une planète d'un autre rayon, **toute pente est donc sous-estimée du
    rapport des circonférences** : 1,3357 sur Aeonir, exactement le facteur que
    `terrain.exaggeration` corrige pour le relief 3D. ⚠️ Et la correction est
    **inapplicable** : `hillshade-exaggeration` plafonne à 1 dans la spec.

    Second terme, plus visible : le nuanceur applique une exagération propre,
    fonction du zoom de la tuile, qui va de **×64 à z=0 à ×6,5 à z=6** — un
    facteur 9,85 — avec une rupture de 33 % à `u_zoom = 4,5`. Non physique,
    délibérée, et corrigeable par une expression de zoom sur
    `hillshade-exaggeration`.

33. **Le terrain 3D de MapLibre réquisitionne la source qu'il vise.** Le
    gestionnaire de terrain fait `deltaZoom = 1` puis
    `tileManager.tileSize = source.tileSize × 2`, ce qui **mute la source** :
    le niveau de tuile, `round(zoom + log₂(512/tileSize))`, recule d'un cran
    pour tout ce qui la consomme. Symptôme : activer le relief 3D change le
    nombre de tuiles à l'écran sans que le zoom bouge, et l'ombrage perd la
    moitié de sa résolution en gagnant 2,07× de contraste.

    Remède, que MapLibre réclame lui-même en console : **une source dédiée au
    terrain**, sur le même jeu de fichiers.

34. **Un maillage de terrain est plat au repos.** Le tampon de sommets est une
    grille régulière sans altitude ; le déplacement est appliqué **dans le
    nuanceur de sommets**, qui lit le MNT en texture. La géométrie rasterisée
    est donc bien 3D — profondeur, occlusion, jupes de raccord aux bords de
    tuile — mais ce qu'on peint dessus est une **texture 2D** de la carte
    drapée, sans aucune lumière calculée sur les normales du maillage.

    Conséquence pratique : activer un relief 3D ne change pas l'ombrage, qui
    était déjà calculé en 2D. Sans caméra inclinée, il ne reste qu'un changement
    d'éclairage global — d'où l'impression que la fonction « ne fait rien ».

35. **Un fBm à persistance `p` et lacunarité `l` a un exposant de Hurst
    `H = −log p / log l`, et c'est lui qui gouverne l'aspect.** À `H = 1` le
    relief est invariant d'échelle : la pente est la même à 4 km et à 900 km, et
    zoomer ne le rend jamais plus escarpé. Aucun réglage de résolution ni
    d'affichage ne corrige une pente moyenne trop faible — seuls l'exposant, ou
    une exagération assumée, le font.

    ⚠️ L'identité vaut pour la cascade **idéale**. Un fBm à dix octaves n'en est
    qu'une approximation, et l'écart grandit avec `H` : mesuré 0,499 pour une
    cible de 0,5, mais 0,884 pour une cible de 1,0 — à `H` élevé, ce sont les
    octaves basses qui portent l'énergie, précisément celles que la fréquence de
    base tronque.

36. **Bundlé, MapLibre 6 ne trouve plus son worker — et ne le dit pas.** La
    bibliothèque déduit l'URL de son worker de son propre `import.meta.url`, et
    abandonne si ce n'est pas une URL `http` : `new Worker("")` se résout alors
    contre le document, et le navigateur reçoit du HTML là où il attendait un
    module. Symptôme : la carte se construit, le canevas apparaît, `getZoom()`
    répond — mais le style n'est **jamais** analysé, puisque c'est le travail du
    worker. `isStyleLoaded()` reste indéfiniment `false`, `getStyle()` ne rend
    rien, et **aucune erreur ne remonte à `map.on("error")`**. Remède :
    `setWorkerUrl()`, qui l'emporte sur la déduction, et servir
    `maplibre-gl-worker.mjs` **avec son voisin `maplibre-gl-shared.mjs`**, que
    le worker importe en relatif.

    Le prototype vanilla n'y était pas exposé : chargé en module depuis
    `node_modules/`, son `import.meta.url` était bien une URL `http`.

37. **Un onglet non composé ne rend pas MapLibre — et ça ressemble à une
    panne.** `Style.loadJSON` attend une frame d'animation avant d'analyser le
    style. Dans un onglet masqué, en arrière-plan, ou dans un volet que rien
    n'affiche, `requestAnimationFrame` ne tourne pas : le style reste en
    suspens, exactement comme au piège 36. Vérifier `document.visibilityState`
    **avant** d'accuser le code.

    Corollaire d'outillage : sous SwiftShader, une capture d'écran ne composite
    pas le canevas WebGL — elle rend du noir alors que le tampon de dessin
    contient l'image. Une capture ne prouve donc rien ; `gl.readPixels()`
    appelé pendant l'événement `render`, si.

38. **Un `width: 100%` dans une boîte à largeur adaptative gonfle la boîte.**
    Le panneau du visualiseur, positionné en absolu sans largeur posée, mesurait
    672 px pour un titre de 171 px : ses boutons en `width: 100%` faisaient
    résoudre le pourcentage contre la largeur *disponible*, pas contre le
    contenu. Poser une largeur explicite casse la circularité — et un cadran
    d'instrument a de toute façon une largeur, contrairement à un bloc de texte.

39. **MapLibre pose sa classe sur VOTRE conteneur, et sa feuille gagne.** Le
    div qu'on lui donne reçoit `maplibregl-map`, et la feuille de la
    bibliothèque déclare `.maplibregl-map { position: relative }`. À
    spécificité égale — deux classes simples — c'est l'**ordre d'injection** qui
    tranche, et celui d'un bundler ne se décrète pas. Un conteneur en
    `position: absolute; inset: 0` repasse donc en `relative`, cesse d'être
    dimensionné, et tombe à **hauteur 0** ; MapLibre retombe alors sur la
    hauteur par défaut d'un `<canvas>`, 300 px, et la page est noire alors que
    `isStyleLoaded()` répond `true` et que les tuiles sont chargées.

    Un sélecteur descendant (`.sig .sig-map`) suffit. Le prototype vanilla n'y
    était pas exposé : il ciblait `#map`, un id, qui bat toute classe — le
    portage a donc *introduit* le défaut en traduisant un id en classe.

40. **`.mjs` n'est pas servi par tout le monde — et le développement ne peut
    pas le montrer.** nginx ne connaît pas cette extension et sert le fichier
    en `application/octet-stream`, que le navigateur REFUSE pour un script de
    module. Le worker de MapLibre échoue donc à se charger, le style n'est
    jamais analysé, et la page est noire — le piège 36 exactement, par une
    autre cause. Or le serveur de développement de Next répond
    `application/javascript` : **aucun test local, si complet soit-il, ne peut
    révéler ce défaut.**

    Deux remèdes possibles, et le choix n'est pas indifférent. Déclarer le type
    dans nginx suppose d'atteindre sa configuration — ici elle vit à la main
    sur le VPS, la CI ne synchronisant que le contenu du site — et ne protège
    que cet hôte-là. Servir les fichiers en `.js` supprime la question partout.
    Le second a été retenu ; il exige de réécrire l'import relatif que le
    worker fait vers son voisin.

    L'enseignement dépasse MapLibre : **une route servie par un hôte statique
    configuré hors du dépôt n'est vérifiée que contre cet hôte.** Le test qui
    compte est celui qui interroge la production, et il doit exister.

41. **Ce n'est pas une source qui coûte, c'est une couche.** Une source que plus
    aucune couche visible ne vise tombe à **zéro tuile** — vérifié en masquant
    ses couches, et vrai aussi de la source dédiée au terrain tant que le relief
    3D est éteint. Déclarer des sources est donc gratuit. En revanche **chaque
    couche `hillshade` visible fait sa propre passe hors écran** : elle calcule
    les dérivées du MNT dans une texture, puis la composite.

    Conséquence directe, et coûteuse à voir : deux couches d'ombrage qui se
    recouvrent géographiquement **s'additionnent**. Un fond grossier suragrandi
    sous un relief net ne l'enrichit pas, il le dilue — mesuré dans la bande,
    moyenne 27,1 avec le fond contre 14,5 sans, à détail fin inchangé.

    Le remède s'écrit donc en **couches**, jamais en sources : `minzoom` et
    `maxzoom` de couche pour exclure en zoom, et autant de sources que
    nécessaire pour découper en latitude — `bounds` étant une boîte, « partout
    sauf cette bande » demande deux emprises.

42. **Le zoom de la carte n'est pas le niveau de tuile.** Avec des tuiles de
    256 px, MapLibre sert le niveau `round(zoom + 1)` : la source de bande, dont
    le `minzoom` vaut 5, ne rend rien jusqu'à un zoom de carte de 3,4 et sert du
    z=5 dès 3,6. Placer un seuil de couche sur `split_zoom` — un niveau de
    tuile — décalerait donc le relais d'un cran entier, et ouvrirait un trou ou
    un recouvrement selon le sens de l'erreur.

    La règle : un seuil qui sépare des **couches** se mesure en zoom de carte,
    et se vérifie en balayant le zoom plutôt qu'en le dérivant.

43. **L'éclairage d'un `hillshade` est un uniforme, pas un champ.** La
    spécification donne à `hillshade-illumination-direction` comme à
    `-altitude` le `property-type` `data-constant`, avec `zoom` pour seul
    paramètre d'expression : une couche porte **un seul soleil** pour toute la
    carte, et rien ne permet de le faire varier avec la position.

    Gênant sur un monde verrouillé par les marées, où la latitude EST
    l'élévation de l'astre. La sortie retenue — recalculer l'angle sur le centre
    de la vue à chaque déplacement — n'est pas exacte au pixel, mais elle est
    exacte là où l'on regarde, et elle rend sensible le fait qui définit le
    monde. Assumer une contrainte vaut mieux que la maquiller.

44. **`hillshade-method: "standard"` ignore l'altitude du soleil.** De 80° à 5°,
    rendu identique à l'octet près. `igor` l'ignore aussi ; `basic`,
    `multidirectional` et `combined` la lisent. Un réglage sans effet n'est donc
    pas forcément un réglage cassé : il peut être branché sur un algorithme qui
    ne le consomme pas. Croiser les deux avant de conclure.

45. **Sans lumière diffuse, un éclairage rasant est noir.** À 11° d'élévation,
    l'angle réel au bord du terminateur, l'amplitude du rendu tombe à 6,7
    niveaux sur 255 ; en relevant la seule couleur d'ombre — qui *est* le terme
    atmosphérique — elle remonte à 62,3, au-dessus de ce que donne la méthode
    neutre à n'importe quel angle.

    On avait conclu que la platitude du terrain interdisait l'angle physique.
    C'était l'absence d'air. **Un modèle d'éclairage incomplet se diagnostique en
    défaut du sujet.**

    Corollaire trouvé en corrigeant : l'atmosphère ne fabrique pas de lumière,
    elle en diffuse. Éteindre l'astre sans réduire le terme diffus donne une
    nuit aussi claire que le jour.
