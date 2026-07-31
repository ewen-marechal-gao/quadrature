/**
 * scripts/check-ci.mjs — rejoue localement la condition de la CI.
 *
 * Le job de déploiement ne fait `npm ci` que dans `web/`. Le site, lui, importe
 * des TYPES du simulateur (`@sim/*`, cf. tsconfig.json) : TypeScript charge alors
 * tout le graphe d'imports pour les résoudre, et si l'un de ces fichiers importe
 * une dépendance du simulateur, le type-check réclame un paquet que le runner n'a
 * pas. En local il est là — la panne ne se voit qu'une fois poussée.
 *
 * C'est exactement ce qui est arrivé : `character/types.ts` prenait `Inventory`
 * dans `equipment/inventory.ts`, qui importe `items-data.ts`, qui importe `yaml`.
 * Trois déploiements ont échoué sur « Cannot find module 'yaml' ».
 *
 * Ce script masque `simulator/node_modules` le temps d'un `npm run build:public`,
 * puis le restaure — y compris si le build échoue ou si on l'interrompt. C'est un
 * RENOMMAGE, pas une suppression : rien n'est réinstallé ensuite.
 *
 * À lancer avant de pousser un changement qui touche aux types partagés.
 */

import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const MODULES = path.join(ROOT, "..", "simulator", "node_modules");
const HIDDEN = `${MODULES}_hidden-by-check-ci`;

// Un dossier masqué qui traîne = un run précédent tué avant sa restauration.
// On refuse d'aller plus loin plutôt que d'écraser l'un avec l'autre.
if (existsSync(HIDDEN)) {
  console.error(
    `✗ ${HIDDEN} existe déjà — un contrôle précédent ne s'est pas terminé.\n` +
      `  Renomme-le en 'node_modules' avant de relancer.`,
  );
  process.exit(1);
}

const present = existsSync(MODULES);
let hidden = false;

/** Idempotente : appelée par le chemin normal ET par les gestionnaires de signaux. */
function restore() {
  if (!hidden) return;
  hidden = false;
  renameSync(HIDDEN, MODULES);
  console.log("✓ simulator/node_modules restauré");
}

// Ctrl-C ne doit pas laisser le simulateur amputé de ses dépendances.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restore();
    process.exit(130);
  });
}

let status = 1;
try {
  if (present) {
    renameSync(MODULES, HIDDEN);
    hidden = true;
    console.log("→ simulator/node_modules masqué — build dans les conditions du runner\n");
  } else {
    console.log("→ simulator/node_modules déjà absent — conditions du runner d'office\n");
  }

  status = spawnSync("npm", ["run", "build:public"], {
    stdio: "inherit",
    cwd: ROOT,
    shell: true, // Windows : `npm` est un .cmd, non exécutable directement
  }).status ?? 1;
} finally {
  restore();
}

console.log(
  status === 0
    ? "\n✓ le site se construit avec ses seules dépendances — la CI passera"
    : "\n✗ build en échec sans les dépendances du simulateur : la CI échouera de même",
);

process.exit(status);
