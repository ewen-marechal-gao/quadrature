/**
 * scripts/copy-aeonir-tiles.mjs
 *
 * Copie la pyramide de tuiles du SIG depuis geo/out/tiles/ vers
 * public/aeonir/, d'où /sig la consomme (cf. src/app/sig/page.tsx).
 *
 * Même pont que copy-bestiary-art.mjs : la source vit hors de web/, produite
 * par un autre sous-projet. Ni l'origine ni la destination ne sont versionnées —
 * la reproductibilité est assurée par le code du pipeline, pas par le stockage.
 *
 * ⚠️ L'absence de tuiles n'est PAS une erreur. C'est l'état normal d'un clone
 * frais, où le pipeline Python n'a jamais tourné. Le script se contente alors de
 * le dire : le site doit se construire, et /sig affiche un message explicite
 * plutôt qu'un écran noir.
 *
 * Pour les produire, depuis geo/ et avec le venv actif — le MNT d'abord, la
 * pyramide ensuite, qui le consomme :
 *   .venv/Scripts/python.exe -m aeonir_gis.dem
 *   .venv/Scripts/python.exe -m aeonir_gis.pyramid
 *
 * Usage : node scripts/copy-aeonir-tiles.mjs
 */

import { cpSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "..", "geo", "out", "tiles");
const DST = join(__dirname, "..", "public", "aeonir");

if (!existsSync(join(SRC, "tiles.json"))) {
  console.warn(
    "⚠  geo/out/tiles/tiles.json introuvable — /sig n'aura pas de relief.\n" +
      "   Pour le produire, depuis geo/ : python -m aeonir_gis.dem\n" +
      "                          puis  : python -m aeonir_gis.pyramid"
  );
  process.exit(0);
}

// Copie de remplacement, et non d'appoint : une pyramide dont le partage a
// changé laisserait sinon traîner les tuiles de l'ancienne emprise, que
// MapLibre servirait sans rien signaler — un relief à moitié périmé est plus
// coûteux à diagnostiquer qu'un relief absent.
rmSync(DST, { recursive: true, force: true });
cpSync(SRC, DST, { recursive: true });

// Le compte de fichiers vaut confirmation : c'est le premier chiffre à comparer
// au récapitulatif du tuileur si /sig affiche des trous.
let tiles = 0;
let bytes = 0;
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".png")) {
      tiles++;
      bytes += statSync(path).size;
    }
  }
};
walk(DST);

console.log(
  `✓  relief d'Aeonir — ${tiles} tuiles, ` +
    `${(bytes / 1024 / 1024).toFixed(1)} Mio → public/aeonir/`
);
