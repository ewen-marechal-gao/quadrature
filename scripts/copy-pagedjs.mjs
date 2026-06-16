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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

/* ── Patch : détection du débordement en multicolonne ─────────────────────────
 *
 * Paged.js calcule `this.gap = columnGap − leftMargin`, utilisé comme
 * frontière de détection du débordement : end = bounds.right + this.gap
 * (Layout.findOverflow). Notre mise en page force 2 colonnes via book.css ;
 * la colonne fantôme de débordement commence exactement à
 * bounds.right + columnGap.
 *
 * Avec la formule d'origine, toute gouttière < marge gauche (22mm sur les
 * pages recto du PDF) fait reculer `end` DANS la colonne de droite : du
 * contenu légitime y est pris pour du débordement (sauts de page
 * intempestifs). On remplace par `columnGap − 5px` : 5px sous la position
 * exacte de la colonne fantôme (tolérance d'arrondi), mais toujours au-delà
 * du bord réel du contenu — correct pour toute gouttière ≥ 2mm, ce qui
 * libère le choix de la gouttière dans book.css.
 */
const ORIGINAL = "this.gap =  gap - leftMargin;";
const PATCHED  = "this.gap = gap - 5; /* patché par copy-pagedjs.mjs — voir ce script */";

let source = readFileSync(SRC, "utf-8");
if (source.includes(ORIGINAL)) {
  source = source.replace(ORIGINAL, PATCHED);
  console.log("✓  paged.js patché (this.gap = columnGap − 5px)");
} else if (source.includes("patché par copy-pagedjs.mjs")) {
  // déjà patché (copie précédente relue) — rien à faire
} else {
  console.warn(
    "⚠  Motif `this.gap =  gap - leftMargin;` introuvable dans paged.js —\n" +
    "   la version de pagedjs a peut-être changé. Patch NON appliqué :\n" +
    "   vérifier Layout.constructor (recherche : columnGap) et adapter ce script."
  );
}

writeFileSync(DEST, source);
console.log("✓  paged.js copié → public/pagedjs/paged.js");
