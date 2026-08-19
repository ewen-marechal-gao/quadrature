/**
 * scripts/copy-aeonir-tiles.mjs
 *
 * Copie les pyramides du SIG depuis geo/out/ vers public/, d'où /sig les
 * consomme (cf. src/app/sig/page.tsx). Il y en a deux, produites par deux
 * commandes distinctes :
 *
 *   geo/out/tiles   → public/aeonir/        relief, PNG terrarium
 *   geo/out/vector  → public/aeonir-hydro/  hydrologie, MVT
 *
 * Même pont que copy-bestiary-art.mjs : la source vit hors de web/, produite
 * par un autre sous-projet. Ni l'origine ni la destination ne sont versionnées —
 * la reproductibilité est assurée par le code du pipeline, pas par le stockage.
 *
 * ⚠️ L'absence d'une pyramide n'est PAS une erreur, et elle se traite pyramide
 * PAR pyramide. Un clone frais n'en a aucune ; un dépôt où seul le MNT a tourné
 * n'a que le relief. Les trois états sont ordinaires, et /sig doit s'ouvrir dans
 * les trois — en le disant, plutôt qu'en restant noir.
 *
 * Pour les produire, depuis geo/ et avec le venv actif — chacune consomme la
 * sortie de l'étape précédente :
 *   .venv/Scripts/python.exe -m aeonir_gis.dem       puis  aeonir_gis.pyramid
 *   .venv/Scripts/python.exe -m aeonir_gis.export    puis  aeonir_gis.mvt
 *
 * Usage : node scripts/copy-aeonir-tiles.mjs
 */

import { cpSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEO = join(__dirname, "..", "..", "geo", "out");
const PUBLIC = join(__dirname, "..", "public");

/**
 * Chaque pyramide est décrite par son contrat, qui sert aussi de témoin de
 * présence : c'est le fichier que le client demande en premier, donc celui dont
 * l'absence a exactement le sens qu'on veut détecter.
 */
const PYRAMIDS = [
  {
    label: "relief d'Aeonir",
    src: join(GEO, "tiles"),
    dst: join(PUBLIC, "aeonir"),
    contract: "tiles.json",
    extension: ".png",
    produce: "python -m aeonir_gis.dem  puis  python -m aeonir_gis.pyramid",
  },
  {
    label: "hydrologie d'Aeonir",
    src: join(GEO, "vector"),
    dst: join(PUBLIC, "aeonir-hydro"),
    contract: "hydro.json",
    extension: ".pbf",
    produce: "python -m aeonir_gis.export  puis  python -m aeonir_gis.mvt",
  },
];

const count = (dir, extension) => {
  let tiles = 0;
  let bytes = 0;
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(extension)) {
        tiles++;
        bytes += statSync(child).size;
      }
    }
  };
  walk(dir);
  return { tiles, bytes };
};

for (const pyramid of PYRAMIDS) {
  if (!existsSync(join(pyramid.src, pyramid.contract))) {
    console.warn(
      `⚠  ${pyramid.contract} introuvable — /sig n'aura pas ${pyramid.label}.\n` +
        `   Pour le produire, depuis geo/ : ${pyramid.produce}`
    );
    continue;
  }

  // Copie de REMPLACEMENT, et non d'appoint : une pyramide dont le partage a
  // changé laisserait sinon traîner les tuiles de l'ancienne emprise, que
  // MapLibre servirait sans rien signaler — une donnée à moitié périmée est
  // plus coûteuse à diagnostiquer qu'une donnée absente.
  rmSync(pyramid.dst, { recursive: true, force: true });
  cpSync(pyramid.src, pyramid.dst, { recursive: true });

  // Le compte de fichiers vaut confirmation : c'est le premier chiffre à
  // comparer au récapitulatif du tuileur si /sig affiche des trous.
  const { tiles, bytes } = count(pyramid.dst, pyramid.extension);
  console.log(
    `✓  ${pyramid.label} — ${tiles} tuiles, ` +
      `${(bytes / 1024 / 1024).toFixed(1)} Mio → ${pyramid.dst.split("public")[1]}`
  );
}
