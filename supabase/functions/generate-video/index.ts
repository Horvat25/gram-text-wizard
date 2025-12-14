import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Replicate from "https://esm.sh/replicate@0.25.2";
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
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    if (!REPLICATE_API_KEY) {
      throw new Error("REPLICATE_API_KEY não configurada");
    }

    // Handle empty body gracefully
    const text = await req.text();
    if (!text || text.trim() === "") {
      throw new Error("Request body is empty. Please provide prompt or predictionId.");
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON in request body");
    }

    // If it's a status check request
    if (body.predictionId) {
      console.log("Checking status for prediction:", body.predictionId);
      const replicate = new Replicate({ auth: REPLICATE_API_KEY });
      const prediction = await replicate.predictions.get(body.predictionId);
      console.log("Status check response:", prediction.status);

      // If video is ready, download and upload to our storage
      if (prediction.status === "succeeded" && prediction.output) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Download the video
        const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
        console.log("Downloading video from:", videoUrl);
        
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
          throw new Error("Failed to download video");
        }

        const videoBlob = await videoResponse.blob();
        const videoArrayBuffer = await videoBlob.arrayBuffer();
        const videoBytes = new Uint8Array(videoArrayBuffer);

        // Upload to Supabase Storage (dedicated video bucket)
        const timestamp = Date.now();
        const randomId = crypto.randomUUID().split("-")[0];
        const fileName = `${timestamp}-${randomId}.mp4`;

        const { error: uploadError } = await supabase.storage
          .from("post-videos")
          .upload(fileName, videoBytes, {
            contentType: "video/mp4",
            upsert: false,
          });

        if (uploadError) {
          console.error("Upload error (falling back to Replicate URL):", uploadError);
          // If storage rejects the mime type or any other error happens,
          // we still return the original Replicate URL so the client can use the video.
          return new Response(
            JSON.stringify({
              ...prediction,
              storedVideoUrl: Array.isArray(prediction.output)
                ? prediction.output[0]
                : prediction.output,
              storageUploadError: uploadError.message,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const { data: publicUrlData } = supabase.storage
          .from("post-videos")
          .getPublicUrl(fileName);

        console.log("Video saved to storage:", publicUrlData.publicUrl);

        return new Response(
          JSON.stringify({
            ...prediction,
            storedVideoUrl: publicUrlData.publicUrl,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify(prediction), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generation request
    const { prompt, duration = 5, aspectRatio = "16:9" } = body;

    if (!prompt) {
      throw new Error("Prompt é obrigatório");
    }

    // Neural Update branding for videos
    const brandingStyle = `Estilo Neural Update: visual futurista tech com tons de roxo (#8B5CF6), azul elétrico (#06B6D4) e gradientes neon. 
Estética clean, minimalista com elementos de IA/tecnologia. Aspecto profissional e inovador.`;

    const optimizedPrompt = `${prompt}. ${brandingStyle}`;

    console.log("Starting video generation with economic model via Replicate");
    console.log("Prompt:", optimizedPrompt);
    console.log("Duration:", duration, "seconds");
    console.log("Aspect ratio:", aspectRatio);

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Use Minimax video-01 - more economic model
    // Alternative economic models: "minimax/video-01" or "luma/ray"
    const prediction = await replicate.predictions.create({
      model: "minimax/video-01",
      input: {
        prompt: optimizedPrompt,
        prompt_optimizer: true,
      },
    });

    console.log("Prediction created:", prediction.id);
    console.log("Status:", prediction.status);

    return new Response(
      JSON.stringify({
        predictionId: prediction.id,
        status: prediction.status,
        modelUsed: "minimax/video-01",
        costEstimate: 0.05, // Economic model cost
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in generate-video:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar vídeo" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
