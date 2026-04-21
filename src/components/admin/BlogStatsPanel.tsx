import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, FileText, Star, TrendingUp, Tag, Calendar, ExternalLink } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ARTICLE_CATEGORIES, formatArticleDate } from "@/lib/article-helpers";

interface ArticleStat {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: string;
  view_count: number;
  is_featured: boolean;
  published_at: string | null;
  created_at: string;
  hero_image_url: string | null;
  reading_time_minutes: number | null;
  tags: string[] | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  ia: "hsl(var(--primary))",
  gadgets: "hsl(280 90% 60%)",
  futuro: "hsl(190 90% 55%)",
  mercado: "hsl(40 90% 55%)",
  ciencia: "hsl(140 70% 50%)",
  tecnologia: "hsl(220 70% 60%)",
};

const BlogStatsPanel = () => {
  const { currentWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<ArticleStat[]>([]);

  useEffect(() => {
    if (!currentWorkspace) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("articles")
        .select("id,slug,title,category,status,view_count,is_featured,published_at,created_at,hero_image_url,reading_time_minutes,tags")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (!cancelled) {
        setArticles((data ?? []) as ArticleStat[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspace?.id]);

  const stats = useMemo(() => {
    const total = articles.length;
    const published = articles.filter((a) => a.status === "published").length;
    const drafts = articles.filter((a) => a.status === "draft").length;
    const featured = articles.filter((a) => a.is_featured).length;
    const totalViews = articles.reduce((s, a) => s + (a.view_count || 0), 0);
    const avgViews = published > 0 ? Math.round(totalViews / published) : 0;
    const withImage = articles.filter((a) => !!a.hero_image_url).length;
    const missingImage = total - withImage;

    // 7-day publishing trend
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      days[k] = 0;
    }
    articles.forEach((a) => {
      const ref = a.published_at || a.created_at;
      if (!ref) return;
      const k = new Date(ref).toISOString().slice(0, 10);
      if (k in days) days[k] += 1;
    });
    const trend = Object.entries(days).map(([date, count]) => ({
      date: new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      Artigos: count,
    }));

    // Category distribution
    const byCategory: Record<string, { count: number; views: number }> = {};
    articles.forEach((a) => {
      const c = a.category || "tecnologia";
      if (!byCategory[c]) byCategory[c] = { count: 0, views: 0 };
      byCategory[c].count += 1;
      byCategory[c].views += a.view_count || 0;
    });
    const categoryData = Object.entries(byCategory).map(([cat, v]) => ({
      name: ARTICLE_CATEGORIES.find((x) => x.slug === cat)?.label ?? cat,
      slug: cat,
      value: v.count,
      views: v.views,
    }));

    const top = [...articles]
      .filter((a) => a.status === "published")
      .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
      .slice(0, 5);

    // Tag cloud (top 10)
    const tagCount: Record<string, number> = {};
    articles.forEach((a) => {
      (a.tags ?? []).forEach((t) => {
        const k = t.toLowerCase().trim();
        if (!k) return;
        tagCount[k] = (tagCount[k] || 0) + 1;
      });
    });
    const topTags = Object.entries(tagCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12);

    return {
      total,
      published,
      drafts,
      featured,
      totalViews,
      avgViews,
      withImage,
      missingImage,
      trend,
      categoryData,
      top,
      topTags,
    };
  }, [articles]);

  if (loading) {
    return (
      <div className="py-20 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <Card className="p-8 text-center">
        <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <h3 className="font-semibold text-sm mb-1">Sem dados ainda</h3>
        <p className="text-xs text-muted-foreground">
          Gere alguns artigos para ver as estatísticas do portal.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KPI icon={FileText} label="Publicados" value={stats.published} sub={`${stats.drafts} rascunhos`} />
        <KPI icon={Eye} label="Total de leituras" value={stats.totalViews.toLocaleString("pt-BR")} sub={`média ${stats.avgViews}/post`} />
        <KPI icon={Star} label="Em destaque" value={stats.featured} sub={`${stats.total} no total`} accent />
        <KPI
          icon={TrendingUp}
          label="Imagens"
          value={`${stats.withImage}/${stats.total}`}
          sub={stats.missingImage > 0 ? `${stats.missingImage} sem imagem` : "todas com imagem"}
          warn={stats.missingImage > 0}
        />
      </div>

      {/* Trend + Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Card className="p-3">
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary" /> Publicações nos últimos 7 dias
          </h4>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.trend} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                />
                <Bar dataKey="Artigos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-3">
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-primary" /> Distribuição por categoria
          </h4>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.categoryData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={28}
                  outerRadius={56}
                  paddingAngle={2}
                >
                  {stats.categoryData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={CATEGORY_COLORS[entry.slug] ?? "hsl(var(--primary))"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  formatter={(v: any, _n: any, p: any) => [`${v} artigos · ${p.payload.views} leituras`, p.payload.name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {stats.categoryData.map((c) => (
              <span key={c.slug} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: CATEGORY_COLORS[c.slug] ?? "hsl(var(--primary))" }}
                />
                {c.name} ({c.value})
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Top articles */}
      <Card className="p-3">
        <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-primary" /> Top 5 artigos mais lidos
        </h4>
        {stats.top.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Nenhum artigo publicado ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {stats.top.map((a, idx) => (
              <a
                key={a.id}
                href={`/noticia/${a.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 transition-colors group"
              >
                <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium line-clamp-1 group-hover:text-primary transition-colors">
                    {a.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatArticleDate(a.published_at)} · {a.category}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                  <Eye className="h-2.5 w-2.5" />
                  {a.view_count}
                </Badge>
                <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </a>
            ))}
          </div>
        )}
      </Card>

      {/* Tag cloud */}
      {stats.topTags.length > 0 && (
        <Card className="p-3">
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-primary" /> Tags mais usadas
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {stats.topTags.map(([tag, count]) => (
              <Badge key={tag} variant="outline" className="text-[10px] gap-1">
                #{tag}
                <span className="text-muted-foreground">{count}</span>
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

const KPI = ({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  warn,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
}) => (
  <Card className="p-2.5">
    <div className="flex items-start justify-between gap-1">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{label}</p>
        <p className={`text-lg font-bold leading-tight mt-0.5 ${warn ? "text-amber-500" : accent ? "text-primary" : ""}`}>
          {value}
        </p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
      <Icon className={`h-4 w-4 shrink-0 ${warn ? "text-amber-500" : accent ? "text-primary" : "text-muted-foreground"}`} />
    </div>
  </Card>
);

export default BlogStatsPanel;
