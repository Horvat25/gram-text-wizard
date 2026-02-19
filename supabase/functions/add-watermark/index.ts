import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * WATERMARK — CUSTO ZERO
 * 
 * Não usa nenhum modelo de IA de imagem (gemini-2.5-flash-image foi removido).
 * A imagem é baixada e salva no Storage SEM modificação.
 * O texto de watermark é retornado como metadado para o frontend aplicar via Canvas.
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Googlebot-Image/1.0',
];

async function downloadImage(imageUrl: string): Promise<{ data: Uint8Array; contentType: string }> {
  // If it's already a base64 data URL, decode it
  if (imageUrl.startsWith('data:image/')) {
    const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) throw new Error("Invalid base64 image format");
    const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
    return {
      data: decode(base64Match[2]),
      contentType: `image/${base64Match[1]}`,
    };
  }

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
      console.log(`[add-watermark] Retry with different UA`);
    }
  }
  
  throw new Error('Não foi possível baixar a imagem.');
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

    console.log("[add-watermark] 💰 CUSTO ZERO — sem IA de imagem");
    console.log("[add-watermark] Watermark:", watermarkText);
    console.log("[add-watermark] Headline:", headlineText ? headlineText.substring(0, 50) + "..." : "none");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Baixar imagem (sem modificar)
    const { data: imageData, contentType } = await downloadImage(imageUrl);
    console.log("[add-watermark] Image downloaded:", imageData.length, "bytes");

    // 2. Upload direto para Storage (sem processar com IA)
    let extension = 'jpg';
    if (contentType.includes('png')) extension = 'png';
    else if (contentType.includes('webp')) extension = 'webp';
    
    const filename = `watermarked-${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(filename, imageData, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(filename);

    console.log("[add-watermark] ✅ Upload sem IA:", publicUrl);

    // 3. Retornar URL + metadados de watermark para o frontend aplicar via Canvas
    return new Response(
      JSON.stringify({
        success: true,
        publicUrl,
        originalUrl: imageUrl,
        hasWatermark: true,
        hasHeadline: !!(headlineText),
        // Metadados para renderização no frontend (custo zero)
        watermarkMetadata: {
          watermarkText,
          headlineText: headlineText || null,
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
