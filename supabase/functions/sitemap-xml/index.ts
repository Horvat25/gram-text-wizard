// Dynamic sitemap.xml generator for Neural Update portal
// Lists all published articles + static portal routes
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    // Site URL: ?site=https://example.com OR header X-Site-Url OR origin fallback
    const siteUrl = (url.searchParams.get("site") || req.headers.get("x-site-url") || "https://neural-update.com.br").replace(/\/$/, "");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: articles } = await supabase
      .from("articles")
      .select("slug, updated_at, published_at, category")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(5000);

    const staticPaths = [
      { loc: "/", priority: "1.0", changefreq: "hourly" },
      { loc: "/sobre", priority: "0.5", changefreq: "monthly" },
      { loc: "/categoria/ia", priority: "0.8", changefreq: "daily" },
      { loc: "/categoria/gadgets", priority: "0.8", changefreq: "daily" },
      { loc: "/categoria/futuro", priority: "0.8", changefreq: "daily" },
      { loc: "/categoria/mercado", priority: "0.8", changefreq: "daily" },
      { loc: "/categoria/ciencia", priority: "0.8", changefreq: "daily" },
      { loc: "/categoria/tecnologia", priority: "0.8", changefreq: "daily" },
    ];

    const today = new Date().toISOString().split("T")[0];
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    for (const p of staticPaths) {
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(siteUrl + p.loc)}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>${p.changefreq}</changefreq>\n`;
      xml += `    <priority>${p.priority}</priority>\n`;
      xml += `  </url>\n`;
    }

    for (const a of articles || []) {
      const lastmod = (a.updated_at || a.published_at || new Date().toISOString()).split("T")[0];
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${siteUrl}/noticia/${a.slug}`)}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[sitemap-xml] error", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
