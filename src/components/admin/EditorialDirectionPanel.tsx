import { useEffect, useState } from "react";
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
} from "lucide-react";
import { formatRelativeDate } from "@/lib/article-helpers";

/**
 * EditorialDirectionPanel — read-only "compass" showing what the agent
 * is doing this week, why, and how it's performing vs hypothesis.
 *
 * Aggregates: agent_strategy_snapshots (latest), agent_decisions (recent
 * with hypothesis/learning), agent_execution_reports (status/trigger),
 * articles + posts published in current ISO week.
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

const startOfWeekBrasilia = () => {
  // Monday 00:00 in America/Sao_Paulo (UTC-3, no DST)
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600 * 1000);
  const day = brt.getUTCDay(); // 0=Sun, 1=Mon ...
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() - diffToMonday));
  // back to UTC by adding the 3h offset
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

export default function EditorialDirectionPanel() {
  const { workspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [weekArticles, setWeekArticles] = useState<number>(0);
  const [weekPosts, setWeekPosts] = useState<number>(0);
  const [topCategory, setTopCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace?.id) return;
    let active = true;
    (async () => {
      setLoading(true);
      const weekStart = startOfWeekBrasilia();

      const [snapRes, decRes, repRes, artRes, postRes] = await Promise.all([
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
          .gte("started_at", weekStart)
          .order("started_at", { ascending: false })
          .limit(10),
        supabase
          .from("articles")
          .select("category", { count: "exact" })
          .eq("workspace_id", workspace.id)
          .eq("status", "published")
          .gte("published_at", weekStart),
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspace.id)
          .eq("status", "published")
          .gte("published_at", weekStart),
      ]);

      if (!active) return;

      setSnapshot((snapRes.data as Snapshot) ?? null);
      setDecisions((decRes.data as Decision[]) ?? []);
      setReports((repRes.data as Report[]) ?? []);
      setWeekArticles(artRes.count ?? 0);
      setWeekPosts(postRes.count ?? 0);

      // Most-used article category this week
      const cats = (artRes.data as { category: string }[] | null) ?? [];
      if (cats.length > 0) {
        const counts = cats.reduce<Record<string, number>>((acc, c) => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Plano semanal alvo (vem do snapshot mais recente — "essa semana o agente está priorizando…")
  const planTotals =
    (snapshot?.content_distribution_news ?? 0) +
    (snapshot?.content_distribution_videos ?? 0) +
    (snapshot?.content_distribution_carousels ?? 0) +
    (snapshot?.content_distribution_images ?? 0);

  const planItems = [
    { key: "news", label: "Notícias", value: snapshot?.content_distribution_news ?? 0, color: "from-emerald-500 to-emerald-700" },
    { key: "videos", label: "Reels", value: snapshot?.content_distribution_videos ?? 0, color: "from-pink-500 to-rose-700" },
    { key: "carousels", label: "Carrosséis", value: snapshot?.content_distribution_carousels ?? 0, color: "from-purple-500 to-indigo-700" },
    { key: "images", label: "Imagens", value: snapshot?.content_distribution_images ?? 0, color: "from-blue-500 to-cyan-700" },
  ];

  const lastReport = reports[0];
  const decisionsWithLearning = decisions.filter((d) => d.learning && d.hypothesis_confirmed !== null).slice(0, 4);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pb-6">
        {/* HEADER — Tese da semana */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
                <Compass className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base leading-tight">Direção editorial — semana atual</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Tese, plano e leitura do agente Horvat. Atualiza a cada execução do ciclo (3h).
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot?.strategy_reason ? (
              <blockquote className="border-l-2 border-primary/60 pl-3 py-1 text-sm text-foreground/90 italic">
                {snapshot.strategy_reason}
              </blockquote>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tese ainda não foi gerada. Aguarde o próximo ciclo do agente ou execute manualmente.
              </p>
            )}

            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className="rounded-md border border-border/60 bg-card/50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Meta</div>
                <div className="text-sm font-semibold capitalize">
                  {snapshot?.goal_type ?? "macro"}
                </div>
              </div>
              <div className="rounded-md border border-border/60 bg-card/50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo top</div>
                <div className="text-sm font-semibold capitalize">
                  {snapshot?.top_performing_type ?? "—"}
                </div>
              </div>
              <div className="rounded-md border border-border/60 bg-card/50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Categoria</div>
                <div className="text-sm font-semibold capitalize">
                  {topCategory ?? "—"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PLANO vs EXECUÇÃO */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Plano semanal</CardTitle>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {weekPosts} posts · {weekArticles} artigos
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {planTotals === 0 ? (
              <p className="text-xs text-muted-foreground">
                Plano de distribuição ainda não configurado. Configure em Agente → Configurações.
              </p>
            ) : (
              planItems.map((item) => {
                const pct = planTotals > 0 ? Math.round((item.value / planTotals) * 100) : 0;
                return (
                  <div key={item.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{item.label}</span>
                      <span className="text-muted-foreground">{item.value} alvo · {pct}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* ÚLTIMO CICLO */}
        {lastReport && (
          <Card>
            <CardHeader className="pb-3">
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
                  <span className="text-xs text-muted-foreground">Decisão:</span>
                  <Badge className={`${decisionLabel(lastReport.decision).color} border text-[10px]`}>
                    {decisionLabel(lastReport.decision).label}
                  </Badge>
                </div>
              )}
              {lastReport.summary && (
                <p className="text-xs text-foreground/80 leading-relaxed">{lastReport.summary}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* DECISÕES DA SEMANA */}
        <Card>
          <CardHeader className="pb-3">
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
              <p className="text-xs text-muted-foreground">Nenhuma decisão registrada esta semana ainda.</p>
            ) : (
              decisions.slice(0, 6).map((d) => {
                const meta = decisionLabel(d.decision);
                return (
                  <div
                    key={d.id}
                    className="rounded-md border border-border/50 bg-card/40 p-2.5 space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className={`${meta.color} border text-[10px]`}>{meta.label}</Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        <Clock3 className="h-2.5 w-2.5 inline mr-0.5" />
                        {formatRelativeDate(d.created_at)}
                      </span>
                    </div>
                    {d.decision_reason && (
                      <p className="text-xs text-foreground/80 leading-snug">{d.decision_reason}</p>
                    )}
                    {d.hypothesis && (
                      <p className="text-[11px] text-muted-foreground italic leading-snug">
                        Hipótese: {d.hypothesis}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* APRENDIZADO — hipótese vs realidade */}
        {decisionsWithLearning.length > 0 && (
          <Card className="border-amber-500/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm">O que o agente aprendeu</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {decisionsWithLearning.map((d) => (
                <div key={d.id} className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-1">
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
                  <p className="text-xs text-foreground/85 leading-snug">{d.learning}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* DICA — como acompanhar */}
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              Como acompanhar nos próximos dias
            </div>
            <ul className="text-[11px] text-muted-foreground space-y-1 ml-5 list-disc">
              <li>Volte aqui 1×/dia: a tese atualiza automaticamente a cada ciclo do agente (3h)</li>
              <li>Compare "Plano semanal" com "Decisões" — se algum tipo está zerado, o agente está evitando aquele formato por baixo desempenho</li>
              <li>Em "O que o agente aprendeu", veja hipóteses confirmadas/refutadas — isso guia as próximas semanas</li>
              <li>Para visão pública: aba <strong>Visitas</strong> (GA4 + interno) e Search Console (pesquisas que levam ao site)</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
