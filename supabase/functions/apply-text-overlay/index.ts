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

// Generate headline text using LLM - IA GERA APENAS O TEXTO
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
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Você é um editor de headlines para notícias virais de tecnologia no Instagram.

REGRAS:
- Crie uma headline CURTA e IMPACTANTE (máximo 8-10 palavras)
- Use TENSÃO IMPLÍCITA para gerar curiosidade
- Português correto, sem erros ortográficos
- NÃO use emojis
- NÃO use pontuação excessiva
- Estilo: profissional, direto, impactante

EXEMPLOS BOM:
- "OpenAI Revela GPT-5 e Muda Tudo"
- "Apple Compra Startup de IA por US$ 1 Bilhão"
- "Brasil Lidera Adoção de IA na América Latina"
- "Elon Musk Anuncia Mudanças Radicais no X"

EXEMPLOS RUIM (NÃO FAÇA):
- "Confira essa notícia incrível!!!" (muito genérico)
- "Você não vai acreditar nisso" (clickbait barato)
- "🚀 Nova tecnologia!!!" (emojis não permitidos)`
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
    console.error("LLM error:", await response.text());
    // Fallback: use title with simple processing
    return title.toUpperCase().slice(0, 60);
  }

  const data = await response.json();
  const headline = data.choices?.[0]?.message?.content?.trim() || title;
  
  // Clean up the headline
  const cleanHeadline = headline
    .replace(/^["']|["']$/g, '') // Remove quotes
    .replace(/\n/g, ' ')
    .trim();
  
  console.log("[apply-text-overlay] Generated headline:", cleanHeadline);
  return cleanHeadline;
}

// Create SVG with text overlay - CÓDIGO APLICA O TEXTO
function createTextOverlaySvg(
  width: number,
  height: number,
  headlineText: string,
  watermarkText: string = "Neural Update"
): string {
  // Calculate text positioning
  const gradientHeight = Math.floor(height * 0.45); // 45% gradient at bottom
  const gradientY = height - gradientHeight;
  
  // Headline positioning - centered, near bottom
  const headlineFontSize = Math.floor(width * 0.065); // ~6.5% of width
  const headlineY = height - Math.floor(height * 0.15); // 15% from bottom
  
  // CTA positioning - below headline
  const ctaFontSize = Math.floor(width * 0.035); // ~3.5% of width
  const ctaY = height - Math.floor(height * 0.06); // 6% from bottom
  
  // Watermark positioning - top right
  const watermarkFontSize = Math.floor(width * 0.025); // ~2.5% of width
  const watermarkX = width - 20;
  const watermarkY = 35;
  
  // Word wrap headline (max ~25 chars per line for readability)
  const words = headlineText.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length > 28 && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  // Limit to 2 lines
  const displayLines = lines.slice(0, 2);
  
  // Generate tspan elements for multiline text
  const headlineLines = displayLines.map((line, index) => {
    const dy = index === 0 ? 0 : headlineFontSize * 1.2;
    return `<tspan x="${width / 2}" dy="${dy}">${escapeXml(line.toUpperCase())}</tspan>`;
  }).join('\n      ');
  
  // Adjust headline Y based on number of lines
  const adjustedHeadlineY = headlineY - ((displayLines.length - 1) * headlineFontSize * 0.6);
  
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <!-- Gradient for bottom overlay -->
    <linearGradient id="bottomGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:rgb(0,0,0);stop-opacity:0" />
      <stop offset="30%" style="stop-color:rgb(0,0,0);stop-opacity:0.5" />
      <stop offset="100%" style="stop-color:rgb(0,0,0);stop-opacity:0.85" />
    </linearGradient>
    
    <!-- Text shadow filter -->
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.7"/>
    </filter>
    
    <!-- Watermark shadow -->
    <filter id="watermarkShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>
  
  <!-- Dark gradient overlay at bottom -->
  <rect x="0" y="${gradientY}" width="${width}" height="${gradientHeight}" fill="url(#bottomGradient)" />
  
  <!-- Main headline - YELLOW/GOLD, BOLD, CENTERED -->
  <text 
    x="${width / 2}" 
    y="${adjustedHeadlineY}" 
    font-family="Arial Black, Helvetica, sans-serif" 
    font-size="${headlineFontSize}px" 
    font-weight="900" 
    fill="#FFD700" 
    text-anchor="middle" 
    filter="url(#textShadow)"
  >
    ${headlineLines}
  </text>
  
  <!-- Call to action - ORANGE/RED, smaller -->
  <text 
    x="${width / 2}" 
    y="${ctaY}" 
    font-family="Arial, Helvetica, sans-serif" 
    font-size="${ctaFontSize}px" 
    font-weight="700" 
    fill="#FF6B35" 
    text-anchor="middle"
    filter="url(#textShadow)"
  >
    ARRASTE PARA MAIS →
  </text>
  
  <!-- Watermark - top right, semi-transparent -->
  <text 
    x="${watermarkX}" 
    y="${watermarkY}" 
    font-family="Arial, Helvetica, sans-serif" 
    font-size="${watermarkFontSize}px" 
    font-weight="600" 
    fill="rgba(255,255,255,0.7)" 
    text-anchor="end"
    filter="url(#watermarkShadow)"
  >
    ${escapeXml(watermarkText)}
  </text>
</svg>`;

  return svg;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Composite image with SVG overlay using Lovable AI image editing
async function compositeImageWithOverlay(
  originalImageUrl: string,
  overlaySvg: string,
  headlineText: string,
  lovableApiKey: string
): Promise<{ data: Uint8Array; contentType: string }> {
  console.log("[apply-text-overlay] Compositing image with text overlay...");
  
  // Since we can't use ImageMagick in Deno edge functions,
  // we use Lovable AI to composite the image with explicit text instructions
  // The key difference: we give EXACT text to render, not ask AI to create text
  
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
            { 
              type: "text", 
              text: `TAREFA: Adicione EXATAMENTE este overlay de texto na imagem. NÃO modifique a imagem original.

TEXTO DA HEADLINE (copie EXATAMENTE, letra por letra):
"${headlineText.toUpperCase()}"

LAYOUT OBRIGATÓRIO:
1. Mantenha a imagem original INTACTA
2. Adicione gradiente preto semi-transparente nos 40% inferiores (de transparente a 85% preto)
3. Coloque a headline em AMARELO DOURADO (#FFD700), fonte bold, centralizado horizontalmente, nos 20% inferiores
4. Abaixo da headline: "ARRASTE PARA MAIS →" em laranja (#FF6B35), menor
5. Canto superior direito: "Neural Update" em branco semi-transparente

REGRAS CRÍTICAS:
- Copie o texto EXATAMENTE como fornecido, sem mudanças
- NÃO invente ou modifique palavras
- Se tiver dúvida sobre uma palavra, mantenha como está
- Use fonte sans-serif, negrito, legível
- Máximo 2 linhas para a headline` 
            },
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
  console.log("[apply-text-overlay] Image composited, size:", imageBytes.length, "type:", contentType);
  
  return { data: imageBytes, contentType };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, title, watermarkText = "Neural Update", generateHeadline = true } = await req.json();

    if (!imageUrl) {
      throw new Error("imageUrl é obrigatório");
    }

    if (!title) {
      throw new Error("title é obrigatório para gerar headline");
    }

    console.log("[apply-text-overlay] Processing image:", imageUrl);
    console.log("[apply-text-overlay] Title:", title.substring(0, 50) + "...");

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // STEP 1: IA gera apenas o TEXTO da headline (não desenha na imagem)
    let headlineText = title;
    if (generateHeadline) {
      headlineText = await generateHeadlineText(title, lovableApiKey);
    }

    // STEP 2: Aplicar overlay via código (IA aplica o texto exato fornecido)
    const { data: finalImageData, contentType } = await compositeImageWithOverlay(
      imageUrl,
      "", // SVG not used directly, but keeping for future pure-code implementation
      headlineText,
      lovableApiKey
    );

    // Generate unique filename
    const filename = `news-overlay-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

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

    console.log("[apply-text-overlay] Image uploaded successfully:", publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        publicUrl,
        originalUrl: imageUrl,
        headline: headlineText,
        hasOverlay: true,
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
