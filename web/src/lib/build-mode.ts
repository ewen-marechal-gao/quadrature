/**
 * src/lib/build-mode.ts — distinction build LOCAL / build PUBLIC.
 *
 * Le site a deux visages :
 *
 *  • build LOCAL (`npm run dev`, `npm run build`) — le site complet, y compris
 *    les outils de mise au point qui lisent le disque : le visualiseur de combat
 *    (`/[locale]/encounters`) et sa route de suppression (`/api/combat-reports`).
 *
 *  • build PUBLIC (`npm run build:public`) — ce qui est mis en ligne sur
 *    quadrature.marechal-gao.fr : un export statique, sans aucune route
 *    dynamique, donc sans les outils ci-dessus.
 *
 * L'exclusion des routes elles-mêmes ne se fait PAS ici mais dans
 * `next.config.ts`, via `pageExtensions` : les fichiers `page.local.tsx` /
 * `route.local.ts` ne sont reconnus comme routes qu'en build local. Cette
 * constante ne sert qu'aux composants qui doivent masquer un LIEN vers ces
 * routes (sinon on publierait des liens morts).
 *
 * Le préfixe `NEXT_PUBLIC_` est nécessaire : la valeur est lue depuis des
 * composants client (LandingPage), donc elle doit être inlinée au build.
 */

export const IS_PUBLIC_BUILD = process.env.NEXT_PUBLIC_QUADRATURE_PUBLIC === "1";
