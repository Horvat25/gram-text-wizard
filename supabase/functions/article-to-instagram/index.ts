import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * article-to-instagram
 *
 * Transforma um artigo do Neural Update em múltiplos formatos pro Instagram:
 *   - carousel: cria um post draft com slides estruturados (hook + insights + CTA)
 *   - reels:    cria um post `generating` e dispara brand-news-video
 *   - snippet:  gera stories/tweets/tldr/hooks (texto puro pra copiar)
 *
 * Dedup: checa article_distributions antes de gerar.
 *
 * Body: { rss_item_id: string, formats?: ('carousel'|'reels'|'snippet')[], force?: boolean }
 */

const HOOK_BANK = [
  "Você ainda faz isso igual em 2022?",
  "5 IAs que vão economizar horas do seu dia",
  "O ChatGPT consegue fazer ISSO?",
  "Por que ninguém te contou isso sobre IA?",
  "Pare de usar IA do jeito errado",
  "A atualização que mudou tudo",
  "Isso é o futuro (e já chegou)",
  "Se você usa IA, precisa ver isso",
];

const BLOG_URL = "https://neural-update.com.br";

interface Article {
  id: string;
  workspace_id: string | null;
  user_id: string;
  title: string;
  description: string | null;
  link: string;
  image_url: string | null;
  source_name: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { rss_item_id, formats = ["carousel", "reels", "snippet"], force = false } = await req.json();

    if (!rss_item_id) {
      return new Response(JSON.stringify({ error: "rss_item_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: article, error: artErr } = await supabase
      .from("rss_items").select("*").eq("id", rss_item_id).single();
    if (artErr || !article) {
      return new Response(JSON.stringify({ error: "Article not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const a = article as Article;
    console.log(`[ARTICLE→IG] 📰 ${a.title.substring(0, 70)}`);

    // Resolve workspace+user (artigo do feed RSS pode estar sem)
    let workspaceId = a.workspace_id;
    let userId = a.user_id;
    if (!workspaceId) {
      const { data: acct } = await supabase
        .from("instagram_accounts").select("user_id, workspace_id").limit(1).single();
      workspaceId = acct?.workspace_id || null;
      userId = acct?.user_id || userId;
    }
    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "No workspace" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dedup
    const { data: existing } = await supabase
      .from("article_distributions").select("format,status")
      .eq("rss_item_id", rss_item_id);
    const existingMap = new Map((existing || []).map((d: any) => [d.format, d.status]));

    const toRun = formats.filter((f: string) => {
      if (force) return true;
      const s = existingMap.get(f);
      return !s || s === "failed" || s === "pending";
    });

    const results: Record<string, any> = {};

    for (const fmt of toRun) {
      try {
        if (fmt === "carousel") {
          results.carousel = await buildCarousel(supabase, lovableKey, a, workspaceId, userId);
        } else if (fmt === "reels") {
          results.reels = await buildReels(supabase, supabaseUrl, serviceRoleKey, a, workspaceId, userId);
        } else if (fmt === "snippet") {
          results.snippet = await buildSnippets(supabase, lovableKey, a, workspaceId);
        }
      } catch (e: any) {
        console.error(`[ARTICLE→IG] ❌ ${fmt}:`, e);
        results[fmt] = { error: e.message };
        await supabase.from("article_distributions").upsert({
          rss_item_id, workspace_id: workspaceId, format: fmt,
          status: "failed", error_message: e.message,
        }, { onConflict: "rss_item_id,format" });
      }
    }

    return new Response(JSON.stringify({ success: true, article_id: a.id, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[ARTICLE→IG] ❌", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ───────────────────────── CAROUSEL ─────────────────────────

function utm(article: Article, medium: string) {
  return `${BLOG_URL}?utm_source=instagram&utm_medium=${medium}&utm_campaign=${article.id}`;
}

function pickHook() {
  return HOOK_BANK[Math.floor(Math.random() * HOOK_BANK.length)];
}

async function callGeminiJSON(lovableKey: string, prompt: string, system: string) {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${lovableKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  const txt = data.choices?.[0]?.message?.content || "{}";
  return JSON.parse(txt);
}

async function buildCarousel(
  supabase: any, lovableKey: string, article: Article,
  workspaceId: string, userId: string,
) {
  // marca generating
  await supabase.from("article_distributions").upsert({
    rss_item_id: article.id, workspace_id: workspaceId, format: "carousel",
    status: "generating",
  }, { onConflict: "rss_item_id,format" });

  const ctaUrl = utm(article, "carousel");
  const hookSuggestion = pickHook();

  const slidesData = await callGeminiJSON(
    lovableKey,
    `Artigo: "${article.title}"
Resumo: ${article.description || "(sem descrição)"}
Link: ${article.link}

Sugestão de hook (use ou crie melhor): "${hookSuggestion}"

Gere um carrossel de 7 slides em PT-BR estilo Neural Update (tech/futuro, sem promo, sem clichês de IA).`,
    `Você é Horvat, social media tech do Neural Update.
Responda SOMENTE JSON válido neste schema:
{
  "slides": [
    {"n":1,"type":"hook","title":"≤7 palavras forte","subtitle":"contexto curto opcional"},
    {"n":2,"type":"insight","title":"insight 1","subtitle":"explicação 1 frase"},
    {"n":3,"type":"insight","title":"insight 2","subtitle":"explicação 1 frase"},
    {"n":4,"type":"insight","title":"insight 3","subtitle":"explicação 1 frase"},
    {"n":5,"type":"insight","title":"insight 4","subtitle":"explicação 1 frase"},
    {"n":6,"type":"insight","title":"insight 5","subtitle":"explicação 1 frase"},
    {"n":7,"type":"cta","title":"Leia completo no blog","subtitle":"Link na bio → neural-update.com.br"}
  ],
  "caption": "legenda IG 2 parágrafos persuasivos PT-BR",
  "hashtags": ["#IA","#InteligenciaArtificial","#Tech","#NeuralUpdate","#Futuro"]
}
REGRAS: ano 2026. Sem 'AI' (use 'IA'). Sem 'desbloquear', 'descubra', 'incrível'. Slide 1 = gancho. Slide 7 = CTA fixo pro blog.`,
  );

  const slides = slidesData.slides || [];
  const caption = String(slidesData.caption || "").trim();
  const hashtags = Array.isArray(slidesData.hashtags) ? slidesData.hashtags : [];

  // CTA fixo
  const finalCaption =
    `${caption}\n\n🧠 Artigo completo: ${ctaUrl}\n\n${hashtags.join(" ")}`.trim();

  // Cria post draft pro user revisar na Fila
  const { data: post, error: pErr } = await supabase
    .from("posts").insert({
      user_id: userId,
      workspace_id: workspaceId,
      platforms: ["instagram"],
      media_type: "carousel",
      status: "draft",
      post_type: "noticia",
      caption: finalCaption,
      hashtags,
      image_url: article.image_url,
      carousel_images: article.image_url ? [article.image_url] : [],
      overlay_metadata: {
        pipeline: "article-to-instagram",
        rss_item_id: article.id,
        source_name: article.source_name,
        source_url: article.link,
        article_url: article.link,
        article_image_url: article.image_url,
        cta_url: ctaUrl,
        slides,
        hook: slides[0]?.title || hookSuggestion,
      },
    }).select().single();

  if (pErr || !post) throw new Error(`Post insert: ${pErr?.message}`);

  await supabase.from("article_distributions").upsert({
    rss_item_id: article.id, workspace_id: workspaceId, format: "carousel",
    status: "ready", post_id: post.id, cta_url: ctaUrl,
    payload: { slides, caption: finalCaption, hashtags },
    error_message: null,
  }, { onConflict: "rss_item_id,format" });

  return { post_id: post.id, slides_count: slides.length, cta_url: ctaUrl };
}

// ───────────────────────── REELS ─────────────────────────

async function buildReels(
  supabase: any, supabaseUrl: string, serviceRoleKey: string,
  article: Article, workspaceId: string, userId: string,
) {
  await supabase.from("article_distributions").upsert({
    rss_item_id: article.id, workspace_id: workspaceId, format: "reels",
    status: "generating",
  }, { onConflict: "rss_item_id,format" });

  const ctaUrl = utm(article, "reels");
  const scheduledFor = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { data: post, error: pErr } = await supabase
    .from("posts").insert({
      user_id: userId, workspace_id: workspaceId,
      platforms: ["instagram"], media_type: "reels",
      status: "generating", post_type: "noticia",
      scheduled_for: scheduledFor,
      caption: article.title,
      hashtags: [],
      overlay_metadata: {
        render_status: "queued",
        pipeline: "article-to-instagram",
        source_name: article.source_name,
        source_url: article.link,
        rss_item_id: article.id,
        cta_url: ctaUrl,
      },
    }).select().single();

  if (pErr || !post) throw new Error(`Post insert reels: ${pErr?.message}`);

  // marca rss usado pra reel
  await supabase.from("rss_items")
    .update({ used_for_reel: true, used_in_post_id: post.id, is_used: true })
    .eq("id", article.id);

  // dispara brand-news-video em background
  const renderTask = (async () => {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/brand-news-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          postId: post.id, title: article.title,
          description: article.description || "",
          workspaceId, userId,
          articleUrl: article.link,
          primaryImageUrl: article.image_url,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        await supabase.from("posts").update({
          status: "draft", error_message: `Render falhou: ${err.substring(0, 200)}`,
        }).eq("id", post.id);
        await supabase.from("article_distributions").upsert({
          rss_item_id: article.id, workspace_id: workspaceId, format: "reels",
          status: "failed", post_id: post.id, error_message: err.substring(0, 200),
        }, { onConflict: "rss_item_id,format" });
      } else {
        await supabase.from("article_distributions").upsert({
          rss_item_id: article.id, workspace_id: workspaceId, format: "reels",
          status: "ready", post_id: post.id, cta_url: ctaUrl, error_message: null,
        }, { onConflict: "rss_item_id,format" });
      }
    } catch (e: any) {
      await supabase.from("posts").update({
        status: "draft", error_message: `Render exception: ${e.message}`,
      }).eq("id", post.id);
    }
  })();

  // @ts-ignore Deno EdgeRuntime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(renderTask);
  } else {
    renderTask.catch(() => {});
  }

  return { post_id: post.id, scheduled_for: scheduledFor, cta_url: ctaUrl };
}

// ───────────────────────── SNIPPETS ─────────────────────────

async function buildSnippets(
  supabase: any, lovableKey: string, article: Article, workspaceId: string,
) {
  await supabase.from("article_distributions").upsert({
    rss_item_id: article.id, workspace_id: workspaceId, format: "snippet",
    status: "generating",
  }, { onConflict: "rss_item_id,format" });

  const ctaUrl = utm(article, "snippet");

  const snippets = await callGeminiJSON(
    lovableKey,
    `Artigo: "${article.title}"
Resumo: ${article.description || ""}
Link: ${article.link}

Gere snippets sociais em PT-BR (ano 2026) pra divulgar este artigo.`,
    `Você é Horvat, social media tech do Neural Update.
Responda SOMENTE JSON neste schema:
{
  "tldr": "1 parágrafo de até 280 caracteres",
  "stories": ["3 frases pra story (≤80 chars cada)"],
  "tweets": ["3 tweets (≤220 chars cada)"],
  "hooks": ["5 hooks alternativos pra outros formatos"]
}
Sem 'AI' (use 'IA'). Sem promo/desconto/clichê.`,
  );

  await supabase.from("article_distributions").upsert({
    rss_item_id: article.id, workspace_id: workspaceId, format: "snippet",
    status: "ready", cta_url: ctaUrl, payload: snippets, error_message: null,
  }, { onConflict: "rss_item_id,format" });

  return { cta_url: ctaUrl, snippets };
}
