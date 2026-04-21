// supabase/functions/generate-article/index.ts
// Generates a full long-form article for the Neural Update portal from a fresh RSS item.
// One AI call produces title + subtitle + excerpt + body + tags + SEO metadata.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_CATEGORIES = ["ia", "gadgets", "futuro", "mercado", "ciencia", "tecnologia"];

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function estimateReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

// Validates that URL is actually an image (not YouTube embed, video, html, etc)
function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase();
  // Reject obvious non-images
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return false;
  if (lower.includes("vimeo.com")) return false;
  if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov")) return false;
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return false;
  // Accept if it looks like an image
  if (/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(lower)) return true;
  // Accept generic CDN/storage URLs that don't have an extension but aren't blacklisted
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    // Heuristic: probably ok if it doesn't look like a page
    return !lower.includes("/embed/") && !lower.includes("/watch");
  }
  return false;
}

// Generates a hero image for the article using Gemini Image
async function generateHeroImage(
  supabase: any,
  workspaceId: string,
  title: string,
  category: string
): Promise<string | null> {
  try {
    console.log(`[generate-article] Generating hero image for: ${title}`);
    const prompt = `Imagem editorial fotorrealista para matéria de tecnologia sobre: "${title}". 
Categoria: ${category}. 
Estilo: cinematográfico, iluminação dramática, paleta dark com acentos neon ciano e roxo, composição editorial premium estilo The Verge / Wired.
Formato 16:9, ultra alta definição.
⛔ ABSOLUTAMENTE SEM TEXTO, LETRAS, NÚMEROS OU LOGOTIPOS NA IMAGEM.`;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        prompt,
        format: "landscape",
        applyWatermark: false,
      }),
    });

    if (!res.ok) {
      console.warn(`[generate-article] image generation failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data?.imageUrl ?? null;
  } catch (e) {
    console.warn("[generate-article] hero image error:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { workspaceId, rssItemId } = await req.json().catch(() => ({}));

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "workspaceId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Pick an RSS item
    let rssItem: any = null;
    if (rssItemId) {
      const { data } = await supabase.from("rss_items").select("*").eq("id", rssItemId).maybeSingle();
      rssItem = data;
    } else {
      // Find a recent RSS item not yet turned into an article
      const { data: candidates } = await supabase
        .from("rss_items")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(30);

      if (!candidates || candidates.length === 0) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "Nenhum item RSS disponível. Atualize as fontes." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Skip ones already used as article source
      const ids = candidates.map((c) => c.id);
      const { data: used } = await supabase
        .from("articles")
        .select("source_rss_item_id")
        .in("source_rss_item_id", ids);
      const usedSet = new Set((used ?? []).map((u: any) => u.source_rss_item_id));

      rssItem = candidates.find((c) => !usedSet.has(c.id));
      if (!rssItem) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "Todos os itens RSS recentes já viraram artigo." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`[generate-article] Generating for RSS item: ${rssItem.title}`);

    // 2. Single AI call — produce the entire article + metadata as JSON
    const aiPrompt = `Você é o Agente Horvat, jornalista sênior de tecnologia do portal "Neural Update". Escreva uma matéria editorial COMPLETA em PT-BR (Brasil) baseada na notícia abaixo.

NOTÍCIA-FONTE:
Título: ${rssItem.title}
Resumo: ${rssItem.description ?? "(sem resumo)"}
Fonte: ${rssItem.source_name}
Link: ${rssItem.link}

REGRAS RÍGIDAS:
- Português brasileiro impecável, sem erros, tom editorial sério (não use "no ano de 2024/2025" — estamos em 2026).
- Não invente fatos, dados ou citações. Use apenas o que está na notícia-fonte e contexto público amplamente conhecido.
- Não escreva "segundo a fonte" ou "de acordo com o site X" — escreva como matéria própria do Neural Update.
- Não use clichês de IA (jamais "no mundo digital atual", "em um cenário cada vez mais", "explosão de IA").
- Categorias permitidas: "ia", "gadgets", "futuro", "mercado", "ciencia", "tecnologia". Escolha A MAIS ESPECÍFICA.
- Corpo: 600-900 palavras. Markdown leve permitido (## subtítulo, **negrito**, listas com -).
- Estrutura: lide forte, contexto, desenvolvimento em 2-3 blocos com subtítulos, fechamento com perspectiva.
- NUNCA promocional. Sem CTA, sem "siga-nos", sem links externos no corpo.

Retorne EXCLUSIVAMENTE um JSON válido (sem texto antes ou depois) neste formato:
{
  "title": "Título editorial impactante (max 80 chars)",
  "subtitle": "Linha de apoio que complementa o título (max 140 chars)",
  "excerpt": "Resumo executivo de 1-2 frases para preview (max 180 chars)",
  "category": "ia|gadgets|futuro|mercado|ciencia|tecnologia",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "body": "Corpo completo em Markdown (600-900 palavras, com ## subtítulos)",
  "seo_title": "Título otimizado para Google (max 60 chars)",
  "seo_description": "Meta description (max 155 chars)"
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: aiPrompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`AI gateway error ${aiRes.status}: ${txt}`);
    }

    const aiJson = await aiRes.json();
    const rawContent: string = aiJson?.choices?.[0]?.message?.content ?? "";
    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      // Try to extract JSON from string
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("AI returned invalid JSON");
      parsed = JSON.parse(match[0]);
    }

    const title = String(parsed.title ?? rssItem.title).trim().slice(0, 200);
    const subtitle = parsed.subtitle ? String(parsed.subtitle).trim().slice(0, 200) : null;
    const excerpt = parsed.excerpt ? String(parsed.excerpt).trim().slice(0, 280) : null;
    const body = String(parsed.body ?? "").trim();
    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "tecnologia";
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((t: any) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 8)
      : [];
    const seoTitle = parsed.seo_title ? String(parsed.seo_title).slice(0, 70) : title.slice(0, 60);
    const seoDesc = parsed.seo_description ? String(parsed.seo_description).slice(0, 160) : excerpt;

    if (!body || body.length < 200) {
      throw new Error("AI returned a body too short");
    }

    // 3. Build a unique slug
    let baseSlug = slugify(title);
    if (!baseSlug) baseSlug = `noticia-${Date.now()}`;
    let finalSlug = baseSlug;
    let attempt = 0;
    while (attempt < 5) {
      const { data: existing } = await supabase
        .from("articles")
        .select("id")
        .eq("slug", finalSlug)
        .maybeSingle();
      if (!existing) break;
      attempt += 1;
      finalSlug = `${baseSlug}-${attempt + 1}`;
    }

    // 4. Insert
    const { data: inserted, error: insertErr } = await supabase
      .from("articles")
      .insert({
        workspace_id: workspaceId,
        slug: finalSlug,
        title,
        subtitle,
        excerpt,
        content: body,
        category,
        tags,
        hero_image_url: rssItem.image_url ?? null,
        og_image_url: rssItem.image_url ?? null,
        seo_title: seoTitle,
        seo_description: seoDesc,
        author_name: "Agente Horvat",
        status: "published",
        published_at: new Date().toISOString(),
        reading_time_minutes: estimateReadingTime(body),
        source_rss_item_id: rssItem.id,
        source_url: rssItem.link,
        source_name: rssItem.source_name,
        ai_model_used: "google/gemini-2.5-flash",
        cost_estimate: 0.002,
      })
      .select("id, slug, title")
      .single();

    if (insertErr) throw insertErr;

    // 5. Mark RSS item as used
    await supabase
      .from("rss_items")
      .update({ is_used: true })
      .eq("id", rssItem.id);

    console.log(`[generate-article] Created article ${inserted.slug}`);

    return new Response(
      JSON.stringify({
        success: true,
        articleId: inserted.id,
        slug: inserted.slug,
        title: inserted.title,
        url: `/noticia/${inserted.slug}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[generate-article] error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
