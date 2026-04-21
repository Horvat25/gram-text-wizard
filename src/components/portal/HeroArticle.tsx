import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { formatRelativeDate, getCategoryLabel } from "@/lib/article-helpers";
import type { ArticleCardData } from "./ArticleCard";

interface HeroArticleProps {
  article: ArticleCardData;
}

export const HeroArticle = ({ article }: HeroArticleProps) => {
  return (
    <Link to={`/noticia/${article.slug}`} className="group block relative overflow-hidden rounded-xl bg-muted">
      <div className="aspect-[16/9] md:aspect-[21/9] w-full">
        {article.hero_image_url ? (
          <img
            src={article.hero_image_url}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/30 to-primary/5" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
        <span className="inline-block text-xs font-bold text-primary uppercase tracking-wider mb-3 bg-background/80 backdrop-blur px-2 py-1 rounded">
          {getCategoryLabel(article.category)}
        </span>
        <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold leading-tight max-w-3xl group-hover:text-primary transition-colors">
          {article.title}
        </h1>
        {article.excerpt && (
          <p className="hidden md:block text-base text-muted-foreground mt-3 max-w-2xl line-clamp-2">
            {article.excerpt}
          </p>
        )}
        <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
          <span>{formatRelativeDate(article.published_at)}</span>
          {article.reading_time_minutes ? (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {article.reading_time_minutes} min de leitura
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
};
