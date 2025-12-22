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

    const text = await req.text();
    if (!text || text.trim() === "") {
      throw new Error("Request body is empty");
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

        const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
        console.log("Downloading video from:", videoUrl);
        
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
          throw new Error("Failed to download video");
        }

        const videoBlob = await videoResponse.blob();
        const videoArrayBuffer = await videoBlob.arrayBuffer();
        const videoBytes = new Uint8Array(videoArrayBuffer);

        const timestamp = Date.now();
        const randomId = crypto.randomUUID().split("-")[0];
        const fileName = `narrative-${timestamp}-${randomId}.mp4`;

        const { error: uploadError } = await supabase.storage
          .from("post-videos")
          .upload(fileName, videoBytes, {
            contentType: "video/mp4",
            upsert: false,
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          return new Response(
            JSON.stringify({
              ...prediction,
              storedVideoUrl: videoUrl,
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

    // Generation request - Image to Video
    const { imageUrl, prompt, duration = 5 } = body;

    if (!imageUrl) {
      throw new Error("imageUrl é obrigatório para geração de vídeo narrativo");
    }

    console.log("Starting image-to-video generation");
    console.log("Image URL:", imageUrl);
    console.log("Prompt:", prompt);
    console.log("Duration:", duration, "seconds");

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Use Wan 2.6 I2V - economic and available image-to-video model
    const prediction = await replicate.predictions.create({
      model: "wan-video/wan-2.6-i2v",
      input: {
        image: imageUrl,
        prompt: prompt || "Subtle camera movement with gentle zoom and pan",
        max_area: "832x480",
        duration: duration <= 5 ? "5s" : "10s",
        fast_mode: "Enabled",
        frame_rate: 16,
        sample_steps: 30,
        sample_guide_scale: 5,
        sample_shift: 8,
      },
    });

    console.log("Prediction created:", prediction.id);
    console.log("Status:", prediction.status);

    return new Response(
      JSON.stringify({
        predictionId: prediction.id,
        status: prediction.status,
        modelUsed: "wan-2.6-i2v",
        costEstimate: 0.03, // Economic model cost
        type: "image-to-video",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in generate-narrative-video:", error);
    
    let errorMessage = error.message || "Erro ao gerar vídeo narrativo";
    let statusCode = 500;
    
    if (error.message?.includes("402") || error.message?.includes("Payment Required")) {
      errorMessage = "Limite gratuito do Replicate atingido. Configure billing em replicate.com/account/billing";
      statusCode = 402;
    } else if (error.message?.includes("429")) {
      errorMessage = "Muitas requisições. Aguarde alguns minutos.";
      statusCode = 429;
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: statusCode,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
