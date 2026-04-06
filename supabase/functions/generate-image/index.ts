import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Gemini 2.5 Flash Image - Melhor custo-benefício (~$0.02/imagem = ~R$0.10)
// Alta qualidade, rápido, suporta instruções complexas
async function generateWithGemini(prompt: string, format: string, LOVABLE_API_KEY: string): Promise<{ base64ImageUrl: string }> {
  console.log("Gerando imagem com Gemini 2.5 Flash Image...");
  
  const currentYear = new Date().getFullYear(); // 2026
  const aspectRatio = format === "portrait" ? "9:16 vertical" : format === "landscape" ? "16:9 horizontal" : "1:1 quadrado";
  
  // CRITICAL: Enhanced prompt for better quality and NO TEXT in image
  // The key insight is that AI image generators produce UGLY TEXT - so we avoid text entirely
  const enhancedPrompt = `${prompt}

## INSTRUÇÕES CRÍTICAS DE QUALIDADE:
1. ESTILO VISUAL: Fotorrealista OU ilustração vetorial moderna e limpa. Escolha UM estilo consistente.
2. COMPOSIÇÃO: Regra dos terços, ponto focal claro, espaço negativo elegante.
3. CORES: Paleta de cores harmoniosa e vibrante, bom contraste, não saturado demais.
4. ILUMINAÇÃO: Iluminação profissional de estúdio ou golden hour natural.
5. PROPORÇÃO: ${aspectRatio}
6. QUALIDADE: Ultra alta definição, nítido, sem ruído, pronto para Instagram.

## REGRA ABSOLUTA - TEXTO:
⛔ NÃO INCLUA NENHUM TEXTO NA IMAGEM ⛔
- Sem palavras, letras, números ou símbolos escritos
- Sem logotipos, marcas d'água ou legendas
- Sem placas, banners ou cartazes com texto
- A imagem deve ser 100% visual, sem elementos tipográficos
- Se precisar indicar conceito, use ÍCONES ou SÍMBOLOS visuais, nunca texto

## CONTEXTO:
- Ano atual: ${currentYear}
- Mercado: Brasil
- Uso: Post profissional para Instagram`;
  
  const maxAttempts = 3;
  let base64ImageUrl: string | undefined;
  let lastError = "";
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Tentativa ${attempt}/${maxAttempts} de gerar imagem...`);
    
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: enhancedPrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Tentativa ${attempt} - Erro na API:`, response.status, errorText);
        
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
        console.log(`✅ Tentativa ${attempt} - Imagem Gemini gerada com sucesso!`);
        break;
      } else {
        lastError = "Unexpected response format";
        console.log("Resposta inesperada:", JSON.stringify(data).substring(0, 500));
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

// DALL-E 3 - Premium option (~$0.08/imagem = ~R$0.40)
// Melhor qualidade, suporta texto na imagem
async function generateWithDallE3(prompt: string, format: string, OPENAI_API_KEY: string): Promise<{ imageBytes: Uint8Array }> {
  console.log("Gerando imagem com DALL-E 3 (Premium)...");
  const size = format === "portrait" ? "1024x1792" : "1024x1024";

  const dalleResponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: `${prompt}. Ultra high quality, professional, vibrant colors, no watermarks. CRITICAL: DO NOT include any text, words, letters or numbers in the image. The image must be purely visual with no typography.`,
      n: 1,
      size: size,
      quality: "hd",
      response_format: "b64_json",
    }),
  });

  if (!dalleResponse.ok) {
    const error = await dalleResponse.text();
    throw new Error(`DALL-E 3 error: ${dalleResponse.status} - ${error}`);
  }

  const dalleData = await dalleResponse.json();
  const base64Image = dalleData.data?.[0]?.b64_json;

  if (!base64Image) {
    throw new Error("DALL-E 3 no image returned");
  }

  const imageBytes = decode(base64Image);
  console.log("✅ Imagem DALL-E 3 gerada!");
  return { imageBytes };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      prompt, 
      format = "square", 
      customStyle, 
      model = "auto", 
      brandName,
      applyWatermark = true // Default: sempre aplicar watermark
    } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      throw new Error("Prompt é obrigatório");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build optimized prompt - NO TEXT IN IMAGE
    const currentYear = new Date().getFullYear(); // 2026
    const styleInstructions = customStyle 
      ? `${customStyle}. Qualidade profissional, cores vibrantes.` 
      : `Profissional, alta qualidade, cores vibrantes, composição equilibrada. Estética moderna.`;
    
    const optimizedPrompt = `${prompt}. ${styleInstructions}. Contexto: ano ${currentYear}. ⛔ NÃO INCLUA NENHUM TEXTO, PALAVRA, LETRA OU NÚMERO NA IMAGEM. A imagem deve ser 100% visual sem elementos tipográficos. Textos serão adicionados programaticamente depois.`;

    let imageUrl: string;
    let modelUsed: string;
    let costEstimate: number;

    // DALL-E 3 if explicitly requested and API key exists
    if (model === "dalle3") {
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      
      if (OPENAI_API_KEY) {
        try {
          const { imageBytes } = await generateWithDallE3(optimizedPrompt, format, OPENAI_API_KEY);
          
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
          
          // Apply watermark if requested
          if (applyWatermark && imageUrl) {
            console.log("[generate-image] Applying watermark to DALL-E image...");
            try {
              const watermarkResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  imageUrl: imageUrl,
                  watermarkText: "Neural Update"
                }),
              });
              
              if (watermarkResponse.ok) {
                const watermarkResult = await watermarkResponse.json();
                if (watermarkResult.publicUrl) {
                  imageUrl = watermarkResult.publicUrl;
                  console.log("[generate-image] ✅ Watermark applied to DALL-E image");
                }
              }
            } catch (e) {
              console.warn("[generate-image] Watermark failed, using original:", e);
            }
          }

          return new Response(
            JSON.stringify({
              imageUrl,
              format,
              modelUsed,
              costEstimate,
              supportsText: true,
              hasWatermark: applyWatermark,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (dalleError) {
          console.error("DALL-E 3 failed, falling back to Gemini:", dalleError);
        }
      }
    }

    // Default: Gemini 2.5 Flash Image (best quality/price ratio)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const { base64ImageUrl } = await generateWithGemini(optimizedPrompt, format, LOVABLE_API_KEY);

    const base64Match = base64ImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error("Invalid image format from Gemini");
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
    modelUsed = "google/gemini-2.5-flash-image";
    costEstimate = 0.02; // ~R$0.10 per image

    console.log("✅ Imagem Gemini gerada:", imageUrl);

    // Apply watermark "Neural Update" to ALL generated images
    if (applyWatermark && imageUrl) {
      console.log("[generate-image] Applying Neural Update watermark...");
      try {
        const watermarkResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            imageUrl: imageUrl,
            watermarkText: "Neural Update"
          }),
        });
        
        if (watermarkResponse.ok) {
          const watermarkResult = await watermarkResponse.json();
          if (watermarkResult.publicUrl) {
            imageUrl = watermarkResult.publicUrl;
            console.log("[generate-image] ✅ Neural Update watermark applied!");
          }
        } else {
          console.warn("[generate-image] Watermark service returned error, using original image");
        }
      } catch (watermarkError) {
        console.warn("[generate-image] Watermark failed, using original:", watermarkError);
      }
    }

    return new Response(
      JSON.stringify({
        imageUrl,
        format,
        modelUsed,
        costEstimate,
        supportsText: false,
        hasWatermark: applyWatermark,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
