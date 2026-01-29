import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pollinations.ai - 100% FREE, no API key needed, uses FLUX model
async function generateWithPollinations(prompt: string, format: string): Promise<{ imageBytes: Uint8Array; contentType: string }> {
  const width = format === "portrait" ? 768 : 1024;
  const height = format === "portrait" ? 1024 : 1024;
  
  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=flux&nologo=true&enhance=true`;
  
  console.log("Gerando imagem com Pollinations.ai (GRÁTIS)...");
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Pollinations error: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const imageBytes = new Uint8Array(arrayBuffer);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  
  console.log("Imagem Pollinations gerada com sucesso!");
  return { imageBytes, contentType };
}

// Gemini fallback (uses Lovable AI credits)
async function generateWithGemini(prompt: string, format: string, LOVABLE_API_KEY: string): Promise<{ base64ImageUrl: string }> {
  console.log("Fallback: Gerando imagem com Gemini...");
  
  const maxAttempts = 3;
  let base64ImageUrl: string | undefined;
  let lastError = "";
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Tentativa ${attempt}/${maxAttempts} de gerar imagem com Gemini...`);
    
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image-preview",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Tentativa ${attempt} - Erro na API Lovable:`, response.status, errorText);
        
        if (response.status === 429) {
          lastError = "Rate limit exceeded";
          const waitTime = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }
        if (response.status === 402) {
          throw new Error("Créditos insuficientes. Adicione créditos no workspace.");
        }
        
        lastError = `API error: ${response.status}`;
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      const data = await response.json();
      base64ImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url 
        || data.choices?.[0]?.message?.content?.images?.[0]?.url
        || data.images?.[0]?.url;

      if (base64ImageUrl && base64ImageUrl.startsWith('data:image/')) {
        console.log(`Tentativa ${attempt} - Imagem Gemini gerada!`);
        break;
      } else {
        lastError = "Unexpected response format";
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    } catch (fetchError: any) {
      console.error(`Tentativa ${attempt} - Erro:`, fetchError);
      lastError = fetchError.message || "Connection error";
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  if (!base64ImageUrl) {
    throw new Error(`Gemini failed after ${maxAttempts} attempts: ${lastError}`);
  }

  return { base64ImageUrl };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, format = "square", customStyle, model = "pollinations", brandName } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      throw new Error("Prompt é obrigatório");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build optimized prompt
    const brandingName = brandName || "NeuralUpdate";
    const styleInstructions = customStyle 
      ? `${customStyle}. Professional quality, vibrant colors.` 
      : `Professional, high quality, vibrant colors, balanced composition. Modern tech aesthetic.`;
    
    const optimizedPrompt = `${prompt}. ${styleInstructions}. Ultra high resolution, suitable for Instagram, no text or words in the image.`;

    let imageUrl: string;
    let modelUsed: string;
    let costEstimate: number;

    // Try Pollinations first (FREE!) unless explicitly requesting other models
    if (model === "pollinations" || model === "gemini" || model === "auto") {
      try {
        const { imageBytes, contentType } = await generateWithPollinations(optimizedPrompt, format);
        
        // Upload to storage
        const timestamp = Date.now();
        const randomId = crypto.randomUUID().split("-")[0];
        const extension = contentType.includes("png") ? "png" : "jpg";
        const fileName = `generated/${timestamp}-${randomId}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("post-images")
          .upload(fileName, imageBytes, {
            contentType,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Upload error: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from("post-images")
          .getPublicUrl(fileName);

        imageUrl = publicUrlData.publicUrl;
        modelUsed = "pollinations/flux";
        costEstimate = 0; // FREE!

        console.log("✅ Imagem salva (GRÁTIS):", imageUrl);

        return new Response(
          JSON.stringify({
            imageUrl,
            format,
            modelUsed,
            costEstimate,
            supportsText: false,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (pollinationsError) {
        console.warn("Pollinations falhou, tentando Gemini como fallback:", pollinationsError);
      }
    }

    // DALL-E 3 (if explicitly requested and API key exists)
    if (model === "dalle3") {
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      
      if (OPENAI_API_KEY) {
        console.log("Gerando imagem com DALL-E 3...");
        const size = format === "portrait" ? "1024x1792" : "1024x1024";

        try {
          const dalleResponse = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "dall-e-3",
              prompt: optimizedPrompt,
              n: 1,
              size: size,
              quality: "hd",
              response_format: "b64_json",
            }),
          });

          if (!dalleResponse.ok) {
            throw new Error(`DALL-E 3 error: ${dalleResponse.status}`);
          }

          const dalleData = await dalleResponse.json();
          const base64Image = dalleData.data?.[0]?.b64_json;

          if (!base64Image) {
            throw new Error("DALL-E 3 no image returned");
          }

          const imageBytes = decode(base64Image);
          const timestamp = Date.now();
          const randomId = crypto.randomUUID().split("-")[0];
          const fileName = `generated/${timestamp}-${randomId}.png`;

          const { error: uploadError } = await supabase.storage
            .from("post-images")
            .upload(fileName, imageBytes, {
              contentType: "image/png",
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`Upload error: ${uploadError.message}`);
          }

          const { data: publicUrlData } = supabase.storage
            .from("post-images")
            .getPublicUrl(fileName);

          imageUrl = publicUrlData.publicUrl;
          modelUsed = "openai/dall-e-3";
          costEstimate = 0.08;

          console.log("Imagem DALL-E 3 salva:", imageUrl);

          return new Response(
            JSON.stringify({
              imageUrl,
              format,
              modelUsed,
              costEstimate,
              supportsText: true,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        } catch (dalleError) {
          console.error("DALL-E 3 failed:", dalleError);
        }
      }
    }

    // Gemini fallback
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("No image generation API available");
    }

    const { base64ImageUrl } = await generateWithGemini(optimizedPrompt, format, LOVABLE_API_KEY);

    const base64Match = base64ImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error("Invalid image format");
    }

    const imageType = base64Match[1];
    const base64Data = base64Match[2];
    const imageBytes = decode(base64Data);

    const timestamp = Date.now();
    const randomId = crypto.randomUUID().split("-")[0];
    const fileName = `generated/${timestamp}-${randomId}.${imageType}`;

    const { error: uploadError } = await supabase.storage
      .from("post-images")
      .upload(fileName, imageBytes, {
        contentType: `image/${imageType}`,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("post-images")
      .getPublicUrl(fileName);

    imageUrl = publicUrlData.publicUrl;
    modelUsed = "google/gemini-flash";
    costEstimate = 0.02;

    console.log("Imagem Gemini salva:", imageUrl);

    return new Response(
      JSON.stringify({
        imageUrl,
        format,
        modelUsed,
        costEstimate,
        supportsText: false,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Erro em generate-image:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar imagem" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
