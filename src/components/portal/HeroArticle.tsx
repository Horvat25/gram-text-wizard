import { Link } from "react-router-dom";
import { Clock, ArrowUpRight } from "lucide-react";
import { formatRelativeDate, getCategoryLabel } from "@/lib/article-helpers";
import type { ArticleCardData } from "./ArticleCard";

interface HeroArticleProps {
  article: ArticleCardData;
}

export const HeroArticle = ({ article }: HeroArticleProps) => {
  return (
    <Link
      to={`/noticia/${article.slug}`}
      className="group block relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm transition-all hover:border-primary/40"
    >
      {/* Image */}
      <div className="relative aspect-[16/9] md:aspect-[21/9] w-full overflow-hidden">
        {article.hero_image_url ? (
          <img
            src={article.hero_image_url}
            alt={article.title}
            className="w-full h-full object-cover transition-transform duration-[1200ms] group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full portal-gradient opacity-40 portal-drift" />
        )}

        {/* Dark gradient overlay so text reads */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
        {/* Side neon vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_hsl(var(--portal-cyan)/0.25),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--portal-purple)/0.18),_transparent_60%)]" />
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 lg:p-12">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary bg-primary/10 border border-primary/30 px-2.5 py-1 rounded-full backdrop-blur">
            <span className="h-1 w-1 rounded-full bg-primary portal-live-dot" />
            {getCategoryLabel(article.category)}
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Manchete
          </span>
        </div>

        <h1 className="font-display text-3xl md:text-5xl lg:text-6xl font-bold leading-[1.05] max-w-4xl text-foreground">
          {article.title}
        </h1>

        {article.excerpt && (
          <p className="hidden md:block text-base lg:text-lg text-muted-foreground mt-4 max-w-2xl line-clamp-2 leading-relaxed">
            {article.excerpt}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 mt-6">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{formatRelativeDate(article.published_at)}</span>
            {article.reading_time_minutes ? (
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> {article.reading_time_minutes} min de leitura
              </span>
            ) : null}
          </div>

          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-primary opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
            Ler matéria
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
};
