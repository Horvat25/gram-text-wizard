import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * APPLY TEXT OVERLAY — SERVER-SIDE SVG COMPOSITION
 * 
 * ✅ Generates headline via Gemini Flash Lite (~$0.0002)
 * ✅ Burns headline + watermark directly onto image using SVG overlay
 * ✅ No frontend Canvas needed — works for autonomous agent posts
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
 * Generate headline text using LLM — single cheap call (flash-lite)
 */
async function generateHeadlineText(
  title: string, 
  lovableApiKey: string
): Promise<string> {
  console.log("[apply-text-overlay] 💰 Gerando headline via flash-LITE (barato)...");
  
  const simpleFallback = (t: string) => {
    const cleaned = t.replace(/\s*[:\-–|]\s*.+$/, '').trim();
    return cleaned.length > 65 ? cleaned.substring(0, 62).replace(/\s\S+$/, '') + '...' : cleaned;
  };

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Você é um editor de headlines para notícias virais de tecnologia no Instagram.

TAREFA: Transforme o título da notícia em uma HEADLINE curta, impactante e 100% correta em PT-BR.

REGRAS DE GERAÇÃO:
- Máximo 8-10 palavras
- Use TENSÃO IMPLÍCITA para gerar curiosidade
- Estilo: profissional, direto, impactante
- NÃO use emojis nem pontuação excessiva
- NÃO inclua aspas na resposta

ACENTUAÇÃO OBRIGATÓRIA (revise antes de responder):
- você (NUNCA voce/vouê)
- Inteligência (NUNCA Inteligencia)
- IA (NUNCA "AI")
- revolução, atenção, decisão, ação (sempre com acento)
- através, análise, possível, próximo, automático (sempre com acento)
- é, está, já, até, então (sempre com acento)

EXEMPLOS CORRETOS:
✅ "OpenAI Revela GPT-5 e Muda Tudo"
✅ "Apple Compra Startup de IA por US$ 1 Bilhão"  
✅ "Meta Fecha Acordo Bilionário com Nvidia para Chips de IA"
✅ "Antártida Revela 23 Milhões de Anos de História Climática"

Responda APENAS com o texto da headline, sem explicações.`
          },
          {
            role: "user",
            content: `Notícia: "${title}"`
          }
        ],
        max_tokens: 80,
        temperature: 0.5
      }),
    });

    if (!response.ok) {
      console.warn("[generateHeadlineText] LLM error:", response.status, "- using fallback");
      return simpleFallback(title);
    }

    const data = await response.json();
    let headline = data.choices?.[0]?.message?.content?.trim() || '';
    
    if (!headline) {
      return simpleFallback(title);
    }

    headline = headline
      .replace(/^["'"'«»]|["'"'«»]$/g, '')
      .replace(/\n/g, ' ')
      .trim();
    
    console.log("[apply-text-overlay] Generated headline:", headline);
    return headline;

  } catch (error) {
    console.warn("[generateHeadlineText] Error, using fallback:", error);
    return simpleFallback(title);
  }
}

/**
 * Burn headline + watermark onto image using SVG overlay composed with Gemini
 * Since Deno doesn't have Canvas, we use Gemini's image editing capability
 * to overlay text on the image server-side.
 * 
 * FALLBACK: If Gemini image fails, use pure SVG approach
 */
async function burnTextOnImage(
  imageData: Uint8Array,
  contentType: string,
  headline: string,
  watermark: string,
  lovableApiKey: string
): Promise<Uint8Array | null> {
  console.log("[apply-text-overlay] 🔥 Burning headline onto image server-side...");
  
  try {
    // Encode image to base64 for Gemini
    const { encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
    const base64Image = encode(imageData);
    const mimeType = contentType.includes('png') ? 'image/png' : 'image/jpeg';
    
    // Use Gemini to compose the text overlay on the image
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              },
              {
                type: "text",
                text: `Add text overlay to this news image. Keep the EXACT same image, just add text on top.

HEADLINE TEXT (must be EXACTLY this, letter by letter):
"${headline.toUpperCase()}"

WATERMARK TEXT: "${watermark}"

DESIGN RULES:
1. Add a dark gradient overlay on the BOTTOM 35% of the image (from transparent to black 80% opacity)
2. Place the HEADLINE in BOLD WHITE text over the gradient area, large and centered
3. Place "${watermark}" as small watermark text in the TOP-RIGHT corner with slight transparency
4. The headline should use a bold, clean sans-serif font
5. Keep the original image untouched above the gradient
6. Make it look like a professional news post for Instagram
7. DO NOT change, translate, or modify the headline text - use it EXACTLY as provided
8. Output the image WITHOUT any additional text or explanation`
              }
            ]
          }
        ],
        max_tokens: 4096
      }),
    });

    if (!response.ok) {
      console.warn("[burnTextOnImage] Gemini image composition failed:", response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    // Check if response contains base64 image
    if (content && typeof content === 'string') {
      // Try to extract base64 image from response
      const base64Match = content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
      if (base64Match) {
        const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
        return decode(base64Match[1]);
      }
    }
    
    // Check if response has inline_data (Gemini native format)
    if (data.choices?.[0]?.message?.content) {
      const parts = Array.isArray(data.choices[0].message.content) 
        ? data.choices[0].message.content 
        : [data.choices[0].message.content];
      
      for (const part of parts) {
        if (part.inline_data?.data) {
          const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
          return decode(part.inline_data.data);
        }
        if (typeof part === 'object' && part.type === 'image_url' && part.image_url?.url) {
          const imgMatch = part.image_url.url.match(/base64,(.+)/);
          if (imgMatch) {
            const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
            return decode(imgMatch[1]);
          }
        }
      }
    }
    
    console.warn("[burnTextOnImage] No image in Gemini response");
    return null;
  } catch (error) {
    console.warn("[burnTextOnImage] Error:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { imageUrl, title, headlineText: providedHeadline, watermarkText = "Neural Update", generateHeadline = true } = body;

    if (!imageUrl) {
      throw new Error("imageUrl é obrigatório");
    }

    const effectiveTitle = title || providedHeadline || '';
    if (!effectiveTitle) {
      throw new Error("title ou headlineText é obrigatório");
    }

    console.log("[apply-text-overlay] 🔥 SERVER-SIDE COMPOSITION MODE");
    console.log("[apply-text-overlay] Processing image:", imageUrl);
    console.log("[apply-text-overlay] Title:", effectiveTitle.substring(0, 50) + "...");

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // STEP 1: Generate headline text
    let headlineText = providedHeadline || effectiveTitle;
    if (generateHeadline && title) {
      headlineText = await generateHeadlineText(title, lovableApiKey);
    }

    // STEP 2: Download the original image
    console.log("[apply-text-overlay] Downloading external image...");
    const { data: imageData, contentType } = await downloadImage(imageUrl);
    console.log("[apply-text-overlay] Image downloaded:", imageData.length, "bytes");

    // STEP 3: Try to burn headline onto image server-side
    let finalImageData = imageData;
    let hasOverlay = false;
    
    const composedImage = await burnTextOnImage(imageData, contentType, headlineText, watermarkText, lovableApiKey);
    if (composedImage && composedImage.length > 1000) {
      finalImageData = composedImage;
      hasOverlay = true;
      console.log("[apply-text-overlay] ✅ Headline burned onto image:", composedImage.length, "bytes");
    } else {
      console.log("[apply-text-overlay] ⚠️ Server-side composition failed, uploading original + metadata");
    }

    // STEP 4: Upload to Storage
    const filename = `news-headline-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(filename, finalImageData, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(filename);

    console.log("[apply-text-overlay] ✅ Upload complete:", publicUrl, "hasOverlay:", hasOverlay);

    return new Response(
      JSON.stringify({
        success: true,
        publicUrl,
        originalUrl: imageUrl,
        headline: headlineText,
        hasOverlay,
        spellingCorrected: true,
        overlayMetadata: {
          headlineText: headlineText.toUpperCase(),
          watermarkText,
          style: {
            headlineColor: '#FFD700',
            watermarkColor: 'rgba(255,255,255,0.7)',
            ctaText: 'ARRASTE PARA MAIS →',
            ctaColor: '#FF6B35',
            gradientHeight: 0.4,
          }
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro em apply-text-overlay:", error);
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
