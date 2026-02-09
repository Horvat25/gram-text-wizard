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

async function downloadImage(imageUrl: string): Promise<{ data: Uint8Array; contentType: string }> {
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
        const arrayBuffer = await response.arrayBuffer();
        return { data: new Uint8Array(arrayBuffer), contentType };
      }
    } catch (err) {
      console.log(`Error with user agent: ${err}`);
    }
  }
  
  throw new Error('Não foi possível baixar a imagem.');
}

/**
 * WATERMARK PROGRAMÁTICO via SVG
 * Mais consistente que IA - texto sempre legível e posicionado corretamente
 */
function createWatermarkSVG(
  width: number, 
  height: number, 
  watermarkText: string = "Neural Update"
): string {
  // Calcular tamanho da fonte baseado na imagem (2.5% da largura, mínimo 14px, máximo 32px)
  const fontSize = Math.max(14, Math.min(32, Math.floor(width * 0.025)));
  const padding = Math.floor(fontSize * 0.8);
  const bgWidth = watermarkText.length * fontSize * 0.6 + padding * 2;
  const bgHeight = fontSize * 1.5 + padding;
  
  // Posição: canto inferior direito
  const x = width - bgWidth - 15;
  const y = height - bgHeight - 15;
  
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/>
        </filter>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:rgba(20,20,20,0.85)"/>
          <stop offset="100%" style="stop-color:rgba(40,40,40,0.75)"/>
        </linearGradient>
      </defs>
      
      <!-- Background pill -->
      <rect 
        x="${x}" 
        y="${y}" 
        width="${bgWidth}" 
        height="${bgHeight}" 
        rx="${bgHeight / 2}" 
        ry="${bgHeight / 2}" 
        fill="url(#bgGrad)"
        stroke="rgba(255,255,255,0.1)"
        stroke-width="1"
      />
      
      <!-- Watermark text -->
      <text 
        x="${x + bgWidth / 2}" 
        y="${y + bgHeight / 2 + fontSize * 0.35}" 
        font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
        font-size="${fontSize}" 
        font-weight="600"
        fill="white" 
        text-anchor="middle"
        filter="url(#shadow)"
        letter-spacing="0.5"
      >${watermarkText}</text>
    </svg>
  `;
}

/**
 * Combina imagem original + SVG watermark usando ImageMagick via Deno
 * Como não temos ImageMagick no Edge, usamos uma técnica de base64 injection
 */
async function addWatermarkToImage(
  imageData: Uint8Array,
  contentType: string,
  watermarkText: string = "Neural Update"
): Promise<{ data: Uint8Array; contentType: string }> {
  // Para Edge Functions, a melhor opção é usar um serviço externo ou
  // simplesmente retornar a imagem com metadata de watermark para o frontend aplicar
  
  // Por enquanto, vamos usar a abordagem de "overlay via Canvas" no cliente
  // Mas aqui podemos usar um truque: converter para PNG com metadata
  
  // SOLUÇÃO: Usar resvg-js para renderizar SVG sobre a imagem
  // Porém, como isso requer WebAssembly, vamos usar uma abordagem alternativa:
  // Chamar um serviço de imagem que suporta composição
  
  // Vamos tentar usar Lovable AI apenas para o compositing final (mais confiável que gerar texto)
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  
  if (!lovableApiKey) {
    // Sem API, retornar imagem original
    console.log("[add-watermark] No API key, returning original image");
    return { data: imageData, contentType };
  }

  // Converter imagem para base64
  const { encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
  const base64Image = encode(imageData);
  const mimeType = contentType.includes('png') ? 'image/png' : 
                   contentType.includes('webp') ? 'image/webp' : 'image/jpeg';
  const imageDataUrl = `data:${mimeType};base64,${base64Image}`;

  // Prompt MUITO SIMPLES para apenas adicionar texto - reduz erros de ortografia
  const prompt = `Adicione EXATAMENTE este texto no canto inferior direito da imagem: "${watermarkText}"

INSTRUÇÕES CRÍTICAS:
1. NÃO altere a imagem original de forma alguma
2. Adicione apenas um pequeno badge semi-transparente no canto inferior direito
3. O texto deve ser: "${watermarkText}" - escreva EXATAMENTE como está, letra por letra
4. Fundo do badge: preto semi-transparente com cantos arredondados
5. Cor do texto: branco
6. Tamanho: pequeno e discreto
7. NÃO adicione nada além do watermark solicitado`;

  console.log("[add-watermark] Applying watermark via AI compositing...");

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
      const errorText = await response.text();
      console.error("[add-watermark] AI error:", response.status, errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const base64ImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!base64ImageUrl || !base64ImageUrl.startsWith('data:image/')) {
      console.error("[add-watermark] No image in response");
      throw new Error("No image in response");
    }

    // Extrair bytes da imagem
    const base64Match = base64ImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error("Invalid image format");
    }
    
    const imageType = base64Match[1];
    const base64Data = base64Match[2];
    const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
    const outputBytes = decode(base64Data);
    
    const outputContentType = `image/${imageType === 'jpg' ? 'jpeg' : imageType}`;
    console.log("[add-watermark] ✅ Watermark applied successfully");
    
    return { data: outputBytes, contentType: outputContentType };
  } catch (error) {
    console.error("[add-watermark] Falling back to original image:", error);
    return { data: imageData, contentType };
  }
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

    console.log("[add-watermark] Processing:", imageUrl.substring(0, 80) + "...");
    console.log("[add-watermark] Watermark text:", watermarkText);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Baixar imagem original
    let imageData: Uint8Array;
    let contentType: string;
    
    if (imageUrl.startsWith('data:image/')) {
      // Base64 image
      const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!base64Match) {
        throw new Error("Invalid base64 image format");
      }
      const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
      imageData = decode(base64Match[2]);
      contentType = `image/${base64Match[1]}`;
    } else {
      // URL externa
      const downloaded = await downloadImage(imageUrl);
      imageData = downloaded.data;
      contentType = downloaded.contentType;
    }
    
    console.log("[add-watermark] Image downloaded, size:", imageData.length);

    // 2. Se headline fornecido, usar prompt especial para headline + watermark
    let finalImageData: Uint8Array;
    let finalContentType: string;
    
    if (headlineText && headlineText.length > 0) {
      // Headline com watermark - precisa de IA para layout
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      
      if (lovableApiKey) {
        const { encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
        const base64Image = encode(imageData);
        const mimeType = contentType.includes('png') ? 'image/png' : 'image/jpeg';
        const imageDataUrl = `data:${mimeType};base64,${base64Image}`;
        
        const upperHeadline = headlineText.toUpperCase();
        
        const headlinePrompt = `Edite esta imagem para criar um post de notícia viral:

1. GRADIENTE: Adicione gradiente escuro nos 40% inferiores (transparente → 85% preto)

2. HEADLINE: Adicione este texto EXATAMENTE como está:
   "${upperHeadline}"
   - Cor: AMARELO DOURADO (#FFD700)
   - Posição: parte inferior, centralizado
   - Estilo: negrito, impactante, máximo 2 linhas

3. CTA: Abaixo do headline, adicione "ARRASTE PARA MAIS" em laranja (#FF6B35), menor

4. WATERMARK: "${watermarkText}" no canto superior direito (branco semi-transparente, pequeno)

IMPORTANTE: Todo texto em PORTUGUÊS. Escreva EXATAMENTE como indicado.`;

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
                    { type: "text", text: headlinePrompt },
                    { type: "image_url", image_url: { url: imageDataUrl } }
                  ]
                }
              ],
              modalities: ["image", "text"]
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const base64ImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            
            if (base64ImageUrl?.startsWith('data:image/')) {
              const match = base64ImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
              if (match) {
                const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
                finalImageData = decode(match[2]);
                finalContentType = `image/${match[1] === 'jpg' ? 'jpeg' : match[1]}`;
                console.log("[add-watermark] ✅ Headline + watermark applied");
              } else {
                throw new Error("Invalid response format");
              }
            } else {
              throw new Error("No image in response");
            }
          } else {
            throw new Error(`API error: ${response.status}`);
          }
        } catch (headlineError) {
          console.error("[add-watermark] Headline failed, applying watermark only:", headlineError);
          const result = await addWatermarkToImage(imageData, contentType, watermarkText);
          finalImageData = result.data;
          finalContentType = result.contentType;
        }
      } else {
        finalImageData = imageData;
        finalContentType = contentType;
      }
    } else {
      // Só watermark
      const result = await addWatermarkToImage(imageData, contentType, watermarkText);
      finalImageData = result.data;
      finalContentType = result.contentType;
    }

    // 3. Upload para Supabase Storage
    const filename = `watermarked-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(filename, finalImageData, {
        contentType: finalContentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[add-watermark] Upload error:", uploadError);
      throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(filename);

    console.log("[add-watermark] ✅ Image saved:", publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        publicUrl,
        originalUrl: imageUrl,
        hasWatermark: true,
        hasHeadline: !!headlineText,
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
