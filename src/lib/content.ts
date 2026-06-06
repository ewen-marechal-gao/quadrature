import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

const CONTENT_DIR = path.join(process.cwd(), "..", "rules", "fr");

export interface ContentPage {
  slug: string[];
  title: string;
  htmlContent: string;
  section: string;
  rawPath: string;
}

// ─── Slug enumeration ───────────────────────────────────────────────────────

export function getAllSlugs(): string[][] {
  const files = collectMdFiles(CONTENT_DIR);
  return files
    .map((file) => {
      const relative = path.relative(CONTENT_DIR, file);
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

export async function getPageBySlug(
  slug: string[]
): Promise<ContentPage | null> {
  const filePath = path.join(CONTENT_DIR, ...slug) + ".md";
  if (!fs.existsSync(filePath)) return null;

  return parseMarkdownFile(filePath, slug);
}

export async function getIndexPage(): Promise<ContentPage> {
  const filePath = path.join(CONTENT_DIR, "_index.md");
  return parseMarkdownFile(filePath, []);
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
    .process(rewriteLinks(content));

  return {
    slug,
    title: (data.title as string) || extractTitle(content),
    htmlContent: processed.toString(),
    section: slug[0] ?? "index",
    rawPath: filePath,
  };
}

// ─── Link rewriting ──────────────────────────────────────────────────────────
// Converts relative .md links to /rules/ routes so they work in the browser.
// [text](core/jet.md)      → [text](/rules/core/jet)
// [text](../core/jet.md)   → [text](/rules/core/jet)

function rewriteLinks(content: string): string {
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTitle(content: string): string {
  const match = content.match(/^#+\s+(.+)$/m);
  return match ? match[1].replace(/[*_`[\]]/g, "").trim() : "Sans titre";
}
