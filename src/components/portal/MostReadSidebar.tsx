import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCategoryLabel } from "@/lib/article-helpers";

interface MostReadItem {
  slug: string;
  title: string;
  category: string;
  view_count: number;
}

interface MostReadSidebarProps {
  excludeSlug?: string;
  className?: string;
}

export const MostReadSidebar = ({ excludeSlug, className }: MostReadSidebarProps) => {
  const [items, setItems] = useState<MostReadItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Top by view_count from last 14 days
      const since = new Date();
      since.setDate(since.getDate() - 14);

      const { data } = await supabase
        .from("articles")
        .select("slug,title,category,view_count")
        .eq("status", "published")
        .gte("published_at", since.toISOString())
        .order("view_count", { ascending: false })
        .limit(6);

      const filtered = (data ?? []).filter((a) => a.slug !== excludeSlug).slice(0, 5);
      setItems(filtered as MostReadItem[]);
      setLoading(false);
    })();
  }, [excludeSlug]);

  if (loading || items.length === 0) return null;

  return (
    <aside className={className}>
      <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-5 md:p-6">
        <div className="flex items-center gap-2 mb-5 pb-4 border-b border-border/40">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="font-display font-bold text-base uppercase tracking-[0.14em]">
            Mais lidas
          </h3>
        </div>

        <ol className="space-y-4">
          {items.map((item, idx) => (
            <li key={item.slug}>
              <Link
                to={`/noticia/${item.slug}`}
                className="group flex gap-3 items-start"
              >
                <span className="font-display font-black text-3xl leading-none portal-gradient-text tabular-nums shrink-0 w-9">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-bold text-primary uppercase tracking-[0.16em]">
                    {getCategoryLabel(item.category)}
                  </span>
                  <p className="text-sm font-semibold leading-snug mt-0.5 group-hover:text-primary transition-colors line-clamp-3">
                    {item.title}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
};
