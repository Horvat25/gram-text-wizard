import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * WATERMARK + HEADLINE OVERLAY
 * 
 * Regra: "IA pensa o texto. Código escreve o texto."
 * 
 * PORÉM: Para headlines complexas em imagens, usamos IA para composição visual
 * porque é mais confiável que tentar renderizar SVG em edge functions.
 * 
 * O texto é REVISADO por IA especialista em PT-BR antes de ser aplicado.
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Googlebot-Image/1.0',
];

async function downloadImage(imageUrl: string): Promise<{ data: Uint8Array; contentType: string }> {
  const url = new URL(imageUrl);
  
  for (const userAgent of USER_AGENTS) {
    try {
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Referer': url.origin,
        }
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await response.arrayBuffer();
        return { data: new Uint8Array(arrayBuffer), contentType };
      }
    } catch (err) {
      console.log(`[add-watermark] Retry download with different UA`);
    }
  }
  
  throw new Error('Não foi possível baixar a imagem.');
}

/**
 * Revisar texto via IA especialista em PT-BR
 */
async function reviewPortuguese(text: string, supabaseUrl: string, supabaseKey: string): Promise<string> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/review-portuguese`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ text, type: 'headline' }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.corrected) {
        console.log(`[add-watermark] Text reviewed: "${text.substring(0,30)}..." → "${result.corrected.substring(0,30)}..."`);
        return result.corrected;
      }
    }
  } catch (e) {
    console.warn('[add-watermark] Review failed, using original');
  }
  
  return text;
}

/**
 * Aplicar headline + watermark usando IA para composição visual
 * Prompt otimizado para minimizar erros de escrita
 */
async function applyHeadlineWithAI(
  imageData: Uint8Array,
  contentType: string,
  headline: string,
  watermarkText: string
): Promise<{ data: Uint8Array; contentType: string } | null> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  
  if (!lovableApiKey) {
    console.log("[add-watermark] No API key");
    return null;
  }

  const { encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
  const base64Image = encode(imageData);
  const mimeType = contentType.includes('png') ? 'image/png' : 'image/jpeg';
  const imageDataUrl = `data:${mimeType};base64,${base64Image}`;

  // Prompt EXTREMAMENTE ESPECÍFICO para evitar erros de ortografia
  // Enfatiza copiar EXATAMENTE letra por letra
  const prompt = `Edite esta imagem para criar um post de notícias estilo @davision.eth:

## LAYOUT OBRIGATÓRIO:

1. GRADIENTE ESCURO na parte inferior (40% da imagem)
   - De transparente no topo para 85% preto na base
   - Suave e profissional

2. HEADLINE em AMARELO DOURADO (#FFD700)
   - Posição: parte inferior da imagem, acima do gradiente
   - Estilo: NEGRITO, CAIXA ALTA, impactante
   - Máximo 2 linhas
   - COPIE EXATAMENTE ESTE TEXTO, LETRA POR LETRA:
   
   "${headline}"
   
   ⚠️ CRÍTICO: Escreva EXATAMENTE como está acima. Não altere, corrija ou modifique NADA.

3. CALL-TO-ACTION em laranja (#FF6B35)
   - Texto EXATO: "ARRASTE PARA MAIS"
   - Posição: abaixo do headline, menor
   - Espaçamento entre letras: aumentado

4. WATERMARK pequeno no canto superior direito
   - Texto EXATO: "${watermarkText}"
   - Cor: branco semi-transparente (70% opacidade)
   - Fonte pequena e discreta

## REGRAS:
- NÃO altere a imagem original além de adicionar o gradiente e textos
- NÃO modifique os textos fornecidos - copie LETRA POR LETRA
- Mantenha a qualidade original da imagem
- Resultado deve parecer um post profissional de notícias`;

  try {
    console.log("[add-watermark] Applying headline with AI...");
    
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
              { type: "image_url", image_url: { url: imageDataUrl } }
            ]
          }
        ],
        modalities: ["image", "text"]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[add-watermark] AI error:", response.status, errorText.substring(0, 200));
      return null;
    }

    const data = await response.json();
    const base64ImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (base64ImageUrl?.startsWith('data:image/')) {
      const match = base64ImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
        const outputBytes = decode(match[2]);
        const outputType = `image/${match[1] === 'jpg' ? 'jpeg' : match[1]}`;
        
        console.log("[add-watermark] ✅ Headline applied successfully");
        return { data: outputBytes, contentType: outputType };
      }
    }
    
    console.error("[add-watermark] Invalid response format");
    return null;
  } catch (error) {
    console.error("[add-watermark] AI composition error:", error);
    return null;
  }
}

/**
 * Aplicar apenas watermark (sem headline)
 */
async function applyWatermarkOnly(
  imageData: Uint8Array,
  contentType: string,
  watermarkText: string
): Promise<{ data: Uint8Array; contentType: string } | null> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  
  if (!lovableApiKey) {
    return null;
  }

  const { encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
  const base64Image = encode(imageData);
  const mimeType = contentType.includes('png') ? 'image/png' : 'image/jpeg';
  const imageDataUrl = `data:${mimeType};base64,${base64Image}`;

  const prompt = `Adicione um pequeno badge de marca no canto inferior direito desta imagem:

- Texto EXATO: "${watermarkText}"
- Fundo: preto semi-transparente (70% opacidade) com cantos arredondados
- Texto: branco, fonte pequena e limpa
- Posição: canto inferior direito, com margem de 15 pixels

NÃO altere mais nada na imagem. Apenas adicione o badge.
Escreva o texto EXATAMENTE como está: "${watermarkText}"`;

  try {
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
              { type: "image_url", image_url: { url: imageDataUrl } }
            ]
          }
        ],
        modalities: ["image", "text"]
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const base64ImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (base64ImageUrl?.startsWith('data:image/')) {
      const match = base64ImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
        const outputBytes = decode(match[2]);
        const outputType = `image/${match[1] === 'jpg' ? 'jpeg' : match[1]}`;
        
        console.log("[add-watermark] ✅ Watermark applied");
        return { data: outputBytes, contentType: outputType };
      }
    }
    
    return null;
  } catch (error) {
    console.error("[add-watermark] Watermark error:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      imageUrl, 
      watermarkText = "Neural Update", 
      headlineText 
    } = await req.json();

    if (!imageUrl) {
      throw new Error("imageUrl é obrigatório");
    }

    console.log("[add-watermark] Processing image...");
    console.log("[add-watermark] Watermark:", watermarkText);
    console.log("[add-watermark] Headline:", headlineText ? headlineText.substring(0, 50) + "..." : "none");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Baixar imagem
    let imageData: Uint8Array;
    let contentType: string;
    
    if (imageUrl.startsWith('data:image/')) {
      const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!base64Match) throw new Error("Invalid base64 image format");
      const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
      imageData = decode(base64Match[2]);
      contentType = `image/${base64Match[1]}`;
    } else {
      const downloaded = await downloadImage(imageUrl);
      imageData = downloaded.data;
      contentType = downloaded.contentType;
    }
    
    console.log("[add-watermark] Image downloaded:", imageData.length, "bytes");

    // 2. Revisar textos via IA especialista em PT-BR
    let reviewedWatermark = watermarkText;
    let reviewedHeadline = '';
    
    if (headlineText && headlineText.length > 0) {
      reviewedHeadline = await reviewPortuguese(headlineText, supabaseUrl, supabaseKey);
    }

    // 3. Aplicar overlay
    let finalImage: { data: Uint8Array; contentType: string } | null = null;
    
    if (reviewedHeadline) {
      // Headline + watermark
      finalImage = await applyHeadlineWithAI(imageData, contentType, reviewedHeadline, reviewedWatermark);
    } else {
      // Apenas watermark
      finalImage = await applyWatermarkOnly(imageData, contentType, reviewedWatermark);
    }
    
    // Fallback: usar imagem original se composição falhar
    if (!finalImage) {
      console.log("[add-watermark] Composition failed, using original image");
      finalImage = { data: imageData, contentType };
    }

    // 4. Upload para Storage
    const filename = `watermarked-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(filename, finalImage.data, {
        contentType: finalImage.contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(filename);

    console.log("[add-watermark] ✅ Success:", publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        publicUrl,
        originalUrl: imageUrl,
        hasWatermark: true,
        hasHeadline: !!reviewedHeadline,
        reviewedTexts: {
          watermark: reviewedWatermark,
          headline: reviewedHeadline || null
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[add-watermark] Error:", error);
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
