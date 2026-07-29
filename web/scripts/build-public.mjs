/**
 * scripts/build-public.mjs — build du site PUBLIC (quadrature.marechal-gao.fr).
 *
 * Un simple wrapper autour de `next build` qui positionne les deux variables du
 * mode public avant de l'appeler :
 *
 *   QUADRATURE_PUBLIC=1             → lu par next.config.ts (pageExtensions +
 *                                     output: "export")
 *   NEXT_PUBLIC_QUADRATURE_PUBLIC=1 → inliné dans le bundle client, lu par
 *                                     src/lib/build-mode.ts (masquage des liens)
 *
 * Pourquoi un script Node plutôt que `QUADRATURE_PUBLIC=1 next build` dans
 * package.json : cette syntaxe est propre au shell POSIX et échoue sous Windows,
 * où les scripts npm passent par cmd.exe. Node est le seul terrain d'entente,
 * et évite d'ajouter une dépendance (cross-env) pour deux lignes.
 *
 * Sortie : `web/out/`, autonome, prêt pour `npm run deploy`.
 */

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

// `next dev` génère dans .next/dev/types des validateurs de routes, inclus par
// tsconfig.json. Ils décrivent le jeu de routes LOCAL (avec /encounters) : après
// bascule en mode public ils pointent vers des pages qui n'existent plus, et le
// type-check échoue. On les supprime — `next dev` les régénère au prochain lancement.
rmSync(new URL("../.next/dev/types", import.meta.url), { recursive: true, force: true });

const result = spawnSync("next", ["build"], {
  stdio: "inherit",
  shell: true, // Windows : `next` est un .cmd, non exécutable directement
  env: {
    ...process.env,
    QUADRATURE_PUBLIC: "1",
    NEXT_PUBLIC_QUADRATURE_PUBLIC: "1",
  },
});

process.exit(result.status ?? 1);
