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
    const { query, orientation = "portrait", per_page = 5, workspace_id } = await req.json();

    if (!query || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "query e workspace_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pexelsApiKey = Deno.env.get("PEXELS_API_KEY");
    if (!pexelsApiKey) {
      return new Response(
        JSON.stringify({ error: "PEXELS_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Search for videos on Pexels
    const searchUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${per_page}&size=medium`;
    console.log(`[download-stock-video] Searching Pexels: "${query}" (${orientation})`);

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: pexelsApiKey },
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error("[download-stock-video] Pexels search failed:", errText);
      return new Response(
        JSON.stringify({ error: "Falha na busca de vídeos no Pexels" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchData = await searchRes.json();
    const videos = searchData.videos || [];

    if (videos.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum vídeo encontrado para essa busca", query }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pick the best video: prefer HD quality, portrait, and short duration (< 30s)
    let bestVideo = null;
    let bestFile = null;

    for (const video of videos) {
      // Filter for videos under 60 seconds
      if (video.duration > 60) continue;

      // Find best video file: prefer HD quality
      const files = video.video_files || [];
      const hdFile = files.find((f: any) => 
        f.quality === "hd" && f.height >= 720
      );
      const sdFile = files.find((f: any) => f.quality === "sd");
      const selectedFile = hdFile || sdFile || files[0];

      if (selectedFile) {
        bestVideo = video;
        bestFile = selectedFile;
        break;
      }
    }

    if (!bestVideo || !bestFile) {
      return new Response(
        JSON.stringify({ error: "Nenhum vídeo adequado encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[download-stock-video] Selected: ${bestVideo.id} (${bestVideo.duration}s, ${bestFile.width}x${bestFile.height})`);

    // Download the video
    const videoRes = await fetch(bestFile.link);
    if (!videoRes.ok) {
      return new Response(
        JSON.stringify({ error: "Falha ao baixar vídeo do Pexels" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const videoBlob = await videoRes.arrayBuffer();
    const videoBytes = new Uint8Array(videoBlob);

    // Upload to Supabase Storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `stock-${bestVideo.id}-${Date.now()}.mp4`;
    const filePath = `${workspace_id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("post-videos")
      .upload(filePath, videoBytes, {
        contentType: "video/mp4",
        upsert: false,
      });

    if (uploadError) {
      console.error("[download-stock-video] Upload failed:", uploadError);
      return new Response(
        JSON.stringify({ error: "Falha ao salvar vídeo no storage" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: publicUrl } = supabase.storage
      .from("post-videos")
      .getPublicUrl(filePath);

    console.log(`[download-stock-video] ✅ Uploaded: ${publicUrl.publicUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        video_url: publicUrl.publicUrl,
        source: {
          platform: "pexels",
          video_id: bestVideo.id,
          duration: bestVideo.duration,
          width: bestFile.width,
          height: bestFile.height,
          photographer: bestVideo.user?.name || "Pexels",
          pexels_url: bestVideo.url,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[download-stock-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
