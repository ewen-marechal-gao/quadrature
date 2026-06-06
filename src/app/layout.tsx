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
      <body>{children}</body>
    </html>
  );
}
