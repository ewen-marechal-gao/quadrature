/**
 * scripts/generate-pdf.mjs
 *
 * Génère public/quadrature.pdf à partir de l'ensemble des sections du livre.
 *
 * Fonctionnement :
 *   1. Lit public/content-index.json (produit par generate-content-index.mjs)
 *   2. Concatène toutes les sections HTML dans l'ordre de navigation
 *   3. Lance Puppeteer (Chromium headless)
 *   4. Rend le document via Paged.js + book.css (même moteur que le viewer)
 *   5. Exporte le résultat en PDF A4 paysage → public/quadrature.pdf
 *
 * Prérequis :
 *   node scripts/generate-content-index.mjs   (ou npm run prebuild)
 *
 * Usage :
 *   node scripts/generate-pdf.mjs
 */

import { readFileSync, existsSync }  from "node:fs";
import { join, dirname }             from "node:path";
import { fileURLToPath }             from "node:url";
import puppeteer                     from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, "..");
const PUBLIC    = join(ROOT, "public");
const OUTPUT    = join(PUBLIC, "quadrature.pdf");

// ── Ordre du sommaire ────────────────────────────────────────────────────────
// Miroir de src/lib/nav.ts → NAV_FLAT.  Mettre à jour si NAV change.
const SLUGS = [
  // Règles fondamentales
  "core/materiel",
  "core/glossaire",
  "core/caracteristiques",
  "core/jet",
  "core/ressources",
  "core/etats",
  "core/furtivite",
  "core/combat",
  "core/personnages",
  "core/traits",
  "core/equipement",
  "core/actions/universal_actions",
  "core/actions/attribute_actions",
  "core/actions/defense_reactions",
  // Disciplines
  "disciplines/magie_intro",
  "disciplines/martial_escrime",
  "disciplines/martial_lames_courtes",
  "disciplines/martial_hast",
  "disciplines/martial_archerie",
  "disciplines/martial_tir_tendu",
  "disciplines/martial_arts_martiaux",
  "disciplines/martial_impact",
  "disciplines/magie_biomancie",
  "disciplines/magie_telepathie",
  "disciplines/magie_electromancie",
  "disciplines/magie_calomancie",
  "disciplines/magie_echomancie",
  "disciplines/magie_alchimie",
  "disciplines/magie_choromancie",
  // Adversaires
  "adversaires/regles_adversaires",
  "adversaires/exemples_adversaires",
  // Univers
  "univers/lore",
  "univers/ecologie",
  "univers/peuples",
  // WIP
  "_wip/traits_effets",
  "_wip/cartes",
  "_wip/decouverte",
];

// ── 1. Charger les ressources ────────────────────────────────────────────────
const contentIndexPath = join(PUBLIC, "content-index.json");
if (!existsSync(contentIndexPath)) {
  console.error(
    "✗  content-index.json introuvable.\n" +
    "   Lancez d'abord : node scripts/generate-content-index.mjs"
  );
  process.exit(1);
}

const contentIndex = JSON.parse(readFileSync(contentIndexPath, "utf-8"));
const bookCss      = readFileSync(join(PUBLIC, "book.css"),         "utf-8");
const pagedJsPath  = join(PUBLIC, "pagedjs", "paged.js");

if (!existsSync(pagedJsPath)) {
  console.error("✗  public/pagedjs/paged.js introuvable.");
  process.exit(1);
}

// ── 2. Concaténer le HTML de toutes les sections ─────────────────────────────
const bodyHtml = SLUGS
  .map((slug) => contentIndex[slug] ?? "")
  .filter(Boolean)
  .join("\n");

const sectionCount = SLUGS.filter((s) => contentIndex[s]).length;
console.log(`\n📖  ${sectionCount} section(s) chargée(s) depuis content-index.json`);

// ── 3. Lancer Puppeteer ──────────────────────────────────────────────────────
console.log("⏳  Démarrage de Chromium…");
const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-web-security",   // autorise certaines opérations CSS cross-origin
  ],
});

const page = await browser.newPage();
page.setDefaultTimeout(300_000); // 5 minutes max

// Log des erreurs JS internes à la page (debug)
page.on("pageerror", (err) => console.warn("  [page] ⚠", err.message));
page.on("console",   (msg) => {
  if (msg.type() === "error") console.warn("  [console] ⚠", msg.text());
});

// ── 4. Charger le contenu ─────────────────────────────────────────────────────
// On pose le HTML brut dans le <body> — Paged.js le lira et en fera des pages.
// Le <link> Google Fonts est indispensable ici : Paged.js injecte book.css
// dans un <style> créé par JS, où @import est ignoré par le navigateur.
// waitUntil:"networkidle0" garantit que la police Modern Antiqua est
// téléchargée avant que Paged.js commence le rendu des titres.
console.log("⏳  Chargement du contenu HTML + police…");
await page.setContent(
  `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Modern+Antiqua&display=swap">
</head>
<body>${bodyHtml}</body>
</html>`,
  { waitUntil: "networkidle0" }
);

// ── 5. Injecter Paged.js ──────────────────────────────────────────────────────
// addScriptTag lire le fichier et l'injecte dans <head> — aucun fetch réseau.
await page.addScriptTag({ path: pagedJsPath });

// ── 6. Lancer le rendu Paged.js ───────────────────────────────────────────────
console.log("⏳  Rendu Paged.js en cours (1–3 minutes selon le volume)…");

// Suivi de progression toutes les 800 ms
let lastCount = 0;
const progressTimer = setInterval(async () => {
  try {
    const n = await page.evaluate(
      () => document.querySelectorAll(".pagedjs_page").length
    );
    if (n !== lastCount) {
      lastCount = n;
      process.stdout.write(`\r    ${n} page(s) composée(s)…`);
    }
  } catch { /* page en cours de modification */ }
}, 800);

const total = await page.evaluate(async (css) => {
  // Extraire le HTML du body avant que Paged.js le remplace
  const html = document.body.innerHTML;
  document.body.innerHTML = "";

  // Conteneur de rendu séparé
  const container = document.createElement("div");
  document.body.appendChild(container);

  // Lancer la prévisualisation Paged.js
  // Le CSS est passé en ligne (objet {url: contenu}) pour éviter tout fetch.
  // eslint-disable-next-line no-undef
  const paged = new window.Paged.Previewer();
  const flow  = await paged.preview(
    html,
    [{ "book.css": css }],
    container
  );

  return flow?.total ?? 0;
}, bookCss);

clearInterval(progressTimer);
process.stdout.write(`\r    ✓ ${total} page(s) composée(s).           \n`);

if (total === 0) {
  console.error("✗  Aucune page générée par Paged.js — vérifiez book.css et le contenu.");
  await browser.close();
  process.exit(1);
}

// ── 7. Appliquer le CSS d'export PDF ──────────────────────────────────────────
// Paged.js dispose les pages en flex (prévu pour l'affichage écran).
// Pour le PDF, on les empile en display:block afin que chaque .pagedjs_page
// (297mm × 210mm = A4 paysage) corresponde exactement à une page PDF.
await page.addStyleTag({
  content: `
    .pagedjs_pages {
      display: block !important;
      padding: 0 !important;
      gap: 0 !important;
      transform: none !important;
      width: 297mm !important;
      background: white !important;
    }
    .pagedjs_page {
      page-break-after: always;
      break-after: page;
    }
    .pagedjs_page:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
  `,
});

// ── 8. Générer le PDF ─────────────────────────────────────────────────────────
console.log("⏳  Génération du PDF…");
await page.pdf({
  path: OUTPUT,
  // A4 paysage : 297 mm × 210 mm
  width:  "297mm",
  height: "210mm",
  printBackground: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
});

await browser.close();

console.log(`\n✅  PDF généré avec succès :`);
console.log(`    ${OUTPUT}`);
console.log(`    ${total} page(s) — A4 paysage\n`);
