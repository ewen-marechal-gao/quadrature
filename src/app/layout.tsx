import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
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
      <body>
        <div className="app-shell">
          <Sidebar />
          <main className="content-area">{children}</main>
        </div>
      </body>
    </html>
  );
}
