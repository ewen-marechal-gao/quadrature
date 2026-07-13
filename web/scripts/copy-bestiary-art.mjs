/**
 * scripts/copy-bestiary-art.mjs
 *
 * Copie les illustrations d'adversaires depuis data/bestiary/art/ vers
 * public/bestiary/art/ afin qu'elles soient servies statiquement au verso des
 * fiches (cf. lib/bestiary.ts : le champ `art` d'une fiche → /bestiary/art/<fichier>).
 *
 * Les sources vivent dans le dépôt de données (data/), hors de web/public :
 * ce script fait le pont, comme copy-pagedjs.mjs pour paged.js. Exécuté
 * automatiquement avant `next dev` (predev) et `next build` (prebuild).
 *
 * Usage : node scripts/copy-bestiary-art.mjs
 */

import { readdirSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "..", "data", "bestiary", "art");
const DST = join(__dirname, "..", "public", "bestiary", "art");

if (!existsSync(SRC)) {
  // Pas de dossier d'illustrations : rien à copier (les fiches utilisent le placeholder).
  process.exit(0);
}

mkdirSync(DST, { recursive: true });
let copied = 0;
for (const entry of readdirSync(SRC, { withFileTypes: true })) {
  if (entry.isFile()) {
    copyFileSync(join(SRC, entry.name), join(DST, entry.name));
    copied++;
  }
}
if (copied > 0) console.log(`✓  illustrations — ${copied} fichier(s) copié(s) → public/bestiary/art/`);
