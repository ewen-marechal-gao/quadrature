"use client";

/**
 * SigViewer — la frontière serveur/navigateur du visualiseur.
 *
 * MapLibre touche `window` dès l'évaluation de son module : il ne peut pas être
 * rendu côté serveur. `ssr: false` répond à ça, et **doit vivre dans un
 * composant client** — Next.js 16 le refuse dans un composant serveur. D'où ce
 * fichier, dont c'est le seul rôle.
 *
 * Même montage que `BookViewerLoader` pour Paged.js : la page reste un composant
 * serveur, seul ce maillon est client.
 */

import dynamic from "next/dynamic";
import "@/app/sig.css";

const DynamicSigMap = dynamic(
  () => import("./SigMap").then((m) => ({ default: m.SigMap })),
  {
    ssr: false,
    loading: () => (
      <div className="sig">
        <div className="sig-map sig-empty">chargement du relief…</div>
      </div>
    ),
  }
);

export function SigViewer({
  tilejsonUrl,
  hydroUrl,
}: {
  tilejsonUrl: string;
  hydroUrl: string;
}) {
  return <DynamicSigMap tilejsonUrl={tilejsonUrl} hydroUrl={hydroUrl} />;
}
