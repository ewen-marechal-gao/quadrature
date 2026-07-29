import type { Metadata } from "next";
import "./globals.css";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const DESCRIPTION =
  "Quadrature — jeu de rôle sur table dans le monde d'Aeonir : règles, cartes " +
  "d'action, bestiaire et outils de table.";

export const metadata: Metadata = {
  // Rend absolues les URLs relatives ci-dessous (exigé pour Open Graph).
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Règles du jeu de rôle`,
    // Les pages définissent déjà leur titre complet dans generateMetadata.
    template: "%s",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Le monde d'Aeonir`,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "fr_FR",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "La carte d'Aeonir" }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Le monde d'Aeonir`,
    description: DESCRIPTION,
    images: ["/og.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        {/* Modern Antiqua — chargé ici plutôt que via @import dans globals.css
            car Tailwind v4 exige que @import "tailwindcss" soit en première
            position dans le fichier CSS source. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Modern+Antiqua&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
