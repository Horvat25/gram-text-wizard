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
      .select("id, instagram_post_id")
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
    const errors: string[] = [];

    for (const post of posts) {
      try {
        // Fetch insights from Instagram Graph API
        const mediaId = post.instagram_post_id;
        
        // Get basic metrics
        const metricsUrl = `https://graph.facebook.com/v18.0/${mediaId}?fields=like_count,comments_count&access_token=${accessToken}`;
        const metricsResponse = await fetch(metricsUrl);
        
        if (!metricsResponse.ok) {
          const errorData = await metricsResponse.json();
          console.error(`Error fetching metrics for ${mediaId}:`, errorData);
          errors.push(`Post ${mediaId}: ${errorData.error?.message || 'Unknown error'}`);
          continue;
        }

        const metricsData = await metricsResponse.json();
        console.log(`📊 Métricas do post ${mediaId}:`, metricsData);

        // Try to get insights (reach, saved) - requires business account
        let reach = 0;
        let saves = 0;

        try {
          const insightsUrl = `https://graph.facebook.com/v18.0/${mediaId}/insights?metric=reach,saved&access_token=${accessToken}`;
          const insightsResponse = await fetch(insightsUrl);
          
          if (insightsResponse.ok) {
            const insightsData = await insightsResponse.json();
            console.log(`📈 Insights do post ${mediaId}:`, insightsData);
            
            for (const insight of insightsData.data || []) {
              if (insight.name === "reach") {
                reach = insight.values?.[0]?.value || 0;
              }
              if (insight.name === "saved") {
                saves = insight.values?.[0]?.value || 0;
              }
            }
          }
        } catch (insightError) {
          console.log(`Insights não disponíveis para ${mediaId}:`, insightError);
        }

        // Update the post in database
        const { error: updateError } = await supabase
          .from("posts")
          .update({
            likes_count: metricsData.like_count || 0,
            comments_count: metricsData.comments_count || 0,
            saves_count: saves,
            reach: reach || Math.max(metricsData.like_count * 10, 100), // Estimate if not available
            updated_at: new Date().toISOString(),
          })
          .eq("id", post.id);

        if (updateError) {
          console.error(`Error updating post ${post.id}:`, updateError);
          errors.push(`Update ${post.id}: ${updateError.message}`);
        } else {
          updatedCount++;
          console.log(`✅ Post ${post.id} atualizado com sucesso`);
        }
      } catch (postError: any) {
        console.error(`Error processing post ${post.id}:`, postError);
        errors.push(`Process ${post.id}: ${postError?.message || 'Unknown error'}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: `Sincronização concluída`, 
        updated: updatedCount,
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
