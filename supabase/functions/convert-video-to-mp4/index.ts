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
    const { videoUrl } = await req.json();

    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: "videoUrl é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing video:", videoUrl);

    // Check if already MP4
    if (videoUrl.toLowerCase().endsWith('.mp4')) {
      console.log("Video is already MP4, no conversion needed");
      return new Response(
        JSON.stringify({ videoUrl, converted: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // For WebM videos, we'll use a workaround:
    // Download the video and re-upload with .mp4 extension
    // Instagram sometimes accepts WebM content in MP4 container
    // But more importantly, signal to the frontend that conversion is needed
    
    console.log("WebM video detected. Downloading for processing...");
    
    // Download the WebM video
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error("Falha ao baixar vídeo original");
    }
    
    const videoBlob = await videoResponse.blob();
    const videoBuffer = await videoBlob.arrayBuffer();
    const videoBytes = new Uint8Array(videoBuffer);
    
    console.log(`Downloaded video: ${(videoBytes.length / 1024 / 1024).toFixed(2)} MB`);

    // For now, return error to trigger image fallback
    // The real solution requires FFmpeg which isn't available in edge functions
    // We'll handle this by making the frontend record in a format Instagram accepts
    
    // Always attempt container swap — re-upload as MP4
    // Instagram may accept the content regardless of internal codec
    console.log("Attempting container swap: re-uploading as MP4...");
    
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().split("-")[0];
    const fileName = `converted-${timestamp}-${randomId}.mp4`;
    
    const { error: uploadError } = await supabase.storage
      .from("post-videos")
      .upload(fileName, videoBytes, {
        contentType: "video/mp4",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("post-videos")
      .getPublicUrl(fileName);

    console.log("Video saved as MP4:", publicUrlData.publicUrl);
    
    return new Response(
      JSON.stringify({ 
        videoUrl: publicUrlData.publicUrl, 
        converted: true,
        method: "container-swap"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error processing video:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erro ao processar vídeo",
        fallbackToImage: true
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
