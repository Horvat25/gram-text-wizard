import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ResearchResult = {
  content: string;
  source: "firecrawl" | "direct_fetch" | "none";
};

const normalizeUrl = (rawUrl?: string | null) => {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
};

const htmlToText = (html: string) => {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ")?.trim() ?? "";
  const metaDescription = html
    .match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1]
    ?.trim() ?? "";

  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);

  const parts = [
    title ? `Título: ${title}` : "",
    metaDescription ? `Descrição do site: ${metaDescription}` : "",
    plain ? `Conteúdo extraído: ${plain}` : "",
  ].filter(Boolean);

  return parts.join("\n\n");
};

const fallbackDirectFetch = async (url: string): Promise<ResearchResult> => {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MarketingResearchBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) return { content: "", source: "none" };

    const html = await response.text();
    const extracted = htmlToText(html);

    return {
      content: extracted.slice(0, 5000),
      source: extracted ? "direct_fetch" : "none",
    };
  } catch (error) {
    console.error("fallbackDirectFetch error:", error);
    return { content: "", source: "none" };
  }
};

const scrapeAffiliateSite = async (affiliateUrl: string, firecrawlApiKey?: string | null): Promise<ResearchResult> => {
  if (firecrawlApiKey) {
    try {
      const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: affiliateUrl,
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: 5000,
        }),
      });

      if (scrapeRes.ok) {
        const scrapeData = await scrapeRes.json();
        const markdown = (scrapeData?.data?.markdown || scrapeData?.markdown || "").trim();
        if (markdown.length > 120) {
          return { content: markdown.slice(0, 5000), source: "firecrawl" };
        }
      } else {
        const errorBody = await scrapeRes.text();
        console.log(`Firecrawl scrape failed [${scrapeRes.status}]:`, errorBody);
      }
    } catch (error) {
      console.error("scrapeAffiliateSite firecrawl error:", error);
    }
  }

  return fallbackDirectFetch(affiliateUrl);
};

const searchProductWeb = async (productName: string, firecrawlApiKey?: string | null): Promise<ResearchResult> => {
  if (!firecrawlApiKey) return { content: "", source: "none" };

  try {
    const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `${productName} o que é benefícios review`,
        limit: 3,
        lang: "pt",
        country: "BR",
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    if (!searchRes.ok) {
      const errorBody = await searchRes.text();
      console.log(`Firecrawl search failed [${searchRes.status}]:`, errorBody);
      return { content: "", source: "none" };
    }

    const searchData = await searchRes.json();
    const results = searchData?.data || [];
    const content = results
      .map((r: any) => {
        const title = r?.title || "";
        const desc = r?.description || "";
        const md = (r?.markdown || "").slice(0, 900);
        return [title ? `Título: ${title}` : "", desc ? `Resumo: ${desc}` : "", md].filter(Boolean).join("\n");
      })
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000);

    return { content, source: content ? "firecrawl" : "none" };
  } catch (error) {
    console.error("searchProductWeb error:", error);
    return { content: "", source: "none" };
  }
};

const buildAnalysisContext = (siteContent: string, webContent: string) => {
  const parts: string[] = [];

  if (siteContent) parts.push(`=== ANÁLISE DO SITE/LP DO PRODUTO ===\n${siteContent}`);
  if (webContent) parts.push(`=== PESQUISA WEB SOBRE O PRODUTO ===\n${webContent}`);

  return parts.join("\n\n").slice(0, 9000);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action = "generate", productName: rawProductName, affiliateUrl: rawAffiliateUrl, analysisContext: rawAnalysisContext } = await req.json();

    const productName = (rawProductName || "").toString().trim();
    const affiliateUrl = normalizeUrl(rawAffiliateUrl);
    const analysisContext = (rawAnalysisContext || "").toString().trim();

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "analyze") {
      if (!affiliateUrl && !productName) {
        return new Response(JSON.stringify({ error: "Informe um link de afiliado ou nome do produto para análise." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const siteResult = affiliateUrl
        ? await scrapeAffiliateSite(affiliateUrl, FIRECRAWL_API_KEY)
        : { content: "", source: "none" as const };

      const webResult = productName
        ? await searchProductWeb(productName, FIRECRAWL_API_KEY)
        : { content: "", source: "none" as const };

      const compiledAnalysis = buildAnalysisContext(siteResult.content, webResult.content);

      if (!compiledAnalysis) {
        return new Response(JSON.stringify({
          error: "Não consegui extrair conteúdo suficiente do site informado. Verifique o link e tente novamente.",
          sources: {
            site: false,
            web: false,
            site_source: siteResult.source,
            web_source: webResult.source,
          },
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        analysisContext: compiledAnalysis,
        analysisPreview: compiledAnalysis.slice(0, 260),
        sources: {
          site: Boolean(siteResult.content),
          web: Boolean(webResult.content),
          site_source: siteResult.source,
          web_source: webResult.source,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!productName) {
      return new Response(JSON.stringify({ error: "productName é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let finalAnalysisContext = analysisContext;
    let siteUsed = false;
    let webUsed = false;

    if (!finalAnalysisContext) {
      const siteResult = affiliateUrl
        ? await scrapeAffiliateSite(affiliateUrl, FIRECRAWL_API_KEY)
        : { content: "", source: "none" as const };
      const webResult = await searchProductWeb(productName, FIRECRAWL_API_KEY);

      finalAnalysisContext = buildAnalysisContext(siteResult.content, webResult.content);
      siteUsed = Boolean(siteResult.content);
      webUsed = Boolean(webResult.content);
    }

    const prompt = `Você é um estrategista de marketing de afiliados. Gere uma descrição curta (2-3 frases), clara e persuasiva para o produto "${productName}".

Use SOMENTE as informações do contexto abaixo.

Contexto pesquisado:\n${finalAnalysisContext || "Sem contexto detalhado"}

Regras:
- Não usar hashtags
- Não usar emojis
- Não inventar dados
- Escrever em português do Brasil
- Focar em: o que é, benefício principal e para quem é indicado`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas solicitações agora, tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes. Adicione créditos para continuar." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const errorText = await aiRes.text();
      console.error("AI generation failed:", aiRes.status, errorText);
      return new Response(JSON.stringify({ error: "Falha ao gerar descrição com IA." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const description = aiData?.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({
      description,
      sources: {
        site: siteUsed || Boolean(finalAnalysisContext.includes("ANÁLISE DO SITE")),
        web: webUsed || Boolean(finalAnalysisContext.includes("PESQUISA WEB")),
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-affiliate-description error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Erro interno",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
