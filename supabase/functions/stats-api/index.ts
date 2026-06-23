// Public stats API — protegida por x-api-key
// Retorna: account, totals, series (7d/30d/90d), posts, updatedAt
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const EXTRA_HEADERS = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...EXTRA_HEADERS, "Content-Type": "application/json" },
  });
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: EXTRA_HEADERS });
  }

  // Auth via x-api-key
  const apiKey = req.headers.get("x-api-key");
  const expected = Deno.env.get("STATS_API_KEY");
  if (!expected) {
    return json({ error: "STATS_API_KEY not configured" }, 500);
  }
  if (!apiKey || apiKey !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id"); // opcional: filtro de workspace
  const postsLimit = Math.min(
    parseInt(url.searchParams.get("posts_limit") ?? "50", 10) || 50,
    200,
  );

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ---------- ACCOUNT ----------
    let accountQuery = supabase
      .from("instagram_accounts")
      .select(
        "id, username, instagram_user_id, page_id, profile_picture_url, connected_at, updated_at, expires_at, workspace_id",
      )
      .order("connected_at", { ascending: false })
      .limit(1);
    if (workspaceId) accountQuery = accountQuery.eq("workspace_id", workspaceId);
    const { data: accountRow } = await accountQuery.maybeSingle();

    // ---------- POSTS ----------
    let postsQuery = supabase
      .from("posts")
      .select(
        "id, caption, hashtags, status, scheduled_for, published_at, instagram_post_id, image_url, video_url, carousel_images, post_type, media_type, likes_count, comments_count, saves_count, shares_count, reach, impressions, last_metrics_sync, created_at",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(postsLimit);
    if (workspaceId) postsQuery = postsQuery.eq("workspace_id", workspaceId);
    const { data: postsRows } = await postsQuery;
    const posts = postsRows ?? [];

    // ---------- TOTALS ----------
    const totals = posts.reduce(
      (acc, p: any) => {
        acc.likes += p.likes_count ?? 0;
        acc.comments += p.comments_count ?? 0;
        acc.saves += p.saves_count ?? 0;
        acc.shares += p.shares_count ?? 0;
        acc.reach += p.reach ?? 0;
        acc.impressions += p.impressions ?? 0;
        acc.posts += 1;
        return acc;
      },
      {
        posts: 0,
        likes: 0,
        comments: 0,
        saves: 0,
        shares: 0,
        reach: 0,
        impressions: 0,
      },
    );

    // ---------- SERIES (snapshots diários) ----------
    async function fetchSeries(days: number) {
      let q = supabase
        .from("agent_strategy_snapshots")
        .select(
          "snapshot_date, followers_count, total_reach, total_impressions, total_likes, total_comments, total_saves, total_shares, posts_count, avg_engagement",
        )
        .gte("snapshot_date", daysAgoISO(days).slice(0, 10))
        .order("snapshot_date", { ascending: true });
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data } = await q;
      return data ?? [];
    }

    const [s7, s30, s90] = await Promise.all([
      fetchSeries(7),
      fetchSeries(30),
      fetchSeries(90),
    ]);

    // Followers atuais = último snapshot disponível
    const latestSnapshot = s90[s90.length - 1] as any;
    const followers = latestSnapshot?.followers_count ?? null;

    const account = accountRow
      ? {
          username: accountRow.username,
          instagram_user_id: accountRow.instagram_user_id,
          profile_picture_url: accountRow.profile_picture_url,
          connected_at: accountRow.connected_at,
          token_expires_at: accountRow.expires_at,
          followers,
          posts_total: totals.posts,
        }
      : null;

    return json({
      account,
      totals,
      series: { "7d": s7, "30d": s30, "90d": s90 },
      posts,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("stats-api error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
