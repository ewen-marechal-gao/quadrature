# Aeonir — Paramètres Astronomiques

> Généré le 2026-06-08

## Paramètres d'entrée

| Paramètre | Valeur |
|:---|---:|
| **Demi-grand axe** | **17.5 AU** |
| Masse étoile | 1.8 M☉ |
| Luminosité étoile | 300 L☉ *(×27.4 L_SM)* |
| Circonférence planète | 0.7486 × C⊕ = 30000 km |
| Densité planète | 0.997 × ρ⊕ = 5497 kg/m³ |
| Inclinaison axiale | 3.0° |
| Largeur terminateur | 1500 km |
| Traversée cible | 100 ans à 45° |
| Période lunaire | 30 h |
| Rayon lune | 300 km *(rayon)* |

## Étoile

| Grandeur | Valeur |
|:---|---:|
| Type spectral *(approx.)* | K0–K2 III |
| Masse | 1.8 M☉ |
| Luminosité | 300 L☉ |
| T_eff *(estimé, géante K)* | 5010 K (λ_max ≈ 578 nm) |
| Luminosité SM (1.4 × M^3.5) | 11.0 L☉ |
| Zone habitable SM *(approx.)* | 3.31 AU |
| Zone habitable géante (√L) | 17.32 AU |
| Durée de vie SM *(approx.)* | 2300 Ma |

## Planète

| Grandeur | Valeur |
|:---|---:|
| Circonférence | 0.7486 × C⊕ = 30000 km |
| Rayon *(dérivé)* | 4774.7 km (0.749 R⊕) |
| Densité | 0.997 × ρ⊕ = 5497 kg/m³ |
| Masse *(dérivée)* | 0.420 M⊕ |
| **Gravité surface** | **7.338 m/s²** (0.748 g⊕) ✓ |

## Orbite

| Grandeur | Valeur |
|:---|---:|
| Demi-grand axe | 17.5 AU |
| Excentricité | 0.20 |
| Périhélie | 14.00 AU |
| Aphélie | 21.00 AU |
| Zone habitable (flux moyen corrigé) | 17.32 AU (écart : +0.0 %) ✓ |
| **Période orbitale T_orb** | **54.57 ans** = 19930 jours |
| Inclinaison axiale | 3.0° |

## Asymétrie polaire — Excentricité

*Convention : le solstice d'été du Pôle Nord coïncide avec le périhélie (e = 0.20).*

| Grandeur | Pôle Nord *(été au périhélie)* | Pôle Sud *(été à l'aphélie)* |
|:---|---:|---:|
| Distance solstice d'été | 14.00 AU | 21.00 AU |
| Flux au solstice | ×1.562 F₀ | ×0.694 F₀ |
| **Durée été polaire** | **20.4 ans** (37.4 %) | **34.2 ans** (62.6 %) |
| Flux moyen estival | ×1.366 F₀ | ×0.815 F₀ |

Rapport d'intensité Nord/Sud : **×2.25** au solstice — ×1.68 en moyenne estivale.

> Les deux pôles reçoivent la **même énergie totale** pendant leur été (loi des aires — l'angle balayé est π dans les deux cas). La différence est dans l'**intensité** : le Pôle Sud n'atteint jamais le seuil de fusion des glaces profondes. F₀ = flux à orbit_au en orbite circulaire.

## Rotation — Quasi-verrouillage

Le **jour solaire T_solar** est dérivé de la contrainte de traversée du terminateur, indépendamment de T_orb. La **rotation sidérale T_rot** en est déduite.

| Grandeur | Valeur |
|:---|---:|
| Vitesse terminateur (éq.) | 21.21 km/an = 58.1 m/jour |
| **Jour solaire T_solar** | **1414 ans** |
| Rotation sidérale T_rot | 56.76 ans (Δ = 4.0 % vs T_orb) |
| Traversée terminateur (éq.) | 71 ans |
| Traversée terminateur (45°) | 100 ans ✓ |
| Traversée terminateur (60°) | 141 ans |
| Dérive apparente du soleil | 0.2546 °/an (20.4° sur 80 ans) |

### Deux mécanismes de saisons

| Mécanisme | Période | Saison | Affecte |
|:---|---:|---:|:---|
| Orbital (inclinaison 3.0°) | 54.6 ans | **27.3 ans** | Pôles géographiques (φ = 90°) |
| Rotationnel (T_solar) | 1414 ans | 707 ans | Régions ~75–85° (par longitude) |

## Lune / Satellite

| Grandeur | Valeur |
|:---|---:|
| Période orbitale | 30 h (= 1 Cycle) ✓ |
| Rayon orbital | 36699 km (altitude : 31924 km) |
| Rayon | 300 km *(Bookstack indique « 300 km de diamètre » — ambigu)* |
| **Diamètre apparent** | **56.2'** (1.78× Lune terrestre) ✓ |
| Densité | 3000 kg/m³ |
| Gravité surface | 0.2516 m/s² |
| Limite de Roche | 14350 km < 36699 km ✓ stable |

## Système de temps — Base 6

| Unité | Durée |
|:---|---:|
| **1 Ère** | **54.57 ans** = 15944 Cycles |
| 1 Phase | 181.2 jours (Ère / 110) |
| 1 Hexade | 30.20 jours (Phase / 6) |
| 1 Cycle | 30 h = orbite lunaire ✓ |
| 1 Ronde | 5.00 h (Cycle / 6) |
| 1 Moment | 83.333 s |
| 1 Instant | 13.8889 s |
| 1 Battement | 2.3148 s |

**Pendule standard** (T = 1 Battement, g = 7.338 m/s²) : L = 0.9960 m ✓

## Bilan des objectifs

| | Objectif | Résultat |
|:---:|:---|:---|
| **✓ [1]** | Quasi-verrouillage gravitationnel | T_rot = 56.8 ans, T_orb = 54.6 ans (Δ = 4.0 %). T_solar = 1414 ans. |
| **✓ [2]** | Lune : période ≈ journée humaine | 1 Cycle = 30 h (1.25× jour terrestre) |
| **✓ [3]** | Lune : grand diamètre apparent | Diamètre apparent = 56.2' = 1.8× Lune terrestre |
| **✓ [4]** | Traversée terminateur ~100 ans à 45° | t(éq.) = 71 ans | t(45°) = 100 ans | t(60°) = 141 ans |
| **✓ [5]** | Saisons polaires longues et asymétriques | Nord (périhélie) : **20.4 ans** ×1.37 F₀ | Sud (aphélie) : **34.2 ans** ×0.81 F₀ |
| **✓ [6]** | Gravité < g⊕ (gigantisme floral) | g = 7.338 m/s² = 0.748 g⊕ |

## Tableau récapitulatif

| Paramètre | Valeur | Unité |
|:---|---:|:---|
| Masse étoile | 1.8 | M☉ |
| Luminosité étoile | 300 | L☉ |
| T_eff étoile *(estimé)* | 5010 | K |
| Zone habitable géante (√L) | 17.32 | AU |
| Durée de vie étoile (SM) | 2300 | Ma |
| Demi-grand axe | 17.5 | AU |
| Excentricité | 0.20 |  |
| Périhélie / Aphélie | 14.00 / 21.00 | AU |
| **Période orbitale T_orb** | **54.57** | **ans** |
| Été polaire Nord (périhélie) | 20.4 — ×1.37 F₀ | ans |
| Été polaire Sud (aphélie) | 34.2 — ×0.81 F₀ | ans |
| Rotation sidérale T_rot | 56.76 | ans |
| Jour solaire T_solar | 1414 | ans |
| Circonférence planète | 0.7486 × C⊕ = 30000 | km |
| Rayon planète *(dérivé)* | 4774.7 | km |
| Masse planète *(dérivée)* | 0.420 | M⊕ |
| Gravité surface | 7.338 | m/s² |
| Inclinaison axiale | 3.0 | ° |
| Dérive terminateur (éq.) | 58.1 | m/jour |
| Période lunaire | 30 | h (= 1 Cycle) |
| Rayon orbital lune | 36699 | km |
| Rayon lune | 300 | km |
| Diamètre apparent lune | 56.2 | arcmin |
| Battement | 2.3148 | s |
| Pendule standard | 0.9960 | m |

