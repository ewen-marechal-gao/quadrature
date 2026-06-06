import { getIndexPage } from "@/lib/content";
import { BookShell } from "@/components/BookShell";
import { BookViewer } from "@/components/BookViewer";

export default async function HomePage() {
  const page = await getIndexPage();
  return (
    <BookShell>
      <BookViewer html={page.htmlContent} />
    </BookShell>
  );
}
