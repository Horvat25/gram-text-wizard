import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper: resize image for Instagram compatibility
async function resizeForInstagram(supabaseUrl: string, supabaseKey: string, imageUrl: string, mediaType: string): Promise<string> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/resize-image-for-instagram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ imageUrl, mediaType }),
    });
    const data = await response.json();
    if (data.url && !data.skipped) {
      console.log(`[resize] ✅ Resized: ${mediaType}`);
      return data.url;
    }
    return imageUrl;
  } catch (e) {
    console.warn('[resize] Failed, using original:', e);
    return imageUrl;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Hoist postId/supabase so catch can update post even after req.body is consumed
  let postId: string | undefined;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    postId = body.postId;
    const accountId = body.accountId;

    if (!postId) {
      throw new Error("postId é obrigatório");
    }

    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (fetchError) throw new Error(`Erro ao buscar post: ${fetchError.message}`);
    if (!post) throw new Error("Post não encontrado");

    let accountQuery = supabase.from("instagram_accounts").select("*");
    if (accountId) accountQuery = accountQuery.eq("id", accountId);
    const { data: accounts, error: accountError } = await accountQuery.limit(1);

    if (accountError || !accounts || accounts.length === 0) {
      console.log("Nenhuma conta Instagram conectada, simulando publicação...");
      
      const { error: updateError } = await supabase
        .from("posts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          likes_count: 0,
          comments_count: 0,
          saves_count: 0,
          reach: 0,
        })
        .eq("id", postId);

      if (updateError) throw new Error(`Erro ao atualizar post: ${updateError.message}`);

      return new Response(
        JSON.stringify({
          success: true, postId, simulated: true,
          message: "Post publicado (simulação - nenhuma conta conectada)",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const account = accounts[0];
    const accessToken = account.access_token;
    const instagramUserId = account.instagram_user_id;

    console.log(`Publicando no Instagram para conta: ${account.username || instagramUserId}`);

    const isReels = post.media_type === "reels" || post.media_type === "reel";
    const isVideo = post.media_type === "video" || isReels;
    const isCarousel = post.media_type === "carousel";

    if (isReels && !post.video_url) {
      throw new Error("Este Reels ainda não foi renderizado (video_url ausente). Gere o vídeo antes de publicar.");
    }
    
    const caption = `${post.caption}\n\n${(post.hashtags || []).map((h: string) => `#${h}`).join(' ')}`;
    let creationId: string;

    if (isCarousel) {
      let carouselImages = [...(post.carousel_images as string[] || [])];
      if (carouselImages.length < 2) throw new Error("Carrossel precisa de pelo menos 2 imagens");
      
      // Resize carousel images
      console.log(`📐 Resizing ${carouselImages.length} carousel images...`);
      for (let i = 0; i < carouselImages.length; i++) {
        carouselImages[i] = await resizeForInstagram(supabaseUrl, supabaseKey, carouselImages[i], 'carousel');
      }
      
      console.log(`Creating carousel with ${carouselImages.length} images...`);
      const childrenIds: string[] = [];
      
      for (let i = 0; i < carouselImages.length; i++) {
        const itemUrl = new URL(`https://graph.facebook.com/v18.0/${instagramUserId}/media`);
        itemUrl.searchParams.set('image_url', carouselImages[i]);
        itemUrl.searchParams.set('is_carousel_item', 'true');
        itemUrl.searchParams.set('access_token', accessToken);
        
        const itemResponse = await fetch(itemUrl.toString(), { method: 'POST' });
        const itemData = await itemResponse.json();
        if (itemData.error) throw new Error(`Instagram API (item ${i + 1}): ${itemData.error.message}`);
        childrenIds.push(itemData.id);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      const carouselUrl = new URL(`https://graph.facebook.com/v18.0/${instagramUserId}/media`);
      carouselUrl.searchParams.set('media_type', 'CAROUSEL');
      carouselUrl.searchParams.set('caption', caption);
      carouselUrl.searchParams.set('children', childrenIds.join(','));
      carouselUrl.searchParams.set('access_token', accessToken);
      
      const carouselResponse = await fetch(carouselUrl.toString(), { method: 'POST' });
      const carouselData = await carouselResponse.json();
      if (carouselData.error) throw new Error(`Instagram API (carousel): ${carouselData.error.message}`);
      creationId = carouselData.id;
    } else {
      let mediaUrl = isVideo ? post.video_url : post.image_url;
      let actuallyIsVideo = isVideo;

      // Resize image for Instagram if not video
      if (!isVideo && mediaUrl) {
        console.log(`📐 Resizing image for Instagram: ${post.media_type}`);
        mediaUrl = await resizeForInstagram(supabaseUrl, supabaseKey, mediaUrl, post.media_type || 'image');
      }

      if (isVideo && mediaUrl) {
        const lowerUrl = mediaUrl.toLowerCase();
        const isActuallyImage = lowerUrl.endsWith('.png') || lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg') || lowerUrl.endsWith('.gif');
        const isWebM = lowerUrl.endsWith('.webm');
        
        if (isActuallyImage) {
          console.log("video_url contains an image file, switching to image post...");
          actuallyIsVideo = false;
        } else if (isWebM) {
          console.log("WebM detected, converting to MP4...");
          try {
            const convertResponse = await fetch(`${supabaseUrl}/functions/v1/convert-video-to-mp4`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
              body: JSON.stringify({ videoUrl: mediaUrl }),
            });
            const convertData = await convertResponse.json();
            if (convertData.videoUrl && !convertData.error) {
              mediaUrl = convertData.videoUrl;
            } else if (post.image_url) {
              actuallyIsVideo = false;
              mediaUrl = post.image_url;
            } else {
              throw new Error("Falha na conversão do vídeo WebM para MP4.");
            }
          } catch (convError: any) {
            if (post.image_url) { actuallyIsVideo = false; mediaUrl = post.image_url; }
            else throw new Error(`Erro na conversão do vídeo: ${convError.message}`);
          }
        }
      }

      if (actuallyIsVideo && !mediaUrl && post.image_url) {
        actuallyIsVideo = false;
        mediaUrl = post.image_url;
      }

      if (!mediaUrl) {
        throw new Error(actuallyIsVideo 
          ? "Um vídeo MP4 é necessário para publicar como Reels."
          : "Uma imagem é necessária para publicar no Instagram."
        );
      }
      
      const createMediaUrl = new URL(`https://graph.facebook.com/v18.0/${instagramUserId}/media`);
      if (actuallyIsVideo) {
        createMediaUrl.searchParams.set('video_url', mediaUrl);
        createMediaUrl.searchParams.set('caption', caption);
        createMediaUrl.searchParams.set('media_type', post.media_type === "reels" ? 'REELS' : 'VIDEO');
      } else {
        createMediaUrl.searchParams.set('image_url', mediaUrl);
        createMediaUrl.searchParams.set('caption', caption);
      }
      createMediaUrl.searchParams.set('access_token', accessToken);

      const mediaResponse = await fetch(createMediaUrl.toString(), { method: 'POST' });
      const mediaData = await mediaResponse.json();
      if (mediaData.error) throw new Error(`Instagram API: ${mediaData.error.message}`);
      creationId = mediaData.id;
    }

    // Wait for media processing
    console.log("Aguardando processamento da mídia...");
    let status = "IN_PROGRESS";
    let attempts = 0;
    const maxAttempts = isVideo ? 60 : 15;
    
    while (status === "IN_PROGRESS" && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const statusUrl = new URL(`https://graph.facebook.com/v18.0/${creationId}`);
      statusUrl.searchParams.set('fields', 'status_code');
      statusUrl.searchParams.set('access_token', accessToken);
      const statusResponse = await fetch(statusUrl.toString());
      const statusData = await statusResponse.json();
      status = statusData.status_code || "FINISHED";
      attempts++;
      if (statusData.error || !statusData.status_code || statusData.status_code === "FINISHED") { status = "FINISHED"; break; }
    }
    
    if (status === "ERROR") throw new Error("Erro no processamento da mídia pelo Instagram");
    if (attempts >= maxAttempts && status === "IN_PROGRESS") throw new Error("Timeout: Mídia ainda processando.");

    // Publish
    const publishUrl = new URL(`https://graph.facebook.com/v18.0/${instagramUserId}/media_publish`);
    publishUrl.searchParams.set('creation_id', creationId);
    publishUrl.searchParams.set('access_token', accessToken);

    const publishResponse = await fetch(publishUrl.toString(), { method: 'POST' });
    const publishData = await publishResponse.json();
    if (publishData.error) throw new Error(`Instagram API: ${publishData.error.message}`);

    const instagramPostId = publishData.id;
    const mediaTypeLabel = isCarousel ? "Carrossel" : isVideo ? "Vídeo" : "Imagem";

    // Update — no fake metrics, sync will fill real data
    await supabase
      .from("posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        instagram_post_id: instagramPostId,
      })
      .eq("id", postId);

    return new Response(
      JSON.stringify({
        success: true, postId, instagramPostId,
        accountUsername: account.username,
        message: `${mediaTypeLabel} publicado com sucesso no Instagram @${account.username}!`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro em publish-post:", error);
    // 🚨 Garante que o erro fique gravado no banco — antes vários carousels falhavam silenciosamente
    try {
      const body = await req.clone().json().catch(() => ({}));
      const failedPostId = body?.postId;
      if (failedPostId) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseKey);
        await sb.from("posts").update({
          status: "failed",
          error_message: (error?.message || "Erro desconhecido em publish-post").substring(0, 500),
        }).eq("id", failedPostId);
      }
    } catch (logErr) {
      console.error("Falha ao gravar error_message no post:", logErr);
    }
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao publicar post" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
