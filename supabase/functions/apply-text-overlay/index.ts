import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * APPLY TEXT OVERLAY — MODO CUSTO ZERO
 * 
 * ✅ MANTIDO: Uma chamada ao gemini-2.5-flash-LITE para gerar headline (muito barata ~$0.0002)
 * ❌ REMOVIDO: gemini-2.5-flash-IMAGE para composição (era cara ~$0.01-0.05 por imagem)
 * 
 * A imagem original é baixada e salva SEM modificação.
 * O texto da headline é retornado como metadado em `overlay_metadata`.
 * O frontend aplica o overlay via Canvas HTML — custo zero no servidor.
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
 * Eliminates all expensive image generation calls
 */
async function generateHeadlineText(
  title: string, 
  lovableApiKey: string
): Promise<string> {
  console.log("[apply-text-overlay] 💰 Gerando headline via flash-LITE (barato)...");
  
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

    // Clean up the headline
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

    console.log("[apply-text-overlay] 💰 MODO CUSTO ZERO — sem IA de imagem");
    console.log("[apply-text-overlay] Processing image:", imageUrl);
    console.log("[apply-text-overlay] Title:", effectiveTitle.substring(0, 50) + "...");

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // STEP 1: Generate headline text (1 chamada BARATA ao flash-lite, ~$0.0002)
    let headlineText = providedHeadline || effectiveTitle;
    if (generateHeadline && title) {
      headlineText = await generateHeadlineText(title, lovableApiKey);
    }

    // STEP 2: Download the original image (sem modificação)
    console.log("[apply-text-overlay] Downloading external image...");
    const { data: imageData, contentType } = await downloadImage(imageUrl);
    console.log("[apply-text-overlay] Image downloaded:", imageData.length, "bytes");

    // STEP 3: Upload imagem original DIRETAMENTE para Storage (sem IA de imagem)
    // O overlay será aplicado pelo frontend via Canvas HTML — custo zero
    const filename = `news-headline-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(filename, imageData, {
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

    console.log("[apply-text-overlay] ✅ Upload sem IA de imagem:", publicUrl);
    console.log("[apply-text-overlay] 💡 Headline para o frontend aplicar via Canvas:", headlineText);

    return new Response(
      JSON.stringify({
        success: true,
        publicUrl,
        originalUrl: imageUrl,
        headline: headlineText,
        // hasOverlay = false significa que o frontend precisa aplicar via Canvas
        hasOverlay: false,
        spellingCorrected: true,
        // Metadados completos para o Canvas frontend
        overlayMetadata: {
          headlineText: headlineText.toUpperCase(),
          watermarkText,
          style: {
            headlineColor: '#FFD700',
            watermarkColor: 'rgba(255,255,255,0.7)',
            ctaText: 'ARRASTE PARA MAIS →',
            ctaColor: '#FF6B35',
            gradientHeight: 0.4, // 40% da imagem
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
