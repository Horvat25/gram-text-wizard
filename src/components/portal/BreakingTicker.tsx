import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TickerItem {
  slug: string;
  title: string;
}

export const BreakingTicker = () => {
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("articles")
        .select("slug,title")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(6);
      if (mounted) setItems((data ?? []) as TickerItem[]);
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (items.length === 0) return null;

  // Duplicate for seamless infinite scroll
  const loop = [...items, ...items];

  return (
    <div className="hidden md:block w-full bg-destructive/95 text-destructive-foreground border-b border-destructive/40 overflow-hidden">
      <div className="container mx-auto px-4 flex items-stretch h-8">
        <div className="flex items-center gap-1.5 pr-4 mr-4 border-r border-destructive-foreground/30 shrink-0">
          <Zap className="h-3 w-3 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">
            Última hora
          </span>
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="flex items-center gap-8 whitespace-nowrap animate-[ticker_60s_linear_infinite] hover:[animation-play-state:paused]">
            {loop.map((item, idx) => (
              <Link
                key={`${item.slug}-${idx}`}
                to={`/noticia/${item.slug}`}
                className="text-[12px] font-medium hover:underline shrink-0 inline-flex items-center gap-2"
              >
                <span className="inline-block h-1 w-1 rounded-full bg-destructive-foreground/70" />
                {item.title}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
