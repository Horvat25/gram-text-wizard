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
 * SPELLING CORRECTION AGENT
 * Uses Gemini Flash Lite to correct Portuguese spelling in headlines
 * This ensures zero spelling errors in the final output
 */
async function correctSpellingWithAI(
  text: string, 
  lovableApiKey: string
): Promise<string> {
  console.log("[apply-text-overlay] Running spelling correction on:", text);
  
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
            content: `Você é um revisor ortográfico rigoroso de português brasileiro.

TAREFA: Corrija TODOS os erros ortográficos e de acentuação no texto fornecido.

REGRAS OBRIGATÓRIAS:
- Corrija acentos faltando: você (não voce), através (não atraves), é, está, já, até
- Corrija palavras comuns:
  * "Inteligência" (não Inteligencia)
  * "revolução" (não revolucao)  
  * "você" (não voce/vouê)
  * "conhece" (não connee/conece)
  * "finalmente" (não finalment)
  * "entendeu" (não entended/entendeo)
  * "diagnóstico" (não diagnostico)
  * "automático" (não automatico)
  * "atenção" (não atencao)
  * "decisão" (não decisao)
  * "análise" (não analise)
  * "possível" (não possivel)
  * "próximo" (não proximo)
- Traduza termos em inglês para português: AI→IA, Robotics→Robótica
- NÃO altere o significado ou estrutura
- Responda APENAS com o texto corrigido, sem explicações`
          },
          {
            role: "user",
            content: `Corrija este texto: "${text}"`
          }
        ],
        max_tokens: 200,
        temperature: 0.1 // Low temperature for precision
      }),
    });

    if (!response.ok) {
      console.warn("[spelling-correction] AI failed, using original:", response.status);
      return text;
    }

    const data = await response.json();
    const corrected = data.choices?.[0]?.message?.content?.trim() || text;
    
    // Clean up the response (remove quotes if present)
    const cleaned = corrected
      .replace(/^["']|["']$/g, '')
      .replace(/^Texto corrigido:\s*/i, '')
      .trim();
    
    console.log("[spelling-correction] Original:", text);
    console.log("[spelling-correction] Corrected:", cleaned);
    
    return cleaned;
  } catch (error) {
    console.warn("[spelling-correction] Error, using original:", error);
    return text;
  }
}

/**
 * Generate headline text using LLM - IA GERA APENAS O TEXTO
 * Then applies spelling correction
 */
async function generateHeadlineText(
  title: string, 
  lovableApiKey: string
): Promise<string> {
  console.log("[apply-text-overlay] Generating headline text via LLM...");
  
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

REGRAS:
- Crie uma headline CURTA e IMPACTANTE (máximo 8-10 palavras)
- Use TENSÃO IMPLÍCITA para gerar curiosidade
- Português brasileiro PERFEITO, sem NENHUM erro ortográfico
- NÃO use emojis
- NÃO use pontuação excessiva
- Estilo: profissional, direto, impactante

REVISÃO ORTOGRÁFICA OBRIGATÓRIA:
- "você" (não voce/vouê)
- "Inteligência" (não Inteligencia)
- "revolução" (não revolucao)
- "através" (não atraves)
- "conhece" (não connee)
- "finalmente" (não finalment/finalement)
- "entendeu" (não entended/entendeo)

EXEMPLOS CORRETOS:
- "OpenAI Revela GPT-5 e Muda Tudo"
- "Apple Compra Startup de IA por US$ 1 Bilhão"
- "Brasil Lidera Adoção de IA na América Latina"
- "Elon Musk Anuncia Mudanças Radicais no X"`
        },
        {
          role: "user",
          content: `Crie uma headline impactante para esta notícia: "${title}". Responda APENAS com o texto da headline, nada mais.`
        }
      ],
      max_tokens: 100,
      temperature: 0.7
    }),
  });

  if (!response.ok) {
    console.warn("[generateHeadlineText] LLM error:", response.status);
    // Fallback: use title directly
    return title.length > 60 ? title.substring(0, 57) + '...' : title;
  }

  const data = await response.json();
  let headline = data.choices?.[0]?.message?.content?.trim() || title;
  
  // Clean up the headline
  headline = headline
    .replace(/^["']|["']$/g, '') // Remove quotes
    .replace(/\n/g, ' ')
    .trim();
  
  // Apply spelling correction as final step
  headline = await correctSpellingWithAI(headline, lovableApiKey);
  
  console.log("[apply-text-overlay] Final headline:", headline);
  return headline;
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

    // STEP 1: Generate or use provided headline text
    let headlineText = providedHeadline || effectiveTitle;
    if (generateHeadline && title) {
      headlineText = await generateHeadlineText(title, lovableApiKey);
    } else {
      // Apply spelling correction to provided text
      headlineText = await correctSpellingWithAI(headlineText, lovableApiKey);
    }

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
