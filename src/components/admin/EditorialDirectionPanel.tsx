import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Compass,
  Target,
  CheckCircle2,
  Clock3,
  Lightbulb,
  TrendingUp,
  AlertCircle,
  Loader2,
  Sparkles,
  DollarSign,
  Eye,
  Users,
  FileText,
  Gauge,
  Calendar,
  Globe,
  Search,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { formatRelativeDate, formatArticleDate, ARTICLE_CATEGORIES } from "@/lib/article-helpers";

/**
 * EditorialDirectionPanel — painel UNIFICADO (Direção + Conteúdo + Visitas).
 * Read-only. Foco em ritmo gradual e economia de IA.
 */

type Snapshot = {
  id: string;
  snapshot_date: string;
  goal_type: string | null;
  top_performing_type: string | null;
  strategy_reason: string | null;
  followers_count: number | null;
  avg_engagement: number | null;
  posts_count: number | null;
  content_distribution_news: number | null;
  content_distribution_videos: number | null;
  content_distribution_carousels: number | null;
  content_distribution_images: number | null;
};

type Decision = {
  id: string;
  created_at: string;
  decision: string;
  decision_reason: string | null;
  hypothesis: string | null;
  hypothesis_confirmed: boolean | null;
  learning: string | null;
  expected_engagement: number | null;
  actual_engagement: number | null;
};

type Report = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  summary: string | null;
  decision: string | null;
};

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: string;
  view_count: number;
  is_featured: boolean;
  published_at: string | null;
  created_at: string;
  cost_estimate: number | null;
};

type PostRow = {
  id: string;
  cost_estimate: number | null;
  created_at: string;
  post_type: string | null;
};

type PageView = {
  page_path: string;
  page_type: string;
  referrer: string | null;
  device_type: string | null;
  created_at: string;
  session_id: string | null;
};

const startOfWeekBrasilia = () => {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600 * 1000);
  const day = brt.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() - diffToMonday));
  return new Date(monday.getTime() + 3 * 3600 * 1000).toISOString();
};

const decisionLabel = (d: string) => {
  const map: Record<string, { label: string; color: string }> = {
    create_image: { label: "Imagem", color: "bg-blue-500/10 text-blue-300 border-blue-500/30" },
    create_carousel: { label: "Carrossel", color: "bg-purple-500/10 text-purple-300 border-purple-500/30" },
    create_video: { label: "Reels", color: "bg-pink-500/10 text-pink-300 border-pink-500/30" },
    create_news: { label: "Notícia", color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
    create_news_video: { label: "Reels Notícia", color: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
    create_marketing: { label: "Marketing", color: "bg-orange-500/10 text-orange-300 border-orange-500/30" },
    create_article: { label: "Artigo", color: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
    skip: { label: "Pausa estratégica", color: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30" },
  };
  return map[d] ?? { label: d, color: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30" };
};

// Plano gradual de "ramp-up" para o BLOG (independente do Instagram/TikTok)
const RAMPUP_PLAN = [
  { week: 1, articlesPerDay: 1, label: "Semana 1 — Aquecimento" },
  { week: 2, articlesPerDay: 2, label: "Semana 2 — Validação" },
  { week: 3, articlesPerDay: 3, label: "Semana 3 — Aceleração" },
  { week: 4, articlesPerDay: 4, label: "Semana 4+ — Ritmo pleno" },
];

export default function EditorialDirectionPanel() {
  const { currentWorkspace: workspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [pageViews, setPageViews] = useState<PageView[]>([]);
  const [topCategory, setTopCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace?.id) return;
    let active = true;
    (async () => {
      setLoading(true);
      const weekStart = startOfWeekBrasilia();
      const last30d = new Date(Date.now() - 30 * 86400000).toISOString();
      const last7d = new Date(Date.now() - 7 * 86400000).toISOString();

      const [snapRes, decRes, repRes, artAllRes, postsRes, viewsRes] = await Promise.all([
        supabase
          .from("agent_strategy_snapshots")
          .select("*")
          .eq("workspace_id", workspace.id)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("agent_decisions")
          .select("id, created_at, decision, decision_reason, hypothesis, hypothesis_confirmed, learning, expected_engagement, actual_engagement")
          .eq("workspace_id", workspace.id)
          .gte("created_at", weekStart)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("agent_execution_reports")
          .select("id, started_at, finished_at, status, trigger, summary, decision")
          .eq("workspace_id", workspace.id)
          .gte("started_at", last7d)
          .order("started_at", { ascending: false })
          .limit(60),
        supabase
          .from("articles")
          .select("id, slug, title, category, status, view_count, is_featured, published_at, created_at, cost_estimate")
          .eq("workspace_id", workspace.id)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("posts")
          .select("id, cost_estimate, created_at, post_type")
          .eq("workspace_id", workspace.id)
          .gte("created_at", last30d)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("page_views")
          .select("page_path, page_type, referrer, device_type, created_at, session_id")
          .gte("created_at", last7d)
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);

      if (!active) return;

      setSnapshot((snapRes.data as Snapshot) ?? null);
      setDecisions((decRes.data as Decision[]) ?? []);
      setReports((repRes.data as Report[]) ?? []);
      setArticles((artAllRes.data as ArticleRow[]) ?? []);
      setPosts((postsRes.data as PostRow[]) ?? []);
      setPageViews((viewsRes.data as PageView[]) ?? []);

      // Top category na semana
      const weekArt = ((artAllRes.data as ArticleRow[]) ?? []).filter(
        (a) => a.published_at && a.published_at >= weekStart
      );
      if (weekArt.length > 0) {
        const counts = weekArt.reduce<Record<string, number>>((acc, c) => {
          acc[c.category] = (acc[c.category] ?? 0) + 1;
          return acc;
        }, {});
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        setTopCategory(top ? top[0] : null);
      } else {
        setTopCategory(null);
      }

      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [workspace?.id]);

  // ============= MÉTRICAS DERIVADAS =============
  const metrics = useMemo(() => {
    const weekStart = startOfWeekBrasilia();
    const last30d = new Date(Date.now() - 30 * 86400000).toISOString();
    const last7d = new Date(Date.now() - 7 * 86400000).toISOString();
    const last24h = new Date(Date.now() - 86400000).toISOString();

    // ====== CUSTO IA ======
    const cost30d = posts.reduce((s, p) => s + (p.cost_estimate || 0), 0);
    const cost7d = posts
      .filter((p) => p.created_at >= last7d)
      .reduce((s, p) => s + (p.cost_estimate || 0), 0);
    const cost24h = posts
      .filter((p) => p.created_at >= last24h)
      .reduce((s, p) => s + (p.cost_estimate || 0), 0);
    const articleCost30d = articles
      .filter((a) => a.created_at >= last30d)
      .reduce((s, a) => s + (a.cost_estimate || 0), 0);

    const totalCost30d = cost30d + articleCost30d;
    const dailyAvg = totalCost30d / 30;
    const monthlyProjection = dailyAvg * 30;

    // Frequência cron
    const cyclesLast24h = reports.filter((r) => r.started_at >= last24h).length;
    const avgHoursBetweenCycles = cyclesLast24h > 0 ? Math.round((24 / cyclesLast24h) * 10) / 10 : 0;

    // ====== CONTEÚDO ======
    const weekArticles = articles.filter(
      (a) => a.status === "published" && a.published_at && a.published_at >= weekStart
    );
    const weekPosts = posts.filter((p) => p.created_at >= weekStart);
    const totalArticles = articles.filter((a) => a.status === "published").length;
    const totalDrafts = articles.filter((a) => a.status === "draft").length;

    // Tendência publicação 7d (artigos por dia)
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days[d] = 0;
    }
    articles.forEach((a) => {
      const ref = a.published_at || a.created_at;
      if (!ref) return;
      const k = ref.slice(0, 10);
      if (k in days) days[k] += 1;
    });
    const publishTrend = Object.entries(days).map(([date, count]) => ({
      date: new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      Artigos: count,
    }));

    // Top 5 artigos
    const topArticles = [...articles]
      .filter((a) => a.status === "published")
      .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
      .slice(0, 5);

    // ====== VISITAS ======
    const totalViews = pageViews.length;
    const sessions = new Set(pageViews.map((v) => v.session_id).filter(Boolean)).size;
    const articleViews = pageViews.filter((v) => v.page_type === "article").length;

    // Visitas por dia (7d)
    const viewDays: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      viewDays[d] = 0;
    }
    pageViews.forEach((v) => {
      const k = v.created_at.slice(0, 10);
      if (k in viewDays) viewDays[k] += 1;
    });
    const viewsTrend = Object.entries(viewDays).map(([date, count]) => ({
      date: new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      Visitas: count,
    }));

    // Fontes
    const refMap = new Map<string, number>();
    pageViews.forEach((v) => {
      let src = "Direto";
      if (v.referrer) {
        try {
          const host = new URL(v.referrer).hostname.replace(/^www\./, "");
          if (host) src = host;
        } catch {}
      }
      refMap.set(src, (refMap.get(src) || 0) + 1);
    });
    const sources = Array.from(refMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }));

    return {
      cost30d: totalCost30d,
      cost7d,
      cost24h,
      dailyAvg,
      monthlyProjection,
      cyclesLast24h,
      avgHoursBetweenCycles,
      weekArticles: weekArticles.length,
      weekPosts: weekPosts.length,
      totalArticles,
      totalDrafts,
      publishTrend,
      topArticles,
      totalViews,
      sessions,
      articleViews,
      viewsTrend,
      sources,
    };
  }, [articles, posts, pageViews, reports]);

  // Determinar fase de ramp-up baseado em quantos artigos publicados nos últimos 7 dias
  const currentPhase = useMemo(() => {
    const totalPub = metrics.totalArticles;
    if (totalPub < 7) return RAMPUP_PLAN[0];
    if (totalPub < 21) return RAMPUP_PLAN[1];
    if (totalPub < 50) return RAMPUP_PLAN[2];
    return RAMPUP_PLAN[3];
  }, [metrics.totalArticles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const planTotals =
    (snapshot?.content_distribution_news ?? 0) +
    (snapshot?.content_distribution_videos ?? 0) +
    (snapshot?.content_distribution_carousels ?? 0) +
    (snapshot?.content_distribution_images ?? 0);

  const planItems = [
    { key: "news", label: "Notícias", value: snapshot?.content_distribution_news ?? 0, color: "bg-emerald-500" },
    { key: "videos", label: "Reels", value: snapshot?.content_distribution_videos ?? 0, color: "bg-pink-500" },
    { key: "carousels", label: "Carrosséis", value: snapshot?.content_distribution_carousels ?? 0, color: "bg-purple-500" },
    { key: "images", label: "Imagens", value: snapshot?.content_distribution_images ?? 0, color: "bg-blue-500" },
  ];

  const lastReport = reports[0];
  const decisionsWithLearning = decisions.filter((d) => d.learning && d.hypothesis_confirmed !== null).slice(0, 3);

  // Status de ritmo
  const isPaceHealthy = metrics.weekArticles >= currentPhase.articlesPerDay * 3; // >= 3 dias da fase

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 pb-6">
        {/* ============ ECONOMIA & RITMO (TOPO) ============ */}
        <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-background to-background">
          <CardHeader className="pb-2">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shrink-0">
                <DollarSign className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm leading-tight">Economia & ritmo de IA</CardTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Quanto custou, quanto vai custar, e o ritmo gradual de publicação.
                </p>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] shrink-0 ${
                  metrics.monthlyProjection < 5
                    ? "border-emerald-500/40 text-emerald-300"
                    : metrics.monthlyProjection < 20
                    ? "border-amber-500/40 text-amber-300"
                    : "border-rose-500/40 text-rose-300"
                }`}
              >
                {metrics.monthlyProjection < 5 ? "💚 econômico" : metrics.monthlyProjection < 20 ? "💛 controlado" : "🔴 alto"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* KPIs custo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KPI label="Últimas 24h" value={`$${metrics.cost24h.toFixed(4)}`} sub={`${metrics.cyclesLast24h} ciclos`} />
              <KPI label="Últimos 7d" value={`$${metrics.cost7d.toFixed(3)}`} sub={`${metrics.weekArticles} artigos`} />
              <KPI label="Últimos 30d" value={`$${metrics.cost30d.toFixed(2)}`} sub={`${articles.length} artigos total`} />
              <KPI
                label="Projeção mensal"
                value={`$${metrics.monthlyProjection.toFixed(2)}`}
                sub="ritmo atual"
                accent
              />
            </div>

            {/* Auto-pilot do blog */}
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5">
              <div className="flex items-center gap-2 text-xs">
                <Zap className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="font-medium">Auto-pilot do blog</span>
                <Badge variant="outline" className="ml-auto text-[10px] border-emerald-500/40 text-emerald-300">
                  ATIVO · 3×/dia
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                Publica automaticamente às <strong className="text-foreground">09h, 13h e 19h</strong> (Brasília).
                Filtro tech-only: bloqueia ofertas, cupons, listas de produtos, jogos, filmes e qualquer notícia que não seja IA, tecnologia, inovação ou ciência.
              </p>
              <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
                <span>Hoje: {articles.filter(a => {
                  const d = new Date(a.created_at);
                  const todayBR = new Date();
                  todayBR.setUTCHours(3, 0, 0, 0);
                  if (todayBR > new Date()) todayBR.setUTCDate(todayBR.getUTCDate() - 1);
                  return d >= todayBR;
                }).length}/3 artigos publicados</span>
                <span className="text-muted-foreground/70">isolado do Instagram</span>
              </div>
            </div>

            {/* Comparativo de custo: Blog vs Instagram */}
            <div className="rounded-md border border-border/60 bg-card/40 p-2.5 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <DollarSign className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="font-medium">Blog vs Instagram (custo médio por peça)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5">
                  <div className="text-muted-foreground text-[10px]">📰 Blog (artigo completo)</div>
                  <div className="font-mono font-semibold text-emerald-300">~$0.004</div>
                  <div className="text-[10px] text-muted-foreground/70">Gemini Flash + Unsplash grátis</div>
                </div>
                <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
                  <div className="text-muted-foreground text-[10px]">📱 Instagram (Reels narrado)</div>
                  <div className="font-mono font-semibold text-amber-300">~$0.020</div>
                  <div className="text-[10px] text-muted-foreground/70">Gemini + ElevenLabs + Pexels</div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/80 leading-snug pt-0.5">
                Blog é <strong className="text-emerald-300">~5× mais barato</strong> que Reels do IG. 3 artigos/dia ≈ <strong>$0.36/mês</strong>.
                Instagram e blog rodam em <strong>pipelines totalmente separados</strong>.
              </p>
            </div>

            {/* Plano gradual */}
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold">{currentPhase.label}</span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {metrics.totalArticles} artigos publicados
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Meta desta fase:{" "}
                <strong className="text-foreground">
                  {currentPhase.articlesPerDay} artigo{currentPhase.articlesPerDay > 1 ? "s" : ""}/dia
                </strong>{" "}
                no blog. O auto-pilot já está configurado para 3/dia — quando bater consistência, sobe pra 4.
              </p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Esta semana: {metrics.weekArticles} artigos publicados</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    isPaceHealthy ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"
                  }`}
                >
                  {isPaceHealthy ? "✓ no ritmo" : "aquecendo"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ============ DIREÇÃO EDITORIAL ============ */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
          <CardHeader className="pb-2">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
                <Compass className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm leading-tight">Direção editorial — semana atual</CardTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Tese e plano do agente. Atualiza a cada ciclo.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot?.strategy_reason ? (
              <blockquote className="border-l-2 border-primary/60 pl-3 py-1 text-xs text-foreground/90 italic leading-snug">
                {snapshot.strategy_reason}
              </blockquote>
            ) : (
              <p className="text-xs text-muted-foreground">
                Tese ainda não gerada. Aguarde o próximo ciclo do agente.
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Meta" value={snapshot?.goal_type ?? "macro"} />
              <MiniStat label="Tipo top" value={snapshot?.top_performing_type ?? "—"} />
              <MiniStat label="Categoria" value={topCategory ?? "—"} />
            </div>

            {/* Distribuição planejada */}
            {planTotals > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <Target className="h-3 w-3" /> Distribuição planejada
                </div>
                {planItems.map((item) => {
                  const pct = planTotals > 0 ? Math.round((item.value / planTotals) * 100) : 0;
                  return (
                    <div key={item.key} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span>{item.label}</span>
                        <span className="text-muted-foreground">
                          {item.value} alvo · {pct}%
                        </span>
                      </div>
                      <Progress value={pct} className="h-1" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============ ÚLTIMO CICLO ============ */}
        {lastReport && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                {lastReport.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : lastReport.status === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                <CardTitle className="text-sm">Último ciclo</CardTitle>
                <Badge variant="outline" className="ml-auto text-[10px] capitalize">
                  {lastReport.trigger} · {formatRelativeDate(lastReport.started_at)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {lastReport.decision && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Decisão:</span>
                  <Badge className={`${decisionLabel(lastReport.decision).color} border text-[10px]`}>
                    {decisionLabel(lastReport.decision).label}
                  </Badge>
                </div>
              )}
              {lastReport.summary && (
                <p className="text-[11px] text-foreground/80 leading-snug">{lastReport.summary}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ============ CONTEÚDO (publicação 7d + top artigos) ============ */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Conteúdo publicado</CardTitle>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {metrics.totalArticles} publicados · {metrics.totalDrafts} rascunhos
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.publishTrend} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
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
                  <Bar dataKey="Artigos" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {metrics.topArticles.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-border/40">
                <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-3 w-3" /> Top 5 mais lidos
                </div>
                {metrics.topArticles.map((a, idx) => {
                  const catLabel = ARTICLE_CATEGORIES.find((c) => c.slug === a.category)?.label ?? a.category;
                  return (
                    <a
                      key={a.id}
                      href={`/noticia/${a.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/40 transition-colors group"
                    >
                      <span className="text-[11px] font-bold text-muted-foreground w-3 shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium line-clamp-1 group-hover:text-primary transition-colors">
                          {a.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatArticleDate(a.published_at)} · {catLabel}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                        <Eye className="h-2.5 w-2.5" /> {a.view_count}
                      </Badge>
                    </a>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============ VISITAS ============ */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Visitas no site</CardTitle>
              <Badge variant="outline" className="ml-auto text-[10px]">
                últimos 7 dias
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.totalViews === 0 ? (
              <div className="text-center py-4">
                <Globe className="h-6 w-6 mx-auto text-muted-foreground mb-1.5" />
                <p className="text-[11px] text-muted-foreground">
                  Sem visitas ainda. Após publicar e divulgar, aparecem aqui.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <KPI label="Visitas" value={metrics.totalViews.toLocaleString("pt-BR")} icon={Eye} />
                  <KPI label="Sessões" value={metrics.sessions.toLocaleString("pt-BR")} icon={Users} />
                  <KPI label="Leituras" value={metrics.articleViews.toLocaleString("pt-BR")} icon={FileText} />
                </div>

                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={metrics.viewsTrend} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 6,
                          fontSize: 11,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Visitas"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {metrics.sources.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-border/40">
                    <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                      <Search className="h-3 w-3" /> De onde vêm
                    </div>
                    {metrics.sources.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className="truncate">{s.source}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {s.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ============ DECISÕES DA SEMANA ============ */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Decisões da semana</CardTitle>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {decisions.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {decisions.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nenhuma decisão registrada esta semana.</p>
            ) : (
              decisions.slice(0, 5).map((d) => {
                const meta = decisionLabel(d.decision);
                return (
                  <div key={d.id} className="rounded-md border border-border/50 bg-card/40 p-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className={`${meta.color} border text-[10px]`}>{meta.label}</Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        <Clock3 className="h-2.5 w-2.5 inline mr-0.5" />
                        {formatRelativeDate(d.created_at)}
                      </span>
                    </div>
                    {d.decision_reason && (
                      <p className="text-[11px] text-foreground/80 leading-snug">{d.decision_reason}</p>
                    )}
                    {d.hypothesis && (
                      <p className="text-[10px] text-muted-foreground italic leading-snug">
                        Hipótese: {d.hypothesis}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* ============ APRENDIZADO ============ */}
        {decisionsWithLearning.length > 0 && (
          <Card className="border-amber-500/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm">O que o agente aprendeu</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {decisionsWithLearning.map((d) => (
                <div key={d.id} className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 space-y-1">
                  <div className="flex items-center gap-2">
                    {d.hypothesis_confirmed ? (
                      <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-[10px]">
                        ✓ confirmada
                      </Badge>
                    ) : (
                      <Badge className="bg-rose-500/10 text-rose-300 border-rose-500/30 text-[10px]">
                        ✗ refutada
                      </Badge>
                    )}
                    {d.expected_engagement != null && d.actual_engagement != null && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        esperado {d.expected_engagement.toFixed(1)} → real {d.actual_engagement.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-foreground/85 leading-snug">{d.learning}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ============ DICA ============ */}
        <Card className="border-dashed">
          <CardContent className="pt-3 pb-3 space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] font-medium">
              <Calendar className="h-3 w-3 text-primary" />
              Como acompanhar nos próximos dias
            </div>
            <ul className="text-[10px] text-muted-foreground space-y-1 ml-4 list-disc leading-snug">
              <li>Volte aqui 1×/dia. Tese e custo atualizam a cada ciclo do agente.</li>
              <li>Custo abaixo de $5/mês = saudável. Acima de $20 = revisar frequência do cron.</li>
              <li>Comece devagar (1-2 artigos/dia) e acelere só quando ver tração nas Visitas.</li>
              <li>Para dados completos de SEO, abra o Search Console (~24-48h pra começar).</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

const KPI = ({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: any;
  accent?: boolean;
}) => (
  <div className="rounded-md border border-border/60 bg-card/50 p-2">
    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
      {Icon && <Icon className="h-2.5 w-2.5" />}
      <span className="truncate">{label}</span>
    </div>
    <div className={`text-base font-bold leading-tight mt-0.5 ${accent ? "text-primary" : ""}`}>{value}</div>
    {sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
  </div>
);

const MiniStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border/60 bg-card/50 px-2.5 py-1.5">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="text-xs font-semibold capitalize truncate">{value}</div>
  </div>
);
