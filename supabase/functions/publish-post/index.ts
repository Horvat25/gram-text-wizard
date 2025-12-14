import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { postId, accountId } = await req.json();

    if (!postId) {
      throw new Error("postId é obrigatório");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar o post
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (fetchError) {
      throw new Error(`Erro ao buscar post: ${fetchError.message}`);
    }

    if (!post) {
      throw new Error("Post não encontrado");
    }

    // Buscar conta do Instagram (usa accountId se fornecido, senão pega a primeira)
    let accountQuery = supabase.from("instagram_accounts").select("*");
    
    if (accountId) {
      accountQuery = accountQuery.eq("id", accountId);
    }
    
    const { data: accounts, error: accountError } = await accountQuery.limit(1);

    if (accountError || !accounts || accounts.length === 0) {
      console.log("Nenhuma conta Instagram conectada, simulando publicação...");
      
      // Simular métricas de publicação
      const likes_count = Math.floor(Math.random() * 5000 + 500);
      const comments_count = Math.floor(Math.random() * 200 + 20);
      const saves_count = Math.floor(Math.random() * 800 + 100);
      const reach = Math.floor(Math.random() * 15000 + 2000);

      const { error: updateError } = await supabase
        .from("posts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          likes_count,
          comments_count,
          saves_count,
          reach,
        })
        .eq("id", postId);

      if (updateError) {
        throw new Error(`Erro ao atualizar post: ${updateError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          postId,
          simulated: true,
          message: "Post publicado (simulação - nenhuma conta conectada)",
          metrics: { likes_count, comments_count, saves_count, reach },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const account = accounts[0];
    const accessToken = account.access_token;
    const instagramUserId = account.instagram_user_id;

    console.log(`Publicando no Instagram para conta: ${account.username || instagramUserId}`);

    const isVideo = post.media_type === "video" || post.media_type === "reels";
    const mediaUrl = isVideo ? post.video_url : post.image_url;

    // Verificar se tem mídia
    if (!mediaUrl) {
      throw new Error(isVideo 
        ? "Um vídeo é necessário para publicar. Gere um vídeo primeiro."
        : "Uma imagem é necessária para publicar no Instagram. Adicione uma imagem ao post."
      );
    }

    const caption = `${post.caption}\n\n${(post.hashtags || []).map((h: string) => `#${h}`).join(' ')}`;
    
    // Step 1: Create media container
    const createMediaUrl = new URL(`https://graph.facebook.com/v18.0/${instagramUserId}/media`);
    
    if (isVideo) {
      // Video/Reels requires different parameters
      createMediaUrl.searchParams.set('video_url', mediaUrl);
      createMediaUrl.searchParams.set('caption', caption);
      createMediaUrl.searchParams.set('media_type', post.media_type === "reels" ? 'REELS' : 'VIDEO');
      createMediaUrl.searchParams.set('access_token', accessToken);
      
      console.log("Creating video media container...");
    } else {
      // Image post
      createMediaUrl.searchParams.set('image_url', mediaUrl);
      createMediaUrl.searchParams.set('caption', caption);
      createMediaUrl.searchParams.set('access_token', accessToken);
      
      console.log("Creating image media container...");
    }

    const mediaResponse = await fetch(createMediaUrl.toString(), { method: 'POST' });
    const mediaData = await mediaResponse.json();

    if (mediaData.error) {
      console.error("Instagram API error (create media):", mediaData.error);
      throw new Error(`Instagram API: ${mediaData.error.message}`);
    }

    const creationId = mediaData.id;
    console.log(`Media container created: ${creationId}`);

    // For videos, we need to wait for processing
    if (isVideo) {
      console.log("Aguardando processamento do vídeo pelo Instagram...");
      
      let status = "IN_PROGRESS";
      let attempts = 0;
      const maxAttempts = 30; // ~2.5 minutes max wait
      
      while (status === "IN_PROGRESS" && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        const statusUrl = new URL(`https://graph.facebook.com/v18.0/${creationId}`);
        statusUrl.searchParams.set('fields', 'status_code');
        statusUrl.searchParams.set('access_token', accessToken);
        
        const statusResponse = await fetch(statusUrl.toString());
        const statusData = await statusResponse.json();
        
        status = statusData.status_code || "FINISHED";
        attempts++;
        
        console.log(`Video processing status: ${status} (attempt ${attempts})`);
        
        if (statusData.error) {
          throw new Error(`Erro ao verificar status: ${statusData.error.message}`);
        }
      }
      
      if (status === "ERROR") {
        throw new Error("Erro no processamento do vídeo pelo Instagram. Verifique o formato.");
      }
      
      if (attempts >= maxAttempts && status === "IN_PROGRESS") {
        throw new Error("Timeout: Vídeo ainda processando. Tente novamente mais tarde.");
      }
    }

    // Step 2: Publish the media
    const publishUrl = new URL(`https://graph.facebook.com/v18.0/${instagramUserId}/media_publish`);
    publishUrl.searchParams.set('creation_id', creationId);
    publishUrl.searchParams.set('access_token', accessToken);

    console.log("Publishing media...");
    const publishResponse = await fetch(publishUrl.toString(), { method: 'POST' });
    const publishData = await publishResponse.json();

    if (publishData.error) {
      console.error("Instagram API error (publish):", publishData.error);
      throw new Error(`Instagram API: ${publishData.error.message}`);
    }

    const instagramPostId = publishData.id;
    console.log(`Post published successfully! Instagram Post ID: ${instagramPostId}`);

    // Atualizar o post no banco
    const { error: updateError } = await supabase
      .from("posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        instagram_post_id: instagramPostId,
      })
      .eq("id", postId);

    if (updateError) {
      throw new Error(`Erro ao atualizar post: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        postId,
        instagramPostId,
        accountUsername: account.username,
        message: `Post publicado com sucesso no Instagram @${account.username}!`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro em publish-post:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao publicar post" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});