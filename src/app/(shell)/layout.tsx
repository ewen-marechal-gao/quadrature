import { BookProvider } from "@/lib/context";
import { BookPreloader } from "@/components/BookPreloader";
import { BookShellLayout } from "@/components/BookShellLayout";

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BookProvider>
      <BookPreloader />
      <BookShellLayout>
        {children}
      </BookShellLayout>
    </BookProvider>
  );
}
