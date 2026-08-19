/**
 * /sig — visualiseur du SIG d'Aeonir.
 *
 * ── Pourquoi hors de `[locale]` ───────────────────────────────────────
 * Le panneau n'a aucun contenu traduisible — ce sont des chiffres, des noms de
 * tuiles et du vocabulaire géomatique. Sous `[locale]` on fabriquerait un
 * `/en/sig/` strictement identique au français, pour rien.
 *
 * ── « Cachée » ────────────────────────────────────────────────────────
 * La route est PUBLIQUE : rien ne la protège, et c'est voulu — elle est faite
 * pour être partagée par lien. Elle n'est simplement annoncée nulle part :
 * aucun bouton depuis la landing, et **pas d'entrée dans `sitemap.ts`**, parce
 * qu'inscrire une page au sitemap, c'est précisément l'annoncer.
 *
 * ── Les tuiles ────────────────────────────────────────────────────────
 * `public/aeonir/` est rempli par `scripts/copy-aeonir-tiles.mjs` depuis
 * `geo/out/tiles`, gitignoré des deux côtés : la reproductibilité est assurée
 * par le code du pipeline, pas par le stockage. Le dossier peut donc être
 * absent — le visualiseur le dit alors au lieu de rester noir.
 */

import type { Metadata } from "next";

import { SigViewer } from "@/components/sig/SigViewer";

/** Les joints. Le Lot 6 y branchera le tuileur dynamique sans toucher au reste. */
const TILEJSON_URL = "/aeonir/tiles.json";

/**
 * L'hydrologie, produite par une commande distincte et donc FACULTATIVE — le
 * visualiseur s'ouvre sans elle. Voir `fetchHydroTileJSON`.
 */
const HYDRO_URL = "/aeonir-hydro/hydro.json";

export const metadata: Metadata = {
  title: "Aeonir — SIG",
  description:
    "Visualiseur du relief d'Aeonir : pyramide de tuiles terrarium produite " +
    "par un pipeline Python, rendue par MapLibre dans le repère Étoile.",
  // La page est publique mais non annoncée ; on ne demande pas non plus aux
  // moteurs de la référencer.
  robots: { index: false, follow: false },
};

export default function SigPage() {
  return <SigViewer tilejsonUrl={TILEJSON_URL} hydroUrl={HYDRO_URL} />;
}
