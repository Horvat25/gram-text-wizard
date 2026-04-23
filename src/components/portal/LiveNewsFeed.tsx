import { Link } from "react-router-dom";
import { Radio } from "lucide-react";
import { getCategoryLabel } from "@/lib/article-helpers";
import type { ArticleCardData } from "./ArticleCard";

interface LiveNewsFeedProps {
  articles: ArticleCardData[];
  limit?: number;
}

/** Format HH:MM in Brasília timezone */
function formatBrtTime(iso?: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export const LiveNewsFeed = ({ articles, limit = 12 }: LiveNewsFeedProps) => {
  const items = articles.slice(0, limit);
  if (items.length === 0) return null;

  return (
    <section className="mt-10 md:mt-14">
      <div className="portal-divider mb-5" />
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/15 border border-destructive/40 text-[10px] font-bold uppercase tracking-[0.2em] text-destructive">
            <Radio className="h-2.5 w-2.5 animate-pulse" /> Agora
          </span>
          <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight">
            Última hora
          </h2>
        </div>
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Brasília · UTC-3
        </span>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0 border-t border-border/40">
        {items.map((a) => (
          <li
            key={a.slug}
            className="border-b border-border/40 group hover:bg-card/40 transition-colors -mx-2 px-2"
          >
            <Link to={`/noticia/${a.slug}`} className="flex items-start gap-3 py-3">
              <span className="font-mono text-[11px] font-semibold text-primary tabular-nums shrink-0 mt-0.5 w-10">
                {formatBrtTime(a.published_at)}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded shrink-0 mt-0.5 hidden sm:inline">
                {getCategoryLabel(a.category).slice(0, 12)}
              </span>
              <span className="text-sm text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2 flex-1">
                {a.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
