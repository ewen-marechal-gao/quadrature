"use client";

/**
 * BookViewer est browser-only : Paged.js requiert le DOM et window.
 * On utilise next/dynamic avec ssr:false pour éviter tout rendu SSR
 * et les erreurs d'hydration qui en découlent.
 *
 * Note Next.js 16 : l'option ssr:false doit être dans un Client Component.
 */
import dynamic from "next/dynamic";
import { BookViewerSkeleton } from "@/components/BookViewerSkeleton";

const BookViewerDynamic = dynamic(
  () => import("./BookViewer").then((m) => ({ default: m.BookViewer })),
  {
    ssr: false,
    loading: () => <BookViewerSkeleton />,
  }
);

interface Props {
  html: string;
  slug?: string;
}

export function BookViewer({ html, slug }: Props) {
  return <BookViewerDynamic html={html} slug={slug} />;
}
