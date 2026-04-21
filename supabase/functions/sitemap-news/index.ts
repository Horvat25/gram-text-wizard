// sitemap-news.xml — Google News sitemap (artigos das últimas 48h)
// Permite descoberta rápida pelo Google News e otimiza ranking de notícias.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const siteUrl = (
      url.searchParams.get("site") ||
      req.headers.get("x-site-url") ||
      "https://neural-update.com.br"
    ).replace(/\/$/, "");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Google News quer artigos das últimas 48h, máximo 1000 URLs
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data: articles } = await supabase
      .from("articles")
      .select("slug, title, published_at, category, tags")
      .eq("status", "published")
      .gte("published_at", cutoff)
      .order("published_at", { ascending: false })
      .limit(1000);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
    xml += `        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n`;

    for (const a of articles || []) {
      const pub = a.published_at || new Date().toISOString();
      const keywords = (a.tags || []).join(", ");
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${siteUrl}/noticia/${a.slug}`)}</loc>\n`;
      xml += `    <news:news>\n`;
      xml += `      <news:publication>\n`;
      xml += `        <news:name>Neural Update</news:name>\n`;
      xml += `        <news:language>pt-BR</news:language>\n`;
      xml += `      </news:publication>\n`;
      xml += `      <news:publication_date>${pub}</news:publication_date>\n`;
      xml += `      <news:title>${escapeXml(a.title)}</news:title>\n`;
      if (keywords) xml += `      <news:keywords>${escapeXml(keywords)}</news:keywords>\n`;
      xml += `    </news:news>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=900", // 15 min — notícias são frescas
      },
    });
  } catch (e) {
    console.error("[sitemap-news] error", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
