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
 * ⚠️ DEUX fichiers, pas un : le worker importe `./maplibre-gl-shared.mjs` en
 * relatif, donc le voisin doit être là.
 *
 * ⚠️ Le nom `maplibre-gl-worker.mjs` est le pendant de `maplibre-gl.mjs`, celui
 * que le champ `exports` du paquet désigne inconditionnellement — il n'y a pas
 * de condition `development`, donc pas de risque de servir le worker de
 * production à un thread principal en variante `-dev`, ou l'inverse.
 *
 * Usage : node scripts/copy-maplibre-worker.mjs
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "node_modules", "maplibre-gl", "dist");
const DST = join(__dirname, "..", "public", "maplibre");

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

for (const name of FILES) {
  if (!existsSync(join(SRC, name))) {
    console.error(
      `✗  node_modules/maplibre-gl/dist/${name} introuvable.\n` +
        "   Lancez d'abord : npm install"
    );
    process.exit(1);
  }
}

mkdirSync(DST, { recursive: true });
for (const name of FILES) copyFileSync(join(SRC, name), join(DST, name));

console.log(`✓  worker MapLibre — ${FILES.length} fichiers → public/maplibre/`);
