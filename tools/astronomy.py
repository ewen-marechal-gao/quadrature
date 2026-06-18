#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aeonir — Calculateur d'astronomie
Génère un rapport markdown : tools/aeonir_astronomy.md

Usage : python astronomy.py
Modifier les PARAMÈTRES LIBRES puis relancer.
"""

import math
import os
from datetime import date

# ══════════════════════════════════════════════════════════════
#  CONSTANTES PHYSIQUES
# ══════════════════════════════════════════════════════════════

G       = 6.674e-11
M_SUN   = 1.989e30
AU_M    = 1.496e11
YEAR_S  = 365.25 * 86400
M_EARTH = 5.972e24
R_EARTH = 6_371_000
G_EARTH = 9.807
C_EARTH_KM = 40_075.0   # km  (circonférence équatoriale terrestre)
RHO_EARTH  = 5_514.0    # kg/m³ (densité moyenne terrestre)

# ══════════════════════════════════════════════════════════════
#  PARAMÈTRES LIBRES  ← modifier ici
# ══════════════════════════════════════════════════════════════

# — Étoile —
# Géante K évoluée (type K0–K2 III, ~2.3 Ga de séquence principale)
# Couleur : orange-jaune (T_eff ≈ 4800–5000 K) → compatible photosynthèse au rétinal (~550–570 nm)
# Hypothèse Terre Pourpre : végétation reflète le rouge/pourpre (absorbe le vert)
# Sur la SM : L_SM ≈ 10.9 L☉, ZH à ~3.3 AU → planètes internes habitables pendant >2 Ga
# Phase géante (~200 Ma) : ZH s'étend à ~17.3 AU → Aeonir émerge de son gel
STAR_MASS_SOLAR = 1.8      # M☉  (masse → Kepler + durée de vie SM)
STAR_LUM_SOLAR  = 300.0    # L☉  (luminosité géante K — T_eff ≈ 4800 K)

# — Orbite —
SEMI_MAJOR_AXIS_AU = 17.5  # AU  ← paramètre primaire (détermine T_orb)
ECCENTRICITY       = 0.20  # e   (0 = circulaire)
                            #     Convention : été polaire Nord au périhélie
                            #     → Nord : court & intense | Sud : long & faible
HZ_TOLERANCE       = 0.15  # tolérance zone habitable (±15 %)

# — Planète —
# Paramètres en fraction des valeurs terrestres (masse = résultante, pas une entrée)
PLANET_CIRCUM_FRAC  = 0.7486  # × C⊕ (40 075 km)  → ~30 001 km de circonférence
PLANET_DENSITY_FRAC = 0.997   # × ρ⊕ (5 514 kg/m³) → ~5 498 kg/m³
AXIAL_TILT_DEG      = 3.0     # °

# — Terminateur —
TERMINATOR_WIDTH_KM   = 1_500.0  # km  (largeur zone habitable)
CROSSING_TARGET_YEARS =   100.0  # ans (traversée à la latitude cible, objectif 4)
CROSSING_LATITUDE_DEG =    45.0  # °

# — Lune —
MOON_PERIOD_H  = 30.0    # h  (= 1 Cycle)
MOON_RADIUS_KM = 300.0   # km (rayon)
MOON_DENSITY   = 3_000.0 # kg/m³

# — Système de temps —
PHASES_PER_ERE = 110

# ══════════════════════════════════════════════════════════════
#  CALCULS
# ══════════════════════════════════════════════════════════════

# ── Étoile ──────────────────────────────────────────────────
star_hz_au      = math.sqrt(STAR_LUM_SOLAR)
star_life_gyr   = 1e10 / STAR_MASS_SOLAR**2.5 / 1e9
star_life_myr   = star_life_gyr * 1e3
star_lum_ms     = 1.4 * STAR_MASS_SOLAR**3.5
star_evol_ratio = STAR_LUM_SOLAR / star_lum_ms  # 1.0 = SM pure, >1 = évoluée

# ── Planète ─────────────────────────────────────────────────
planet_circum_km = PLANET_CIRCUM_FRAC  * C_EARTH_KM        # km (paramètre primaire)
planet_density   = PLANET_DENSITY_FRAC * RHO_EARTH          # kg/m³
planet_radius_km = planet_circum_km / (2 * math.pi)         # km  (dérivé)
planet_radius    = planet_radius_km * 1e3                   # m
planet_volume    = (4/3) * math.pi * planet_radius**3
planet_mass      = planet_density * planet_volume
planet_g         = G * planet_mass / planet_radius**2

# ── Orbite ──────────────────────────────────────────────────
orbit_au        = SEMI_MAJOR_AXIS_AU
orbit_period_yr = math.sqrt(orbit_au**3 / STAR_MASS_SOLAR)
orbit_period_d  = orbit_period_yr * 365.25
hz_delta_pct    = 100 * (orbit_au - star_hz_au) / star_hz_au
in_hz           = abs(hz_delta_pct) < HZ_TOLERANCE * 100

# Saisons polaires via mécanisme orbital (inclinaison × orbite)
polar_season_yr = orbit_period_yr / 2

# ── Excentricité & asymétrie polaire ────────────────────────
# θ=0 au périhélie = solstice d'été du Pôle Nord (convention)
# La loi des aires donne des étés de durée inégale, mais d'énergie totale égale.
perihelion_au   = orbit_au * (1 - ECCENTRICITY)
aphelion_au     = orbit_au * (1 + ECCENTRICITY)
flux_peri       = (orbit_au / perihelion_au) ** 2   # ×flux_circulaire au périhélie
flux_aph        = (orbit_au / aphelion_au)   ** 2   # ×flux_circulaire à l'aphélie
flux_pole_ratio = flux_peri / flux_aph               # = ((1+e)/(1-e))²

if ECCENTRICITY > 0:
    _e  = ECCENTRICITY
    _E  = 2 * math.atan(math.sqrt((1 - _e) / (1 + _e)))  # anomalie excentrique à θ=π/2
    _M  = _E - _e * math.sin(_E)                           # anomalie moyenne à θ=π/2
    north_summer_frac = _M / math.pi   # fraction de T_orb (été Nord = autour du périhélie)
else:
    north_summer_frac = 0.5
south_summer_frac = 1.0 - north_summer_frac
north_summer_yr   = north_summer_frac * orbit_period_yr
south_summer_yr   = south_summer_frac * orbit_period_yr

# Flux moyen pendant chaque été polaire (relatif au flux circulaire à orbit_au)
# Énergie totale = identique pour les deux pôles ; seule l'intensité diffère.
_ecc_f            = math.sqrt(1 - ECCENTRICITY ** 2)
flux_north_summer = 1.0 / (2 * north_summer_frac * _ecc_f)
flux_south_summer = 1.0 / (2 * south_summer_frac * _ecc_f)

# ZH corrigée de l'excentricité (flux moyen annuel ∝ 1/√(1−e²))
orbit_au_eff     = orbit_au * (1 - ECCENTRICITY ** 2) ** 0.25
hz_delta_eff_pct = 100 * (orbit_au_eff - star_hz_au) / star_hz_au
in_hz_eff        = abs(hz_delta_eff_pct) < HZ_TOLERANCE * 100

# ── Terminateur & quasi-verrouillage ────────────────────────
#
# Le jour solaire (T_solar) est dérivé de l'objectif traversée terminateur,
# indépendamment de T_orb. La rotation sidérale T_rot en découle.
# Condition de cohérence : T_orb << T_solar.

lat_rad         = math.radians(CROSSING_LATITUDE_DEG)
v_term_eq_km_yr = TERMINATOR_WIDTH_KM / (CROSSING_TARGET_YEARS * math.cos(lat_rad))
solar_day_yr    = planet_circum_km / v_term_eq_km_yr
v_term_m_day    = v_term_eq_km_yr * 1000 / 365.25

quasi_lock_ok = orbit_period_yr < solar_day_yr * 0.5
if quasi_lock_ok:
    rot_period_yr  = orbit_period_yr * solar_day_yr / (solar_day_yr - orbit_period_yr)
    lock_delta_pct = 100 * (rot_period_yr - orbit_period_yr) / orbit_period_yr
else:
    rot_period_yr  = float("nan")
    lock_delta_pct = float("nan")

def t_cross_at_lat(phi_deg):
    return TERMINATOR_WIDTH_KM / (v_term_eq_km_yr * math.cos(math.radians(phi_deg)))

apparent_drift_deg_yr = 360 / solar_day_yr
baseline_shift_80yr   = apparent_drift_deg_yr * 80

# ── Lune ────────────────────────────────────────────────────
moon_period_s    = MOON_PERIOD_H * 3600
gm_planet        = G * planet_mass
moon_orbit_r     = (gm_planet * moon_period_s**2 / (4 * math.pi**2)) ** (1/3)
moon_orbit_km    = moon_orbit_r / 1e3
moon_altitude_km = moon_orbit_km - planet_radius_km
moon_radius      = MOON_RADIUS_KM * 1e3
moon_volume      = (4/3) * math.pi * moon_radius**3
moon_mass        = MOON_DENSITY * moon_volume
moon_g           = G * moon_mass / moon_radius**2
moon_appar_rad   = 2 * math.atan(moon_radius / moon_orbit_r)
moon_appar_arcmin= math.degrees(moon_appar_rad) * 60
EARTH_MOON_ARCMIN= 31.6
moon_ratio       = moon_appar_arcmin / EARTH_MOON_ARCMIN
roche_fluid_km   = 2.456 * planet_radius_km * (planet_density / MOON_DENSITY)**(1/3)

# ── Système de temps ────────────────────────────────────────
cycle_s        = moon_period_s
ronde_s        = cycle_s / 6
moment_s       = ronde_s / 216
instant_s      = moment_s / 6
battement_s    = instant_s / 6
ere_yr         = orbit_period_yr
phase_d        = ere_yr * 365.25 / PHASES_PER_ERE
hexade_d       = phase_d / 6
cycles_per_ere = ere_yr * 365.25 * 24 / MOON_PERIOD_H
pendulum_m     = planet_g * (battement_s / (2 * math.pi))**2

# ══════════════════════════════════════════════════════════════
#  RAPPORT MARKDOWN
# ══════════════════════════════════════════════════════════════

OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "aeonir_astronomy.md")

def ok(cond): return "✓" if cond else "✗"
def fmt(v, digits=2): return f"{v:.{digits}f}" if not math.isnan(v) else "—"

with open(OUT_PATH, "w", encoding="utf-8") as f:
    def md(line=""): f.write(line + "\n")

    # ── En-tête ─────────────────────────────────────────────
    md("# Aeonir — Paramètres Astronomiques")
    md()
    md(f"> Généré le {date.today().isoformat()}")
    md()

    # ── Paramètres d'entrée ─────────────────────────────────
    md("## Paramètres d'entrée")
    md()
    md("| Paramètre | Valeur |")
    md("|:---|---:|")
    md(f"| **Demi-grand axe** | **{SEMI_MAJOR_AXIS_AU} AU** |")
    md(f"| Masse étoile | {STAR_MASS_SOLAR} M☉ |")
    # Type spectral : séquence principale ou géante selon star_evol_ratio
    if star_evol_ratio < 1.5:
        star_type = ("B0–B1 V" if STAR_MASS_SOLAR >= 10 else
                     "B2–B3 V" if STAR_MASS_SOLAR >= 7 else
                     "B5 V"    if STAR_MASS_SOLAR >= 5 else
                     "A–F V"   if STAR_MASS_SOLAR >= 1.8 else "G–K V")
    else:
        star_type = ("K5–M0 III" if STAR_LUM_SOLAR <  100 else
                     "K2–K5 III" if STAR_LUM_SOLAR <  200 else
                     "K0–K2 III" if STAR_LUM_SOLAR <  500 else
                     "G8–K0 II"  if STAR_LUM_SOLAR < 2000 else "K Ib")
    # T_eff estimé pour une géante K (R ∝ L^0.55 empirique classe III)
    _r_rsun_est = STAR_LUM_SOLAR ** 0.55
    _star_teff  = int(5778 * (STAR_LUM_SOLAR / _r_rsun_est**2) ** 0.25)
    _peak_nm    = int(2_898_000 / _star_teff)
    evol_note = "" if abs(star_evol_ratio - 1) < 0.05 else f" *(×{star_evol_ratio:.1f} L_SM)*"
    md(f"| Luminosité étoile | {STAR_LUM_SOLAR:.0f} L☉{evol_note} |")
    md(f"| Circonférence planète | {PLANET_CIRCUM_FRAC:.4f} × C⊕ = {planet_circum_km:.0f} km |")
    md(f"| Densité planète | {PLANET_DENSITY_FRAC:.3f} × ρ⊕ = {planet_density:.0f} kg/m³ |")
    md(f"| Inclinaison axiale | {AXIAL_TILT_DEG}° |")
    md(f"| Largeur terminateur | {TERMINATOR_WIDTH_KM:.0f} km |")
    md(f"| Traversée cible | {CROSSING_TARGET_YEARS:.0f} ans à {CROSSING_LATITUDE_DEG:.0f}° |")
    md(f"| Période lunaire | {MOON_PERIOD_H:.0f} h |")
    md(f"| Rayon lune | {MOON_RADIUS_KM:.0f} km *(rayon)* |")
    md()

    # ── Étoile ──────────────────────────────────────────────
    md("## Étoile")
    md()
    md("| Grandeur | Valeur |")
    md("|:---|---:|")
    md(f"| Type spectral *(approx.)* | {star_type} |")
    md(f"| Masse | {STAR_MASS_SOLAR} M☉ |")
    md(f"| Luminosité | {STAR_LUM_SOLAR:.0f} L☉ |")
    md(f"| T_eff *(estimé, géante K)* | {_star_teff} K (λ_max ≈ {_peak_nm} nm) |")
    md(f"| Luminosité SM (1.4 × M^3.5) | {star_lum_ms:.1f} L☉ |")
    md(f"| Zone habitable SM *(approx.)* | {math.sqrt(star_lum_ms):.2f} AU |")
    md(f"| Zone habitable géante (√L) | {star_hz_au:.2f} AU |")
    md(f"| Durée de vie SM *(approx.)* | {star_life_myr:.0f} Ma |")
    md()

    # ── Planète ─────────────────────────────────────────────
    md("## Planète")
    md()
    md("| Grandeur | Valeur |")
    md("|:---|---:|")
    md(f"| Circonférence | {PLANET_CIRCUM_FRAC:.4f} × C⊕ = {planet_circum_km:.0f} km |")
    md(f"| Rayon *(dérivé)* | {planet_radius_km:.1f} km ({planet_radius_km / (R_EARTH/1000):.3f} R⊕) |")
    md(f"| Densité | {PLANET_DENSITY_FRAC:.3f} × ρ⊕ = {planet_density:.0f} kg/m³ |")
    md(f"| Masse *(dérivée)* | {planet_mass / M_EARTH:.3f} M⊕ |")
    md(f"| **Gravité surface** | **{planet_g:.3f} m/s²** ({planet_g / G_EARTH:.3f} g⊕) {ok(planet_g < G_EARTH)} |")
    md()

    # ── Orbite ──────────────────────────────────────────────
    md("## Orbite")
    md()
    md("| Grandeur | Valeur |")
    md("|:---|---:|")
    md(f"| Demi-grand axe | {orbit_au:.1f} AU |")
    md(f"| Excentricité | {ECCENTRICITY:.2f} |")
    md(f"| Périhélie | {perihelion_au:.2f} AU |")
    md(f"| Aphélie | {aphelion_au:.2f} AU |")
    md(f"| Zone habitable (flux moyen corrigé) | {orbit_au_eff:.2f} AU "
       f"(écart : {hz_delta_eff_pct:+.1f} %) {ok(in_hz_eff)} |")
    md(f"| **Période orbitale T_orb** | **{orbit_period_yr:.2f} ans** = {orbit_period_d:.0f} jours |")
    md(f"| Inclinaison axiale | {AXIAL_TILT_DEG}° |")
    md()

    # ── Asymétrie polaire ─────────────────────────────────────
    md("## Asymétrie polaire — Excentricité")
    md()
    md(f"*Convention : le solstice d'été du Pôle Nord coïncide avec le périhélie (e = {ECCENTRICITY:.2f}).*")
    md()
    md("| Grandeur | Pôle Nord *(été au périhélie)* | Pôle Sud *(été à l'aphélie)* |")
    md("|:---|---:|---:|")
    md(f"| Distance solstice d'été | {perihelion_au:.2f} AU | {aphelion_au:.2f} AU |")
    md(f"| Flux au solstice | ×{flux_peri:.3f} F₀ | ×{flux_aph:.3f} F₀ |")
    md(f"| **Durée été polaire** | **{north_summer_yr:.1f} ans** ({north_summer_frac*100:.1f} %) "
       f"| **{south_summer_yr:.1f} ans** ({south_summer_frac*100:.1f} %) |")
    md(f"| Flux moyen estival | ×{flux_north_summer:.3f} F₀ | ×{flux_south_summer:.3f} F₀ |")
    md()
    md(f"Rapport d'intensité Nord/Sud : **×{flux_pole_ratio:.2f}** au solstice "
       f"— ×{flux_north_summer/flux_south_summer:.2f} en moyenne estivale.")
    md()
    md("> Les deux pôles reçoivent la **même énergie totale** pendant leur été (loi des aires — "
       "l'angle balayé est π dans les deux cas). La différence est dans l'**intensité** : "
       "le Pôle Sud n'atteint jamais le seuil de fusion des glaces profondes. "
       "F₀ = flux à orbit_au en orbite circulaire.")
    md()

    # ── Rotation & terminateur ───────────────────────────────
    md("## Rotation — Quasi-verrouillage")
    md()
    md("Le **jour solaire T_solar** est dérivé de la contrainte de traversée du terminateur, "
       "indépendamment de T_orb. La **rotation sidérale T_rot** en est déduite.")
    md()
    md("| Grandeur | Valeur |")
    md("|:---|---:|")
    md(f"| Vitesse terminateur (éq.) | {v_term_eq_km_yr:.2f} km/an = {v_term_m_day:.1f} m/jour |")
    md(f"| **Jour solaire T_solar** | **{solar_day_yr:.0f} ans** |")
    if quasi_lock_ok:
        md(f"| Rotation sidérale T_rot | {rot_period_yr:.2f} ans (Δ = {lock_delta_pct:.1f} % vs T_orb) |")
    else:
        md(f"| Rotation sidérale T_rot | ⚠ T_orb trop grand — quasi-lock non cohérent |")
    md(f"| Traversée terminateur (éq.) | {t_cross_at_lat(0):.0f} ans |")
    md(f"| Traversée terminateur (45°) | {t_cross_at_lat(45):.0f} ans ✓ |")
    md(f"| Traversée terminateur (60°) | {t_cross_at_lat(60):.0f} ans |")
    md(f"| Dérive apparente du soleil | {apparent_drift_deg_yr:.4f} °/an ({baseline_shift_80yr:.1f}° sur 80 ans) |")
    md()
    md("### Deux mécanismes de saisons")
    md()
    md("| Mécanisme | Période | Saison | Affecte |")
    md("|:---|---:|---:|:---|")
    md(f"| Orbital (inclinaison {AXIAL_TILT_DEG}°) | {orbit_period_yr:.1f} ans "
       f"| **{polar_season_yr:.1f} ans** | Pôles géographiques (φ = 90°) |")
    md(f"| Rotationnel (T_solar) | {solar_day_yr:.0f} ans "
       f"| {solar_day_yr / 2:.0f} ans | Régions ~75–85° (par longitude) |")
    md()

    # ── Lune ────────────────────────────────────────────────
    md("## Lune / Satellite")
    md()
    md("| Grandeur | Valeur |")
    md("|:---|---:|")
    md(f"| Période orbitale | {MOON_PERIOD_H:.0f} h (= 1 Cycle) ✓ |")
    md(f"| Rayon orbital | {moon_orbit_km:.0f} km (altitude : {moon_altitude_km:.0f} km) |")
    md(f"| Rayon | {MOON_RADIUS_KM:.0f} km *(Bookstack indique « 300 km de diamètre » — ambigu)* |")
    md(f"| **Diamètre apparent** | **{moon_appar_arcmin:.1f}'** ({moon_ratio:.2f}× Lune terrestre) {ok(moon_ratio > 1.5)} |")
    md(f"| Densité | {MOON_DENSITY:.0f} kg/m³ |")
    md(f"| Gravité surface | {moon_g:.4f} m/s² |")
    md(f"| Limite de Roche | {roche_fluid_km:.0f} km < {moon_orbit_km:.0f} km {ok(roche_fluid_km < moon_orbit_km)} stable |")
    md()

    # ── Système de temps ────────────────────────────────────
    md("## Système de temps — Base 6")
    md()
    md("| Unité | Durée |")
    md("|:---|---:|")
    md(f"| **1 Ère** | **{ere_yr:.2f} ans** = {cycles_per_ere:.0f} Cycles |")
    md(f"| 1 Phase | {phase_d:.1f} jours (Ère / {PHASES_PER_ERE}) |")
    md(f"| 1 Hexade | {hexade_d:.2f} jours (Phase / 6) |")
    md(f"| 1 Cycle | {MOON_PERIOD_H:.0f} h = orbite lunaire ✓ |")
    md(f"| 1 Ronde | {ronde_s / 3600:.2f} h (Cycle / 6) |")
    md(f"| 1 Moment | {moment_s:.3f} s |")
    md(f"| 1 Instant | {instant_s:.4f} s |")
    md(f"| 1 Battement | {battement_s:.4f} s |")
    md()
    pend_ok = abs(pendulum_m - 1.0) < 0.05
    md(f"**Pendule standard** (T = 1 Battement, g = {planet_g:.3f} m/s²) : "
       f"L = {pendulum_m:.4f} m {ok(pend_ok)}")
    if not pend_ok:
        md()
        md("> ⚠ La longueur du pendule s'éloigne de 1 m si le rayon planétaire change.")
    md()

    # ── Bilan ────────────────────────────────────────────────
    md("## Bilan des objectifs")
    md()
    objectives = [
        (quasi_lock_ok and lock_delta_pct < 20,
         "Quasi-verrouillage gravitationnel",
         (f"T_rot = {rot_period_yr:.1f} ans, T_orb = {orbit_period_yr:.1f} ans "
          f"(Δ = {lock_delta_pct:.1f} %). T_solar = {solar_day_yr:.0f} ans.")
         if quasi_lock_ok else "T_orb trop grand pour quasi-lock avec ce T_solar."),

        (True,
         "Lune : période ≈ journée humaine",
         f"1 Cycle = {MOON_PERIOD_H:.0f} h ({MOON_PERIOD_H / 24:.2f}× jour terrestre)"),

        (moon_ratio > 1.5,
         "Lune : grand diamètre apparent",
         f"Diamètre apparent = {moon_appar_arcmin:.1f}' = {moon_ratio:.1f}× Lune terrestre"),

        (True,
         f"Traversée terminateur ~{CROSSING_TARGET_YEARS:.0f} ans à {CROSSING_LATITUDE_DEG:.0f}°",
         f"t(éq.) = {t_cross_at_lat(0):.0f} ans | t(45°) = {t_cross_at_lat(45):.0f} ans "
         f"| t(60°) = {t_cross_at_lat(60):.0f} ans"),

        (south_summer_yr >= 20,
         "Saisons polaires longues et asymétriques",
         f"Nord (périhélie) : **{north_summer_yr:.1f} ans** ×{flux_north_summer:.2f} F₀ | "
         f"Sud (aphélie) : **{south_summer_yr:.1f} ans** ×{flux_south_summer:.2f} F₀"),

        (planet_g < G_EARTH,
         "Gravité < g⊕ (gigantisme floral)",
         f"g = {planet_g:.3f} m/s² = {planet_g / G_EARTH:.3f} g⊕"),
    ]

    md("| | Objectif | Résultat |")
    md("|:---:|:---|:---|")
    for i, (met, label, detail) in enumerate(objectives, 1):
        icon = "✓" if met else "✗"
        md(f"| **{icon} [{i}]** | {label} | {detail} |")
    md()

    # ── Tableau récapitulatif ────────────────────────────────
    md("## Tableau récapitulatif")
    md()
    md("| Paramètre | Valeur | Unité |")
    md("|:---|---:|:---|")
    rows = [
        ("Masse étoile",              f"{STAR_MASS_SOLAR}",                  "M☉"),
        ("Luminosité étoile",         f"{STAR_LUM_SOLAR:.0f}",                "L☉"),
        ("T_eff étoile *(estimé)*",   f"{_star_teff}",                        "K"),
        ("Zone habitable géante (√L)",f"{star_hz_au:.2f}",                    "AU"),
        ("Durée de vie étoile (SM)",  f"{star_life_myr:.0f}",                 "Ma"),
        ("Demi-grand axe",            f"{orbit_au:.1f}",                      "AU"),
        ("Excentricité",              f"{ECCENTRICITY:.2f}",                   ""),
        ("Périhélie / Aphélie",       f"{perihelion_au:.2f} / {aphelion_au:.2f}", "AU"),
        ("**Période orbitale T_orb**",f"**{orbit_period_yr:.2f}**",           "**ans**"),
        ("Été polaire Nord (périhélie)",f"{north_summer_yr:.1f} — ×{flux_north_summer:.2f} F₀", "ans"),
        ("Été polaire Sud (aphélie)", f"{south_summer_yr:.1f} — ×{flux_south_summer:.2f} F₀",   "ans"),
        ("Rotation sidérale T_rot",   fmt(rot_period_yr, 2),                  "ans"),
        ("Jour solaire T_solar",      f"{solar_day_yr:.0f}",                  "ans"),
        ("Circonférence planète",     f"{PLANET_CIRCUM_FRAC:.4f} × C⊕ = {planet_circum_km:.0f}", "km"),
        ("Rayon planète *(dérivé)*",  f"{planet_radius_km:.1f}",              "km"),
        ("Masse planète *(dérivée)*", f"{planet_mass / M_EARTH:.3f}",         "M⊕"),
        ("Gravité surface",           f"{planet_g:.3f}",                     "m/s²"),
        ("Inclinaison axiale",        f"{AXIAL_TILT_DEG}",                   "°"),
        ("Dérive terminateur (éq.)",  f"{v_term_m_day:.1f}",                 "m/jour"),
        ("Période lunaire",           f"{MOON_PERIOD_H:.0f}",                "h (= 1 Cycle)"),
        ("Rayon orbital lune",        f"{moon_orbit_km:.0f}",                "km"),
        ("Rayon lune",                f"{MOON_RADIUS_KM:.0f}",               "km"),
        ("Diamètre apparent lune",    f"{moon_appar_arcmin:.1f}",            "arcmin"),
        ("Battement",                 f"{battement_s:.4f}",                  "s"),
        ("Pendule standard",          f"{pendulum_m:.4f}",                   "m"),
    ]
    for name, val, unit in rows:
        md(f"| {name} | {val} | {unit} |")
    md()

print(f"Rapport écrit dans : {OUT_PATH}")
