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
    const { prompt, format = "square", customStyle } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      throw new Error("Prompt é obrigatório");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build style instructions
    const styleInstructions = customStyle || "Profissional, alta qualidade, cores vibrantes, composição equilibrada.";

    // Otimizar prompt para Instagram
    const optimizedPrompt = `${prompt}

Estilo: ${styleInstructions}
Formato: ${format === "portrait" ? "Vertical (4:5 ratio)" : "Quadrado (1:1 ratio)"}.
Qualidade: Ultra alta resolução, adequado para Instagram feed.
Sem texto: Não incluir textos ou palavras na imagem.`;

    console.log(`Gerando imagem para: ${prompt}`);

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

    console.log("Imagem gerada, fazendo upload para Storage...");

    // Extract base64 data from data URL
    const base64Match = base64ImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error("Formato de imagem inválido");
    }

    const imageType = base64Match[1]; // png, jpeg, etc.
    const base64Data = base64Match[2];
    const imageBytes = decode(base64Data);

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().split("-")[0];
    const fileName = `generated/${timestamp}-${randomId}.${imageType}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("post-images")
      .upload(fileName, imageBytes, {
        contentType: `image/${imageType}`,
        upsert: false,
      });

    if (uploadError) {
      console.error("Erro no upload:", uploadError);
      throw new Error(`Erro ao salvar imagem: ${uploadError.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("post-images")
      .getPublicUrl(fileName);

    const permanentUrl = publicUrlData.publicUrl;
    console.log("Imagem salva com sucesso:", permanentUrl);

    return new Response(
      JSON.stringify({
        imageUrl: permanentUrl,
        format,
        storagePath: fileName,
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
