import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, format = "square", customStyle, model = "dalle3" } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      throw new Error("Prompt é obrigatório");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let imageUrl: string;
    let modelUsed: string;
    let costEstimate: number;

    // Build style instructions
    const styleInstructions = customStyle || "Profissional, alta qualidade, cores vibrantes, composição equilibrada.";

    // Determine size based on format
    const size = format === "portrait" ? "1024x1792" : "1024x1024";

    // Try DALL-E 3 first if selected
    if (model === "dalle3") {
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      
      if (OPENAI_API_KEY) {
        console.log("Gerando imagem com DALL-E 3...");
        
        const optimizedPrompt = `${prompt}. ${styleInstructions}. High quality, suitable for Instagram, no text or words in the image.`;

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
            const errorData = await dalleResponse.text();
            console.error("DALL-E 3 error:", dalleResponse.status, errorData);
            throw new Error(`DALL-E 3 error: ${dalleResponse.status}`);
          }

          const dalleData = await dalleResponse.json();
          const base64Image = dalleData.data?.[0]?.b64_json;

          if (!base64Image) {
            throw new Error("DALL-E 3 não retornou imagem");
          }

          // Upload to storage
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
            throw new Error(`Erro ao salvar imagem: ${uploadError.message}`);
          }

          const { data: publicUrlData } = supabase.storage
            .from("post-images")
            .getPublicUrl(fileName);

          imageUrl = publicUrlData.publicUrl;
          modelUsed = "openai/dall-e-3";
          costEstimate = 0.08; // ~$0.08 per HD image

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
          console.error("Fallback para Gemini devido a erro DALL-E:", dalleError);
        }
      } else {
        console.log("OPENAI_API_KEY não configurada, usando Gemini como fallback");
      }
    }

    // Fallback to Gemini
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("Nenhuma API de imagem configurada");
    }

    console.log("Gerando imagem com Gemini...");

    const optimizedPrompt = `${prompt}

Estilo: ${styleInstructions}
Formato: ${format === "portrait" ? "Vertical (4:5 ratio)" : "Quadrado (1:1 ratio)"}.
Qualidade: Ultra alta resolução, adequado para Instagram feed.
Sem texto: Não incluir textos ou palavras na imagem.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: optimizedPrompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erro na API Lovable:", response.status, errorText);
      
      if (response.status === 429) {
        throw new Error("Limite de requisições excedido. Aguarde alguns minutos.");
      }
      if (response.status === 402) {
        throw new Error("Créditos insuficientes. Adicione créditos no workspace.");
      }
      
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data = await response.json();
    const base64ImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!base64ImageUrl) {
      throw new Error("Imagem não foi gerada pela API");
    }

    console.log("Imagem Gemini gerada, fazendo upload para Storage...");

    const base64Match = base64ImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error("Formato de imagem inválido");
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
      throw new Error(`Erro ao salvar imagem: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("post-images")
      .getPublicUrl(fileName);

    imageUrl = publicUrlData.publicUrl;
    modelUsed = "google/gemini-flash";
    costEstimate = 0;

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
