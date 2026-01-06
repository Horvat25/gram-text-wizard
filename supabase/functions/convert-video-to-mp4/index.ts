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
    const { videoUrl } = await req.json();

    if (!videoUrl) {
      throw new Error("videoUrl é obrigatório");
    }

    console.log("Converting video to MP4:", videoUrl);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if already MP4
    if (videoUrl.toLowerCase().endsWith('.mp4')) {
      console.log("Video is already MP4, no conversion needed");
      return new Response(
        JSON.stringify({ videoUrl, converted: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For WebM videos, use Replicate for conversion
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    
    if (!REPLICATE_API_KEY) {
      console.warn("REPLICATE_API_KEY not set, cannot convert video");
      throw new Error("Serviço de conversão não configurado");
    }

    console.log("Using Replicate for video conversion...");

    // Use a video-to-video model on Replicate that can handle format conversion
    // We'll use the video2video-webm-to-mp4 approach via ffmpeg model
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${REPLICATE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Using a general video processing model
        version: "9ca73752fc3c1b4f70069f8dd8b2a4a8bf38220a9bc0b7ed89ce2d76bb5c7d4e",
        input: {
          video: videoUrl,
          output_format: "mp4",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Replicate API error:", errorText);
      throw new Error("Falha ao iniciar conversão de vídeo");
    }

    const prediction = await response.json();
    console.log("Replicate prediction started:", prediction.id);

    // Poll for completion
    let status = prediction.status;
    let outputUrl = null;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max

    while ((status === "starting" || status === "processing") && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: {
          "Authorization": `Bearer ${REPLICATE_API_KEY}`,
        },
      });
      
      const statusData = await statusResponse.json();
      status = statusData.status;
      attempts++;
      
      console.log(`Conversion status: ${status} (attempt ${attempts}/${maxAttempts})`);
      
      if (status === "succeeded") {
        outputUrl = statusData.output;
        break;
      } else if (status === "failed" || status === "canceled") {
        console.error("Conversion failed:", statusData.error);
        throw new Error(statusData.error || "Conversão falhou");
      }
    }

    if (!outputUrl) {
      throw new Error("Timeout na conversão de vídeo");
    }

    // If output is an array, get the first item
    if (Array.isArray(outputUrl)) {
      outputUrl = outputUrl[0];
    }

    console.log("Video converted successfully:", outputUrl);

    // Download the converted video and re-upload to our storage
    const convertedResponse = await fetch(outputUrl);
    if (!convertedResponse.ok) {
      throw new Error("Falha ao baixar vídeo convertido");
    }

    const videoBlob = await convertedResponse.blob();
    const videoArrayBuffer = await videoBlob.arrayBuffer();
    const videoBytes = new Uint8Array(videoArrayBuffer);

    const timestamp = Date.now();
    const randomId = crypto.randomUUID().split("-")[0];
    const fileName = `cinematic-converted-${timestamp}-${randomId}.mp4`;

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

    console.log("Converted video uploaded:", publicUrlData.publicUrl);

    return new Response(
      JSON.stringify({ 
        videoUrl: publicUrlData.publicUrl, 
        converted: true,
        originalUrl: videoUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error converting video:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao converter vídeo" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
