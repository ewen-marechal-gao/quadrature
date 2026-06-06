import { notFound } from "next/navigation";
import { getAllSlugs, getPageBySlug } from "@/lib/content";
import { MarkdownContent } from "@/components/MarkdownContent";
import { PageNav } from "@/components/PageNav";

interface Props {
  params: Promise<{ slug: string[] }>;
}

export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
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

  const currentSlug = slug.join("/");

  return (
    <>
      <MarkdownContent html={page.htmlContent} />
      <PageNav currentSlug={currentSlug} />
    </>
  );
}
