/**
 * Génère public/content-index.json avec le HTML rendu de chaque section.
 * Utilisé par le BookPreloader pour pré-calculer le nombre de pages
 * de chaque section au chargement de l'application.
 *
 * Exécuté automatiquement avant `next build` et `next dev`.
 * Reproduce la même pipeline que src/lib/content.ts.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = join(__dirname, "..", "..", "rules", "fr");
const OUTPUT    = join(__dirname, "..", "public", "content-index.json");

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

/** Réécrit les liens .md → /rules/ (même logique que content.ts). */
function rewriteLinks(content) {
  return content.replace(
    /\[([^\]]+)\]\(([^)]+\.md)(#[^)]*)?\)/g,
    (_, text, href, hash = "") => {
      const cleaned = href
        .replace(/^\.\.\//, "")
        .replace(/^\.\//, "")
        .replace(/\.md$/, "");
      return `[${text}](/rules/${cleaned}${hash})`;
    }
  );
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
    .process(rewriteLinks(content));

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

  index[slug] = `<article class="${classes.join(" ")}">\n${String(file)}</article>`;
}

writeFileSync(OUTPUT, JSON.stringify(index));
console.log(
  `✓ content-index.json — ${Object.keys(index).length} sections générées`
);
