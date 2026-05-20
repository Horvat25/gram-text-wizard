import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  extractEntities,
  containsForbidden,
  scoreImage,
  buildEntityQuery,
  type ImageCandidate,
} from "../_shared/image-relevance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * fetch-real-news-images
 *
 * Retorna imagens REAIS (sem IA) pra montar Reels jornalísticos:
 *   - Capa do artigo (og:image / RSS image_url)
 *   - B-roll do Pexels baseado em palavras-chave extraídas pelo Gemini
 *   - Imagens adicionais scrapadas do próprio artigo (fallback)
 *
 * Body:
 *   { title, description?, articleUrl?, primaryImageUrl?, count? = 4 }
 *
 * Response:
 *   { images: [{ url, source: 'article'|'pexels'|'scrape', credit?, query? }] }
 */

interface RealImage {
  url: string;
  source: "article" | "pexels" | "scrape";
  credit?: string;
  query?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const title: string = body.title || "";
    const description: string = body.description || "";
    const articleUrl: string | undefined = body.articleUrl;
    const primaryImageUrl: string | undefined = body.primaryImageUrl;
    const count: number = Math.max(2, Math.min(6, body.count || 4));

    if (!title) {
      return new Response(JSON.stringify({ error: "title é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[REAL-IMG] 🎯 "${title.substring(0, 60)}..." (count=${count})`);

    const images: RealImage[] = [];
    const seen = new Set<string>();
    const push = (img: RealImage) => {
      if (!img.url || seen.has(img.url)) return;
      seen.add(img.url);
      images.push(img);
    };

    // 1) Capa do artigo
    if (primaryImageUrl) {
      push({ url: primaryImageUrl, source: "article", credit: "Imagem original do artigo" });
      console.log(`[REAL-IMG] ✅ Capa: ${primaryImageUrl.substring(0, 60)}...`);
    } else if (articleUrl) {
      const og = await fetchOgImage(articleUrl);
      if (og) {
        push({ url: og, source: "article", credit: "og:image" });
        console.log(`[REAL-IMG] ✅ og:image: ${og.substring(0, 60)}...`);
      }
    }

    // 2) BUSCA INTELIGENTE: extrai entidades + busca em múltiplas queries + Pexels & Unsplash + ranqueia
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const pexelsKey = Deno.env.get("PEXELS_API_KEY");
    const unsplashKey = Deno.env.get("UNSPLASH_ACCESS_KEY");

    const entities = extractEntities(`${title} ${description}`);
    console.log(`[REAL-IMG] 🧠 Entidades: ${entities.join(", ") || "(nenhuma)"}`);

    const queries = await extractKeywords(title, description, lovableApiKey);
    const entityQuery = buildEntityQuery(entities, queries[0] || "technology");
    // Combina: query principal de entidade + queries Gemini + entidades soltas como queries extras
    const allQueries = Array.from(new Set([
      entityQuery,
      ...queries,
      ...entities.slice(0, 3).filter(e => e.length > 3),
    ])).slice(0, 5);
    console.log(`[REAL-IMG] 🔎 Queries: ${allQueries.join(" | ")}`);

    const candidates: ImageCandidate[] = [];

    // Pexels: 8 fotos por query
    if (pexelsKey) {
      for (const q of allQueries) {
        const photos = await searchPexelsMulti(q, pexelsKey, 8);
        for (const p of photos) candidates.push({ ...p, query: q });
      }
    } else {
      console.warn("[REAL-IMG] ⚠️ PEXELS_API_KEY não configurada");
    }

    // Unsplash: 6 fotos por query (descrições mais ricas → melhor score)
    if (unsplashKey) {
      for (const q of allQueries.slice(0, 3)) {
        const photos = await searchUnsplash(q, unsplashKey, 6);
        for (const p of photos) candidates.push({ ...p, query: q });
      }
    }

    console.log(`[REAL-IMG] 📦 ${candidates.length} candidatos brutos`);

    // Filtra forbidden + ranqueia
    const ranked = candidates
      .filter(c => !containsForbidden(c, entities))
      .map(c => ({ ...c, score: scoreImage(c, entities, entityQuery) }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    // Dedup por URL + pega top N
    const slotsLeft = Math.max(0, count - images.length);
    for (const c of ranked) {
      if (images.length >= count) break;
      if (seen.has(c.url)) continue;
      push({
        url: c.url,
        source: "pexels",
        credit: c.source || "Stock",
        query: c.query,
      });
      console.log(`[REAL-IMG]   ✅ score=${c.score} q="${c.query}" ${c.url.substring(0, 60)}...`);
    }

    // 3) Fallback: scrape do artigo
    if (images.length < count && articleUrl) {
      const scraped = await scrapeArticleImages(articleUrl, count - images.length);
      for (const url of scraped) push({ url, source: "scrape", credit: "Artigo" });
    }

    console.log(`[REAL-IMG] ✅ Total: ${images.length} imagens (top ranqueadas de ${candidates.length})`);

    return new Response(
      JSON.stringify({ success: true, images: images.slice(0, count), entities, queries: allQueries }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[REAL-IMG] ❌", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Gemini extrai 2-3 keywords concretas em INGLÊS pra Pexels ───
async function extractKeywords(
  title: string,
  description: string,
  lovableApiKey?: string
): Promise<string[]> {
  // fallback simples: pega substantivos em inglês via heurística
  const fallback = (): string[] => {
    const text = (title + " " + description).toLowerCase();
    const map: Record<string, string> = {
      nvidia: "nvidia chip", chip: "semiconductor chip", semicondutor: "semiconductor",
      openai: "openai office", chatgpt: "ai chatbot interface",
      google: "google office", apple: "apple products", microsoft: "microsoft office",
      whatsapp: "smartphone messaging", iphone: "iphone close up",
      android: "android phone", robô: "humanoid robot", robot: "humanoid robot",
      ia: "artificial intelligence concept", ai: "artificial intelligence concept",
      dados: "data center server", "data center": "data center server",
      tesla: "tesla car", spacex: "rocket launch",
      bitcoin: "bitcoin cryptocurrency", crypto: "cryptocurrency",
    };
    const hits: string[] = [];
    for (const [k, v] of Object.entries(map)) {
      if (text.includes(k) && !hits.includes(v)) hits.push(v);
      if (hits.length >= 3) break;
    }
    if (hits.length === 0) hits.push("technology workspace", "modern computer screen");
    return hits;
  };

  if (!lovableApiKey) return fallback();

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{
          role: "user",
          content: `Extraia 3 queries CONCRETAS em INGLÊS pra buscar fotos REAIS no Pexels sobre esta notícia. Sem termos abstratos. Foque em objetos, lugares, pessoas, marcas visíveis.

TÍTULO: ${title}
CONTEXTO: ${description.substring(0, 300)}

Responda em JSON: {"queries": ["query 1", "query 2", "query 3"]}
Cada query: 2-4 palavras. Ex: "nvidia chip", "data center server", "smartphone screen close up".`,
        }],
        response_format: { type: "json_object" },
        max_tokens: 150,
      }),
    });
    if (!resp.ok) return fallback();
    const data = await resp.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    const qs = (parsed.queries || []).filter((q: any) => typeof q === "string" && q.length > 2);
    return qs.length > 0 ? qs.slice(0, 3) : fallback();
  } catch {
    return fallback();
  }
}

// ─── Pexels: foto vertical 9:16 quando possível ───
async function searchPexels(query: string, apiKey: string): Promise<string | null> {
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5`;
    const resp = await fetch(url, { headers: { Authorization: apiKey } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const photos = data.photos || [];
    if (photos.length === 0) return null;
    // pega aleatória pra evitar repetição
    const pick = photos[Math.floor(Math.random() * Math.min(photos.length, 3))];
    return pick.src?.large2x || pick.src?.large || pick.src?.original || null;
  } catch (e) {
    console.warn("[REAL-IMG] Pexels error:", e);
    return null;
  }
}

// ─── og:image scraper ───
async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Lovablebot/1.0)" },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? absolutize(m[1], url) : null;
  } catch { return null; }
}

// ─── scraper genérico de <img> dentro do article ───
async function scrapeArticleImages(url: string, max: number): Promise<string[]> {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Lovablebot/1.0)" } });
    if (!resp.ok) return [];
    const html = await resp.text();
    const out: string[] = [];
    const re = /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
    let m;
    while ((m = re.exec(html)) && out.length < max) {
      const src = absolutize(m[1], url);
      if (src && !src.includes("logo") && !src.includes("avatar") && !src.includes("favicon")) {
        out.push(src);
      }
    }
    return out;
  } catch { return []; }
}

function absolutize(src: string, base: string): string {
  try {
    if (src.startsWith("//")) return "https:" + src;
    if (src.startsWith("http")) return src;
    return new URL(src, base).toString();
  } catch { return src; }
}
