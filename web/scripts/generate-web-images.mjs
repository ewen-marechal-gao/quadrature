/**
 * scripts/generate-web-images.mjs — dérive les images web de la carte d'Aeonir.
 *
 * `public/images/map.jpg` est l'original : 8000×2000, ~8 Mo. C'est la bonne
 * source à conserver, mais la servir telle quelle en fond de page d'accueil fait
 * payer 8 Mo à chaque visiteur avant le premier écran. On en dérive donc :
 *
 *   map-web.jpg  fond de la landing, réduit à une taille d'écran réaliste
 *   og.jpg       carte de partage (1200×630, le format attendu par les réseaux)
 *
 * Les deux sont des ARTEFACTS (gitignorés, régénérés à chaque build) : seul
 * l'original est versionné.
 *
 * `sharp` arrive avec Next.js. Si un jour il disparaît de l'arbre de
 * dépendances, ce script échoue franchement plutôt que de produire un site
 * dégradé silencieusement.
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const SOURCE = path.join(ROOT, "public", "images", "map.jpg");
const OUT_DIR = path.join(ROOT, "public", "images");

if (!existsSync(SOURCE)) {
  console.error(`✗ image source introuvable : ${SOURCE}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

// Fond de la landing : 3200 px de large suffit pour un écran 4K, l'image étant
// de toute façon assombrie par un calque et en dérive lente.
await sharp(SOURCE)
  .resize({ width: 3200, withoutEnlargement: true })
  .jpeg({ quality: 72, mozjpeg: true, progressive: true })
  .toFile(path.join(OUT_DIR, "map-web.jpg"));

// Carte de partage : recadrage centré au ratio 1200×630 attendu par Open Graph.
await sharp(SOURCE)
  .resize({ width: 1200, height: 630, fit: "cover", position: "centre" })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(path.join(ROOT, "public", "og.jpg"));

const ko = (file) => Math.round(statSync(file).size / 1024);
console.log(
  `✓ images web — map-web.jpg (${ko(path.join(OUT_DIR, "map-web.jpg"))} Ko, ` +
    `original ${ko(SOURCE)} Ko) + og.jpg (${ko(path.join(ROOT, "public", "og.jpg"))} Ko)`,
);
