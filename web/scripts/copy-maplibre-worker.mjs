/**
 * scripts/copy-maplibre-worker.mjs
 *
 * Copie le worker de MapLibre depuis node_modules vers public/maplibre/.
 *
 * ── Pourquoi ce script existe ─────────────────────────────────────────
 * MapLibre 6 déduit l'URL de son worker de son PROPRE emplacement :
 *
 *   function () {
 *     let e = import.meta.url;
 *     if (!/^https?:/.test(e)) return "";          // ← ici
 *     return new URL("./maplibre-gl-worker.mjs", e).href;
 *   }
 *
 * Une fois la bibliothèque bundlée, `import.meta.url` n'est plus une URL http :
 * la fonction rend la chaîne vide, `new Worker("")` se résout contre le document,
 * et le navigateur reçoit du HTML là où il attendait un module. Symptôme observé,
 * et parfaitement muet côté MapLibre :
 *
 *   Failed to load module script: The server responded with a non-JavaScript
 *   MIME type of "text/html".
 *
 * La carte se construit, le canevas apparaît — mais le style n'est jamais
 * analysé (c'est le travail du worker), donc `isStyleLoaded()` reste false et
 * rien ne s'affiche. Aucune erreur ne remonte à `map.on("error")`.
 *
 * MapLibre prévoit la sortie : `setWorkerUrl()` l'emporte sur la déduction
 * (`config.WORKER_URL || deduire()`). Encore faut-il que le fichier soit servi —
 * c'est ce que fait ce script, comme copy-pagedjs.mjs pour Paged.js.
 *
 * ⚠️ DEUX fichiers, pas un : le worker importe son voisin `maplibre-gl-shared`
 * en relatif, donc il doit être là.
 *
 * ⚠️ Et ils sont renommés en **`.js`**. Découvert en production, pas en local :
 * nginx ne connaît pas l'extension `.mjs` et sert ces fichiers en
 * `application/octet-stream`, que le navigateur REFUSE pour un script de
 * module. C'est exactement le défaut que `setWorkerUrl` devait écarter, revenu
 * par une autre porte — et invisible en développement, où le serveur de Next
 * répond `application/javascript`.
 *
 * Corriger nginx aurait demandé une intervention hors dépôt : sa configuration
 * vit à la main sur le VPS, la CI ne synchronisant que le contenu du site (cf.
 * deploy/README.md). Et ça n'aurait rien réglé sur un autre hôte. `.js` est
 * connu de tous, donc le problème disparaît au lieu d'être contourné.
 *
 * L'import interne du worker est réécrit en conséquence.
 *
 * ⚠️ Le nom `maplibre-gl-worker` est le pendant de `maplibre-gl.mjs`, celui que
 * le champ `exports` du paquet désigne inconditionnellement — il n'y a pas de
 * condition `development`, donc pas de risque de servir le worker de production
 * à un thread principal en variante `-dev`, ou l'inverse.
 *
 * Usage : node scripts/copy-maplibre-worker.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "node_modules", "maplibre-gl", "dist");
const DST = join(__dirname, "..", "public", "maplibre");

/** `.mjs` à la source, `.js` une fois servis — voir l'en-tête. */
const FILES = ["maplibre-gl-worker", "maplibre-gl-shared"];

const VOISIN_AVANT = "./maplibre-gl-shared.mjs";
const VOISIN_APRES = "./maplibre-gl-shared.js";

for (const name of FILES) {
  if (!existsSync(join(SRC, `${name}.mjs`))) {
    console.error(
      `✗  node_modules/maplibre-gl/dist/${name}.mjs introuvable.\n` +
        "   Lancez d'abord : npm install"
    );
    process.exit(1);
  }
}

mkdirSync(DST, { recursive: true });

for (const name of FILES) {
  let source = readFileSync(join(SRC, `${name}.mjs`), "utf-8");

  // La carte de source désigne un `.mjs.map` qu'on ne copie pas : la garder
  // produirait un 404 dans l'onglet réseau à chaque chargement du worker.
  source = source.replace(/\/\/# sourceMappingURL=.*/g, "");

  if (name === "maplibre-gl-worker") {
    if (!source.includes(VOISIN_AVANT)) {
      console.error(
        `✗  l'import de « ${VOISIN_AVANT} » est introuvable dans le worker.\n` +
          "   La version de maplibre-gl a changé : vérifier comment le worker\n" +
          "   désigne son voisin, puis adapter ce script. Sans quoi le style ne\n" +
          "   se chargera jamais — EN SILENCE, c'est tout le problème."
      );
      process.exit(1);
    }
    source = source.replace(VOISIN_AVANT, VOISIN_APRES);
  }

  writeFileSync(join(DST, `${name}.js`), source);
}

console.log(`✓  worker MapLibre — ${FILES.length} fichiers .js → public/maplibre/`);
