import type { NextConfig } from "next";

/**
 * Deux modes de build (cf. src/lib/build-mode.ts) :
 *
 *  • LOCAL (défaut) — mode HYBRIDE : chaque route choisit son rendu. Les pages
 *    du livre sont prérendues (SSG), tandis que l'outil de rejeu de combat
 *    (`/encounters`, `/api/combat-reports`) est dynamique — il lit le disque à
 *    la demande, ce que l'export statique interdit. Le site se sert alors via
 *    un serveur Node (`next start`).
 *
 *  • PUBLIC (`QUADRATURE_PUBLIC=1`) — ce qui part en ligne. Les routes locales
 *    sont retirées du build par `pageExtensions` : leurs fichiers s'appellent
 *    `page.local.tsx` / `route.local.ts`, extensions reconnues uniquement en
 *    mode local. Il ne reste alors que des pages statiques, donc `output:
 *    "export"` redevient possible → un dossier `out/` autonome, servi par nginx
 *    sur le VPS, sans process Node en production.
 *
 * Le pipeline PDF n'est concerné par aucun des deux (il lit
 * `public/content-index-fr.json`).
 */
const isPublicBuild = process.env.QUADRATURE_PUBLIC === "1";

const nextConfig: NextConfig = {
  trailingSlash: true,

  // En local, `local.tsx` / `local.ts` s'ajoutent aux extensions reconnues, ce
  // qui « allume » les routes de l'outil de combat. En public, elles ne
  // figurent pas dans la liste : les fichiers sont ignorés par le routeur.
  pageExtensions: isPublicBuild
    ? ["tsx", "ts"]
    : ["local.tsx", "local.ts", "tsx", "ts"],

  ...(isPublicBuild ? { output: "export" as const } : {}),
};

export default nextConfig;
