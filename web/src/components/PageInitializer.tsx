"use client";

/**
 * PageInitializer — pont entre les Server Components (page.tsx) et le contexte client.
 *
 * Chaque page route rend ce composant avec son slug + HTML.
 * Au montage, il met à jour currentHtml/currentSlug dans le BookContext,
 * ce qui déclenche le rendu de la section dans BookViewer (qui, lui,
 * vit dans le layout et ne se démonte jamais entre les navigations).
 */

import { useEffect } from "react";
import { useBook } from "@/lib/context";

interface Props {
  slug: string;
  html: string;
}

export function PageInitializer({ slug, html }: Props) {
  const { setCurrentContent } = useBook();

  useEffect(() => {
    setCurrentContent(slug, html);
  }, [slug, html, setCurrentContent]);

  return null;
}
