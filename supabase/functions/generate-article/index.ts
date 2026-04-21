// supabase/functions/generate-article/index.ts
// Neural Update — Editorial article generator (Agente Horvat)
// Pipeline:
//   1. Pick a fresh angle (RSS item OR autonomous Firecrawl search)
//   2. Research via Firecrawl (3-5 fresh sources, last 7 days)
//   3. Generate a long-form, well-structured article (H2/H3, lists, highlights)
//   4. Validate / generate hero image
//   5. Persist as published article — never references the original source

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

const VALID_CATEGORIES = ["ia", "gadgets", "futuro", "mercado", "ciencia", "tecnologia"];

// ───────────────────────────────────────────────────────────────────────────
// TECH-ONLY FILTER (Neural Update editorial focus)
// Block anything that isn't IA / tech / inovação / ciência tech.
// Rejects: deals, coupons, "10 ofertas de…", product lists, game reviews,
// movies/series, sports, lifestyle, finance unrelated to tech.
// ───────────────────────────────────────────────────────────────────────────
const BLOCKED_PATTERNS = [
  // promotional / commerce
  /\b(oferta|ofertas|cupom|cupons|desconto|descontos|promoç[ãa]o|black\s*friday)\b/i,
  /\b\d+\s*%\s*(off|de\s*desconto)\b/i,
  /\b(magalu|magazine\s*luiza|mercado\s*livre|amazon\.com|americanas|kabum|shopee|aliexpress)\b/i,
  /\bmelhor(es)?\s+(pre[çc]o|oferta)/i,
  /\bem\s+oferta\b/i,
  // generic "top X products" lists (afiliado disfarçado)
  /^\s*\d{1,2}\s+(melhores|ofertas|dicas|coisas|produtos|gadgets|smartphones|notebooks|monitores|teclados|mouses|fones|smartwatches|capinhas|ssds)\b/i,
  // games / entertainment
  /\b(diablo|fortnite|minecraft|fifa|call\s*of\s*duty|gta|xbox\s*game\s*pass|playstation\s*plus|nintendo\s*switch)\b/i,
  /\b(filme|filmes|s[ée]rie|s[ée]ries|netflix|prime\s*video|disney\+|globoplay|hbo)\b/i,
  /\breview\s+de\s+(jogo|game)\b/i,
  /\bzerar\s+(jogo|game)\b/i,
  // sports / lifestyle
  /\b(futebol|ronaldinho|neymar|copa\s+do\s+mundo|olimp[íi]ada)\b/i,
  /\b(receita|moda|beleza|fitness|emagrecer)\b/i,
];

function isTechRelevant(title: string, description?: string): { allowed: boolean; reason: string } {
  const text = `${title} ${description ?? ""}`.toLowerCase();
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: false, reason: `bloqueado por padrão: ${pattern.source.slice(0, 60)}` };
    }
  }
  // Must contain at least one tech signal
  const TECH_SIGNALS = /\b(ia|inteligência\s*artificial|machine\s*learning|chatgpt|gemini|claude|openai|anthropic|google|apple|meta|microsoft|nvidia|samsung|tesla|spacex|robô|robótica|quantum|qu[âa]ntic|chip|processador|semicondutor|algoritmo|software|aplicativo|app|tecnologia|inovação|startup\s+(de|tech)|computação|nuvem|cloud|cibersegurança|blockchain|criptomoeda|metaverso|realidade\s+(virtual|aumentada)|biotec|neurotec|wearable|iot|5g|6g|satélite|foguete|missão\s+espacial|nasa|ciência|pesquisa|descoberta|estudo|cientistas|pesquisadores)\b/i;
  if (!TECH_SIGNALS.test(text)) {
    return { allowed: false, reason: "sem sinal claro de IA/tecnologia/ciência" };
  }
  return { allowed: true, reason: "ok" };
}

// Topic seeds for autonomous research when no RSS item is provided (TECH-ONLY)
const AUTONOMOUS_TOPICS = [
  { q: "avanço inteligência artificial generativa 2026", category: "ia" },
  { q: "novo modelo de IA OpenAI Anthropic Google", category: "ia" },
  { q: "lançamento chip processador NVIDIA Apple", category: "gadgets" },
  { q: "robótica humanoide avanço pesquisa", category: "futuro" },
  { q: "computação quântica breakthrough", category: "ciencia" },
  { q: "missão espacial SpaceX NASA", category: "ciencia" },
  { q: "startup tecnologia inovação Brasil", category: "futuro" },
  { q: "cibersegurança ataque vulnerabilidade", category: "tecnologia" },
];

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

function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return false;
  if (lower.includes("vimeo.com")) return false;
  if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov")) return false;
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return false;
  if (/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(lower)) return true;
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return !lower.includes("/embed/") && !lower.includes("/watch");
  }
  return false;
}

// Translate PT-BR title to English keywords for stock photo search
function buildImageQuery(title: string, category: string): string {
  const categoryMap: Record<string, string> = {
    ia: "artificial intelligence technology",
    gadgets: "gadgets electronics device",
    futuro: "futuristic technology innovation",
    mercado: "tech business startup",
    ciencia: "science research laboratory",
    tecnologia: "technology computer",
  };
  // Extract key nouns from title (simple heuristic)
  const stop = new Set(["a","o","e","de","da","do","para","com","em","que","os","as","um","uma","no","na","por","sua","seu","como","ao","mais","novo","nova"]);
  const keywords = title
    .toLowerCase()
    .replace(/[^a-záéíóúâêôãõç\s]/gi, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !stop.has(w))
    .slice(0, 3)
    .join(" ");
  return keywords || categoryMap[category] || "technology";
}

// Try Unsplash (free, high quality)
async function fetchUnsplashImage(query: string): Promise<string | null> {
  const key = Deno.env.get("UNSPLASH_ACCESS_KEY");
  if (!key) return null;
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape&content_filter=high`;
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } });
    if (!res.ok) {
      console.warn("[generate-article] Unsplash failed:", res.status);
      return null;
    }
    const data = await res.json();
    const results = data?.results || [];
    if (results.length === 0) return null;
    // Pick first relevant result
    const photo = results[0];
    return photo?.urls?.regular || photo?.urls?.full || null;
  } catch (e) {
    console.warn("[generate-article] Unsplash error:", e);
    return null;
  }
}

// Try Pexels (free, fallback)
async function fetchPexelsImage(query: string): Promise<string | null> {
  const key = Deno.env.get("PEXELS_API_KEY");
  if (!key) return null;
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) {
      console.warn("[generate-article] Pexels failed:", res.status);
      return null;
    }
    const data = await res.json();
    const photos = data?.photos || [];
    if (photos.length === 0) return null;
    return photos[0]?.src?.large2x || photos[0]?.src?.large || photos[0]?.src?.original || null;
  } catch (e) {
    console.warn("[generate-article] Pexels error:", e);
    return null;
  }
}

// Strategy: Stock photos FIRST (free), AI as last resort (saves cost)
async function generateHeroImage(
  title: string,
  category: string
): Promise<string | null> {
  const query = buildImageQuery(title, category);
  console.log(`[generate-article] 🔍 Searching free stock photo for: "${query}"`);

  // 1. Unsplash (preferred - editorial quality)
  const unsplash = await fetchUnsplashImage(query);
  if (unsplash) {
    console.log("[generate-article] ✅ Unsplash image found (FREE, $0.00)");
    return unsplash;
  }

  // 2. Pexels (fallback - also free)
  const pexels = await fetchPexelsImage(query);
  if (pexels) {
    console.log("[generate-article] ✅ Pexels image found (FREE, $0.00)");
    return pexels;
  }

  // 3. Try broader category fallback before going to AI
  const broadQuery = buildImageQuery("", category);
  if (broadQuery !== query) {
    const fallback = await fetchUnsplashImage(broadQuery) || await fetchPexelsImage(broadQuery);
    if (fallback) {
      console.log("[generate-article] ✅ Stock fallback (category) found (FREE)");
      return fallback;
    }
  }

  // 4. Last resort: AI generation (costs ~$0.02)
  console.log("[generate-article] ⚠️ No stock photo found, falling back to AI (paid)");
  try {
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
      body: JSON.stringify({ prompt, format: "landscape", applyWatermark: false }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.imageUrl ?? null;
  } catch (e) {
    console.warn("[generate-article] hero image error:", e);
    return null;
  }
}

interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  markdown?: string;
  publishedAt?: string;
}

/** Firecrawl research — fresh PT-BR results from the last 7 days. */
async function firecrawlResearch(query: string): Promise<ResearchSource[]> {
  if (!FIRECRAWL_API_KEY) {
    console.warn("[generate-article] FIRECRAWL_API_KEY missing — skipping research");
    return [];
  }
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 5,
        lang: "pt",
        country: "br",
        tbs: "qdr:w", // last week
        scrapeOptions: { formats: ["markdown"] },
      }),
    });
    if (!res.ok) {
      console.warn(`[generate-article] firecrawl ${res.status}`);
      return [];
    }
    const data = await res.json();
    const items = data?.data ?? data?.web ?? [];
    return (Array.isArray(items) ? items : [])
      .slice(0, 5)
      .map((it: any) => ({
        title: it.title ?? "",
        url: it.url ?? "",
        snippet: it.description ?? it.snippet ?? "",
        markdown: typeof it.markdown === "string" ? it.markdown.slice(0, 4000) : undefined,
        publishedAt: it.publishedAt ?? it.date,
      }))
      .filter((s: ResearchSource) => s.title && s.url);
  } catch (e) {
    console.warn("[generate-article] firecrawl error:", e);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { workspaceId, rssItemId, topic } = await req.json().catch(() => ({}));

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "workspaceId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== 1. Decide angle ======
    let angle: { seedTitle: string; seedDescription: string; category: string; sourceRssId: string | null } = {
      seedTitle: "",
      seedDescription: "",
      category: "tecnologia",
      sourceRssId: null,
    };

    if (rssItemId) {
      const { data } = await supabase.from("rss_items").select("*").eq("id", rssItemId).maybeSingle();
      if (data) {
        const check = isTechRelevant(data.title, data.description ?? "");
        if (!check.allowed) {
          return new Response(
            JSON.stringify({ success: false, skipped: true, reason: check.reason, title: data.title }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        angle = {
          seedTitle: data.title,
          seedDescription: data.description ?? "",
          category: "tecnologia",
          sourceRssId: data.id,
        };
      }
    } else if (topic && typeof topic === "string") {
      angle.seedTitle = topic;
    } else {
      // Try fresh RSS first — scan up to 100 to skip the promotional noise
      const { data: candidates } = await supabase
        .from("rss_items")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("is_used", false)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(100);

      if (candidates && candidates.length > 0) {
        const ids = candidates.map((c) => c.id);
        const { data: used } = await supabase
          .from("articles")
          .select("source_rss_item_id")
          .in("source_rss_item_id", ids);
        const usedSet = new Set((used ?? []).map((u: any) => u.source_rss_item_id));

        // Find first RSS item that passes tech filter AND wasn't used
        let skippedCount = 0;
        for (const c of candidates) {
          if (usedSet.has(c.id)) continue;
          const check = isTechRelevant(c.title, c.description ?? "");
          if (!check.allowed) {
            skippedCount += 1;
            continue;
          }
          angle = {
            seedTitle: c.title,
            seedDescription: c.description ?? "",
            category: "tecnologia",
            sourceRssId: c.id,
          };
          break;
        }
        console.log(`[generate-article] Skipped ${skippedCount} non-tech RSS items`);
      }

      // Autonomous fallback — Horvat picks a TECH topic himself
      if (!angle.seedTitle) {
        const seed = AUTONOMOUS_TOPICS[Math.floor(Math.random() * AUTONOMOUS_TOPICS.length)];
        angle.seedTitle = seed.q;
        angle.category = seed.category;
        console.log(`[generate-article] Using autonomous tech topic: "${seed.q}"`);
      }
    }

    console.log(`[generate-article] Angle: "${angle.seedTitle}"`);

    // ====== 2. Autonomous research ======
    const researchQuery = angle.seedTitle.length > 100
      ? angle.seedTitle.slice(0, 100)
      : angle.seedTitle;
    const sources = await firecrawlResearch(researchQuery);
    console.log(`[generate-article] Research: ${sources.length} sources`);

    const researchBriefing = sources.length > 0
      ? sources.map((s, i) => {
          const head = `### Fonte ${i + 1}: ${s.title}${s.publishedAt ? ` (${s.publishedAt})` : ""}`;
          const body = s.markdown ? s.markdown.slice(0, 2500) : s.snippet;
          return `${head}\n${body}`;
        }).join("\n\n---\n\n")
      : `(Sem fontes externas — escreva com base em conhecimento público amplamente difundido sobre o tema.)`;

    const todayBR = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo",
    });

    // ====== 3. Generate article ======
    const aiPrompt = `Você é o **Agente Horvat**, jornalista sênior de tecnologia do portal Neural Update. Hoje é ${todayBR}. Escreva uma matéria editorial COMPLETA, ORIGINAL e BEM ESTRUTURADA em PT-BR.

# TEMA / ÂNGULO INICIAL
${angle.seedTitle}
${angle.seedDescription ? `Contexto adicional: ${angle.seedDescription}` : ""}

# BRIEFING DE PESQUISA (use como base factual)
${researchBriefing}

# REGRAS RÍGIDAS
- Português brasileiro impecável. Tom editorial sério, analítico, jornalístico — não promocional.
- Estamos em **2026**. Use datas e referências temporais coerentes (ex.: "nesta semana", "${todayBR}", "no início de 2026").
- **NUNCA** mencione "fonte original", "segundo o site X", "de acordo com Tecnoblog/G1/etc.". A matéria é ORIGINAL do Neural Update assinada por Horvat.
- **NUNCA** use links externos no corpo. Sem CTA, sem "siga-nos", sem "leia mais".
- Não invente números, valores, datas, nomes de pessoas ou citações que não estejam no briefing.
- Sem clichês ("no mundo digital atual", "cenário cada vez mais", "explosão de IA", "revolução tecnológica").
- Use a categoria MAIS específica entre: ia, gadgets, futuro, mercado, ciencia, tecnologia.

# ESTRUTURA OBRIGATÓRIA DO CORPO (Markdown rigoroso)
Total: 700-1000 palavras. NÃO escreva como bloco único. SEMPRE siga:

1. **Lide forte** (1 parágrafo curto de abertura, 2-3 frases, prende o leitor).

2. **OBRIGATÓRIO: 3 a 5 seções** com cabeçalho **## Título da Seção** (Markdown H2 com dois "#" e espaço).
   ⚠️ NUNCA escreva o título de seção como texto solto numa linha. SEMPRE prefixe com "## " — exemplo correto: "## Impacto no Consumidor". Exemplo ERRADO: "Impacto no Consumidor" (sem o ##).
   Use nomes curtos e específicos — NÃO use "Introdução", "Conclusão", "Desenvolvimento".

3. Em cada seção: 1-2 parágrafos curtos (máx. 4 frases cada). Sempre uma linha em branco entre parágrafos.

4. Pelo menos **1 lista com bullets** em alguma seção. Cada item começa com "- " (hífen e espaço) numa linha própria.

5. Pelo menos **1 frase em destaque** usando blockquote: linha começando com "> " contendo uma análise impactante de Horvat.

6. **Negrito** com \`**texto**\` para 3-5 termos-chave ao longo do artigo.

7. Última seção OBRIGATORIAMENTE com cabeçalho "## O que esperar" ou "## Próximos passos" (com ## no começo).

# RETORNE EXCLUSIVAMENTE JSON VÁLIDO neste formato (sem texto antes/depois):
{
  "title": "Título editorial impactante e específico (max 80 chars, sem clickbait barato)",
  "subtitle": "Linha de apoio que aprofunda o título (max 140 chars)",
  "excerpt": "Resumo de 1-2 frases para preview do card (max 180 chars)",
  "category": "ia|gadgets|futuro|mercado|ciencia|tecnologia",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "body": "Corpo completo em Markdown seguindo a ESTRUTURA OBRIGATÓRIA — TODA seção começa com '## '",
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
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("AI returned invalid JSON");
      parsed = JSON.parse(match[0]);
    }

    const title = String(parsed.title ?? angle.seedTitle).trim().slice(0, 200);
    const subtitle = parsed.subtitle ? String(parsed.subtitle).trim().slice(0, 200) : null;
    const excerpt = parsed.excerpt ? String(parsed.excerpt).trim().slice(0, 280) : null;
    let body = String(parsed.body ?? "").trim();
    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : (angle.category || "tecnologia");
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((t: any) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 8)
      : [];
    const seoTitle = parsed.seo_title ? String(parsed.seo_title).slice(0, 70) : title.slice(0, 60);
    const seoDesc = parsed.seo_description ? String(parsed.seo_description).slice(0, 160) : excerpt;

    if (!body || body.length < 400) {
      throw new Error("AI returned a body too short");
    }

    // Safety scrub: strip any accidental "fonte original" references
    body = body
      .replace(/^.*\b(fonte original|segundo (o |a )?(tecnoblog|g1|olhar digital|canaltech|the verge|wired|reuters|bloomberg|exame))\b.*$/gim, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // ====== 4. Slug ======
    let baseSlug = slugify(title);
    if (!baseSlug) baseSlug = `noticia-${Date.now()}`;
    let finalSlug = baseSlug;
    let attempt = 0;
    while (attempt < 5) {
      const { data: existing } = await supabase
        .from("articles").select("id").eq("slug", finalSlug).maybeSingle();
      if (!existing) break;
      attempt += 1;
      finalSlug = `${baseSlug}-${attempt + 1}`;
    }

    // ====== 5. Hero image ======
    const heroImage = await generateHeroImage(title, category);

    // ====== 6. Insert ======
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
        hero_image_url: heroImage,
        og_image_url: heroImage,
        seo_title: seoTitle,
        seo_description: seoDesc,
        author_name: "Agente Horvat",
        status: "published",
        published_at: new Date().toISOString(),
        reading_time_minutes: estimateReadingTime(body),
        source_rss_item_id: angle.sourceRssId,
        // Source URL/name intentionally omitted — article is original Neural Update content
        source_url: null,
        source_name: null,
        ai_model_used: "google/gemini-2.5-flash",
        cost_estimate: 0.004,
      })
      .select("id, slug, title")
      .single();

    if (insertErr) throw insertErr;

    if (angle.sourceRssId) {
      await supabase.from("rss_items").update({ is_used: true }).eq("id", angle.sourceRssId);
    }

    console.log(`[generate-article] Created article ${inserted.slug}`);

    return new Response(
      JSON.stringify({
        success: true,
        articleId: inserted.id,
        slug: inserted.slug,
        title: inserted.title,
        url: `/noticia/${inserted.slug}`,
        researchSourcesUsed: sources.length,
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
