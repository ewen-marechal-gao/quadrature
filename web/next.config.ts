import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mode HYBRIDE (pas d'`output: "export"`) : chaque route choisit son rendu.
  // Les pages du livre restent prérendues statiques (SSG, via leur
  // `generateStaticParams`), tandis que l'outil local de rejeu de combat
  // (`/encounters`, `/api/combat-reports`) est dynamique — ce que l'export
  // statique interdisait (aucun route handler de mutation, même en dev).
  // Conséquence : le site se sert désormais via un serveur Node (`next start`),
  // plus via un dossier statique `out/`. Le pipeline PDF n'est pas concerné
  // (il lit `public/content-index-fr.json`, jamais `out/`).
  trailingSlash: true,
};

export default nextConfig;
