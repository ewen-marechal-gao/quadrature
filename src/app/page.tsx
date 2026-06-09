"use client";

/**
 * Page racine — redirige vers la landing page de la locale par défaut (/fr/).
 *
 * Note : Next.js static export ne supporte pas redirect() côté serveur.
 * On utilise un useEffect côté client pour la redirection.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE } from "@/lib/nav";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${DEFAULT_LOCALE}/`);
  }, [router]);

  // Fond sombre pendant la redirection (évite le flash blanc)
  return <div style={{ height: "100vh", background: "#100c07" }} />;
}
