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
  Calendar,
  Globe,
  Search,
  Zap,
  Sunrise,
  Moon,
  Info,
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
 * EditorialDirectionPanel — painel UNIFICADO read-only.
 * Foco: custo POR POST + decisões do agente + relatórios diários.
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

type PageView = {
  page_path: string;
  page_type: string;
  article_slug: string | null;
  referrer: string | null;
  device_type: string | null;
  created_at: string;
  session_id: string | null;
};

type DailyReport = {
  id: string;
  content: string;
  created_at: string;
  metadata: any;
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
    create_image: { label: "Imagem (IG)", color: "bg-blue-500/10 text-blue-300 border-blue-500/30" },
    create_carousel: { label: "Carrossel (IG)", color: "bg-purple-500/10 text-purple-300 border-purple-500/30" },
    create_video: { label: "Reels (IG)", color: "bg-pink-500/10 text-pink-300 border-pink-500/30" },
    create_news: { label: "Notícia (IG)", color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
    create_news_video: { label: "Reels Notícia (IG)", color: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
    create_marketing: { label: "Marketing (IG)", color: "bg-orange-500/10 text-orange-300 border-orange-500/30" },
    create_article: { label: "Artigo (Blog)", color: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
    skip: { label: "Pausa estratégica", color: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30" },
  };
  return map[d] ?? { label: d, color: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30" };
};

// Formato HH:mm em Brasília
const fmtTimeBR = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

const fmtDayBR = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return "";
  }
};

export default function EditorialDirectionPanel() {
  const { currentWorkspace: workspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [pageViews, setPageViews] = useState<PageView[]>([]);
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [topCategory, setTopCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace?.id) return;
    let active = true;
    (async () => {
      setLoading(true);
      const weekStart = startOfWeekBrasilia();
      const last7d = new Date(Date.now() - 7 * 86400000).toISOString();

      const [snapRes, decRes, repRes, artAllRes, viewsRes, dailyRes] = await Promise.all([
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
          .from("page_views")
          .select("page_path, page_type, article_slug, referrer, device_type, created_at, session_id")
          .gte("created_at", last7d)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("agent_proactive_messages")
          .select("id, content, created_at, metadata")
          .eq("workspace_id", workspace.id)
          .eq("message_type", "daily_blog_report")
          .order("created_at", { ascending: false })
          .limit(4),
      ]);

      if (!active) return;

      setSnapshot((snapRes.data as Snapshot) ?? null);
      setDecisions((decRes.data as Decision[]) ?? []);
      setReports((repRes.data as Report[]) ?? []);
      setArticles((artAllRes.data as ArticleRow[]) ?? []);
      setPageViews((viewsRes.data as PageView[]) ?? []);
      setDailyReports((dailyRes.data as DailyReport[]) ?? []);

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

  const metrics = useMemo(() => {
    const weekStart = startOfWeekBrasilia();

    // Posts recentes (últimos 10) com custo individual
    const recentArticles = [...articles]
      .filter((a) => a.cost_estimate != null && a.cost_estimate > 0)
      .slice(0, 10);

    // Hoje (Brasília)
    const todayBR = new Date();
    todayBR.setUTCHours(3, 0, 0, 0);
    if (todayBR > new Date()) todayBR.setUTCDate(todayBR.getUTCDate() - 1);
    const todayArticles = articles.filter((a) => new Date(a.created_at) >= todayBR);
    const todayCost = todayArticles.reduce((s, a) => s + (a.cost_estimate || 0), 0);

    const weekArticles = articles.filter(
      (a) => a.status === "published" && a.published_at && a.published_at >= weekStart
    );
    const totalArticles = articles.filter((a) => a.status === "published").length;
    const totalDrafts = articles.filter((a) => a.status === "draft").length;

    // Tendência publicação 7d
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

    // Top 5 mais lidos
    const topArticles = [...articles]
      .filter((a) => a.status === "published")
      .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
      .slice(0, 5);

    // Visitas
    const totalViews = pageViews.length;
    const sessions = new Set(pageViews.map((v) => v.session_id).filter(Boolean)).size;
    const articleViews = pageViews.filter((v) => v.page_type === "article").length;

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
      recentArticles,
      todayArticles,
      todayCost,
      weekArticles: weekArticles.length,
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
  }, [articles, pageViews]);

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
    {
      key: "news",
      label: "Notícias",
      value: snapshot?.content_distribution_news ?? 0,
      color: "bg-emerald-500",
      explain: "Posts de notícia tech no Instagram (imagem + caption resumindo a manchete).",
    },
    {
      key: "videos",
      label: "Reels",
      value: snapshot?.content_distribution_videos ?? 0,
      color: "bg-pink-500",
      explain: "Vídeos curtos verticais (9:16) narrados — só no Instagram/TikTok.",
    },
    {
      key: "carousels",
      label: "Carrosséis",
      value: snapshot?.content_distribution_carousels ?? 0,
      color: "bg-purple-500",
      explain: "Sequência de slides no Instagram (até 3 imagens), útil pra contar uma história em pedaços.",
    },
    {
      key: "images",
      label: "Imagens",
      value: snapshot?.content_distribution_images ?? 0,
      color: "bg-blue-500",
      explain: "Post estático de imagem única no Instagram com caption editorial.",
    },
  ];

  const lastReport = reports[0];
  const recentDecisions = decisions.slice(0, 5);
  const decisionsWithLearning = decisions.filter((d) => d.learning && d.hypothesis_confirmed !== null).slice(0, 3);

  // Separa relatórios diários
  const morningReports = dailyReports.filter((r) => r.metadata?.period === "morning").slice(0, 1);
  const eveningReports = dailyReports.filter((r) => r.metadata?.period === "evening").slice(0, 1);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 pb-6">
        {/* ============ AUTO-PILOT (faixa fina) ============ */}
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <Zap className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] text-foreground">
            <strong className="text-emerald-300">Auto-pilot ATIVO</strong> · 09h, 13h e 19h (BR) ·{" "}
            <span className="text-muted-foreground">
              hoje {metrics.todayArticles.length}/3 artigos · ${metrics.todayCost.toFixed(4)}
            </span>
          </span>
          <Badge variant="outline" className="ml-auto text-[10px] border-emerald-500/40 text-emerald-300 shrink-0">
            tech-only
          </Badge>
        </div>

        {/* ============ CUSTO POR POST ============ */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              <CardTitle className="text-sm">Custo por post (últimos 10)</CardTitle>
              <Badge variant="outline" className="ml-auto text-[10px]">
                hoje: ${metrics.todayCost.toFixed(4)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {metrics.recentArticles.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-3">
                Nenhum artigo com custo registrado ainda.
              </p>
            ) : (
              metrics.recentArticles.map((a) => (
                <a
                  key={a.id}
                  href={`/noticia/${a.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors group border border-border/40"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium line-clamp-1 group-hover:text-primary transition-colors">
                      {a.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {fmtDayBR(a.created_at)} · {fmtTimeBR(a.created_at)} · {a.category}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 font-mono text-[10px] border-emerald-500/30 text-emerald-300"
                  >
                    ${(a.cost_estimate ?? 0).toFixed(4)}
                  </Badge>
                </a>
              ))
            )}
          </CardContent>
        </Card>

        {/* ============ RELATÓRIOS DIÁRIOS (manhã + noite) ============ */}
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-background to-background">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <CardTitle className="text-sm">Relatórios do dia</CardTitle>
              <Badge variant="outline" className="ml-auto text-[10px] border-amber-500/30 text-amber-300">
                08h & 22h BR
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {dailyReports.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Nenhum relatório ainda. O agente publica 2/dia automaticamente: <strong>08h</strong> (matinal) e <strong>22h</strong> (noturno).
              </p>
            ) : (
              <>
                {morningReports.map((r) => (
                  <div key={r.id} className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Sunrise className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="text-[11px] font-semibold">Matinal</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {fmtDayBR(r.created_at)} · {fmtTimeBR(r.created_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-foreground/90 leading-snug whitespace-pre-line">{r.content}</p>
                  </div>
                ))}
                {eveningReports.map((r) => (
                  <div key={r.id} className="rounded-md border border-indigo-500/20 bg-indigo-500/5 p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Moon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                      <span className="text-[11px] font-semibold">Noturno</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {fmtDayBR(r.created_at)} · {fmtTimeBR(r.created_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-foreground/90 leading-snug whitespace-pre-line">{r.content}</p>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* ============ DIREÇÃO EDITORIAL + EXPLICAÇÃO DOS TIPOS ============ */}
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

            {/* Explicação do que é cada tipo de conteúdo */}
            <div className="rounded-md border border-border/60 bg-card/40 p-2.5 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <Info className="h-3 w-3 text-primary" />
                O que é cada tipo de conteúdo
              </div>
              <div className="space-y-1.5 text-[10.5px] leading-snug">
                <div className="flex gap-2">
                  <span className="font-semibold text-cyan-300 shrink-0 w-20">📰 Artigo</span>
                  <span className="text-muted-foreground">
                    Texto completo (~600-1200 palavras) publicado <strong className="text-foreground">no blog Neural Update</strong>. É o único formato do blog.
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-emerald-300 shrink-0 w-20">📱 Notícia</span>
                  <span className="text-muted-foreground">
                    Post de notícia <strong className="text-foreground">no Instagram</strong> (imagem + caption resumida da manchete).
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-pink-300 shrink-0 w-20">🎬 Reels</span>
                  <span className="text-muted-foreground">
                    Vídeo vertical 9:16 narrado <strong className="text-foreground">no Instagram/TikTok</strong>. Não existe no blog.
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-purple-300 shrink-0 w-20">🎴 Carrossel</span>
                  <span className="text-muted-foreground">
                    Sequência de até 3 slides <strong className="text-foreground">no Instagram</strong>. Não existe no blog.
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-blue-300 shrink-0 w-20">🖼️ Imagem</span>
                  <span className="text-muted-foreground">
                    Post de imagem única <strong className="text-foreground">no Instagram</strong>. Não existe no blog.
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/80 pt-1 border-t border-border/40">
                <strong className="text-foreground">Resumo:</strong> Blog = só artigo escrito. Os demais formatos são exclusivos do Instagram/TikTok e rodam num pipeline totalmente separado.
              </p>
            </div>

            {/* Distribuição planejada (Instagram) */}
            {planTotals > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <Target className="h-3 w-3" /> Distribuição planejada (Instagram)
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

        {/* ============ ÚLTIMO CICLO + DECISÕES RECENTES ============ */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              {lastReport?.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : lastReport?.status === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
              <CardTitle className="text-sm">Último ciclo & decisões</CardTitle>
              {lastReport && (
                <Badge variant="outline" className="ml-auto text-[10px] capitalize">
                  {lastReport.trigger} · {formatRelativeDate(lastReport.started_at)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {lastReport?.summary && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-2 space-y-1">
                {lastReport.decision && (
                  <Badge className={`${decisionLabel(lastReport.decision).color} border text-[10px]`}>
                    {decisionLabel(lastReport.decision).label}
                  </Badge>
                )}
                <p className="text-[11px] text-foreground/90 leading-snug">{lastReport.summary}</p>
              </div>
            )}

            {recentDecisions.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nenhuma decisão registrada esta semana.</p>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground pt-1">
                  Decisões recentes (semana)
                </div>
                {recentDecisions.map((d) => {
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
                })}
              </>
            )}
          </CardContent>
        </Card>

        {/* ============ CONTEÚDO PUBLICADO ============ */}
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

        {/* ============ VISITAS NO SITE ============ */}
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

        {/* ============ APRENDIZADO (se houver) ============ */}
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
