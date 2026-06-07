/**
 * scripts/copy-pagedjs.mjs
 *
 * Copie paged.js depuis node_modules vers public/pagedjs/.
 *
 * Pourquoi ce script existe :
 *   Paged.js ne peut pas être bundlé par Turbopack (utilisé par `next dev`)
 *   car son module ESM exporte via `window.Paged` au lieu des exports ESM
 *   standards. La solution retenue est de servir paged.js comme fichier statique
 *   (`/pagedjs/paged.js`) et de l'injecter via une balise <script> à la demande.
 *
 *   Ce script automatise la copie depuis node_modules afin que le fichier ne
 *   soit jamais committé dans le dépôt (voir .gitignore). Il est exécuté
 *   automatiquement avant `next dev` (predev) et `next build` (prebuild).
 *
 * Usage :
 *   node scripts/copy-pagedjs.mjs
 */

import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname }                       from "node:path";
import { fileURLToPath }                       from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, "..");

const SRC  = join(ROOT, "node_modules", "pagedjs", "dist", "paged.js");
const DEST_DIR = join(ROOT, "public", "pagedjs");
const DEST = join(DEST_DIR, "paged.js");

if (!existsSync(SRC)) {
  console.error(
    "✗  node_modules/pagedjs/dist/paged.js introuvable.\n" +
    "   Lancez d'abord : npm install"
  );
  process.exit(1);
}

mkdirSync(DEST_DIR, { recursive: true });
copyFileSync(SRC, DEST);
console.log("✓  paged.js copié → public/pagedjs/paged.js");
