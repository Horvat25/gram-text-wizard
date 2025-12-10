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

    const body = await req.json();

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

        // Upload to Supabase Storage
        const timestamp = Date.now();
        const randomId = crypto.randomUUID().split("-")[0];
        const fileName = `videos/${timestamp}-${randomId}.mp4`;

        const { error: uploadError } = await supabase.storage
          .from("post-images")
          .upload(fileName, videoBytes, {
            contentType: "video/mp4",
            upsert: false,
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          throw new Error(`Erro ao salvar vídeo: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from("post-images")
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

    console.log("Starting video generation with Runway Gen-3 via Replicate");
    console.log("Prompt:", prompt);
    console.log("Duration:", duration, "seconds");
    console.log("Aspect ratio:", aspectRatio);

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Use Runway Gen-3 Alpha Turbo via Replicate
    const prediction = await replicate.predictions.create({
      model: "runwayml/gen3a_turbo",
      input: {
        prompt: prompt,
        duration: duration,
        aspect_ratio: aspectRatio,
      },
    });

    console.log("Prediction created:", prediction.id);
    console.log("Status:", prediction.status);

    return new Response(
      JSON.stringify({
        predictionId: prediction.id,
        status: prediction.status,
        modelUsed: "runway/gen-3-turbo",
        costEstimate: duration <= 5 ? 0.25 : 0.50,
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
