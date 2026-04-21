// supabase/functions/auto-publish-article/index.ts
// Cron-triggered: publishes ONE tech article to the Neural Update blog.
// Completely isolated from the Instagram/TikTok agent (ai-agent-core).
// Schedule: 09h, 13h, 19h Brasília (= 12, 16, 22 UTC).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = new Date().toISOString();
  console.log(`[auto-publish-article] 🚀 Started at ${startedAt}`);

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Find the workspace that owns the blog (single-tenant for now → first workspace)
    const { data: workspaces, error: wsErr } = await supabase
      .from("workspaces")
      .select("id, name")
      .order("created_at", { ascending: true })
      .limit(1);

    if (wsErr || !workspaces || workspaces.length === 0) {
      throw new Error(`No workspace found: ${wsErr?.message ?? "empty"}`);
    }

    const workspaceId = workspaces[0].id;
    console.log(`[auto-publish-article] Using workspace: ${workspaces[0].name} (${workspaceId})`);

    // Safety guard: don't publish if we already have 3+ articles today (Brasília TZ)
    const todayStart = new Date();
    todayStart.setUTCHours(3, 0, 0, 0); // 00:00 BR = 03:00 UTC
    if (todayStart > new Date()) todayStart.setUTCDate(todayStart.getUTCDate() - 1);

    const { count: todayCount } = await supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", todayStart.toISOString());

    if ((todayCount ?? 0) >= 3) {
      console.log(`[auto-publish-article] ⏸ Daily cap reached (${todayCount}/3) — skipping`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "daily_cap_reached", todayCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invoke generate-article (it picks the best fresh tech RSS item)
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-article`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ workspaceId }),
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(`generate-article failed: ${body.error ?? res.status}`);
    }

    console.log(`[auto-publish-article] ✅ Published: ${body.title} → /noticia/${body.slug}`);

    return new Response(
      JSON.stringify({
        success: true,
        articleId: body.articleId,
        slug: body.slug,
        title: body.title,
        todayCount: (todayCount ?? 0) + 1,
        startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[auto-publish-article] ❌", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message ?? "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
