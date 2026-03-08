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

    // Parse optional batch params
    let batchOffset = 0;
    let batchSize = 30;
    try {
      const body = await req.json();
      batchOffset = body.offset || 0;
      batchSize = body.batch_size || 30;
    } catch { /* no body, use defaults */ }

    // Get the connected Instagram accounts
    const { data: accounts, error: accountError } = await supabase
      .from("instagram_accounts")
      .select("*");

    if (accountError || !accounts?.length) {
      console.error("No Instagram account found:", accountError);
      return new Response(
        JSON.stringify({ error: "Nenhuma conta do Instagram conectada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const account = accounts[0];
    const accessToken = account.access_token;

    // ===== STEP 1: AGGREGATE & SAVE SNAPSHOTS FIRST (before per-post sync) =====
    if (batchOffset === 0) {
      console.log('📊 Step 1: Saving snapshots & updating agent context...');
      await saveSnapshotsAndContext(supabase, accounts, accessToken);
    }

    // ===== STEP 2: SYNC INDIVIDUAL POST METRICS IN BATCHES =====
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, instagram_post_id, media_type")
      .eq("status", "published")
      .not("instagram_post_id", "is", null)
      .order("published_at", { ascending: false })
      .range(batchOffset, batchOffset + batchSize - 1);

    if (postsError) {
      console.error("Error fetching posts:", postsError);
      throw postsError;
    }

    if (!posts?.length) {
      return new Response(
        JSON.stringify({ message: "Sincronização concluída", updated: 0, batch: batchOffset }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🔄 Batch ${batchOffset}: sincronizando ${posts.length} posts...`);

    let updatedCount = 0;
    let deletedCount = 0;
    const errors: string[] = [];

    for (const post of posts) {
      try {
        const mediaId = post.instagram_post_id;
        
        const metricsUrl = `https://graph.facebook.com/v18.0/${mediaId}?fields=like_count,comments_count&access_token=${accessToken}`;
        const metricsResponse = await fetch(metricsUrl);
        
        if (!metricsResponse.ok) {
          const errorData = await metricsResponse.json();
          
          if (errorData.error?.code === 100 || metricsResponse.status === 404) {
            console.log(`🗑️ Post ${mediaId} deletado no Instagram`);
            const { error: deleteError } = await supabase
              .from("posts")
              .delete()
              .eq("id", post.id);
            if (!deleteError) deletedCount++;
            continue;
          }
          
          errors.push(`Post ${mediaId}: ${errorData.error?.message || 'Unknown error'}`);
          continue;
        }

        const metricsData = await metricsResponse.json();
        const likes = metricsData.like_count || 0;
        const comments = metricsData.comments_count || 0;

        let reach = 0, saves = 0, impressions = 0, shares = 0;

        try {
          const isReels = post.media_type === "reels" || post.media_type === "reel";
          const insightMetrics = isReels
            ? "reach,saved,impressions,shares"
            : "reach,saved,impressions";

          const insightsUrl = `https://graph.facebook.com/v18.0/${mediaId}/insights?metric=${insightMetrics}&access_token=${accessToken}`;
          const insightsResponse = await fetch(insightsUrl);
          
          if (insightsResponse.ok) {
            const insightsData = await insightsResponse.json();
            for (const insight of insightsData.data || []) {
              const value = insight.values?.[0]?.value || 0;
              switch (insight.name) {
                case "reach": reach = value; break;
                case "saved": saves = value; break;
                case "impressions": impressions = value; break;
                case "shares": shares = value; break;
              }
            }
          }
        } catch (insightError) {
          console.log(`Insights não disponíveis para ${mediaId}`);
        }

        const minReach = likes + comments + saves;
        const finalReach = Math.max(reach, minReach);

        const { error: updateError } = await supabase
          .from("posts")
          .update({
            likes_count: likes,
            comments_count: comments,
            saves_count: saves,
            reach: finalReach,
            impressions: impressions,
            shares_count: shares,
            last_metrics_sync: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", post.id);

        if (!updateError) {
          updatedCount++;
          if (likes > 0 || comments > 0 || saves > 0) {
            console.log(`✅ ${post.id}: ${likes}❤️ ${comments}💬 ${saves}🔖 ${finalReach}👁️`);
          }
        } else {
          errors.push(`Update ${post.id}: ${updateError.message}`);
        }
      } catch (postError: any) {
        errors.push(`Process ${post.id}: ${postError?.message || 'Unknown error'}`);
      }
    }

    // Check if there are more posts to process
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

// ===== Helper: Save snapshots and update agent_context =====
async function saveSnapshotsAndContext(supabase: any, accounts: any[], accessToken: string) {
  try {
    const workspaceIds = [...new Set(accounts.map((a: any) => a.workspace_id).filter(Boolean))];
    
    for (const wsId of workspaceIds) {
      const wsAccount = accounts.find((a: any) => a.workspace_id === wsId);
      
      // 1. Fetch followers from Instagram
      let followersCount = 0;
      if (wsAccount) {
        try {
          const igUserId = wsAccount.instagram_user_id;
          const profileRes = await fetch(
            `https://graph.facebook.com/v21.0/${igUserId}?fields=followers_count&access_token=${accessToken}`
          );
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            followersCount = profileData.followers_count || 0;
            console.log(`📊 Instagram followers: ${followersCount}`);
          }
        } catch (e) {
          console.error('Error fetching Instagram profile:', e);
        }
      }

      // 2. Calculate weekly metrics from existing post data
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
      
      if (weekPosts && weekPosts.length > 0) {
        const totalReach = weekPosts.reduce((sum: number, p: any) => sum + (p.reach || 0), 0);
        const engagements = weekPosts.map((p: any) => {
          const total = (p.likes_count || 0) + (p.comments_count || 0) + (p.saves_count || 0);
          const reach = p.reach || 1;
          return (total / reach) * 100;
        });
        const avgEngagement = engagements.reduce((a: number, b: number) => a + b, 0) / engagements.length;
        updateData.current_weekly_views = totalReach;
        updateData.current_weekly_engagement = Math.round(avgEngagement * 10) / 10;
      }
      
      if (followersCount > 0) {
        updateData.current_weekly_followers = followersCount;
      }
      
      // 3. Update agent_context
      const { error: ctxError } = await supabase
        .from("agent_context")
        .update(updateData)
        .eq("workspace_id", wsId);
      
      if (!ctxError) {
        console.log(`✅ Agent context updated: followers=${followersCount}, reach=${updateData.current_weekly_views || 0}`);
      }

      // 4. Save daily strategy snapshot + auto-learn from top posts
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
          .gt("reach", 10); // Only real synced metrics - exclude placeholder data
        
        const totalReach = (allPosts || []).reduce((s: number, p: any) => s + (p.reach || 0), 0);
        const totalImpressions = (allPosts || []).reduce((s: number, p: any) => s + (p.impressions || 0), 0);
        const totalLikes = (allPosts || []).reduce((s: number, p: any) => s + (p.likes_count || 0), 0);
        const totalComments = (allPosts || []).reduce((s: number, p: any) => s + (p.comments_count || 0), 0);
        const totalSaves = (allPosts || []).reduce((s: number, p: any) => s + (p.saves_count || 0), 0);
        const totalShares = (allPosts || []).reduce((s: number, p: any) => s + (p.shares_count || 0), 0);
        
        // Find top performing type and generate insights
        const typePerf: Record<string, { reach: number; count: number; engagement: number }> = {};
        for (const p of (allPosts || [])) {
          const mt = p.media_type === 'reels' || p.media_type === 'reel' ? 'video' : p.post_type === 'noticia' ? 'news' : p.media_type || 'image';
          if (!typePerf[mt]) typePerf[mt] = { reach: 0, count: 0, engagement: 0 };
          typePerf[mt].reach += (p.reach || 0);
          typePerf[mt].count += 1;
          typePerf[mt].engagement += (p.likes_count || 0) + (p.comments_count || 0) + (p.saves_count || 0);
        }
        
        const topType = Object.entries(typePerf).sort(([,a],[,b]) => b.reach - a.reach)[0]?.[0] || null;
        
        // Auto-learn: generate insights from real data
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
        
        // Find top 3 posts for learning
        const topReachPosts = [...(allPosts || [])].sort((a: any, b: any) => (b.reach || 0) - (a.reach || 0)).slice(0, 3);
        if (topReachPosts.length > 0) {
          const topCaption = topReachPosts[0].caption?.substring(0, 60) || '';
          insights.push(`Post de maior alcance (${topReachPosts[0].reach?.toLocaleString()}): "${topCaption}..."`);
        }
        
        // Save insights to agent_context
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
