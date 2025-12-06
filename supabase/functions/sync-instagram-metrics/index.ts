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
    const instagramUserId = account.instagram_user_id;

    console.log(`🔄 Buscando mídias recentes da conta ${account.username}...`);

    // Buscar as mídias recentes do Instagram
    // Usar instagram_user_id para a Instagram Graph API
    const mediaListUrl = `https://graph.facebook.com/v18.0/${instagramUserId}/media?fields=id,caption,timestamp,like_count,comments_count&limit=50&access_token=${accessToken}`;
    
    console.log(`🔗 Buscando mídias de: ${instagramUserId}`);
    
    const mediaListResponse = await fetch(mediaListUrl);
    const mediaListData = await mediaListResponse.json();
    
    if (mediaListData.error) {
      console.error("Erro ao buscar mídias:", mediaListData.error);
      
      // Se falhar, tentar sincronizar sem buscar a lista (usar IDs existentes com fallback)
      console.log("Tentando sincronização alternativa...");
      
      // Get all published posts
      const { data: posts, error: postsError } = await supabase
        .from("posts")
        .select("id, instagram_post_id, caption, published_at, likes_count")
        .eq("status", "published");

      if (postsError || !posts?.length) {
        return new Response(
          JSON.stringify({ 
            message: "Não foi possível sincronizar métricas. Verifique as permissões do Instagram.", 
            error: mediaListData.error.message,
            updated: 0 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Retornar os posts existentes sem atualização da API
      return new Response(
        JSON.stringify({ 
          message: "Sincronização limitada - usando dados locais. Reconecte o Instagram para obter métricas em tempo real.",
          updated: 0,
          total: posts.length,
          apiError: mediaListData.error.message
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instagramMedia = mediaListData.data || [];
    
    console.log(`📱 Encontradas ${instagramMedia.length} mídias no Instagram`);

    // Get all published posts
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, instagram_post_id, caption, published_at")
      .eq("status", "published");

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

    console.log(`📊 Sincronizando ${posts.length} posts com ${instagramMedia.length} mídias do Instagram...`);

    let updatedCount = 0;
    const errors: string[] = [];
    const matched: string[] = [];

    for (const post of posts) {
      try {
        let matchedMedia = null;

        // Tentar encontrar pelo instagram_post_id primeiro
        if (post.instagram_post_id) {
          matchedMedia = instagramMedia.find((m: any) => m.id === post.instagram_post_id);
        }

        // Se não encontrou, tentar match por caption (primeiros 50 chars)
        if (!matchedMedia && post.caption) {
          const postCaptionStart = post.caption.substring(0, 50).toLowerCase().trim();
          matchedMedia = instagramMedia.find((m: any) => {
            if (!m.caption) return false;
            const mediaCaptionStart = m.caption.substring(0, 50).toLowerCase().trim();
            return mediaCaptionStart === postCaptionStart;
          });

          // Se encontrou por caption, atualizar o instagram_post_id
          if (matchedMedia) {
            console.log(`🔗 Match por caption encontrado: post ${post.id} -> media ${matchedMedia.id}`);
          }
        }

        if (!matchedMedia) {
          console.log(`⚠️ Nenhum match encontrado para post ${post.id}`);
          continue;
        }

        matched.push(matchedMedia.id);
        
        const likes = matchedMedia.like_count || 0;
        const comments = matchedMedia.comments_count || 0;

        // Buscar insights adicionais (reach, saved)
        let reach = 0;
        let saves = 0;

        try {
          const insightsUrl = `https://graph.facebook.com/v18.0/${matchedMedia.id}/insights?metric=reach,saved&access_token=${accessToken}`;
          const insightsResponse = await fetch(insightsUrl);
          
          if (insightsResponse.ok) {
            const insightsData = await insightsResponse.json();
            
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
          console.log(`Insights não disponíveis para ${matchedMedia.id}`);
        }

        // Calcular reach mínimo
        const minReach = likes + comments + saves;
        const finalReach = Math.max(reach, minReach);

        // Atualizar o post
        const { error: updateError } = await supabase
          .from("posts")
          .update({
            instagram_post_id: matchedMedia.id, // Atualizar com ID correto
            likes_count: likes,
            comments_count: comments,
            saves_count: saves,
            reach: finalReach,
            updated_at: new Date().toISOString(),
          })
          .eq("id", post.id);

        if (updateError) {
          console.error(`Error updating post ${post.id}:`, updateError);
          errors.push(`Update ${post.id}: ${updateError.message}`);
        } else {
          updatedCount++;
          console.log(`✅ Post ${post.id} atualizado: ${likes} likes, ${comments} comments, ${saves} saves, ${finalReach} reach`);
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
        mediaFound: instagramMedia.length,
        matched: matched.length,
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
