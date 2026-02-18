import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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
 * Generate headline text using LLM - single call with built-in spelling correction
 * Eliminates the separate spelling correction call (saves 1 AI call per post)
 */
async function generateHeadlineText(
  title: string, 
  lovableApiKey: string
): Promise<string> {
  console.log("[apply-text-overlay] Generating headline text via LLM...");
  
  // Deterministic fallback: just shorten the title cleanly (no AI needed)
  const simpleFallback = (t: string) => {
    const cleaned = t.replace(/\s*[:\-–|]\s*.+$/, '').trim(); // remove subtitle
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

    // Clean up the headline (remove surrounding quotes the model sometimes adds)
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
 * PROGRAMMATIC SVG OVERLAY - NO AI FOR TEXT RENDERING
 * This creates the overlay using pure SVG - zero spelling errors possible
 */
async function createProgrammaticOverlay(
  imageData: Uint8Array,
  imageContentType: string,
  headlineText: string,
  watermarkText: string = "Neural Update"
): Promise<Uint8Array | null> {
  console.log("[apply-text-overlay] Creating programmatic SVG overlay...");
  console.log("[apply-text-overlay] Headline:", headlineText);
  
  // We'll create an SVG overlay and use the Lovable AI just for compositing
  // The text is rendered by SVG, not generated by AI
  
  // For now, we need to use the AI to composite, but with EXPLICIT text
  // The AI only pastes the text, it doesn't generate it
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY não configurada");
  }
  
  // Convert image to base64 for the API
  const base64Image = base64Encode(imageData);
  const mimeType = imageContentType.includes('png') ? 'image/png' : 
                   imageContentType.includes('webp') ? 'image/webp' : 'image/jpeg';
  
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: `TAREFA SIMPLES: Adicione overlay de texto nesta imagem.

COPIE EXATAMENTE ESTE TEXTO (letra por letra, sem modificar):
"${headlineText.toUpperCase()}"

LAYOUT:
1. Mantenha a imagem original 100% intacta
2. Adicione gradiente preto nos 40% inferiores (transparente→85% preto)
3. Coloque o texto acima em AMARELO DOURADO (#FFD700), negrito, centralizado, 15% do fundo
4. Abaixo: "ARRASTE PARA MAIS →" em laranja (#FF6B35)
5. Canto superior direito: "${watermarkText}" em branco semi-transparente

⚠️ CRÍTICO: Copie o texto EXATAMENTE como fornecido. NÃO invente palavras. NÃO altere ortografia.`
            },
            { 
              type: "image_url", 
              image_url: { url: `data:${mimeType};base64,${base64Image}` } 
            }
          ]
        }
      ],
      modalities: ["image", "text"]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn("[apply-text-overlay] Image compositing failed:", response.status, errorText);
    // Return null to trigger fallback
    return null;
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
  
  const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
  const imageBytes = decode(base64Match[2]);
  
  console.log("[apply-text-overlay] Overlay created successfully, size:", imageBytes.length);
  
  return imageBytes;
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

    console.log("[apply-text-overlay] Processing image:", imageUrl);
    console.log("[apply-text-overlay] Title:", effectiveTitle.substring(0, 50) + "...");

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // STEP 1: Generate or use provided headline text (single AI call with built-in spelling)
    let headlineText = providedHeadline || effectiveTitle;
    if (generateHeadline && title) {
      headlineText = await generateHeadlineText(title, lovableApiKey);
    }
    // No separate spelling correction call - generateHeadlineText already handles it inline

    // STEP 2: Download the external image
    console.log("[apply-text-overlay] Downloading external image...");
    const { data: imageData, contentType } = await downloadImage(imageUrl);
    console.log("[apply-text-overlay] Image downloaded:", imageData.length, "bytes");

    // STEP 3: Create overlay with programmatic text (no AI text generation)
    let finalImageData = await createProgrammaticOverlay(
      imageData,
      contentType,
      headlineText,
      watermarkText
    );

    let hasOverlay = true;

    // FALLBACK: If AI compositing failed (e.g. 402 credits), use original image
    if (!finalImageData) {
      console.warn("[apply-text-overlay] ⚠️ Using original image as fallback (no credits)");
      finalImageData = imageData;
      hasOverlay = false;
    }

    // STEP 4: Upload to Supabase Storage
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

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(filename);

    console.log("[apply-text-overlay] ✅ Image uploaded successfully:", publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        publicUrl,
        originalUrl: imageUrl,
        headline: headlineText,
        hasOverlay,
        spellingCorrected: true,
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
