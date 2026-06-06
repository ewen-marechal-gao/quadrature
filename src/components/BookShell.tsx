"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, NAV_FLAT } from "@/lib/nav";

interface Props {
  currentSlug?: string;
  children: React.ReactNode;
}

export function BookShell({ currentSlug = "", children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const index = NAV_FLAT.findIndex((item) => item.slug === currentSlug);
  const current = NAV_FLAT[index];
  const prev = index > 0 ? NAV_FLAT[index - 1] : null;
  const next = index < NAV_FLAT.length - 1 ? NAV_FLAT[index + 1] : null;

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="top-bar">
        <button
          className="top-bar-menu"
          onClick={() => setDrawerOpen(true)}
          aria-label="Ouvrir la navigation"
        >
          ☰
        </button>

        <Link href="/" className="top-bar-logo">
          Quadrature
        </Link>

        <span className="top-bar-sep">—</span>

        <span className="top-bar-title">{current?.title ?? "Règles"}</span>

        <nav className="top-bar-nav">
          {prev && (
            <Link href={`/rules/${prev.slug}`} className="top-bar-link top-bar-link--prev">
              ← <span className="top-bar-link-label">{prev.title}</span>
            </Link>
          )}
          {next && (
            <Link href={`/rules/${next.slug}`} className="top-bar-link top-bar-link--next">
              <span className="top-bar-link-label">{next.title}</span> →
            </Link>
          )}
        </nav>
      </header>

      {/* ── Nav drawer ──────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="drawer-overlay"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <nav className={`nav-drawer${drawerOpen ? " nav-drawer--open" : ""}`}>
        <div className="drawer-header">
          <Link href="/" className="drawer-logo" onClick={() => setDrawerOpen(false)}>
            Quadrature
          </Link>
          <button
            className="drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="drawer-sections">
          {NAV.map((section) => (
            <div key={section.id} className="drawer-section">
              <span className="drawer-section-title">{section.title}</span>
              <ul className="drawer-items">
                {section.items.map((item) => {
                  const href = `/rules/${item.slug}`;
                  const isActive =
                    pathname === href || pathname === `${href}/`;
                  return (
                    <li key={item.slug}>
                      <Link
                        href={href}
                        className={`drawer-link${isActive ? " drawer-link--active" : ""}`}
                        onClick={() => setDrawerOpen(false)}
                      >
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* ── Page content ────────────────────────────────────── */}
      <main className="book-main">{children}</main>
    </>
  );
}
