/**
 * Génère public/content-index.json avec le HTML rendu de chaque section.
 * Utilisé par le BookPreloader pour pré-calculer le nombre de pages
 * de chaque section au chargement de l'application.
 *
 * Exécuté automatiquement avant `next build` et `next dev`.
 * Reproduce la même pipeline que src/lib/content.ts.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Locale passée en argument CLI : node generate-content-index.mjs [locale]
// Par défaut : "fr". Exemple EN : node generate-content-index.mjs en
const locale    = process.argv[2] ?? "fr";
const RULES_DIR = join(__dirname, "..", "..", "rules", locale);
const OUTPUT    = join(__dirname, "..", "public", `content-index-${locale}.json`);

// Dossier images du contenu (rules/{locale}/images/) → copié vers public/images/
const IMAGES_SRC = join(RULES_DIR, "images");
const IMAGES_DST = join(__dirname, "..", "public", "images");

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function collectMdFiles(dir, base = dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMdFiles(full, base));
    } else if (entry.name.endsWith(".md") && entry.name !== "_index.md") {
      const slug = relative(base, full)
        .replace(/\\/g, "/")
        .replace(/\.md$/, "");
      results.push({ path: full, slug });
    }
  }
  return results;
}

/**
 * Réécrit les chemins d'images relatifs en chemins web absolus.
 *
 * Les images stockées dans rules/{locale}/images/ sont accessibles via
 * des chemins relatifs dans le Markdown (ex: ../images/foo.png).
 * Ce chemin résolu dans rules/{locale}/images/ → /images/foo.png sur le web.
 *
 * Exemples :
 *   univers/peuples.md  + ../images/foo.png → /images/foo.png
 *   core/combat.md      + ../images/foo.png → /images/foo.png
 *
 * @param {string} content  Contenu Markdown brut
 * @param {string} slug     Slug du fichier courant, ex: "univers/peuples"
 */
function rewriteImages(content, slug) {
  const fileDir = slug.split("/").slice(0, -1);

  return content.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (match, alt, src) => {
      // Laisser les URLs absolues et chemins web absolus intacts
      if (/^https?:\/\//.test(src) || src.startsWith("/")) return match;

      // Résoudre le chemin relatif depuis le répertoire du fichier source
      const parts = src.split("/");
      const resolved = [...fileDir];
      for (const part of parts) {
        if (part === "..") { if (resolved.length > 0) resolved.pop(); }
        else if (part !== ".") resolved.push(part);
      }

      // Si le chemin résolu est dans images/, convertir en chemin web /images/
      if (resolved[0] === "images") {
        const webPath = "/images/" + resolved.slice(1).join("/");
        return `![${alt}](${webPath})`;
      }

      return match;
    }
  );
}

/**
 * Transforme les callouts Obsidian en divs avec classes CSS.
 *
 * Syntaxe source : > [!type] Titre optionnel  (identique à Obsidian)
 * Types reconnus : example → "Exemple", note → "Note", lore → (sans label)
 * Tout type inconnu reçoit son nom brut comme label.
 *
 * @param {string} html  HTML généré par remark-html
 */
function rewriteCallouts(html) {
  const labels = { example: "Exemple", note: "Note", lore: null };

  return html.replace(
    /<blockquote>([\s\S]*?)<\/blockquote>/g,
    (match, inner) => {
      const trimmed = inner.trim();

      const m = trimmed.match(
        /^<p>\[!(\w[\w-]*)\]([ \t]*)([^\n<]*)(?:\n([\s\S]*?))?<\/p>([\s\S]*)$/
      );
      if (!m) return match;

      const type     = m[1];
      const titleRaw = m[3].trim();
      const samePara = (m[4] ?? "").trim();
      const rest     = (m[5] ?? "").trim();

      const defaultLabel = Object.prototype.hasOwnProperty.call(labels, type)
        ? labels[type]
        : type;
      const displayTitle = titleRaw || defaultLabel;

      let out = `<div class="callout callout-${type}">`;
      if (displayTitle) out += `<div class="callout-title">${displayTitle}</div>`;
      if (samePara)     out += `<p>${samePara}</p>`;
      if (rest)         out += rest;
      out += `</div>`;
      return out;
    }
  );
}

/**
 * Réécrit les liens .md → /rules/ avec résolution de chemin relative
 * au fichier source (même logique que content.ts).
 *
 * @param {string} content  Contenu Markdown brut
 * @param {string} slug     Slug du fichier courant, ex: "core/ressources"
 */
function rewriteLinks(content, slug) {
  // Répertoire du fichier courant : "core/ressources" → ["core"]
  const fileDir = slug.split("/").slice(0, -1);

  return content.replace(
    /\[([^\]]+)\]\(([^)]+\.md)(#[^)]*)?\)/g,
    (_, text, href, hash = "") => {
      if (/^https?:\/\//.test(href)) return `[${text}](${href}${hash})`;

      const parts = href.replace(/\.md$/, "").split("/");
      const resolved = [...fileDir];
      for (const part of parts) {
        if (part === "..") { if (resolved.length > 0) resolved.pop(); }
        else if (part !== ".") resolved.push(part);
      }

      // Trailing slash requis : next.config.ts utilise trailingSlash:true.
      const path = `/rules/${resolved.join("/")}`;
      return `[${text}](${path}/${hash})`;
    }
  );
}

/**
 * Transforme les segments « deux colonnes alignées » en grilles duo.
 *
 * Convention d'écriture (Markdown) :
 *   <div class="pdf-break"></div>   sépare les pages
 *   <div class="pdf-col-break"></div>   sépare colonne gauche / droite
 *
 * Tout segment de page contenant un pdf-col-break est converti en
 * <div class="duo-grid pdf-break duo--{id}"> avec des paires de cellules
 * <div class="duo-cell"> : les blocs (h2+intro, h3+contenu, callout) des
 * deux colonnes sont appariés par index → les titres de même niveau
 * s'alignent verticalement (grille CSS, voir book.css §Pages duo).
 *
 * L'{id} est dérivé du premier h2 du segment (ex : "✪ Force" → duo--force),
 * ce qui permet d'ajuster chaque page individuellement dans book.css.
 *
 * @param {string} html  HTML d'une section (après rewriteCallouts)
 */
function rewriteDuoGrids(html) {
  const PAGE_BREAK = '<div class="pdf-break"></div>';
  const COL_BREAK  = /<div class="pdf-col-break"><\/div>/;

  const parts = html.split(PAGE_BREAK);
  let out = "";

  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!COL_BREAK.test(seg)) {
      // Segment ordinaire : conserver son saut de page d'origine
      out += (i > 0 ? PAGE_BREAK : "") + seg;
      continue;
    }

    const [left, right] = seg.split(COL_BREAK);
    const leftBlocks  = splitDuoBlocks(left);
    const rightBlocks = splitDuoBlocks(right);

    // Identifiant de page depuis le premier h2 (pour ajustements ciblés)
    const m  = seg.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const id = m
      ? m[1].replace(/<[^>]+>/g, "").trim().toLowerCase()
          .normalize("NFD").replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      : "page";

    const n = Math.max(leftBlocks.length, rightBlocks.length);
    let cells = "";
    for (let r = 0; r < n; r++) {
      cells += `<div class="duo-cell">${leftBlocks[r] ?? ""}</div>`;
      cells += `<div class="duo-cell">${rightBlocks[r] ?? ""}</div>`;
    }

    // pdf-break : le saut de page est porté par la grille elle-même
    out += `<div class="duo-grid pdf-break duo--${id}">${cells}</div>`;
  }

  return out;
}

/**
 * Découpe une colonne en blocs alignables : chaque bloc démarre sur un
 * <h2>, un <h3> ou un callout. Un éventuel préambule est fusionné au
 * premier bloc.
 *
 * @param {string} html  HTML d'une demi-page
 */
function splitDuoBlocks(html) {
  const re = /<h2[^>]*>|<h3[^>]*>|<div class="callout /g;
  const idxs = [];
  let m;
  while ((m = re.exec(html)) !== null) idxs.push(m.index);

  const trimmed = html.trim();
  if (idxs.length === 0) return trimmed ? [trimmed] : [];

  const blocks = [];
  for (let i = 0; i < idxs.length; i++) {
    const end = i + 1 < idxs.length ? idxs[i + 1] : html.length;
    blocks.push(html.slice(idxs[i], end).trim());
  }
  const pre = html.slice(0, idxs[0]).trim();
  if (pre) blocks[0] = pre + blocks[0];
  return blocks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const files = collectMdFiles(RULES_DIR);
const index = {};

for (const { path, slug } of files) {
  const raw     = readFileSync(path, "utf-8");
  const { content, data } = matter(raw);

  const file = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(rewriteLinks(rewriteImages(content, slug), slug));

  // ── Wrapper de section avec classes CSS issues du frontmatter ──────────────
  //
  // Champ `pdf:` reconnu dans le frontmatter YAML :
  //   pdf:
  //     columns: 1          # 1 colonne | 2 (défaut)
  //     break: false        # false = pas de saut avant la section (défaut: true)
  //
  // Ces classes servent à :
  //   - Déclencher des pages nommées Paged.js (→ changement de colonnes)
  //   - Contrôler les sauts de page entre sections
  //
  // La classe `section--{slug}` permet de cibler une section spécifique
  // dans book.css si nécessaire (ex: .section--core-combat h2 { ... })
  //
  const pdf     = (data.pdf ?? {});
  const cols    = pdf.columns ?? 2;           // 1 | 2
  const doBreak = pdf.break !== false;        // true par défaut

  const safeSlug = slug.replace(/[^a-z0-9]/gi, "-");
  const classes  = ["section", `section--${safeSlug}`];
  if (cols === 1)  classes.push("pdf-single-col");
  if (!doBreak)    classes.push("pdf-no-break");

  index[slug] = `<article class="${classes.join(" ")}">\n${rewriteDuoGrids(rewriteCallouts(String(file)))}</article>`;
}

writeFileSync(OUTPUT, JSON.stringify(index));
console.log(
  `✓ content-index-${locale}.json — ${Object.keys(index).length} sections générées`
);

// ── Copie des images rules/{locale}/images/ → public/images/ ─────────────────
if (existsSync(IMAGES_SRC)) {
  mkdirSync(IMAGES_DST, { recursive: true });
  let copied = 0;
  for (const entry of readdirSync(IMAGES_SRC, { withFileTypes: true })) {
    if (entry.isFile()) {
      copyFileSync(
        join(IMAGES_SRC, entry.name),
        join(IMAGES_DST, entry.name)
      );
      copied++;
    }
  }
  if (copied > 0) console.log(`✓ images — ${copied} fichier(s) copié(s) vers public/images/`);
}
