import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

/**
 * Renders a visual breadcrumb trail. Pair with `breadcrumbsJsonLd()` (below)
 * to also emit structured data — Google shows breadcrumbs in SERPs (+CTR).
 */
export const Breadcrumbs = ({ items }: BreadcrumbsProps) => {
  return (
    <nav
      aria-label="Trilha de navegação"
      className="flex items-center gap-1.5 text-[11px] md:text-xs text-muted-foreground mb-4 overflow-x-auto scrollbar-hide"
    >
      <Link
        to="/"
        className="inline-flex items-center gap-1 hover:text-primary transition-colors shrink-0"
        aria-label="Início"
      >
        <Home className="h-3 w-3" />
        <span>Início</span>
      </Link>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 shrink-0">
          <ChevronRight className="h-3 w-3 opacity-50" />
          {it.href ? (
            <Link to={it.href} className="hover:text-primary transition-colors">
              {it.label}
            </Link>
          ) : (
            <span className="text-foreground/85 font-medium truncate max-w-[200px] md:max-w-[400px]">
              {it.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
};

/**
 * Build BreadcrumbList JSON-LD for SEO. Pass it inside seo.jsonLd's @graph
 * (or as standalone if no other ld present).
 */
export const breadcrumbsJsonLd = (
  items: BreadcrumbItem[],
  origin: string
): Record<string, unknown> => {
  const list: Record<string, unknown>[] = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Início",
      item: origin + "/",
    },
  ];
  items.forEach((it, i) => {
    list.push({
      "@type": "ListItem",
      position: i + 2,
      name: it.label,
      item: it.href ? origin + it.href : undefined,
    });
  });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: list,
  };
};
