/**
 * app/robots.ts — génère robots.txt au build (compatible `output: "export"`).
 *
 * Posture : ouverte. Le site sert de vitrine (portfolio), donc être trouvable
 * prime — y compris par les crawlers d'IA, qui ne sont pas exclus ici. Pour
 * changer d'avis, ajouter une règle ciblée : { userAgent: "GPTBot", disallow: "/" }.
 */

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
