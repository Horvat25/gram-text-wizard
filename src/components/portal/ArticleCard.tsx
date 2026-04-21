import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
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
        className="group flex gap-4 py-4 border-b border-border last:border-0 hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors"
      >
        {article.hero_image_url && (
          <div className="w-28 h-28 shrink-0 overflow-hidden rounded-md bg-muted">
            <img
              src={article.hero_image_url}
              alt={article.title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">
            {getCategoryLabel(article.category)}
          </span>
          <h3 className="font-semibold text-base leading-snug mt-1 group-hover:text-primary transition-colors line-clamp-2">
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
        <h3 className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors line-clamp-3">
          {article.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-2">
          {formatRelativeDate(article.published_at)}
        </p>
      </Link>
    );
  }

  return (
    <Link to={href} className="group flex flex-col h-full">
      <div className="aspect-video overflow-hidden rounded-lg bg-muted mb-3">
        {article.hero_image_url ? (
          <img
            src={article.hero_image_url}
            alt={article.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
        )}
      </div>
      <span className="text-xs font-semibold text-primary uppercase tracking-wide">
        {getCategoryLabel(article.category)}
      </span>
      <h3 className="font-bold text-lg leading-snug mt-1 group-hover:text-primary transition-colors line-clamp-3">
        {article.title}
      </h3>
      {article.excerpt && (
        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{article.excerpt}</p>
      )}
      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
        <span>{formatRelativeDate(article.published_at)}</span>
        {article.reading_time_minutes ? (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {article.reading_time_minutes} min
          </span>
        ) : null}
      </div>
    </Link>
  );
};
