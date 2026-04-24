// Public RSS 2.0 feed for Neural Update — readers can follow via Feedly, Inoreader, etc.
// Boosts recurrent traffic + helps Google discover new articles faster.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(s: string): string {
  return `<![CDATA[${(s || "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
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

    const { data: articles } = await supabase
      .from("articles")
      .select(
        "slug,title,excerpt,hero_image_url,category,published_at,updated_at,author_name,tags"
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(50);

    const lastBuild = new Date().toUTCString();
    const items = (articles || []).map((a) => {
      const link = `${siteUrl}/noticia/${a.slug}`;
      const pubDate = new Date(a.published_at || Date.now()).toUTCString();
      const desc = a.excerpt || a.title;
      const enclosure = a.hero_image_url
        ? `      <enclosure url="${esc(a.hero_image_url)}" type="image/jpeg" />\n`
        : "";
      const cats = (a.tags || []).map((t: string) => `      <category>${esc(t)}</category>`).join("\n");
      return `    <item>
      <title>${cdata(a.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <dc:creator>${cdata(a.author_name || "Neural Update")}</dc:creator>
      <description>${cdata(desc)}</description>
${enclosure}      <category>${esc(a.category)}</category>
${cats}
    </item>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Neural Update — Tecnologia, IA e Futuro</title>
    <link>${esc(siteUrl)}</link>
    <atom:link href="${esc(siteUrl)}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Notícias de tecnologia, inteligência artificial, gadgets, ciência e futuro — atualizadas em tempo real pelo Agente Horvat.</description>
    <language>pt-BR</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <generator>Neural Update Engine</generator>
    <image>
      <url>${esc(siteUrl)}/og-neural-update.jpg</url>
      <title>Neural Update</title>
      <link>${esc(siteUrl)}</link>
    </image>
${items.join("\n")}
  </channel>
</rss>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=900",
      },
    });
  } catch (e) {
    console.error("[rss-feed] error", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
