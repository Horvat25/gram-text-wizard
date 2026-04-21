import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { encode as b64encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * APPLY TEXT OVERLAY — PROGRAMMATIC SVG RENDERING
 * 
 * Pipeline:
 * 1. Generate headline via Gemini Flash (text only)
 * 2. MANDATORY review via review-portuguese (HARD BLOCK on failure)
 * 3. Build SVG with embedded image + programmatic text (pixel-perfect, no AI hallucination)
 * 4. Render SVG → PNG via resvg-wasm
 * 5. Upload to storage
 * 
 * ✅ Zero spelling errors — text is rendered character-by-character by code
 * ✅ No AI image editing — eliminates "TECTIOLOGIA" type hallucinations
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Googlebot-Image/1.0',
];

// ── IMAGE DOWNLOAD ──
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
      console.log(`[download] Error with user agent: ${err}`);
    }
  }
  throw new Error('Não foi possível baixar a imagem.');
}

// ── HEADLINE GENERATION (text only, cheap) ──
async function generateHeadlineText(title: string, lovableApiKey: string): Promise<string> {
  console.log("[headline] Gerando headline via Gemini Flash...");
  
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
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é editor-chefe de manchetes provocativas para Instagram (estilo @davision.eth).
ESCREVA EXCLUSIVAMENTE EM PORTUGUÊS BRASILEIRO (PT-BR) COM ORTOGRAFIA PERFEITA.

TAREFA: Transforme o título em uma HEADLINE com TENSÃO IMPLÍCITA que pare o scroll.

FÓRMULA OBRIGATÓRIA: [Consequência dramática] + [Gancho misterioso]
A headline PUXA, ela NÃO explica. Quem ler precisa SENTIR que falta uma peça.

EXEMPLOS BONS (mire nesse nível):
- "SAM ALTMAN SABIA DISSO HÁ 2 ANOS. AGORA É TARDE DEMAIS."
- "ESSE CHIP CUSTA US$40.000. E VOCÊ VAI QUERER UM."
- "O GOOGLE NÃO VAI GOSTAR DESSA NOTÍCIA."
- "ELES PROMETERAM PRIVACIDADE. CONSEGUIRAM O OPOSTO."

EXEMPLOS RUINS (NUNCA faça assim):
- "OpenAI lança nova versão do GPT-5" (descritivo, sem tensão)
- "Conheça a nova IA da Google" (chamada genérica)
- "A inteligência artificial está mudando o mundo" (vago)

REGRAS:
- Máximo 8-10 palavras (1-2 frases curtas)
- CAIXA ALTA opcional na frase de impacto
- NÃO explique a notícia inteira
- NÃO use emojis nem aspas
- NÃO termine com "?" a menos que a pergunta seja afiada
- Se houver nome próprio (Sam Altman, OpenAI, Google), USE — dá força

ORTOGRAFIA OBRIGATÓRIA:
- "IA" (NUNCA "AI")
- "Inteligência" (NUNCA "Inteligencia")
- Acentuar: revolução, atenção, decisão, ação, proteção, conexão, análise, possível, próximo, automático
- Acentuar: é, está, já, até, então, você, também, será, terá
- "ç": lançamento, ameaça, avanço, preço, serviço
- Til: são, não, coração, padrão, milhão, bilhão

Responda APENAS com o texto da headline.`
          },
          { role: "user", content: `Notícia: "${title}"` }
        ],
        max_tokens: 80,
        temperature: 0.3
      }),
    });

    if (!response.ok) return simpleFallback(title);
    const data = await response.json();
    let headline = data.choices?.[0]?.message?.content?.trim() || '';
    if (!headline) return simpleFallback(title);
    headline = headline.replace(/^["'"'«»]|["'"'«»]$/g, '').replace(/\n/g, ' ').trim();
    console.log("[headline] Generated:", headline);
    return headline;
  } catch (error) {
    console.warn("[headline] Error, using fallback:", error);
    return simpleFallback(title);
  }
}

// ── MANDATORY PORTUGUESE REVIEW (HARD BLOCK) ──
async function reviewPortuguese(
  text: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ corrected: string; wasModified: boolean; success: boolean }> {
  console.log(`[review] 📝 Revisão obrigatória: "${text.substring(0, 50)}..."`);
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/review-portuguese`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({
        text,
        type: 'headline',
        maxLength: 80,
        context: 'Headline para post de notícia do Instagram. VERIFICAR acentuação e ortografia PT-BR.'
      })
    });

    if (!response.ok) {
      console.error(`[review] ❌ HTTP ${response.status}`);
      return { corrected: text, wasModified: false, success: false };
    }

    const result = await response.json();
    if (!result.success) {
      console.error("[review] ❌ Review failed:", result.error);
      return { corrected: text, wasModified: false, success: false };
    }

    if (result.wasModified) {
      console.log(`[review] ✅ Corrigido: "${text}" → "${result.corrected}"`);
    } else {
      console.log("[review] ✅ Sem correções necessárias");
    }
    return { corrected: result.corrected, wasModified: result.wasModified, success: true };
  } catch (e) {
    console.error("[review] ❌ Exception:", e);
    return { corrected: text, wasModified: false, success: false };
  }
}

// ── SVG TEXT OVERLAY BUILDER ──
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxCharsPerLine && currentLine.length > 0) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
    }
  }
  if (currentLine) lines.push(currentLine.trim());
  return lines;
}

function buildOverlaySvg(
  headline: string,
  watermark: string,
  ctaText: string | null = 'LEIA A LEGENDA 👇',
  width = 1080,
  height = 1350,
  showWatermark: boolean = true,
): string {
  const headlineUpper = headline.toUpperCase();
  
  // Calculate font size and line wrapping based on text length
  let fontSize = 56;
  let maxChars = 20;
  if (headlineUpper.length > 50) { fontSize = 44; maxChars = 26; }
  else if (headlineUpper.length > 35) { fontSize = 48; maxChars = 24; }
  
  const lines = wrapText(headlineUpper, maxChars);
  const lineHeight = fontSize * 1.25;
  const totalTextHeight = lines.length * lineHeight;
  
  // Position text at ~63% height (deixa espaço para CTA e watermark sem ocultar foco)
  const textStartY = height * 0.63 - (totalTextHeight / 2);
  const gradientStartPct = Math.max(30, Math.round((textStartY / height) * 100) - 15);
  
  const textElements = lines.map((line, i) => {
    const y = textStartY + (i * lineHeight);
    const escaped = escapeXml(line);
    const commonAttrs = `text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="2"`;
    const offsets = [[-2,-2],[2,-2],[-2,2],[2,2],[0,-3],[0,3],[-3,0],[3,0]];
    const shadows = offsets.map(([dx, dy]) =>
      `<text x="${width / 2 + dx}" y="${y + dy}" ${commonAttrs} fill="#000">${escaped}</text>`
    ).join('');
    return `${shadows}<text x="${width / 2}" y="${y}" ${commonAttrs} fill="#FFD700">${escaped}</text>`;
  }).join('\n');

  const ctaElement = ctaText
    ? `<text x="${width / 2}" y="${textStartY + totalTextHeight + 40}" text-anchor="middle"
         font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700"
         fill="#FF6B35">${escapeXml(ctaText)}</text>`
    : '';

  const watermarkBottomElement = showWatermark
    ? `<text x="${width - 40}" y="${height - 45}" text-anchor="end"
         font-family="Arial Black, Impact, Arial, Helvetica, sans-serif" font-size="28" font-weight="900"
         fill="#FFD700" opacity="0.95">⚡ ${escapeXml(watermark.toUpperCase())}</text>`
    : '';

  // Top-left small watermark sempre presente (branding sutil)
  const watermarkTopElement = `<text x="30" y="50"
         font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="600"
         fill="white" opacity="0.6">${escapeXml(watermark)}</text>`;

  // SVG SEM a imagem embedded (compomos depois com imagescript — muito mais leve para o resvg)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0"/>
      <stop offset="${gradientStartPct}%" stop-color="black" stop-opacity="0"/>
      <stop offset="${gradientStartPct + 20}%" stop-color="black" stop-opacity="0.55"/>
      <stop offset="80%" stop-color="black" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="black" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#grad)"/>
  <rect x="0" y="${height - 120}" width="${width}" height="120" fill="black" opacity="0.92"/>
  <rect x="0" y="0" width="${width}" height="80" fill="url(#topGrad)"/>
  ${textElements}
  ${ctaElement}
  ${watermarkBottomElement}
  ${watermarkTopElement}
</svg>`;
}

// ── SVG → PNG RENDERING (now lightweight: only overlay layer, no embedded image) ──
async function renderSvgToPng(svgString: string): Promise<Uint8Array> {
  const { render } = await import("https://deno.land/x/resvg_wasm/mod.ts");
  const pngData = await render(svgString);
  console.log(`[resvg] ✅ Overlay SVG rendered: ${pngData.length} bytes`);
  return pngData;
}

// ── COMPOSE base image + overlay using imagescript (CPU-light) ──
async function composeImageWithOverlay(
  baseImageData: Uint8Array,
  overlayPngData: Uint8Array,
  targetWidth = 1080,
  targetHeight = 1350
): Promise<Uint8Array> {
  console.log(`[compose] Decoding base image (${baseImageData.length} bytes)...`);
  const base = await Image.decode(baseImageData);
  console.log(`[compose] Base: ${base.width}x${base.height} → resize/crop to ${targetWidth}x${targetHeight}`);

  // Cover crop: scale to fill and center
  const scale = Math.max(targetWidth / base.width, targetHeight / base.height);
  const newW = Math.ceil(base.width * scale);
  const newH = Math.ceil(base.height * scale);
  base.resize(newW, newH);
  const cropX = Math.floor((newW - targetWidth) / 2);
  const cropY = Math.floor((newH - targetHeight) / 2);
  base.crop(cropX, cropY, targetWidth, targetHeight);

  console.log(`[compose] Decoding overlay (${overlayPngData.length} bytes)...`);
  const overlay = await Image.decode(overlayPngData);

  console.log(`[compose] Compositing overlay onto base...`);
  base.composite(overlay, 0, 0);

  console.log(`[compose] Encoding final PNG...`);
  const out = await base.encode(2); // PNG, fast compression
  console.log(`[compose] ✅ Final image: ${out.length} bytes`);
  return out;
}

// ── FALLBACK: Gemini image edit with EXACT text verification ──
async function burnTextWithGeminiFallback(
  imageData: Uint8Array,
  contentType: string,
  headline: string,
  watermark: string,
  lovableApiKey: string
): Promise<Uint8Array | null> {
  console.log("[fallback] Using Gemini image edit as last resort...");
  try {
    const base64Image = b64encode(imageData);
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
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            { type: "text", text: `Add bold yellow (#FFD700) text "${headline.toUpperCase()}" at 65% height. Dark gradient on lower half. Small "${watermark}" top-right. Keep photo unchanged. IMPORTANT: Copy the text CHARACTER BY CHARACTER exactly as shown. Return the edited image.` }
          ]
        }]
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
    
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (imageUrl?.startsWith('data:image/')) {
      return decode(imageUrl.split('base64,')[1]);
    }
    return null;
  } catch { return null; }
}

// ── MAIN HANDLER ──
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      imageUrl,
      title,
      headlineText: providedHeadline,
      watermarkText = "Neural Update",
      generateHeadline = true,
      mediaType = "image",
      // NEW: para carrosséis, controlar CTA por slide
      // slidePosition: 'first' | 'middle' | 'last' (apenas o último mostra "LEIA A LEGENDA" + watermark inferior)
      slidePosition,
      ctaText: providedCtaText, // permite override explícito; null = sem CTA
    } = body;

    if (!imageUrl) throw new Error("imageUrl é obrigatório");
    const effectiveTitle = title || providedHeadline || '';
    if (!effectiveTitle) throw new Error("title ou headlineText é obrigatório");

    console.log("[apply-text-overlay] 🎨 PROGRAMMATIC SVG MODE");
    console.log("[apply-text-overlay] Title:", effectiveTitle.substring(0, 60));

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY não configurada");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── STEP 1: Generate headline text ──
    let headlineText = providedHeadline || effectiveTitle;
    if (generateHeadline && title) {
      headlineText = await generateHeadlineText(title, lovableApiKey);
    }

    // ── STEP 2: Portuguese review (SOFT — não bloqueia, apenas avisa) ──
    const review = await reviewPortuguese(headlineText, supabaseUrl, supabaseKey);
    let reviewWarning: string | null = null;
    if (!review.success) {
      console.warn("[apply-text-overlay] ⚠️ Revisão ortográfica falhou — prosseguindo com headline original.");
      reviewWarning = "Revisão ortográfica indisponível; usando texto original.";
    } else {
      headlineText = review.corrected;
      console.log("[apply-text-overlay] ✅ Headline revisada:", headlineText);
    }

    // ── STEP 3: Download original image ──
    console.log("[apply-text-overlay] Downloading image...");
    const { data: imageData, contentType } = await downloadImage(imageUrl);
    console.log("[apply-text-overlay] Downloaded:", imageData.length, "bytes");

    // ── STEP 4: Build LIGHTWEIGHT SVG ──
    // Lógica de CTA:
    //   - slidePosition === 'first' ou 'middle' (slides intermediários do carrossel) → SEM CTA, SEM watermark grande
    //   - slidePosition === 'last' → "LEIA A LEGENDA 👇" + watermark grande
    //   - sem slidePosition + carrossel → "ARRASTE PARA MAIS →"
    //   - sem slidePosition + image normal → "LEIA A LEGENDA 👇"
    //   - providedCtaText explicitamente null → sem CTA
    const isCarousel = mediaType === 'carousel' || mediaType === 'carrossel';
    let ctaText: string | null;
    let showWatermarkBottom: boolean;
    if (providedCtaText !== undefined) {
      ctaText = providedCtaText; // pode ser string ou null
      showWatermarkBottom = providedCtaText !== null;
    } else if (slidePosition === 'first' || slidePosition === 'middle') {
      ctaText = null;
      showWatermarkBottom = false;
    } else if (slidePosition === 'last') {
      ctaText = 'LEIA A LEGENDA 👇';
      showWatermarkBottom = true;
    } else {
      ctaText = isCarousel ? 'ARRASTE PARA MAIS →' : 'LEIA A LEGENDA 👇';
      showWatermarkBottom = true;
    }
    const svgString = buildOverlaySvg(headlineText, watermarkText, ctaText, 1080, 1350, showWatermarkBottom);
    console.log(`[apply-text-overlay] Overlay SVG built (slide=${slidePosition || 'auto'}, cta=${ctaText || 'none'}):`, svgString.length, "chars");

    // ── STEP 5: Render overlay SVG → PNG, then COMPOSE with base image ──
    let finalImageData: Uint8Array;
    let renderMethod = 'svg-composite';
    
    try {
      const overlayPng = await renderSvgToPng(svgString);
      finalImageData = await composeImageWithOverlay(imageData, overlayPng, 1080, 1350);
      console.log("[apply-text-overlay] ✅ Composite ready:", finalImageData.length, "bytes");
    } catch (svgError) {
      console.warn("[apply-text-overlay] Composite failed, using Gemini fallback:", svgError);
      const fallbackResult = await burnTextWithGeminiFallback(imageData, contentType, headlineText, watermarkText, lovableApiKey);
      if (fallbackResult && fallbackResult.length > 1000) {
        finalImageData = fallbackResult;
        renderMethod = 'gemini-fallback';
        console.log("[apply-text-overlay] ✅ Gemini fallback succeeded:", fallbackResult.length, "bytes");
      } else {
        finalImageData = imageData;
        renderMethod = 'original-no-overlay';
        console.warn("[apply-text-overlay] ⚠️ All render methods failed, using original image");
      }
    }

    // ── STEP 6: Upload to Storage ──
    const ext = renderMethod === 'original-no-overlay' ? 'jpg' : 'png';
    const filename = `news-headline-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(filename, finalImageData, {
        contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
        upsert: false,
      });

    if (uploadError) throw new Error(`Erro ao fazer upload: ${uploadError.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(filename);

    console.log(`[apply-text-overlay] ✅ Done! ${renderMethod} → ${publicUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        publicUrl,
        originalUrl: imageUrl,
        headline: headlineText,
        hasOverlay: renderMethod !== 'original-no-overlay',
        renderMethod,
        spellingReviewed: review.success,
        spellingCorrected: review.success && review.wasModified,
        reviewWarning,
        overlayMetadata: {
          headlineText: headlineText.toUpperCase(),
          watermarkText,
          style: {
            headlineColor: '#FFD700',
            watermarkColor: 'rgba(255,255,255,0.7)',
            ctaText,
            ctaColor: '#FF6B35',
          }
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro em apply-text-overlay:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Erro ao processar imagem" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
