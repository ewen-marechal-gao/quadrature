import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quadrature — Règles",
  description: "Règles du jeu de rôle Quadrature",
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
