"use client";

/**
 * SigMap — le visualiseur MapLibre du relief d'Aeonir.
 *
 * Portage du prototype `geo/viewer/index.html`, supprimé une fois ce fichier
 * en place — le chercher dans l'historique git plutôt que sur le disque. Le
 * partage des rôles :
 * `src/lib/sig/` porte tout ce qui se relit sans navigateur (contrat TileJSON,
 * style, graticule, politique du relief), ce fichier ne porte que le **cycle de
 * vie** et le **branchement React ↔ MapLibre**.
 *
 * ── Trois pièges React, et comment ils sont traités ────────────────────
 *
 * 1. **La carte ne se recrée jamais.** L'effet qui l'instancie ne dépend que de
 *    l'URL du contrat : les bascules passent par des effets séparés qui
 *    agissent sur l'instance déjà là. Mettre `terrainRequested` dans les
 *    dépendances du premier effet reconstruirait la carte à chaque clic.
 *
 * 2. **React ne doit jamais toucher au DOM de MapLibre.** Le conteneur est un
 *    `<div>` sans le moindre enfant JSX, et ça doit le rester : MapLibre y
 *    injecte son canevas et ses contrôles, que React ignore. Un enfant
 *    conditionnel ici, et la réconciliation piétinerait le canevas.
 *
 * 3. **Les fermetures rassies.** Un `map.on("zoom", …)` posé une fois capture
 *    l'état de ce moment-là. On le réabonne donc à chaque changement de l'état
 *    qu'il lit — c'est la réponse React, et elle coûte un `off`/`on`. Seule
 *    l'exagération passe par une référence : elle change vingt fois pendant
 *    qu'on tire le curseur, et n'a pas à réabonner quoi que ce soit.
 *
 * S'y ajoute le double montage de StrictMode en développement : l'effet est
 * joué deux fois, donc le nettoyage doit être complet (`map.remove()`) et la
 * requête asynchrone doit pouvoir être désavouée.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
// Le style du panneau est importé par SigViewer, qui est chargé d'emblée :
// l'écran d'attente doit déjà être mis en forme. Ici, seule la feuille de
// MapLibre, qui n'a de sens qu'une fois la carte présente.
import "maplibre-gl/dist/maplibre-gl.css";

import {
  ALL_COLOR_LAYERS,
  ALL_HILLSHADE_LAYERS,
  LAYERS,
  MONTAGES,
  TERRAIN_SOURCE,
  buildStyle,
} from "@/lib/sig/style";
import {
  EARTH_HYPSOMETRIC,
  TINT_OPACITY_DEFAULT,
  TINT_OPACITY_MAX,
  TINT_OPACITY_MIN,
} from "@/lib/sig/palette";
import {
  ATMOSPHERE_SHADOW,
  NEUTRAL_METHOD,
  ambientShadow,
  REALISTIC_METHOD,
  STAR_AZIMUTH_DEG,
  VACUUM_SHADOW,
  starElevationDeg,
  starHighlight,
} from "@/lib/sig/sun";
import { fetchTileJSON, resolveTileTemplate } from "@/lib/sig/tilejson";
import type { AeonirTileJSON } from "@/lib/sig/tilejson";
import { tileIndex, wrapLongitude } from "@/lib/sig/mercator";
import {
  EXAGGERATION_DEFAULT,
  EXAGGERATION_MAX,
  EXAGGERATION_MIN,
  TERRAIN_MIN_ZOOM,
  effectiveExaggeration,
  pitchForZoom,
} from "@/lib/sig/relief";

/** Relevé sous le pointeur. `null` = le pointeur n'est pas sur la carte. */
interface Readout {
  lon: number;
  lat: number;
  tile: string;
  /** `null` quand le relief 3D est éteint : la mesure n'existe pas. */
  elevation: number | null;
}

interface Props {
  /** URL du TileJSON, résolue contre le document. */
  tilejsonUrl: string;
}

export function SigMap({ tilejsonUrl }: Props) {
  const container = useRef<HTMLDivElement>(null);

  // La carte passe en état — et non en simple référence — une fois son style
  // chargé : c'est ce qui permet aux effets de bascule d'attendre que
  // `setLayoutProperty` soit légal, sans sonder ni réessayer.
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [tilejson, setTilejson] = useState<AeonirTileJSON | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [terrainRequested, setTerrainRequested] = useState(false);
  const [exaggeration, setExaggeration] = useState(EXAGGERATION_DEFAULT);
  const [multiSource, setMultiSource] = useState(false);
  const [realisticLight, setRealisticLight] = useState(false);
  const [atmosphere, setAtmosphere] = useState(true);
  /** Élévation de l'étoile au centre de la vue, affichée sur le bouton. */
  const [starElevation, setStarElevation] = useState(0);
  const [paletteOn, setPaletteOn] = useState(false);
  const [tintOpacity, setTintOpacity] = useState(TINT_OPACITY_DEFAULT);
  const [graticuleOn, setGraticuleOn] = useState(false);
  const [tileBoundaries, setTileBoundaries] = useState(false);

  const [zoom, setZoom] = useState<number | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);

  // Voir le piège 3 : l'exagération est lue au moment où le terrain est monté,
  // elle ne déclenche pas le montage.
  const exaggerationRef = useRef(exaggeration);
  exaggerationRef.current = exaggeration;

  // ── Création, une fois ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | null = null;

    (async () => {
      const contract = await fetchTileJSON(tilejsonUrl);
      // StrictMode rejoue l'effet : la requête lancée par le premier montage
      // peut revenir après son démontage. Sans ce garde-fou, elle bâtirait une
      // carte dans un conteneur détaché.
      if (cancelled || !container.current) return;

      // ⚠️ Import différé, et pas seulement par confort de découpage : MapLibre
      // touche `window` dès l'évaluation du module. Le composant est déjà
      // chargé en `ssr: false`, mais l'import statique remonterait quand même
      // dans le graphe du serveur.
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container.current) return;

      // ⚠️ Sans cette ligne, la carte se construit, le canevas apparaît, et
      // RIEN ne s'affiche — en silence. MapLibre 6 déduit l'URL de son worker
      // de son propre `import.meta.url` ; bundlé, ce n'est plus une URL http,
      // la déduction rend la chaîne vide, et le worker part chercher le
      // document HTML au lieu d'un module. Le style n'étant analysé QUE dans le
      // worker, `isStyleLoaded()` reste indéfiniment false, sans qu'aucune
      // erreur ne remonte à `map.on("error")`.
      //
      // ⚠️ `.js` et non `.mjs` : nginx ne connaît pas la seconde extension et
      // sert alors le worker en `application/octet-stream`, que le navigateur
      // refuse pour un module — même panne, autre cause, et invisible en
      // développement. Voir scripts/copy-maplibre-worker.mjs, qui copie les
      // fichiers et porte le détail.
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.js");

      const urlTemplate = resolveTileTemplate(
        tilejsonUrl,
        contract,
        window.location.href
      );

      created = new maplibregl.Map({
        container: container.current,
        hash: true,
        center: [0, 0],
        zoom: 2.2,
        maxPitch: 75,

        // ⚠️ `renderWorldCopies` LAISSÉ À `true`, après l'avoir coupé et remis.
        // L'histoire vaut le commentaire, parce que la première correction
        // marchait.
        //
        // Le relief 3D n'ombre pas toutes les colonnes de tuiles pareil. Mesuré
        // sur deux captures au même zoom, mêmes réglages, seule la largeur de
        // fenêtre changeant :
        //
        //   fenêtre 1 278 px = largeur exacte du monde, AUCUNE copie visible
        //     colonnes à 22,25 · 22,36 · 22,83          écart  +2,6 %
        //   fenêtre 1 560 px, 282 px de copies visibles
        //     colonnes à 31,71 · 20,43 · 20,97 · 31,00  écart +55,2 %
        //
        // Le défaut n'apparaît donc que lorsqu'une copie du monde entre dans le
        // champ, et `renderWorldCopies: false` le supprime — vérifié. Mais il
        // coûte trop cher : MapLibre contraint alors la caméra pour que le
        // monde remplisse la fenêtre, donc le zoom minimal dépend de la largeur
        // d'écran et **la vue planétaire devient inatteignable**. Sur une
        // planète, non.
        //
        // La sortie est ailleurs, et elle tombe juste : une copie n'est visible
        // que si le monde est plus étroit que l'écran, donc à bas zoom — la
        // plage exacte où le relief 3D ne montre rien. Voir `TERRAIN_MIN_ZOOM`.
        style: buildStyle(contract, urlTemplate),
      });

      created.addControl(
        new maplibregl.NavigationControl({ visualizePitch: true })
      );
      created.addControl(new maplibregl.ScaleControl({ unit: "metric" }));

      // Exposé volontairement : un visualiseur sert à inspecter, et un module
      // ne laisserait rien atteindre depuis la console autrement.
      Object.assign(window, { aeonir: { map: created, tilejson: contract } });

      created.on("error", (e) => {
        // Hors de la bande, au-delà de `split_zoom`, les tuiles n'existent
        // pas : le 404 est attendu et MapLibre retombe sur la tuile parente.
        // On ne le signale donc pas comme une panne.
        const message = e?.error?.message ?? "";
        if (/40[34]/.test(message)) return;
        setError(message || "erreur MapLibre");
      });

      created.on("load", () => {
        if (cancelled) return;
        setTilejson(contract);
        setMap(created);
      });
    })().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      cancelled = true;
      created?.remove();
      setMap(null);
    };
  }, [tilejsonUrl]);

  // ── Lecture continue : zoom, puis pointeur ────────────────────────────
  useEffect(() => {
    if (!map) return;
    const track = () => setZoom(map.getZoom());
    track();
    map.on("move", track);
    return () => {
      map.off("move", track);
    };
  }, [map]);

  useEffect(() => {
    if (!map || !tilejson) return;

    const onPointerMove = (e: { lngLat: { lng: number; lat: number } }) => {
      const lon = wrapLongitude(e.lngLat.lng);
      const lat = e.lngLat.lat;
      const z = Math.min(tilejson.maxzoom, Math.floor(map.getZoom()));
      const t = tileIndex(lon, lat, z);

      // `queryTerrainElevation` rend 0 — et non `null` — quand aucun relief
      // n'est monté, ce qui afficherait un « 0 m » trompeur au lieu de dire que
      // la mesure n'est pas disponible. On interroge donc l'état du relief.
      const elevation = map.getTerrain()
        ? (map.queryTerrainElevation(e.lngLat) ?? null)
        : null;

      setReadout({ lon, lat, tile: `${z}/${t.x}/${t.y}`, elevation });
    };
    const onPointerOut = () => setReadout(null);

    map.on("mousemove", onPointerMove);
    map.on("mouseout", onPointerOut);
    return () => {
      map.off("mousemove", onPointerMove);
      map.off("mouseout", onPointerOut);
    };
  }, [map, tilejson]);

  // ── Le relief 3D : montage, extinction, et inclinaison suivie ─────────
  const radiusCorrection = tilejson?.aeonir.terrain_exaggeration ?? 1;

  useEffect(() => {
    if (!map) return;

    const apply = () => {
      const allowed = map.getZoom() >= TERRAIN_MIN_ZOOM;
      const wanted = terrainRequested && allowed;
      const active = !!map.getTerrain();

      // `setTerrain` reconstruit le maillage : on ne l'appelle que sur
      // changement d'état, sinon chaque image de zoom le relancerait.
      if (wanted !== active) {
        map.setTerrain(
          wanted
            ? {
                source: TERRAIN_SOURCE,
                exaggeration: effectiveExaggeration(
                  exaggerationRef.current,
                  radiusCorrection
                ),
              }
            : null
        );
        // En extinction depuis un zoom élevé, l'inclinaison ne peut pas
        // redescendre par la rampe — elle serait restée à 60°. On la ramène.
        if (!wanted) map.easeTo({ pitch: 0, duration: 400 });
      }

      // `setPitch` et non `easeTo` : on suit le zoom image par image, une
      // animation par événement se mettrait en travers de la suivante.
      if (wanted) map.setPitch(pitchForZoom(map.getZoom()));
    };

    apply();
    map.on("zoom", apply);
    return () => {
      map.off("zoom", apply);
    };
  }, [map, terrainRequested, radiusCorrection]);

  // L'exagération se pousse à part : le terrain est déjà monté, il n'y a que sa
  // déclaration à refaire. `setTerrain` et pas une propriété de peinture —
  // l'exagération est portée par la déclaration, donc le maillage se
  // reconstruit, ce qui reste fluide aux zooms concernés.
  useEffect(() => {
    if (!map?.getTerrain()) return;
    map.setTerrain({
      source: TERRAIN_SOURCE,
      exaggeration: effectiveExaggeration(exaggeration, radiusCorrection),
    });
  }, [map, exaggeration, radiusCorrection]);

  // ── Les bascules d'affichage ──────────────────────────────────────────
  //
  // Bascule entre les deux montages, pour les comparer sur la même vue :
  //   éteint — UNE source, emprise globale. Au-delà du partage elle réclame des
  //            tuiles hors bande qui n'existent pas : 404, et MapLibre laisse
  //            ce qu'il peut.
  //   allumé — DEUX sources, chacune ne demandant que ce qui existe.
  //
  // Les teintes suivent le MÊME montage : sinon la bascule comparerait un
  // ombrage nu d'un côté à un ombrage teinté de l'autre, et ne dirait plus rien
  // du montage lui-même.
  useEffect(() => {
    if (!map) return;
    const shown = (on: boolean) => (on ? "visible" : "none");
    const actif = multiSource ? MONTAGES.multi : MONTAGES.single;
    const dormant = multiSource ? MONTAGES.single : MONTAGES.multi;

    for (const id of actif.hillshade) {
      map.setLayoutProperty(id, "visibility", shown(true));
    }
    for (const id of dormant.hillshade) {
      map.setLayoutProperty(id, "visibility", shown(false));
    }
    for (const id of actif.color) {
      map.setLayoutProperty(id, "visibility", shown(paletteOn));
    }
    for (const id of dormant.color) {
      map.setLayoutProperty(id, "visibility", shown(false));
    }
  }, [map, multiSource, paletteOn]);

  // ── L'éclairage ───────────────────────────────────────────────────────
  //
  // Un seul effet, parce que les deux bascules touchent les mêmes propriétés :
  // les séparer ferait que la dernière à s'appliquer écraserait l'autre.
  //
  // ⚠️ La méthode change avec le réalisme, et ce n'est pas décoratif :
  // `standard` ignore l'altitude du soleil. Sans ce changement, suivre la
  // latitude ne produirait strictement rien. Voir sun.ts.
  //
  // L'abonnement à `move` est la contrepartie assumée de la limite de MapLibre :
  // l'élévation ne pouvant pas varier DANS une couche, on la recalcule sur le
  // centre du champ à chaque déplacement.
  const twilightFloor = tilejson?.aeonir.band.south_deg ?? -21;

  useEffect(() => {
    if (!map) return;
    const layers = ALL_HILLSHADE_LAYERS;

    // Dernière LATITUDE appliquée : `move` tire des dizaines d'événements par
    // seconde, et repousser un uniforme identique ne sert à rien.
    //
    // ⚠️ La latitude, et surtout pas l'élévation. Sous l'équateur l'étoile est
    // couchée, donc l'élévation est bornée à 0 partout : un garde-fou indexé
    // sur elle se court-circuiterait dès le premier point négatif et figerait
    // le crépuscule. Or c'est là, entre l'équateur et le Linceul, que la
    // lumière varie le plus.
    let applied = Number.NaN;

    const apply = () => {
      const lat = map.getCenter().lat;
      if (Math.abs(lat - applied) < 0.25) return;
      applied = lat;
      const elevation = starElevationDeg(lat);
      setStarElevation(elevation);
      // L'ombre AVANT la haute lumière : celle-ci se fond vers celle-là, donc
      // elle a besoin de la valeur du moment, pas de celle d'avant.
      const shadow = ambientShadow(lat, twilightFloor, atmosphere);
      for (const id of layers) {
        map.setPaintProperty(id, "hillshade-illumination-altitude", elevation);
        map.setPaintProperty(id, "hillshade-shadow-color", shadow);
        map.setPaintProperty(
          id,
          "hillshade-highlight-color",
          starHighlight(lat, twilightFloor, shadow)
        );
      }
    };

    for (const id of layers) {
      map.setPaintProperty(
        id,
        "hillshade-method",
        realisticLight ? REALISTIC_METHOD : NEUTRAL_METHOD
      );
      // Régime neutre : pas de latitude qui compte, donc l'atmosphère seule.
      map.setPaintProperty(
        id,
        "hillshade-shadow-color",
        atmosphere ? ATMOSPHERE_SHADOW : VACUUM_SHADOW
      );
      map.setPaintProperty(
        id,
        "hillshade-illumination-direction",
        STAR_AZIMUTH_DEG
      );
    }

    if (!realisticLight) return;
    apply();
    map.on("move", apply);
    return () => {
      map.off("move", apply);
    };
  }, [map, realisticLight, atmosphere, twilightFloor]);

  // L'opacité se pousse sur les trois couches à la fois : seule l'une d'elles
  // est visible, mais laisser les deux autres à l'ancienne valeur ferait sauter
  // le rendu au prochain changement de montage.
  useEffect(() => {
    if (!map) return;
    for (const id of ALL_COLOR_LAYERS) {
      map.setPaintProperty(id, "color-relief-opacity", tintOpacity);
    }
  }, [map, tintOpacity]);

  useEffect(() => {
    if (!map) return;
    for (const id of [LAYERS.graticule, LAYERS.graticuleDashed]) {
      map.setLayoutProperty(id, "visibility", graticuleOn ? "visible" : "none");
    }
  }, [map, graticuleOn]);

  // Drapeau de débogage natif de MapLibre : il trace le contour de chaque tuile
  // ET son triplet z/x/y sans avoir besoin de `glyphs` — il embarque sa propre
  // fonte. Voisins utiles : showCollisionBoxes, showPadding,
  // showOverdrawInspector.
  useEffect(() => {
    if (!map) return;
    map.showTileBoundaries = tileBoundaries;
  }, [map, tileBoundaries]);

  const waitingForZoom =
    terrainRequested && zoom !== null && zoom < TERRAIN_MIN_ZOOM;

  const toggle = useCallback(
    (value: boolean, set: (v: boolean) => void) => () => set(!value),
    []
  );

  return (
    <div className="sig">
      {/* ⚠️ Aucun enfant JSX ici, jamais : MapLibre est propriétaire de ce
          nœud. Voir le piège 2 en tête de fichier. */}
      <div className="sig-map" ref={container} />

      <div className="sig-hud">
        <h1>Aeonir · repère Étoile</h1>
        <dl>
          <dt>zoom</dt>
          <dd>{zoom === null ? "—" : zoom.toFixed(2)}</dd>
          <dt>tuile</dt>
          <dd>{readout?.tile ?? "—"}</dd>

          <div className="sig-sep" />

          <dt>longitude&apos;</dt>
          <dd>{readout ? `${readout.lon.toFixed(3)}°` : "—"}</dd>
          <dt>latitude&apos;</dt>
          <dd>{readout ? `${readout.lat.toFixed(3)}°` : "—"}</dd>

          {/* Dans le repère Étoile, la latitude EST l'angle d'élévation de
              l'étoile. Ce n'est pas une approximation, c'est la définition du
              repère. */}
          <dt>élévation ☀</dt>
          <dd>{readout ? `${readout.lat.toFixed(2)}°` : "—"}</dd>

          <dt>altitude</dt>
          <dd>
            {readout === null
              ? "—"
              : readout.elevation === null
                ? "— (relief 3D éteint)"
                : `${Math.round(readout.elevation)} m`}
          </dd>

          <div className="sig-sep" />

          <dt>époque</dt>
          <dd>{tilejson ? `${tilejson.aeonir.epoch_a} a` : "—"}</dd>

          {error && <dd className="sig-error">{error}</dd>}
        </dl>

        <button
          type="button"
          aria-pressed={terrainRequested}
          onClick={toggle(terrainRequested, setTerrainRequested)}
        >
          {waitingForZoom
            ? `relief 3D — en attente de z ${TERRAIN_MIN_ZOOM}`
            : "relief 3D"}
        </button>

        {terrainRequested && (
          <label className="sig-slider" htmlFor="sig-exaggeration">
            exagération <output>{exaggeration}</output>×
            <input
              id="sig-exaggeration"
              type="range"
              min={EXAGGERATION_MIN}
              max={EXAGGERATION_MAX}
              step={1}
              value={exaggeration}
              // `onChange` de React est branché sur l'événement `input` du DOM,
              // donc le relief suit le curseur pendant qu'on le tire — ce qui
              // est tout l'intérêt d'un réglage visuel : on cherche une valeur
              // à l'œil, on ne la connaît pas d'avance.
              onChange={(e) => setExaggeration(Number(e.target.value))}
            />
          </label>
        )}

        {/* ⚠️ Libellé qui RAPPORTE l'état, au lieu de nommer la cible de la
            bascule comme les autres boutons. Leur convention marche parce que
            leur état éteint est une absence ; ici les deux positions sont deux
            montages également réels, et « sources multiples » sur un bouton
            terne se lit comme une affirmation de ce qui tourne. */}
        <button
          type="button"
          aria-pressed={multiSource}
          onClick={toggle(multiSource, setMultiSource)}
          title="Une source globale sur tous les niveaux, ou plusieurs — le monde jusqu'au partage, la bande au-delà. Le montage multiple supprime les 404 hors bande, au prix d'un double ombrage dans la bande."
        >
          montage — {multiSource ? "sources multiples" : "source unique"}
        </button>
        <button
          type="button"
          aria-pressed={realisticLight}
          onClick={toggle(realisticLight, setRealisticLight)}
          title="L'élévation de l'étoile suit la latitude du centre de la vue : dans le repère Étoile, la latitude EST cette élévation."
        >
          lumière réaliste
          {realisticLight ? ` — ☀ ${starElevation.toFixed(1)}°` : ""}
        </button>
        <button
          type="button"
          aria-pressed={atmosphere}
          onClick={toggle(atmosphere, setAtmosphere)}
          title="La lumière diffusée par l'air : sans elle, ce que l'étoile n'atteint pas est noir."
        >
          atmosphère
        </button>
        <button
          type="button"
          aria-pressed={paletteOn}
          onClick={toggle(paletteOn, setPaletteOn)}
        >
          {EARTH_HYPSOMETRIC.label}
        </button>

        {paletteOn && (
          <label className="sig-slider" htmlFor="sig-tint-opacity">
            opacité des teintes{" "}
            <output>{Math.round(tintOpacity * 100)}</output> %
            <input
              id="sig-tint-opacity"
              type="range"
              min={TINT_OPACITY_MIN * 100}
              max={TINT_OPACITY_MAX * 100}
              step={5}
              value={Math.round(tintOpacity * 100)}
              onChange={(e) => setTintOpacity(Number(e.target.value) / 100)}
            />
          </label>
        )}
        <button
          type="button"
          aria-pressed={graticuleOn}
          onClick={toggle(graticuleOn, setGraticuleOn)}
        >
          parallèles &amp; méridiens
        </button>
        <button
          type="button"
          aria-pressed={tileBoundaries}
          onClick={toggle(tileBoundaries, setTileBoundaries)}
        >
          bords de tuiles (z/x/y)
        </button>

        {graticuleOn && (
          <p className="sig-legend">
            <span style={{ color: "#e8eef7" }}>—</span> équateur Étoile
            (terminateur)
            <br />
            <span style={{ color: "#e09a5a" }}>—</span> Mur des Tempêtes +6°
            <br />
            <span style={{ color: "#7fb6e0" }}>—</span> Linceul −21°
            <br />
            <span style={{ color: "#6b7f99" }}>╌</span> emprise des tuiles de
            bande
          </p>
        )}
      </div>
    </div>
  );
}
