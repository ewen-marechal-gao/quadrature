import Link from "next/link";
import { NAV_FLAT } from "@/lib/nav";

interface Props {
  currentSlug: string;
}

export function PageNav({ currentSlug }: Props) {
  const index = NAV_FLAT.findIndex((item) => item.slug === currentSlug);
  const prev = index > 0 ? NAV_FLAT[index - 1] : null;
  const next = index < NAV_FLAT.length - 1 ? NAV_FLAT[index + 1] : null;

  if (!prev && !next) return null;

  return (
    <div className="page-nav">
      {prev ? (
        <Link href={`/rules/${prev.slug}`} className="page-nav-link page-nav-link--prev">
          <span className="page-nav-direction">← Précédent</span>
          <span className="page-nav-title">{prev.title}</span>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link href={`/rules/${next.slug}`} className="page-nav-link page-nav-link--next">
          <span className="page-nav-direction">Suivant →</span>
          <span className="page-nav-title">{next.title}</span>
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
