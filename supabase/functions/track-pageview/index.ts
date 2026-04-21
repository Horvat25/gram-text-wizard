// Lightweight pageview tracker for the Neural Update public portal
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function detectDevice(ua: string): string {
  if (!ua) return "unknown";
  const u = ua.toLowerCase();
  if (/mobile|android|iphone|ipod/.test(u)) return "mobile";
  if (/tablet|ipad/.test(u)) return "tablet";
  return "desktop";
}

function extractSearchQuery(referrer: string): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    const host = u.hostname.toLowerCase();
    // Google, Bing, DuckDuckGo, Yahoo all use 'q'
    if (/google|bing|duckduckgo|yahoo|ecosia|brave/.test(host)) {
      return u.searchParams.get("q");
    }
  } catch {}
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { workspace_id, page_path, page_type, article_slug, referrer, session_id } = body || {};

    if (!page_path || typeof page_path !== "string") {
      return new Response(JSON.stringify({ error: "page_path required" }), { status: 400, headers: corsHeaders });
    }

    const userAgent = req.headers.get("user-agent") || "";
    const country = req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || null;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    await supabase.from("page_views").insert({
      workspace_id: workspace_id || null,
      page_path: page_path.slice(0, 500),
      page_type: page_type || "page",
      article_slug: article_slug ? String(article_slug).slice(0, 200) : null,
      referrer: referrer ? String(referrer).slice(0, 500) : null,
      user_agent: userAgent.slice(0, 500),
      country,
      device_type: detectDevice(userAgent),
      search_query: extractSearchQuery(referrer || ""),
      session_id: session_id ? String(session_id).slice(0, 100) : null,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[track-pageview] error", e);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, // Never break the site for analytics failures
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
