import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let batchOffset = 0;
    let batchSize = 50;
    let periodDays = 90;
    try {
      const body = await req.json();
      batchOffset = body.offset || 0;
      batchSize = body.batch_size || 50;
      periodDays = body.period_days || 90;
    } catch { /* no body */ }

    const { data: accounts, error: accountError } = await supabase
      .from("instagram_accounts")
      .select("*");

    if (accountError || !accounts?.length) {
      return new Response(
        JSON.stringify({ error: "Nenhuma conta do Instagram conectada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const account = accounts[0];
    const accessToken = account.access_token;

    // Save snapshots only on first batch
    if (batchOffset === 0) {
      console.log('📊 Step 1: Saving snapshots...');
      await saveSnapshotsAndContext(supabase, accounts, periodDays);
    }

    // Fetch posts batch
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, instagram_post_id, media_type, reach, impressions, saves_count, shares_count")
      .eq("status", "published")
      .not("instagram_post_id", "is", null)
      .order("published_at", { ascending: false })
      .range(batchOffset, batchOffset + batchSize - 1);

    if (postsError) throw postsError;

    if (!posts?.length) {
      return new Response(
        JSON.stringify({ message: "Sincronização concluída", updated: 0, batch: batchOffset }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🔄 Batch ${batchOffset}: sincronizando ${posts.length} posts em paralelo...`);

    // Process posts in PARALLEL (chunks of 5 to avoid rate limits)
    let updatedCount = 0;
    let deletedCount = 0;
    const errors: string[] = [];

    const chunkSize = 5;
    for (let i = 0; i < posts.length; i += chunkSize) {
      const chunk = posts.slice(i, i + chunkSize);
      const results = await Promise.allSettled(
        chunk.map(post => syncSinglePost(supabase, post, accessToken))
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.action === 'updated') updatedCount++;
          else if (result.value.action === 'deleted') deletedCount++;
          else if (result.value.action === 'error') errors.push(result.value.message || '');
        } else {
          errors.push(result.reason?.message || 'Unknown');
        }
      }
    }

    const hasMore = posts.length === batchSize;

    return new Response(
      JSON.stringify({ 
        message: `Batch ${batchOffset} concluído`, 
        updated: updatedCount,
        deleted: deletedCount,
        batch_offset: batchOffset,
        batch_size: batchSize,
        has_more: hasMore,
        next_offset: hasMore ? batchOffset + batchSize : null,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Process a single post — fetches metrics + insights in parallel
async function syncSinglePost(supabase: any, post: any, accessToken: string): Promise<{ action: string; message?: string }> {
  const mediaId = post.instagram_post_id;
  const isReels = post.media_type === "reels" || post.media_type === "reel";

  // Fetch basic metrics AND insights in parallel
  // NOTE: 'views' replaced deprecated 'impressions/plays' for newer Instagram media.
  const insightMetrics = isReels
    ? "reach,saved,shares,views"
    : "reach,saved,views";

  const [metricsRes, insightsRes] = await Promise.all([
    fetch(`https://graph.facebook.com/v21.0/${mediaId}?fields=like_count,comments_count&access_token=${accessToken}`),
    fetch(`https://graph.facebook.com/v21.0/${mediaId}/insights?metric=${insightMetrics}&access_token=${accessToken}`).catch(() => null),
  ]);

  if (!metricsRes.ok) {
    const errorData = await metricsRes.json();
    if (errorData.error?.code === 100 || metricsRes.status === 404) {
      const { error } = await supabase.from("posts").delete().eq("id", post.id);
      return error ? { action: 'error', message: error.message } : { action: 'deleted' };
    }
    return { action: 'error', message: errorData.error?.message || 'API error' };
  }

  const metricsData = await metricsRes.json();
  const likes = metricsData.like_count || 0;
  const comments = metricsData.comments_count || 0;

  // Keep previously synced values as fallback so we don't regress to tiny numbers.
  let reach = post.reach || 0;
  let saves = post.saves_count || 0;
  let impressions = post.impressions || 0;
  let shares = post.shares_count || 0;

  if (insightsRes && insightsRes.ok) {
    const insightsData = await insightsRes.json();
    for (const insight of insightsData.data || []) {
      const rawValue = insight.values?.[0]?.value;
      const value = typeof rawValue === 'number' ? rawValue : Number(rawValue) || 0;

      switch (insight.name) {
        case "reach":
          reach = value;
          break;
        case "saved":
          saves = value;
          break;
        case "impressions":
        case "views":
          impressions = value;
          break;
        case "shares":
          shares = value;
          break;
        case "plays":
          if (value > impressions) impressions = value;
          break;
      }
    }
  } else if (insightsRes) {
    try {
      const errorData = await insightsRes.json();
      console.log(`⚠️ Insights unavailable for media ${mediaId}:`, errorData?.error?.message || insightsRes.statusText);
    } catch {
      console.log(`⚠️ Insights unavailable for media ${mediaId}: HTTP ${insightsRes.status}`);
    }
  }

  const minReach = likes + comments + saves;
  const finalReach = Math.max(reach, minReach, post.reach || 0);

  const { error } = await supabase
    .from("posts")
    .update({
      likes_count: likes,
      comments_count: comments,
      saves_count: saves,
      reach: finalReach,
      impressions,
      shares_count: shares,
      last_metrics_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", post.id);

  if (error) return { action: 'error', message: error.message };
  if (likes > 0 || comments > 0) {
    console.log(`✅ ${post.id}: ${likes}❤️ ${comments}💬 ${saves}🔖 ${finalReach}👁️ ${impressions}📺`);
  }
  return { action: 'updated' };
}

// ===== Helper: Save snapshots and update agent_context =====
async function saveSnapshotsAndContext(supabase: any, accounts: any[], periodDays: number) {
  try {
    const workspaceIds = [...new Set(accounts.map((a: any) => a.workspace_id).filter(Boolean))];
    
    for (const wsId of workspaceIds) {
      const wsAccount = accounts.find((a: any) => a.workspace_id === wsId);
      const accessToken = wsAccount?.access_token;
      
      let followersCount = 0;
      let accountImpressions = 0;
      let accountReach = 0;
      
      if (wsAccount && accessToken) {
        const igUserId = wsAccount.instagram_user_id;
        const nowTs = Math.floor(Date.now() / 1000);
        const sinceTs = nowTs - 86400 * Math.max(14, Math.min(periodDays, 90));

        // Instagram account insights supports fixed timeframe values.
        const timeframe = periodDays >= 90 ? 'last_90_days' : periodDays >= 30 ? 'last_30_days' : 'last_14_days';

        // Fetch followers + account-level insights in parallel
        // New API uses views(metric_type=total_value). Keep legacy fallback for impressions.
        const [profileRes, viewsRangeRes, viewsInsightsRes, viewsBreakdownRes, legacyInsightsRes] = await Promise.all([
          fetch(`https://graph.facebook.com/v21.0/${igUserId}?fields=followers_count&access_token=${accessToken}`).catch(() => null),
          fetch(`https://graph.facebook.com/v21.0/${igUserId}/insights?metric=views,reach&period=day&since=${sinceTs}&until=${nowTs}&metric_type=total_value&access_token=${accessToken}`).catch(() => null),
          fetch(`https://graph.facebook.com/v21.0/${igUserId}/insights?metric=views,reach&period=day&timeframe=${timeframe}&metric_type=total_value&access_token=${accessToken}`).catch(() => null),
          fetch(`https://graph.facebook.com/v21.0/${igUserId}/insights?metric=views&period=day&timeframe=${timeframe}&metric_type=total_value&breakdown=media_product_type&access_token=${accessToken}`).catch(() => null),
          fetch(`https://graph.facebook.com/v21.0/${igUserId}/insights?metric=impressions,reach&period=day&since=${sinceTs}&until=${nowTs}&access_token=${accessToken}`).catch(() => null),
        ]);

        if (profileRes && profileRes.ok) {
          const profileData = await profileRes.json();
          followersCount = profileData.followers_count || 0;
          console.log(`📊 Instagram followers: ${followersCount}`);
        }

        const parseMetricValue = (metric: any): number => {
          if (!metric) return 0;
          if (typeof metric.total_value?.value === 'number') return metric.total_value.value;
          if (typeof metric.total_value === 'number') return metric.total_value;
          if (Array.isArray(metric.values)) {
            return metric.values.reduce((s: number, v: any) => {
              if (typeof v?.value === 'number') return s + v.value;
              if (typeof v?.value?.value === 'number') return s + v.value.value;
              return s;
            }, 0);
          }
          return 0;
        };

        // Primary: account views (new API)
        const parseViewsResponse = async (res: Response | null, label: string) => {
          if (!res) return { views: 0, reach: 0 };
          if (!res.ok) {
            try {
              const errData = await res.json();
              console.log(`⚠️ Account views ${label} failed: ${errData?.error?.message || res.statusText}`);
            } catch {
              console.log(`⚠️ Account views ${label} failed: HTTP ${res.status}`);
            }
            return { views: 0, reach: 0 };
          }

          const insData = await res.json();
          let views = 0;
          let reach = 0;
          for (const metric of insData.data || []) {
            const totalValue = parseMetricValue(metric);
            if (metric.name === 'views') views = totalValue;
            if (metric.name === 'reach') reach = totalValue;
          }
          console.log(`📊 Account views(${label}): ${views}, reach: ${reach}`);
          return { views, reach };
        };

        const parseBreakdownViews = async (res: Response | null): Promise<number> => {
          if (!res || !res.ok) return 0;
          try {
            const data = await res.json();
            let total = 0;
            for (const metric of data.data || []) {
              if (metric.name !== 'views') continue;

              const directValue = typeof metric.total_value?.value === 'number' ? metric.total_value.value : 0;
              let breakdownSum = 0;
              const breakdowns = metric.total_value?.breakdowns || [];
              for (const b of breakdowns) {
                for (const r of b.results || []) {
                  const v = typeof r?.value === 'number' ? r.value : Number(r?.value) || 0;
                  breakdownSum += v;
                }
              }

              total = Math.max(total, directValue, breakdownSum);
            }
            if (total > 0) console.log(`📊 Account views(breakdown): ${total}`);
            return total;
          } catch {
            return 0;
          }
        };

        const [rangeMetrics, timeframeMetrics, breakdownViews] = await Promise.all([
          parseViewsResponse(viewsRangeRes, 'range'),
          parseViewsResponse(viewsInsightsRes, 'timeframe'),
          parseBreakdownViews(viewsBreakdownRes),
        ]);

        accountImpressions = Math.max(rangeMetrics.views, timeframeMetrics.views, breakdownViews);
        accountReach = Math.max(rangeMetrics.reach, timeframeMetrics.reach);

        // Fallback: legacy impressions endpoint
        if (accountImpressions === 0 && legacyInsightsRes && legacyInsightsRes.ok) {
          const legacyData = await legacyInsightsRes.json();
          for (const metric of legacyData.data || []) {
            const totalValue = parseMetricValue(metric);
            if (metric.name === 'impressions') accountImpressions = totalValue;
            if (metric.name === 'reach' && accountReach === 0) accountReach = totalValue;
          }
          console.log(`📊 Account views(legacy impressions): ${accountImpressions}, reach: ${accountReach}`);
        }
      }

      // Calculate weekly metrics from posts
      const now = new Date();
      const brasiliaOffset = -3 * 60 * 60 * 1000;
      const todayBrasilia = new Date(now.getTime() + brasiliaOffset);
      const weekStart = new Date(todayBrasilia);
      weekStart.setDate(todayBrasilia.getDate() - todayBrasilia.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekStartUTC = new Date(weekStart.getTime() - brasiliaOffset);
      
      const { data: weekPosts } = await supabase
        .from("posts")
        .select("reach, likes_count, comments_count, saves_count, impressions")
        .eq("workspace_id", wsId)
        .eq("status", "published")
        .not("instagram_post_id", "is", null)
        .gte("published_at", weekStartUTC.toISOString());

      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      
      // Use account-level views as source of truth (matches Instagram "Visualizações")
      // If insights are unavailable, keep previous DB value (avoid replacing with tiny fallback values).
      if (accountImpressions > 0) {
        updateData.current_weekly_views = accountImpressions;
      } else if (accountReach > 0) {
        updateData.current_weekly_views = accountReach;
      }

      if (weekPosts && weekPosts.length > 0) {
        const engagements = weekPosts.map((p: any) => {
          const total = (p.likes_count || 0) + (p.comments_count || 0) + (p.saves_count || 0);
          const reach = p.reach || 1;
          return (total / reach) * 100;
        });
        const avgEngagement = engagements.reduce((a: number, b: number) => a + b, 0) / engagements.length;
        updateData.current_weekly_engagement = Math.round(avgEngagement * 10) / 10;
      }
      
      if (followersCount > 0) {
        updateData.current_weekly_followers = followersCount;
      }
      
      const { error: ctxError } = await supabase
        .from("agent_context")
        .update(updateData)
        .eq("workspace_id", wsId);
      
      if (!ctxError) {
        console.log(`✅ Agent context updated: followers=${followersCount}, reach=${updateData.current_weekly_views || 0}`);
      }

      // Save daily strategy snapshot
      try {
        const { data: ctxData } = await supabase
          .from("agent_context")
          .select("goal_type, content_distribution_videos, content_distribution_carousels, content_distribution_news, content_distribution_images, success_patterns")
          .eq("workspace_id", wsId)
          .single();
        
        const { data: allPosts } = await supabase
          .from("posts")
          .select("reach, impressions, likes_count, comments_count, saves_count, shares_count, media_type, post_type, caption, published_at")
          .eq("workspace_id", wsId)
          .eq("status", "published")
          .not("instagram_post_id", "is", null)
          .gt("reach", 10);
        
        const totalReach = (allPosts || []).reduce((s: number, p: any) => s + (p.reach || 0), 0);
        const totalImpressions = (allPosts || []).reduce((s: number, p: any) => s + (p.impressions || 0), 0);
        const totalLikes = (allPosts || []).reduce((s: number, p: any) => s + (p.likes_count || 0), 0);
        const totalComments = (allPosts || []).reduce((s: number, p: any) => s + (p.comments_count || 0), 0);
        const totalSaves = (allPosts || []).reduce((s: number, p: any) => s + (p.saves_count || 0), 0);
        const totalShares = (allPosts || []).reduce((s: number, p: any) => s + (p.shares_count || 0), 0);
        
        const typePerf: Record<string, { reach: number; count: number; engagement: number }> = {};
        for (const p of (allPosts || [])) {
          const mt = p.media_type === 'reels' || p.media_type === 'reel' ? 'video' : p.post_type === 'noticia' ? 'news' : p.media_type || 'image';
          if (!typePerf[mt]) typePerf[mt] = { reach: 0, count: 0, engagement: 0 };
          typePerf[mt].reach += (p.reach || 0);
          typePerf[mt].count += 1;
          typePerf[mt].engagement += (p.likes_count || 0) + (p.comments_count || 0) + (p.saves_count || 0);
        }
        
        const topType = Object.entries(typePerf).sort(([,a],[,b]) => b.reach - a.reach)[0]?.[0] || null;
        
        const insights: string[] = [];
        const sorted = Object.entries(typePerf).sort(([,a],[,b]) => (b.reach / (b.count || 1)) - (a.reach / (a.count || 1)));
        if (sorted.length > 0) {
          const [bestType, bestData] = sorted[0];
          const avgReach = Math.round(bestData.reach / (bestData.count || 1));
          const typeLabel = bestType === 'video' ? 'Reels' : bestType === 'carousel' ? 'Carrosséis' : bestType === 'news' ? 'Notícias' : 'Imagens';
          insights.push(`${typeLabel} têm o maior alcance médio: ${avgReach.toLocaleString()} por post`);
        }
        if (sorted.length > 1) {
          const [worstType] = sorted[sorted.length - 1];
          const worstLabel = worstType === 'video' ? 'Reels' : worstType === 'carousel' ? 'Carrosséis' : worstType === 'news' ? 'Notícias' : 'Imagens';
          insights.push(`${worstLabel} têm o menor alcance — considerar reduzir frequência`);
        }
        
        const topReachPosts = [...(allPosts || [])].sort((a: any, b: any) => (b.reach || 0) - (a.reach || 0)).slice(0, 3);
        if (topReachPosts.length > 0) {
          const topCaption = topReachPosts[0].caption?.substring(0, 60) || '';
          insights.push(`Post de maior alcance (${topReachPosts[0].reach?.toLocaleString()}): "${topCaption}..."`);
        }
        
        if (insights.length > 0) {
          await supabase
            .from("agent_context")
            .update({ 
              success_patterns: insights.slice(0, 5),
              top_topics: sorted.map(([t]) => t === 'video' ? 'Reels' : t === 'carousel' ? 'Carrosséis' : t === 'news' ? 'Notícias' : 'Imagens').slice(0, 4)
            })
            .eq("workspace_id", wsId);
          console.log(`🧠 Auto-learn: ${insights.length} insights saved`);
        }
        
        const today = new Date().toISOString().split('T')[0];
        
        await supabase
          .from("agent_strategy_snapshots")
          .upsert({
            workspace_id: wsId,
            snapshot_date: today,
            period_type: 'daily',
            goal_type: ctxData?.goal_type || null,
            content_distribution_videos: ctxData?.content_distribution_videos || 0,
            content_distribution_carousels: ctxData?.content_distribution_carousels || 0,
            content_distribution_news: ctxData?.content_distribution_news || 0,
            content_distribution_images: ctxData?.content_distribution_images || 0,
            total_reach: totalReach,
            total_impressions: totalImpressions,
            total_likes: totalLikes,
            total_comments: totalComments,
            total_saves: totalSaves,
            total_shares: totalShares,
            followers_count: followersCount,
            avg_engagement: updateData.current_weekly_engagement || 0,
            posts_count: (allPosts || []).length,
            top_performing_type: topType,
            strategy_reason: insights[0] || null
          }, { onConflict: 'workspace_id,snapshot_date,period_type' });
        
        console.log(`📸 Strategy snapshot saved for ${today}`);
      } catch (snapError) {
        console.error('Error saving strategy snapshot:', snapError);
      }
    }
  } catch (aggError) {
    console.error('Error in saveSnapshotsAndContext:', aggError);
  }
}
