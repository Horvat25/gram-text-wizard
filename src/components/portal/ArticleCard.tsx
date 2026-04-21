import { Link } from "react-router-dom";
import { Clock, ArrowUpRight } from "lucide-react";
import { formatRelativeDate, getCategoryLabel } from "@/lib/article-helpers";

export interface ArticleCardData {
  slug: string;
  title: string;
  excerpt?: string | null;
  hero_image_url?: string | null;
  category: string;
  published_at?: string | null;
  reading_time_minutes?: number | null;
}

interface ArticleCardProps {
  article: ArticleCardData;
  variant?: "default" | "compact" | "horizontal";
}

export const ArticleCard = ({ article, variant = "default" }: ArticleCardProps) => {
  const href = `/noticia/${article.slug}`;

  if (variant === "horizontal") {
    return (
      <Link
        to={href}
        className="group flex gap-4 py-4 border-b border-border/40 last:border-0 -mx-2 px-2 rounded-lg transition-colors hover:bg-card/40"
      >
        {article.hero_image_url ? (
          <div className="w-28 h-28 shrink-0 overflow-hidden rounded-lg bg-muted/40 ring-1 ring-border/40">
            <img
              src={article.hero_image_url}
              alt={article.title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>
        ) : (
          <div className="w-28 h-28 shrink-0 rounded-lg portal-gradient opacity-40" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold text-primary uppercase tracking-[0.18em]">
            {getCategoryLabel(article.category)}
          </span>
          <h3 className="font-display font-semibold text-base leading-snug mt-1 group-hover:text-primary transition-colors line-clamp-2">
            {article.title}
          </h3>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>{formatRelativeDate(article.published_at)}</span>
            {article.reading_time_minutes ? (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {article.reading_time_minutes} min
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link to={href} className="group block">
        <span className="text-[10px] font-semibold text-primary uppercase tracking-[0.18em]">
          {getCategoryLabel(article.category)}
        </span>
        <h3 className="font-display font-semibold text-sm leading-snug mt-1 group-hover:text-primary transition-colors line-clamp-3">
          {article.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-2">
          {formatRelativeDate(article.published_at)}
        </p>
      </Link>
    );
  }

  // default — large grid card with neon hover
  return (
    <Link to={href} className="group flex flex-col h-full portal-card rounded-2xl overflow-hidden">
      <div className="relative aspect-video overflow-hidden bg-muted/40">
        {article.hero_image_url ? (
          <img
            src={article.hero_image_url}
            alt={article.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.07] transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full portal-gradient opacity-30 portal-drift" />
        )}
        {/* Soft top gradient for category chip readability */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background/55 to-transparent" />
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary bg-background/80 border border-primary/30 px-2 py-0.5 rounded-full backdrop-blur">
          {getCategoryLabel(article.category)}
        </span>
      </div>

      <div className="flex flex-col flex-1 p-4">
        <h3 className="font-display font-bold text-lg leading-tight group-hover:portal-gradient-text transition-all line-clamp-3">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
            {article.excerpt}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 mt-auto pt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{formatRelativeDate(article.published_at)}</span>
            {article.reading_time_minutes ? (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {article.reading_time_minutes} min
              </span>
            ) : null}
          </div>
          <ArrowUpRight className="h-3.5 w-3.5 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </Link>
  );
};
