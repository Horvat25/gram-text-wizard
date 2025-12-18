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
    const isCarousel = post.media_type === "carousel";
    
    const caption = `${post.caption}\n\n${(post.hashtags || []).map((h: string) => `#${h}`).join(' ')}`;
    
    let creationId: string;

    if (isCarousel) {
      // Carousel post - multiple images
      const carouselImages = post.carousel_images as string[] || [];
      
      if (carouselImages.length < 2) {
        throw new Error("Carrossel precisa de pelo menos 2 imagens");
      }
      
      console.log(`Creating carousel with ${carouselImages.length} images...`);
      
      // Step 1: Create media containers for each item (without caption)
      const childrenIds: string[] = [];
      
      for (let i = 0; i < carouselImages.length; i++) {
        const imageUrl = carouselImages[i];
        console.log(`Creating media container for image ${i + 1}/${carouselImages.length}...`);
        
        const itemUrl = new URL(`https://graph.facebook.com/v18.0/${instagramUserId}/media`);
        itemUrl.searchParams.set('image_url', imageUrl);
        itemUrl.searchParams.set('is_carousel_item', 'true');
        itemUrl.searchParams.set('access_token', accessToken);
        
        const itemResponse = await fetch(itemUrl.toString(), { method: 'POST' });
        const itemData = await itemResponse.json();
        
        if (itemData.error) {
          console.error(`Error creating carousel item ${i + 1}:`, itemData.error);
          throw new Error(`Instagram API (item ${i + 1}): ${itemData.error.message}`);
        }
        
        childrenIds.push(itemData.id);
        console.log(`Carousel item ${i + 1} created: ${itemData.id}`);
        
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Step 2: Create carousel container with children
      console.log("Creating carousel container...");
      const carouselUrl = new URL(`https://graph.facebook.com/v18.0/${instagramUserId}/media`);
      carouselUrl.searchParams.set('media_type', 'CAROUSEL');
      carouselUrl.searchParams.set('caption', caption);
      carouselUrl.searchParams.set('children', childrenIds.join(','));
      carouselUrl.searchParams.set('access_token', accessToken);
      
      const carouselResponse = await fetch(carouselUrl.toString(), { method: 'POST' });
      const carouselData = await carouselResponse.json();
      
      if (carouselData.error) {
        console.error("Error creating carousel container:", carouselData.error);
        throw new Error(`Instagram API (carousel): ${carouselData.error.message}`);
      }
      
      creationId = carouselData.id;
      console.log(`Carousel container created: ${creationId}`);
      
    } else {
      // Single media post (image or video)
      const mediaUrl = isVideo ? post.video_url : post.image_url;

      if (!mediaUrl) {
        throw new Error(isVideo 
          ? "Um vídeo é necessário para publicar. Gere um vídeo primeiro."
          : "Uma imagem é necessária para publicar no Instagram. Adicione uma imagem ao post."
        );
      }
      
      // Create media container
      const createMediaUrl = new URL(`https://graph.facebook.com/v18.0/${instagramUserId}/media`);
      
      if (isVideo) {
        createMediaUrl.searchParams.set('video_url', mediaUrl);
        createMediaUrl.searchParams.set('caption', caption);
        createMediaUrl.searchParams.set('media_type', post.media_type === "reels" ? 'REELS' : 'VIDEO');
        createMediaUrl.searchParams.set('access_token', accessToken);
        console.log("Creating video media container...");
      } else {
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

      creationId = mediaData.id;
      console.log(`Media container created: ${creationId}`);
    }

    // Wait for media processing (carousels, images, and videos need this)
    console.log("Aguardando processamento da mídia pelo Instagram...");
    
    let status = "IN_PROGRESS";
    let attempts = 0;
    const maxAttempts = isVideo ? 60 : 15; // Videos: 5 min, Others: 1.25 min
    const waitTime = 5000; // 5 seconds between checks
    
    while (status === "IN_PROGRESS" && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      const statusUrl = new URL(`https://graph.facebook.com/v18.0/${creationId}`);
      statusUrl.searchParams.set('fields', 'status_code');
      statusUrl.searchParams.set('access_token', accessToken);
      
      const statusResponse = await fetch(statusUrl.toString());
      const statusData = await statusResponse.json();
      
      status = statusData.status_code || "FINISHED";
      attempts++;
      
      console.log(`Media processing status: ${status} (attempt ${attempts}/${maxAttempts})`);
      
      if (statusData.error) {
        console.error("Status check error:", statusData.error);
        status = "FINISHED";
        break;
      }
      
      if (!statusData.status_code || statusData.status_code === "FINISHED") {
        status = "FINISHED";
        break;
      }
    }
    
    if (status === "ERROR") {
      throw new Error("Erro no processamento da mídia pelo Instagram. Verifique o formato e tamanho.");
    }
    
    if (attempts >= maxAttempts && status === "IN_PROGRESS") {
      throw new Error("Timeout: Mídia ainda processando. Tente novamente em alguns minutos.");
    }
    
    console.log("Media processing complete, publishing...");

    // Publish the media
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
    const mediaTypeLabel = isCarousel ? "Carrossel" : isVideo ? "Vídeo" : "Imagem";
    console.log(`${mediaTypeLabel} published successfully! Instagram Post ID: ${instagramPostId}`);

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
        message: `${mediaTypeLabel} publicado com sucesso no Instagram @${account.username}!`,
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