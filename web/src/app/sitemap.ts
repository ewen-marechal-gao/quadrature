/**
 * app/sitemap.ts — génère sitemap.xml au build (compatible `output: "export"`).
 *
 * On n'indexe que les locales activées : `/en` n'est aujourd'hui qu'une page
 * « traduction en cours », qui n'a rien à faire dans un index de recherche.
 *
 * Les routes de l'outil local (/encounters) n'apparaissent pas ici : elles
 * n'existent pas dans le build public (cf. next.config.ts).
 */

import type { MetadataRoute } from "next";
import { BOOKS, LOCALES } from "@/lib/nav";
import { SITE_URL } from "@/lib/site";

// Exigé par `output: "export"` : le `new Date()` ci-dessous suffirait sinon à
// faire classer la route comme dynamique. Il est ici évalué au build.
export const dynamic = "force-static";

/** Rubriques de premier niveau, hors livres. `trailingSlash: true` oblige. */
const SECTIONS = [
  "", "cartes/", "traits/", "equipement/", "adversaires/", "evolution/", "personnage/",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return LOCALES.filter((l) => l.enabled).flatMap((l) => [
    ...SECTIONS.map((section) => ({
      url: `${SITE_URL}/${l.id}/${section}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: section === "" ? 1 : 0.8,
    })),
    ...BOOKS.map((book) => ({
      url: `${SITE_URL}/${l.id}/volumen/${book.id}/`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
  ]);
}
