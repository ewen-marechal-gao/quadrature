"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <Link href="/" className="sidebar-logo">
          Quadrature
        </Link>
      </div>

      <div className="sidebar-sections">
        {NAV.map((section) => (
          <div key={section.id} className="nav-section">
            <span className="nav-section-title">{section.title}</span>
            <ul className="nav-items">
              {section.items.map((item) => {
                const href = `/rules/${item.slug}`;
                const isActive = pathname === href || pathname === `${href}/`;
                return (
                  <li key={item.slug}>
                    <Link
                      href={href}
                      className={`nav-link${isActive ? " nav-link--active" : ""}`}
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
  );
}
