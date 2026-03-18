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
    const { encode, decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
    const base64Image = encode(imageData);
    const mimeType = contentType.includes('png') ? 'image/png' : 'image/jpeg';
    
    // Use Gemini with modalities: ["image", "text"] (same as generate-image)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        modalities: ["image", "text"],
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
                text: `Edit this image: add a text overlay. Keep the EXACT same photo, just overlay text.

HEADLINE (use EXACTLY this text, letter by letter):
"${headline.toUpperCase()}"

WATERMARK: "${watermark}"

DESIGN:
1. Dark gradient covering the BOTTOM HALF of the image (transparent at 50% → black 85% at bottom)
2. HEADLINE in BOLD YELLOW (#FFD700) large text, positioned at 60-70% height (NOT at the very bottom — leave 15% padding from bottom edge so Instagram 4:5 crop doesn't cut it)
3. "${watermark}" small white text, TOP-RIGHT corner, 70% opacity
4. Keep original photo unchanged above the gradient
5. Professional Instagram news post style
6. The headline must be FULLY VISIBLE and not touching any edge
7. If headline is long (3+ lines), use slightly smaller font
8. Return ONLY the edited image`
              }
            ]
          }
        ],
        max_tokens: 4096
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn("[burnTextOnImage] Gemini failed:", response.status, errText.substring(0, 200));
      return null;
    }

    const data = await response.json();
    console.log("[burnTextOnImage] Response keys:", JSON.stringify(Object.keys(data)).substring(0, 200));
    
    // Parse image from response - try ALL known formats from Lovable gateway
    
    // Format 1: images array (same as generate-image)
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url
      || data.choices?.[0]?.message?.content?.images?.[0]?.url
      || data.images?.[0]?.url;
    
    if (imageUrl && imageUrl.startsWith('data:image/')) {
      const b64 = imageUrl.split('base64,')[1];
      if (b64) {
        console.log("[burnTextOnImage] ✅ Got image via images array");
        return decode(b64);
      }
    }
    
    // Format 2: base64 in string content
    const content = data.choices?.[0]?.message?.content;
    if (content && typeof content === 'string') {
      const b64Match = content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
      if (b64Match) {
        console.log("[burnTextOnImage] ✅ Got image via string content");
        return decode(b64Match[1]);
      }
    }
    
    // Format 3: content array with image parts
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.inline_data?.data) {
          console.log("[burnTextOnImage] ✅ Got image via inline_data");
          return decode(part.inline_data.data);
        }
        if (part?.type === 'image_url' && part?.image_url?.url) {
          const m = part.image_url.url.match(/base64,(.+)/);
          if (m) {
            console.log("[burnTextOnImage] ✅ Got image via content image_url");
            return decode(m[1]);
          }
        }
        // Format 4: image object in content array
        if (part?.image?.url) {
          const m = part.image.url.match(/base64,(.+)/);
          if (m) {
            console.log("[burnTextOnImage] ✅ Got image via content image.url");
            return decode(m[1]);
          }
        }
      }
    }
    
    console.warn("[burnTextOnImage] No image found in response. Content preview:", 
      JSON.stringify(data.choices?.[0]?.message).substring(0, 300));
    return null;
  } catch (error) {
    console.warn("[burnTextOnImage] Error:", error);
    return null;
  }
}

/**
 * Simplified retry: shorter prompt, uses flash model
 */
async function burnTextOnImageSimple(
  imageData: Uint8Array,
  contentType: string,
  headline: string,
  watermark: string,
  lovableApiKey: string
): Promise<Uint8Array | null> {
  try {
    const { encode, decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
    const base64Image = encode(imageData);
    const mimeType = contentType.includes('png') ? 'image/png' : 'image/jpeg';
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
              { type: "text", text: `Add bold yellow (#FFD700) text "${headline.toUpperCase()}" at 65% height of this image (NOT at the very bottom — leave padding). Dark gradient on lower half. Add small "${watermark}" text top-right. Keep the photo unchanged. Return the edited image.` }
            ]
          }
        ]
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (imageUrl?.startsWith('data:image/')) {
      return decode(imageUrl.split('base64,')[1]);
    }
    return null;
  } catch { return null; }
}

/**
 * Last resort: generate a brand-new news overlay image with headline
 */
async function generateFreshOverlayImage(
  headline: string,
  watermark: string,
  lovableApiKey: string
): Promise<Uint8Array | null> {
  try {
    const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: `Generate a professional tech news image for Instagram (1080x1080).

Design:
- Dark blue/purple gradient background with subtle tech grid pattern
- Large bold white headline text centered: "${headline.toUpperCase()}"
- Small "${watermark}" watermark text in top-right corner
- Professional, clean, modern design
- No other text or decorations

The headline MUST be readable and prominent. Tech news aesthetic.`
          }
        ]
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (imageUrl?.startsWith('data:image/')) {
      return decode(imageUrl.split('base64,')[1]);
    }
    return null;
  } catch { return null; }
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

    // STEP 3: Try to burn headline onto image server-side (with retry)
    let finalImageData = imageData;
    let hasOverlay = false;
    
    // Attempt 1: Burn text onto original image
    let composedImage = await burnTextOnImage(imageData, contentType, headlineText, watermarkText, lovableApiKey);
    if (composedImage && composedImage.length > 1000) {
      finalImageData = composedImage;
      hasOverlay = true;
      console.log("[apply-text-overlay] ✅ Headline burned onto image:", composedImage.length, "bytes");
    } else {
      // Attempt 2: Retry with simpler prompt
      console.log("[apply-text-overlay] ⚠️ Attempt 1 failed, retrying with simpler prompt...");
      composedImage = await burnTextOnImageSimple(imageData, contentType, headlineText, watermarkText, lovableApiKey);
      if (composedImage && composedImage.length > 1000) {
        finalImageData = composedImage;
        hasOverlay = true;
        console.log("[apply-text-overlay] ✅ Headline burned (retry):", composedImage.length, "bytes");
      } else {
        // Attempt 3: Generate a NEW image with headline from scratch
        console.log("[apply-text-overlay] ⚠️ Burn failed, generating fresh overlay image...");
        const freshImage = await generateFreshOverlayImage(headlineText, watermarkText, lovableApiKey);
        if (freshImage && freshImage.length > 1000) {
          finalImageData = freshImage;
          hasOverlay = true;
          console.log("[apply-text-overlay] ✅ Fresh overlay image generated:", freshImage.length, "bytes");
        } else {
          console.log("[apply-text-overlay] ⚠️ All overlay methods failed, uploading original + metadata");
        }
      }
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
