import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Different user agents to try for downloading external images
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Googlebot-Image/1.0',
];

async function downloadImage(imageUrl: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const url = new URL(imageUrl);
  
  for (const userAgent of USER_AGENTS) {
    try {
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
          'Referer': url.origin,
        }
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const data = await response.arrayBuffer();
        return { data, contentType };
      }
    } catch (err) {
      console.log(`Error with user agent: ${err}`);
    }
  }
  
  throw new Error('Não foi possível baixar a imagem.');
}

// Create image with watermark AND headline overlay using Lovable AI
async function createNewsImage(
  originalImageUrl: string,
  watermarkText: string = "Neural Update",
  headlineText?: string
): Promise<{ data: Uint8Array; contentType: string }> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  
  if (!lovableApiKey) {
    throw new Error("LOVABLE_API_KEY não configurada");
  }

  // Build the prompt based on whether we have headline text
  // CRITICAL: All prompts MUST be in Portuguese and follow @davision.eth style
  let prompt = "";
  
  if (headlineText && headlineText.length > 0) {
    // Style inspired by @davision.eth - bold yellow text at bottom
    // Headlines must be in PORTUGUESE ONLY
    const upperHeadline = headlineText.toUpperCase();
    
    prompt = `Edite esta imagem adicionando um OVERLAY PROFISSIONAL estilo notícia viral do Instagram:

1. GRADIENTE ESCURO: Adicione um gradiente semi-transparente escuro nos 40% inferiores da imagem (de transparente no topo a 85% preto na base)

2. HEADLINE PRINCIPAL: Adicione este texto em CAIXA ALTA, NEGRITO, cor AMARELO DOURADO (#FFD700) na parte inferior:
   "${upperHeadline}"
   - Fonte grande, altamente legível, estilo impactante
   - Centralizado horizontalmente
   - Quebra de linha se necessário (máximo 2 linhas)
   - Sombra sutil para contraste

3. CALL TO ACTION: Abaixo do headline, adicione "ARRASTE PARA MAIS" em laranja/vermelho (#FF6B35), menor

4. MARCA D'ÁGUA: Pequena marca "${watermarkText}" no canto superior direito (branco semi-transparente)

IMPORTANTE:
- Mantenha a imagem original EXATAMENTE como está
- APENAS adicione os overlays de texto
- Estilo: notícia tech profissional, similar a @davision.eth
- Todo texto DEVE estar em PORTUGUÊS`;
  } else {
    // Just add watermark - also in Portuguese
    prompt = `Mantenha esta imagem EXATAMENTE como está e adicione apenas uma pequena marca d'água elegante "${watermarkText}" no canto inferior direito. A marca deve ser branca semi-transparente com sombra sutil. Discreta mas visível.`;
  }

  console.log("[add-watermark] Using Lovable AI (Gemini Image) with prompt:", prompt.substring(0, 100) + "...");

  // Use Lovable AI Gateway with Gemini image model for editing
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { 
              type: "image_url", 
              image_url: { url: originalImageUrl } 
            }
          ]
        }
      ],
      modalities: ["image", "text"]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Lovable AI error:", errorText);
    throw new Error(`Erro ao processar imagem: ${response.status}`);
  }

  const data = await response.json();
  
  // Extract base64 image from response
  const base64ImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  if (!base64ImageUrl || !base64ImageUrl.startsWith('data:image/')) {
    console.error("No image in response:", JSON.stringify(data).substring(0, 300));
    throw new Error("Resposta inválida da API de imagem");
  }

  // Convert base64 to bytes
  const base64Match = base64ImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!base64Match) {
    throw new Error("Formato de imagem inválido");
  }
  
  const imageType = base64Match[1];
  const base64Data = base64Match[2];
  const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
  const imageBytes = decode(base64Data);
  
  const contentType = `image/${imageType === 'jpg' ? 'jpeg' : imageType}`;
  console.log("[add-watermark] Image processed, size:", imageBytes.length, "type:", contentType);
  
  return { data: imageBytes, contentType };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, watermarkText = "Neural Update", headlineText } = await req.json();

    if (!imageUrl) {
      throw new Error("imageUrl é obrigatório");
    }

    console.log("Processing image:", imageUrl);
    console.log("Watermark:", watermarkText);
    console.log("Headline:", headlineText ? headlineText.substring(0, 50) + "..." : "none");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let finalImageData: Uint8Array | ArrayBuffer;
    let contentType = 'image/png';
    let hasOverlay = false;

    try {
      // Try to add watermark/headline using AI
      console.log("Adding watermark/headline via AI...");
      const result = await createNewsImage(imageUrl, watermarkText, headlineText);
      finalImageData = result.data;
      contentType = result.contentType;
      hasOverlay = true;
      console.log("Overlay added successfully, contentType:", contentType);
    } catch (overlayError: any) {
      console.error("Overlay failed, downloading original:", overlayError.message);
      
      // Fallback: just download and use original image
      const { data, contentType: ct } = await downloadImage(imageUrl);
      finalImageData = data;
      contentType = ct;
    }

    // Generate unique filename
    const filename = `news-${headlineText ? 'headline-' : 'watermarked-'}${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(filename, finalImageData, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(filename);

    console.log("Image uploaded successfully:", publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        publicUrl,
        originalUrl: imageUrl,
        hasWatermark: true,
        hasHeadline: hasOverlay && !!headlineText,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro em add-watermark:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || "Erro ao processar imagem" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
