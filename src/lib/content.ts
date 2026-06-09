/**
 * src/lib/content.ts
 *
 * Couche d'accès aux fichiers Markdown du livre de règles.
 * Utilisée uniquement côté serveur (Server Components, generateStaticParams).
 *
 * Pipeline :
 *   Markdown (.md) → gray-matter (frontmatter) → remark-gfm + remark-html → HTML
 *
 * Les liens relatifs vers d'autres sections (.md) sont réécrits en routes
 * /rules/... afin d'être navigables dans l'application.
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

/** Répertoire des sources Markdown pour une locale donnée. */
function getContentDir(locale: string): string {
  return path.join(process.cwd(), "..", "rules", locale);
}

export interface ContentPage {
  slug: string[];
  title: string;
  htmlContent: string;
  section: string;
  rawPath: string;
}

// ─── Slug enumeration ───────────────────────────────────────────────────────

/**
 * Retourne tous les slugs disponibles sous forme de tableaux de segments.
 * Exemple : ["core", "combat"] pour rules/fr/core/combat.md
 * Exclut _index.md (page d'accueil traitée séparément par getIndexPage).
 */
export function getAllSlugs(locale = "fr"): string[][] {
  const contentDir = getContentDir(locale);
  const files = collectMdFiles(contentDir);
  return files
    .map((file) => {
      const relative = path.relative(contentDir, file);
      const slugPath = relative.replace(/\.md$/, "").replace(/\\/g, "/");
      return slugPath.split("/");
    })
    .filter((slug) => slug.join("/") !== "_index");
}

function collectMdFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMdFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

// ─── Page loading ────────────────────────────────────────────────────────────

/**
 * Charge et parse le fichier Markdown correspondant au slug donné.
 * Retourne null si le fichier n'existe pas (→ notFound() dans la page route).
 */
export async function getPageBySlug(
  slug: string[],
  locale = "fr"
): Promise<ContentPage | null> {
  const contentDir = getContentDir(locale);
  const filePath = path.join(contentDir, ...slug) + ".md";
  if (!fs.existsSync(filePath)) return null;

  return parseMarkdownFile(filePath, slug);
}

/** Charge la page d'accueil (_index.md). */
export async function getIndexPage(locale = "fr"): Promise<ContentPage> {
  const filePath = path.join(getContentDir(locale), "_index.md");
  return parseMarkdownFile(filePath, []);
}

/**
 * Transforme les callouts Obsidian en divs avec classes CSS.
 *
 * Syntaxe source (identique à Obsidian) :
 *   > [!example] Titre optionnel
 *   >
 *   > Contenu…
 *
 * Types reconnus : example, note, lore (extensible via `labels`).
 * Un type inconnu reçoit son nom brut comme label.
 *
 * Appliqué sur le HTML généré par remark-html (donc après remark).
 * remark convertit le blockquote en <blockquote><p>[!type]…</p>…</blockquote>
 * que cette fonction transforme en <div class="callout callout-{type}">…</div>.
 */
function rewriteCallouts(html: string): string {
  const labels: Record<string, string | null> = {
    example: "Exemple",
    note:    "Note",
    lore:    null,   // pas de label automatique pour le lore
  };

  return html.replace(
    /<blockquote>([\s\S]*?)<\/blockquote>/g,
    (match, inner: string) => {
      const trimmed = inner.trim();

      // Premier <p> doit commencer par [!type]
      const m = trimmed.match(
        /^<p>\[!(\w[\w-]*)\]([ \t]*)([^\n<]*)(?:\n([\s\S]*?))?<\/p>([\s\S]*)$/
      );
      if (!m) return match;

      const type      = m[1];
      const titleRaw  = m[3].trim();                // texte après [!type] sur la même ligne
      const samePara  = (m[4] ?? "").trim();        // texte après \n dans le même <p>
      const rest      = (m[5] ?? "").trim();        // autres éléments (<p>, <ul>, etc.)

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
 * Réécrit les chemins d'images relatifs en chemins web absolus.
 *
 * Les images dans rules/{locale}/images/ sont référencées par des chemins
 * relatifs dans le Markdown (ex: ../images/foo.png depuis univers/).
 * Ce chemin résolu dans rules/{locale}/images/ → /images/foo.png sur le web.
 */
function rewriteImages(content: string, slug: string[]): string {
  const fileDir = slug.slice(0, -1);

  return content.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (match, alt: string, src: string) => {
      if (/^https?:\/\//.test(src) || src.startsWith("/")) return match;

      const parts = src.split("/");
      const resolved = [...fileDir];
      for (const part of parts) {
        if (part === "..") { if (resolved.length > 0) resolved.pop(); }
        else if (part !== ".") resolved.push(part);
      }

      if (resolved[0] === "images") {
        const webPath = "/images/" + resolved.slice(1).join("/");
        return `![${alt}](${webPath})`;
      }

      return match;
    }
  );
}

async function parseMarkdownFile(
  filePath: string,
  slug: string[]
): Promise<ContentPage> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  const processed = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(rewriteLinks(rewriteImages(content, slug), slug));

  return {
    slug,
    title: (data.title as string) || extractTitle(content),
    htmlContent: rewriteCallouts(processed.toString()),
    section: slug[0] ?? "index",
    rawPath: filePath,
  };
}

// ─── Link rewriting ──────────────────────────────────────────────────────────
// Converts relative .md links to absolute /rules/ routes.
//
// The resolution is path-aware: a link in core/ressources.md to "etats.md"
// resolves to /rules/core/etats (not /rules/etats).
//
// Examples (from core/ressources.md, fileDir = ["core"]):
//   [text](etats.md)         → [text](/rules/core/etats)
//   [text](./etats.md)       → [text](/rules/core/etats)
//   [text](../core/etats.md) → [text](/rules/core/etats)
//   [text](combat.md#sec)    → [text](/rules/core/combat#sec)

function rewriteLinks(content: string, slug: string[]): string {
  // Directory of the current file: ["core", "ressources"] → ["core"]
  const fileDir = slug.slice(0, -1);

  return content.replace(
    /\[([^\]]+)\]\(([^)]+\.md)(#[^)]*)?\)/g,
    (_, text, href, hash = "") => {
      // Leave absolute URLs untouched
      if (/^https?:\/\//.test(href)) return `[${text}](${href}${hash})`;

      // Resolve relative path from the file's directory
      const parts = href.replace(/\.md$/, "").split("/");
      const resolved = [...fileDir];
      for (const part of parts) {
        if (part === "..") { if (resolved.length > 0) resolved.pop(); }
        else if (part !== ".") resolved.push(part);
      }

      // Trailing slash requis : next.config.ts utilise trailingSlash:true,
      // donc les routes sont servies à /rules/…/ — sans le slash final, le
      // serveur émet un 301 qui force un rechargement complet de la page.
      const path = `/rules/${resolved.join("/")}`;
      return `[${text}](${path}/${hash})`;
    }
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTitle(content: string): string {
  const match = content.match(/^#+\s+(.+)$/m);
  return match ? match[1].replace(/[*_`[\]]/g, "").trim() : "Sans titre";
}
