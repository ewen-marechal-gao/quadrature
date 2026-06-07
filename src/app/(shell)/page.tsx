import { getIndexPage } from "@/lib/content";
import { PageInitializer } from "@/components/PageInitializer";

export default async function HomePage() {
  const page = await getIndexPage();
  return <PageInitializer slug="" html={page.htmlContent} />;
}
