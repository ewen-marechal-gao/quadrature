import { getIndexPage } from "@/lib/content";
import { MarkdownContent } from "@/components/MarkdownContent";

export default async function HomePage() {
  const page = await getIndexPage();
  return <MarkdownContent html={page.htmlContent} />;
}
