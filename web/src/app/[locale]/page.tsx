import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LOCALES, resolveLocale } from "@/lib/nav";
import { LandingPage } from "@/components/LandingPage";

export function generateStaticParams() {
  // Générer la landing pour toutes les locales (y compris EN "coming soon")
  return LOCALES.map((l) => ({ locale: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const label = locale === "fr" ? "Règles du jeu de rôle" : "Tabletop RPG Rules";
  return { title: `Quadrature — ${label}` };
}

export default async function LocaleLandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!LOCALES.find((l) => l.id === locale)) notFound();
  return <LandingPage locale={resolveLocale(locale)} />;
}
