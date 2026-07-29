/**
 * src/lib/site.ts — identité publique du site.
 *
 * Une seule source pour l'URL canonique : elle sert au sitemap, au robots.txt
 * et à `metadataBase` (qui transforme les chemins relatifs des cartes Open Graph
 * en URLs absolues, seul format accepté par les réseaux sociaux).
 */

export const SITE_URL = "https://quadrature.marechal-gao.fr";

export const SITE_NAME = "Quadrature";
