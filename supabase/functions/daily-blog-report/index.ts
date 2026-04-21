// supabase/functions/daily-blog-report/index.ts
// Cron-triggered: gera 2 relatórios/dia sobre o blog Neural Update.
// Manhã (08h BR): plano e leitura do dia anterior.
// Noite (22h BR): consolidação de tudo que foi feito no dia.
// Salva em agent_proactive_messages com message_type='daily_blog_report'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

// Início do dia em Brasília (UTC-3)
function startOfTodayBrasilia(): Date {
  const d = new Date();
  d.setUTCHours(3, 0, 0, 0); // 00:00 BR = 03:00 UTC
  if (d > new Date()) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function startOfYesterdayBrasilia(): Date {
  const d = startOfTodayBrasilia();
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") ?? "morning"; // morning | evening
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id, name")
      .order("created_at", { ascending: true })
      .limit(1);

    if (!workspaces?.length) throw new Error("No workspace found");
    const workspaceId = workspaces[0].id;

    const todayStart = startOfTodayBrasilia();
    const yesterdayStart = startOfYesterdayBrasilia();
    const last7d = new Date(Date.now() - 7 * 86400000).toISOString();

    // Período de análise
    const periodStart = period === "morning" ? yesterdayStart : todayStart;
    const periodEnd = period === "morning" ? todayStart : new Date();

    // Coleta de dados em paralelo
    const [articlesRes, viewsRes, decisionsRes] = await Promise.all([
      supabase
        .from("articles")
        .select("id, slug, title, category, view_count, published_at, created_at, cost_estimate, status")
        .eq("workspace_id", workspaceId)
        .gte("created_at", periodStart.toISOString())
        .lt("created_at", periodEnd.toISOString())
        .order("created_at", { ascending: false }),
      supabase
        .from("page_views")
        .select("page_path, page_type, article_slug, referrer, created_at, session_id")
        .gte("created_at", periodStart.toISOString())
        .lt("created_at", periodEnd.toISOString())
        .limit(2000),
      supabase
        .from("agent_decisions")
        .select("decision, decision_reason, hypothesis, created_at")
        .eq("workspace_id", workspaceId)
        .gte("created_at", periodStart.toISOString())
        .lt("created_at", periodEnd.toISOString())
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const articles = articlesRes.data ?? [];
    const views = viewsRes.data ?? [];
    const decisions = decisionsRes.data ?? [];

    // Métricas
    const totalCost = articles.reduce((s, a) => s + (a.cost_estimate || 0), 0);
    const totalViews = views.length;
    const sessions = new Set(views.map((v) => v.session_id).filter(Boolean)).size;

    // Top artigos por visualização
    const articleStats = articles.map((a) => ({
      title: a.title,
      slug: a.slug,
      category: a.category,
      cost: a.cost_estimate || 0,
      reads: views.filter((v) => v.article_slug === a.slug).length,
    })).sort((a, b) => b.reads - a.reads);

    // Fontes de tráfego
    const refMap = new Map<string, number>();
    views.forEach((v) => {
      let src = "Direto";
      if (v.referrer) {
        try {
          const host = new URL(v.referrer).hostname.replace(/^www\./, "");
          if (host) src = host;
        } catch {}
      }
      refMap.set(src, (refMap.get(src) || 0) + 1);
    });
    const topSources = Array.from(refMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Categorias publicadas
    const catMap = new Map<string, number>();
    articles.forEach((a) => catMap.set(a.category, (catMap.get(a.category) || 0) + 1));

    // Monta narrativa via Gemini Flash Lite (super barato)
    const periodLabel = period === "morning" ? "RELATÓRIO MATINAL (visão do dia anterior)" : "RELATÓRIO NOTURNO (fechamento do dia)";

    const prompt = `Você é o Agente Horvat, estrategista editorial do blog Neural Update (tecnologia/IA, 2026, PT-BR).

Gere um relatório curto e objetivo em PT-BR para o gestor humano. NÃO use jargão de marketing nem promessas vazias.

CONTEXTO: ${periodLabel}
Período analisado: ${periodStart.toISOString()} → ${periodEnd.toISOString()}

DADOS REAIS:
- Artigos publicados: ${articles.length}
- Custo IA total: $${totalCost.toFixed(4)}
- Visitas no site: ${totalViews}
- Sessões únicas: ${sessions}
- Decisões automáticas registradas: ${decisions.length}
- Categorias: ${Array.from(catMap.entries()).map(([c, n]) => `${c}(${n})`).join(", ") || "nenhuma"}
- Top fontes de tráfego: ${topSources.map(([s, n]) => `${s}(${n})`).join(", ") || "sem dados"}

ARTIGOS (com leituras):
${articleStats.slice(0, 10).map((a, i) => `${i + 1}. "${a.title}" — ${a.reads} leituras, $${a.cost.toFixed(4)}`).join("\n") || "Nenhum artigo no período."}

DECISÕES DO CRON:
${decisions.slice(0, 5).map((d, i) => `${i + 1}. ${d.decision}: ${d.decision_reason ?? "—"}`).join("\n") || "Nenhuma decisão."}

REGRAS DO RELATÓRIO:
- Máximo 4 parágrafos curtos (300-500 chars total).
- Comece com 1 emoji + linha-resumo.
- Cite NÚMEROS reais (não invente).
- Se algo foi ruim, diga claramente o que e por quê.
- Termine com 1 sugestão concreta de ação para o próximo turno.
- Se for matinal: foco em "o que rola hoje".
- Se for noturno: foco em "o que rolou hoje + leitura para amanhã".
- NÃO use hashtags. NÃO use bullets. Apenas texto corrido.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`AI gateway: ${aiRes.status} ${txt}`);
    }

    const aiJson = await aiRes.json();
    const reportContent = aiJson?.choices?.[0]?.message?.content?.trim() ?? "Relatório indisponível.";

    // Salva relatório
    const { error: insertErr } = await supabase.from("agent_proactive_messages").insert({
      workspace_id: workspaceId,
      content: reportContent,
      message_type: "daily_blog_report",
      metadata: {
        period,
        articles_published: articles.length,
        total_cost: totalCost,
        total_views: totalViews,
        sessions,
        decisions_count: decisions.length,
        top_sources: topSources,
        article_stats: articleStats.slice(0, 10),
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
      },
    });

    if (insertErr) throw insertErr;

    console.log(`[daily-blog-report] ✅ ${period} report saved (${articles.length} articles, $${totalCost.toFixed(4)})`);

    return new Response(
      JSON.stringify({
        success: true,
        period,
        report: reportContent,
        metrics: { articles: articles.length, cost: totalCost, views: totalViews },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[daily-blog-report] ❌", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message ?? "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
