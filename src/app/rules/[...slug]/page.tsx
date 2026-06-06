import { notFound } from "next/navigation";
import { getAllSlugs, getPageBySlug } from "@/lib/content";
import { BookShell } from "@/components/BookShell";
import { BookViewer } from "@/components/BookViewer";

interface Props {
  params: Promise<{ slug: string[] }>;
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) return {};
  return { title: `${page.title} — Quadrature` };
}

export default async function RulePage({ params }: Props) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  return (
    <BookShell currentSlug={slug.join("/")}>
      <BookViewer html={page.htmlContent} />
    </BookShell>
  );
}
