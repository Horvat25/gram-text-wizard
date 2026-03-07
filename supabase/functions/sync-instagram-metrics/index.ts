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

    // Get the connected Instagram account
    const { data: accounts, error: accountError } = await supabase
      .from("instagram_accounts")
      .select("*")
      .limit(1);

    if (accountError || !accounts?.length) {
      console.error("No Instagram account found:", accountError);
      return new Response(
        JSON.stringify({ error: "Nenhuma conta do Instagram conectada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const account = accounts[0];
    const accessToken = account.access_token;

    // Get all published posts with instagram_post_id
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, instagram_post_id, media_type")
      .eq("status", "published")
      .not("instagram_post_id", "is", null);

    if (postsError) {
      console.error("Error fetching posts:", postsError);
      throw postsError;
    }

    if (!posts?.length) {
      return new Response(
        JSON.stringify({ message: "Nenhum post publicado para sincronizar", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🔄 Sincronizando métricas de ${posts.length} posts...`);

    let updatedCount = 0;
    let deletedCount = 0;
    const errors: string[] = [];

    for (const post of posts) {
      try {
        const mediaId = post.instagram_post_id;
        
        // Get basic metrics
        const metricsUrl = `https://graph.facebook.com/v18.0/${mediaId}?fields=like_count,comments_count&access_token=${accessToken}`;
        const metricsResponse = await fetch(metricsUrl);
        
        if (!metricsResponse.ok) {
          const errorData = await metricsResponse.json();
          console.error(`Error fetching metrics for ${mediaId}:`, errorData);
          
          // Post deleted on Instagram
          if (errorData.error?.code === 100 || metricsResponse.status === 404) {
            console.log(`🗑️ Post ${mediaId} deletado no Instagram, removendo...`);
            const { error: deleteError } = await supabase
              .from("posts")
              .delete()
              .eq("id", post.id);
            if (!deleteError) deletedCount++;
            else errors.push(`Delete ${post.id}: ${deleteError.message}`);
            continue;
          }
          
          errors.push(`Post ${mediaId}: ${errorData.error?.message || 'Unknown error'}`);
          continue;
        }

        const metricsData = await metricsResponse.json();
        const likes = metricsData.like_count || 0;
        const comments = metricsData.comments_count || 0;

        // Get insights (reach, saved, impressions, shares)
        let reach = 0;
        let saves = 0;
        let impressions = 0;
        let shares = 0;

        try {
          // Determine correct metrics based on media type
          const isReels = post.media_type === "reels" || post.media_type === "reel";
          const insightMetrics = isReels
            ? "reach,saved,impressions,shares"
            : "reach,saved,impressions";

          const insightsUrl = `https://graph.facebook.com/v18.0/${mediaId}/insights?metric=${insightMetrics}&access_token=${accessToken}`;
          const insightsResponse = await fetch(insightsUrl);
          
          if (insightsResponse.ok) {
            const insightsData = await insightsResponse.json();
            console.log(`📈 Insights do post ${mediaId}:`, JSON.stringify(insightsData.data?.map((d: any) => ({ name: d.name, value: d.values?.[0]?.value }))));
            
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
          console.log(`Insights não disponíveis para ${mediaId}:`, insightError);
        }

        // Calculate minimum reach
        const minReach = likes + comments + saves;
        const finalReach = Math.max(reach, minReach);

        // Update the post with real metrics
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

        if (updateError) {
          console.error(`Error updating post ${post.id}:`, updateError);
          errors.push(`Update ${post.id}: ${updateError.message}`);
        } else {
          updatedCount++;
          console.log(`✅ Post ${post.id}: ${likes}❤️ ${comments}💬 ${saves}🔖 ${finalReach}👁️ ${impressions}📊 ${shares}🔗`);
        }
      } catch (postError: any) {
        console.error(`Error processing post ${post.id}:`, postError);
        errors.push(`Process ${post.id}: ${postError?.message || 'Unknown error'}`);
      }
    }

    // ===== AGGREGATE WEEKLY METRICS INTO AGENT CONTEXT =====
    console.log('📊 Aggregating weekly metrics into agent context...');
    
    try {
      // Get all accounts to aggregate per workspace
      const workspaceIds = [...new Set(accounts.map((a: any) => a.workspace_id).filter(Boolean))];
      
      for (const wsId of workspaceIds) {
        const wsAccount = accounts.find((a: any) => a.workspace_id === wsId);
        
        const now = new Date();
        const brasiliaOffset = -3 * 60 * 60 * 1000;
        const todayBrasilia = new Date(now.getTime() + brasiliaOffset);
        const weekStart = new Date(todayBrasilia);
        weekStart.setDate(todayBrasilia.getDate() - todayBrasilia.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekStartUTC = new Date(weekStart.getTime() - brasiliaOffset);
        
        // Get all published posts this week for this workspace
        const { data: weekPosts } = await supabase
          .from("posts")
          .select("reach, likes_count, comments_count, saves_count, impressions")
          .eq("workspace_id", wsId)
          .eq("status", "published")
          .not("instagram_post_id", "is", null)
          .gte("published_at", weekStartUTC.toISOString());
        
        // Fetch current followers count from Instagram API
        let followersCount = 0;
        if (wsAccount) {
          try {
            const igUserId = wsAccount.instagram_user_id;
            const igToken = wsAccount.access_token;
            const profileRes = await fetch(
              `https://graph.facebook.com/v21.0/${igUserId}?fields=followers_count&access_token=${igToken}`
            );
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              followersCount = profileData.followers_count || 0;
              console.log(`📊 Instagram followers: ${followersCount}`);
            } else {
              const errBody = await profileRes.text();
              console.error('Error fetching followers:', errBody);
            }
          } catch (e) {
            console.error('Error fetching Instagram profile:', e);
          }
        }
        
        const updateData: Record<string, any> = {
          updated_at: new Date().toISOString()
        };
        
        if (weekPosts && weekPosts.length > 0) {
          const totalReach = weekPosts.reduce((sum: number, p: any) => sum + (p.reach || 0), 0);
          
          // Calculate average engagement rate
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
        
        // Update agent_context with real weekly metrics
        const { error: ctxError } = await supabase
          .from("agent_context")
          .update(updateData)
          .eq("workspace_id", wsId);
        
        if (ctxError) {
          console.error(`Error updating agent_context for workspace ${wsId}:`, ctxError);
        } else {
          console.log(`✅ Agent context updated for workspace ${wsId}: reach=${updateData.current_weekly_views || 0}, engagement=${updateData.current_weekly_engagement || 0}%, followers=${followersCount}`);
        }
        
        // ===== SAVE DAILY STRATEGY SNAPSHOT =====
        try {
          // Get current agent_context for strategy info
          const { data: ctxData } = await supabase
            .from("agent_context")
            .select("goal_type, content_distribution_videos, content_distribution_carousels, content_distribution_news, content_distribution_images, success_patterns")
            .eq("workspace_id", wsId)
            .single();
          
          // Aggregate ALL posts metrics for this workspace (not just this week)
          const { data: allPosts } = await supabase
            .from("posts")
            .select("reach, impressions, likes_count, comments_count, saves_count, shares_count, media_type, post_type")
            .eq("workspace_id", wsId)
            .eq("status", "published")
            .not("instagram_post_id", "is", null);
          
          const totalReach = (allPosts || []).reduce((s: number, p: any) => s + (p.reach || 0), 0);
          const totalImpressions = (allPosts || []).reduce((s: number, p: any) => s + (p.impressions || 0), 0);
          const totalLikes = (allPosts || []).reduce((s: number, p: any) => s + (p.likes_count || 0), 0);
          const totalComments = (allPosts || []).reduce((s: number, p: any) => s + (p.comments_count || 0), 0);
          const totalSaves = (allPosts || []).reduce((s: number, p: any) => s + (p.saves_count || 0), 0);
          const totalShares = (allPosts || []).reduce((s: number, p: any) => s + (p.shares_count || 0), 0);
          
          // Find top performing type
          const typePerf: Record<string, number> = {};
          for (const p of (allPosts || [])) {
            const mt = p.media_type === 'reels' ? 'video' : p.post_type === 'noticia' ? 'news' : p.media_type || 'image';
            const eng = (p.likes_count || 0) + (p.comments_count || 0) + (p.saves_count || 0);
            typePerf[mt] = (typePerf[mt] || 0) + eng;
          }
          const topType = Object.entries(typePerf).sort(([,a],[,b]) => b - a)[0]?.[0] || null;
          
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
              strategy_reason: (ctxData?.success_patterns || []).slice(-1)[0] || null
            }, { onConflict: 'workspace_id,snapshot_date,period_type' });
          
          console.log(`📸 Strategy snapshot saved for ${today}`);
        } catch (snapError) {
          console.error('Error saving strategy snapshot:', snapError);
        }
      }
    } catch (aggError) {
      console.error('Error aggregating weekly metrics:', aggError);
    }

    return new Response(
      JSON.stringify({ 
        message: `Sincronização concluída`, 
        updated: updatedCount,
        deleted: deletedCount,
        total: posts.length,
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
