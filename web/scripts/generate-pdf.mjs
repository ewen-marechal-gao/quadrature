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

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname }                           from "node:path";
import { fileURLToPath }                           from "node:url";
import puppeteer                                   from "puppeteer";
import { PDFDocument, PDFName, PDFNumber, PDFString, PDFArray, PDFDict } from "pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, "..");
const PUBLIC    = join(ROOT, "public");
const OUTPUT    = join(PUBLIC, "quadrature.pdf");

// ── Ordre du sommaire — dérivé de src/data/books.json ───────────────────────
// Pour modifier l'ordre ou ajouter une section : éditer books.json uniquement.
const booksData = JSON.parse(
  readFileSync(join(ROOT, "src", "data", "books.json"), "utf-8")
);
/** @type {string[]} Slugs dans l'ordre livre par livre, section par section. */
const SLUGS = booksData.flatMap((book) => book.sections.map((s) => s.slug));

// ── 1. Charger les ressources ────────────────────────────────────────────────
const contentIndexPath = join(PUBLIC, "content-index-fr.json");
if (!existsSync(contentIndexPath)) {
  console.error(
    "✗  content-index-fr.json introuvable.\n" +
    "   Lancez d'abord : node scripts/generate-content-index.mjs fr"
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

// ── 3b. Mode impression ───────────────────────────────────────────────────────
// Active @media print / désactive @media screen dans book.css :
//   - supprime le fond parchemin et les ombres (page blanche pour l'imprimante)
//   - permet d'injecter les marges asymétriques sans affecter la visionneuse web
await page.emulateMediaType("print");

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

// CSS injecté uniquement dans le PDF : vrai format A4 + marges asymétriques reliure.
// La visionneuse utilise 291mm (book.css) → même contenu 259mm → même layout.
// column-gap déjà 22mm dans book.css → this.gap ≥ 0 sur toutes les pages.
const printLayoutCss = `
@page {
  size: 297mm 210mm;
}
@page :right {
  margin-left:  22mm;
  margin-right: 16mm;
}
@page :left {
  margin-left:  16mm;
  margin-right: 22mm;
}
`;

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
}, bookCss + "\n" + printLayoutCss);

clearInterval(progressTimer);
process.stdout.write(`\r    ✓ ${total} page(s) composée(s).           \n`);

if (total === 0) {
  console.error("✗  Aucune page générée par Paged.js — vérifiez book.css et le contenu.");
  await browser.close();
  process.exit(1);
}

// ── 7. Patcher les références croisées ────────────────────────────────────────
// target-counter CSS ne peut pas résoudre des hrefs /rules/... (ce sont des URLs,
// pas des fragments #id). On identifie la première page Paged.js contenant chaque
// section (via sa classe .section--<slug>), puis on injecte un <span class="cross-ref-page">
// dans chaque lien interne — même approche que applyPageRefs() côté viewer.
console.log("⏳  Correction des références croisées…");
const refsResult = await page.evaluate((slugs) => {
  const allPages = Array.from(document.querySelectorAll(".pagedjs_page"));

  // slug → numéro de page (1-based)
  const slugPageMap = {};
  // slug → [{text, pageIndex}] — titres h2, 0-based
  const h2PageMap   = {};

  for (const slug of slugs) {
    const safeSlug = slug.replace(/[^a-z0-9]/gi, "-");

    // Trouver la première page qui contient un élément de cette section.
    // Paged.js fragmente le contenu mais préserve les classes CSS sur les éléments.
    for (let i = 0; i < allPages.length; i++) {
      if (allPages[i].querySelector(`.section--${safeSlug}`)) {
        slugPageMap[slug] = i + 1;
        break;
      }
    }

    // Extraire les titres h2 et leur page dans la section.
    // On déduplique par texte (Paged.js peut répliquer un fragment sur 2 pages).
    const h2items = [];
    const seen    = new Set();
    for (let i = 0; i < allPages.length; i++) {
      const frag = allPages[i].querySelector(`.section--${safeSlug}`);
      if (!frag) continue;
      for (const h2 of frag.querySelectorAll("h2")) {
        const text = h2.textContent.trim();
        if (text && !seen.has(text)) {
          seen.add(text);
          h2items.push({ text, pageIndex: i }); // 0-based
        }
      }
    }
    if (h2items.length > 0) h2PageMap[slug] = h2items;
  }

  // Patcher tous les liens de cross-référence
  let count = 0;
  const links = document.querySelectorAll("a[href^=\"/rules/\"]");
  links.forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    const slug = href.replace(/^\/rules\//, "").replace(/\/+$/, "");
    const pageNum = slugPageMap[slug];
    if (!pageNum) return;

    link.querySelector(".cross-ref-page")?.remove();
    const span = document.createElement("span");
    span.className = "cross-ref-page";
    span.textContent = ` (p. ${pageNum})`;
    link.appendChild(span);
    count++;
  });

  return { count, slugPageMap, h2PageMap };
}, SLUGS);

const { count: refsPatched, slugPageMap, h2PageMap } = refsResult;
console.log(`    ✓ ${refsPatched} référence(s) croisée(s) patchée(s).`);

// ── 8. Appliquer le CSS d'export PDF ──────────────────────────────────────────
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

// ── 9. Générer le PDF ─────────────────────────────────────────────────────────
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

// ── 10. Post-traitement : métadonnées + signets (pdf-lib) ─────────────────────
// Puppeteer/Chrome ne permet pas d'injecter des métadonnées ni un plan PDF
// directement. On charge le fichier généré avec pdf-lib, on enrichit, on
// réécrit — sans perte de qualité (pdf-lib recopie les flux compressés tels quels).
console.log("⏳  Ajout des métadonnées et des signets…");

const pdfDoc = await PDFDocument.load(readFileSync(OUTPUT));
const pdfCtx = pdfDoc.context;
const pdfPgs = pdfDoc.getPages();

// ── Métadonnées ──────────────────────────────────────────────────────────────
pdfDoc.setTitle("Quadrature — Livre de Règles");
// pdfDoc.setAuthor("Votre nom");  // ← décommenter et renseigner
pdfDoc.setSubject("Jeu de rôle original");
pdfDoc.setKeywords(["JDR", "TTRPG", "Quadrature", "Aeonir"]);
pdfDoc.setProducer("Quadrature PDF Generator");
pdfDoc.setCreator("Paged.js + Puppeteer");
pdfDoc.setCreationDate(new Date());
pdfDoc.setModificationDate(new Date());

// ── Signets — 3 niveaux : Livre (replié) › Section › h2 ─────────────────────
//
// Structure PDF Outline :
//   Racine (/Outlines)
//     └─ Livre A  [Count=-N, replié par défaut]
//          ├─ Section 1  [Count=-M si des h2 existent, replié]
//          │    ├─ Titre h2 a
//          │    └─ Titre h2 b
//          ├─ Section 2
//          └─ Section N
//     └─ Livre B  …
//
// Ordre de construction imposé par les références circulaires :
//   1. Pré-allouer outlinesRef (nécessaire comme /Parent des items livres)
//   2. Pour chaque livre : pré-allouer bookRef, créer les sections avec leurs h2
//      (chaque secRef pré-alloué → passé comme /Parent aux h2 avant assign)
//   3. Chaîner les items livres (Prev/Next), les enregistrer
//   4. Créer et enregistrer la racine, connecter au catalogue

const makePageDest = (pageIndex) => {
  const a = PDFArray.withContext(pdfCtx);
  a.push(pdfPgs[pageIndex].ref);
  a.push(PDFName.of("Fit"));
  return a;
};

const outlinesRef = pdfCtx.nextRef();   // pré-alloué — sera rempli à l'étape 4
const bookRefs    = [];
const bookDicts   = [];
let   totalSecBm  = 0;
let   totalH2Bm   = 0;

for (const book of booksData) {
  const bookTitle = (book.title?.fr ?? book.title);

  // Sections connues dans slugPageMap
  const sections = book.sections
    .map(s => ({
      title:     (s.title?.fr ?? s.title),
      slug:      s.slug,                             // nécessaire pour h2PageMap
      pageIndex: (slugPageMap[s.slug] ?? 0) - 1,    // 0-based
    }))
    .filter(s => s.pageIndex >= 0 && s.pageIndex < pdfPgs.length);

  if (sections.length === 0) continue;

  const bookRef  = pdfCtx.nextRef();   // pré-alloué — nécessaire comme /Parent des sections
  const secRefs  = [];
  const secDicts = [];

  // Passe 1 — créer les items section (sans Prev/Next)
  for (const { title, slug, pageIndex } of sections) {
    const h2items = h2PageMap[slug] ?? [];

    // Le ref section est pré-alloué pour pouvoir être passé
    // comme /Parent aux items h2 avant que le dict soit enregistré.
    const secRef = pdfCtx.nextRef();

    const d = PDFDict.withContext(pdfCtx);
    d.set(PDFName.of("Title"),  PDFString.of(title));
    d.set(PDFName.of("Dest"),   makePageDest(pageIndex));
    d.set(PDFName.of("Parent"), bookRef);

    // ── Sous-items h2 ──────────────────────────────────────────────────────
    if (h2items.length > 0) {
      const h2Refs  = [];
      const h2Dicts = [];

      for (const { text, pageIndex: h2Idx } of h2items) {
        const safeIdx = Math.max(0, Math.min(h2Idx, pdfPgs.length - 1));
        const hd = PDFDict.withContext(pdfCtx);
        hd.set(PDFName.of("Title"),  PDFString.of(text));
        hd.set(PDFName.of("Dest"),   makePageDest(safeIdx));
        hd.set(PDFName.of("Parent"), secRef);
        h2Refs.push(pdfCtx.register(hd));
        h2Dicts.push(hd);
      }

      // Chaîner Prev/Next entre les items h2
      for (let j = 0; j < h2Refs.length; j++) {
        if (j > 0)                   h2Dicts[j].set(PDFName.of("Prev"), h2Refs[j - 1]);
        if (j < h2Refs.length - 1)   h2Dicts[j].set(PDFName.of("Next"), h2Refs[j + 1]);
      }

      d.set(PDFName.of("First"), h2Refs[0]);
      d.set(PDFName.of("Last"),  h2Refs[h2Refs.length - 1]);
      d.set(PDFName.of("Count"), PDFNumber.of(-h2items.length)); // replié par défaut
      totalH2Bm += h2items.length;
    }

    pdfCtx.assign(secRef, d);
    secRefs.push(secRef);
    secDicts.push(d);
  }

  // Passe 2 — chaîner Prev/Next entre sections
  for (let i = 0; i < secRefs.length; i++) {
    if (i > 0)                  secDicts[i].set(PDFName.of("Prev"), secRefs[i - 1]);
    if (i < secRefs.length - 1) secDicts[i].set(PDFName.of("Next"), secRefs[i + 1]);
  }

  // Item livre : Count négatif = replié par défaut dans les lecteurs PDF
  const bd = PDFDict.withContext(pdfCtx);
  bd.set(PDFName.of("Title"),  PDFString.of(bookTitle));
  bd.set(PDFName.of("Dest"),   makePageDest(sections[0].pageIndex));
  bd.set(PDFName.of("Parent"), outlinesRef);
  bd.set(PDFName.of("First"),  secRefs[0]);
  bd.set(PDFName.of("Last"),   secRefs[secRefs.length - 1]);
  bd.set(PDFName.of("Count"),  PDFNumber.of(-sections.length));

  bookRefs.push(bookRef);
  bookDicts.push(bd);
  totalSecBm += sections.length;
}

if (bookRefs.length > 0) {
  // Chaîner les items livres (Prev/Next), puis les enregistrer
  for (let i = 0; i < bookRefs.length; i++) {
    if (i > 0)                    bookDicts[i].set(PDFName.of("Prev"), bookRefs[i - 1]);
    if (i < bookRefs.length - 1)  bookDicts[i].set(PDFName.of("Next"), bookRefs[i + 1]);
    pdfCtx.assign(bookRefs[i], bookDicts[i]);
  }

  // Racine du plan
  const outlinesDict = PDFDict.withContext(pdfCtx);
  outlinesDict.set(PDFName.of("Type"),  PDFName.of("Outlines"));
  outlinesDict.set(PDFName.of("First"), bookRefs[0]);
  outlinesDict.set(PDFName.of("Last"),  bookRefs[bookRefs.length - 1]);
  outlinesDict.set(PDFName.of("Count"), PDFNumber.of(bookRefs.length));
  pdfCtx.assign(outlinesRef, outlinesDict);

  // Connecter au catalogue + ouvrir le panneau signets à l'ouverture du PDF
  pdfDoc.catalog.set(PDFName.of("Outlines"), outlinesRef);
  pdfDoc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

writeFileSync(OUTPUT, await pdfDoc.save());
console.log(
  `    ✓ ${bookRefs.length} livre(s) / ${totalSecBm} section(s) / ${totalH2Bm} titre(s) h2 dans le plan PDF.`
);

console.log(`\n✅  PDF généré avec succès :`);
console.log(`    ${OUTPUT}`);
console.log(`    ${total} page(s) — A4 paysage\n`);
