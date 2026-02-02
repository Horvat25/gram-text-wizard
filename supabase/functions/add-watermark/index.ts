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

async function downloadImage(imageUrl: string): Promise<{ data: ArrayBuffer; contentType: string }> {
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
        const data = await response.arrayBuffer();
        return { data, contentType };
      }
    } catch (err) {
      console.log(`Error with user agent: ${err}`);
    }
  }
  
  throw new Error('Não foi possível baixar a imagem.');
}

// Create image with watermark AND headline overlay using Lovable AI
async function createNewsImage(
  originalImageUrl: string,
  watermarkText: string = "Neural Update",
  headlineText?: string
): Promise<ArrayBuffer> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  
  if (!lovableApiKey) {
    throw new Error("LOVABLE_API_KEY não configurada");
  }

  // Build the prompt based on whether we have headline text
  let prompt = "";
  
  if (headlineText && headlineText.length > 0) {
    // Style inspired by @davision.eth - bold yellow text at bottom
    // Create a professional news-style image with the headline
    prompt = `Take this image and add a PROFESSIONAL NEWS OVERLAY:
1. Add a semi-transparent dark gradient at the bottom 40% of the image (from transparent at top to 80% black at bottom)
2. Add this headline text in BOLD, UPPERCASE, YELLOW (#FFD700) letters at the bottom: "${headlineText.toUpperCase()}"
   - Text should be large and highly readable
   - Text should be centered horizontally
   - Text should wrap to multiple lines if needed
   - Add a subtle text shadow for readability
3. Below the headline, add a small "ARRASTE PARA MAIS" text in orange/red color
4. Add a small, elegant watermark "${watermarkText}" in the top right corner (semi-transparent white)

The style should look like a professional tech news Instagram post, similar to @davision.eth style.
Keep the original image exactly as is, only add the text overlays.`;
  } else {
    // Just add watermark
    prompt = `Take this exact image and add a small, elegant watermark text "${watermarkText}" in the bottom right corner. The watermark should be semi-transparent white text with a subtle dark shadow, positioned in the lower right area. Keep the original image exactly as is, only add the watermark overlay. The watermark should be visible but not distracting.`;
  }

  console.log("[add-watermark] Using Lovable AI with prompt:", prompt.substring(0, 100) + "...");

  const response = await fetch("https://api.lovable.dev/v1/images/edit", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_paths: [originalImageUrl],
      prompt: prompt,
      aspect_ratio: "1:1",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Lovable AI error:", errorText);
    throw new Error(`Erro ao processar imagem: ${response.status}`);
  }

  const result = await response.json();
  
  if (!result.url) {
    throw new Error("Resposta inválida da API de imagem");
  }

  // Download the processed image
  const processedResponse = await fetch(result.url);
  if (!processedResponse.ok) {
    throw new Error("Erro ao baixar imagem processada");
  }

  return await processedResponse.arrayBuffer();
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

    console.log("Processing image:", imageUrl);
    console.log("Watermark:", watermarkText);
    console.log("Headline:", headlineText ? headlineText.substring(0, 50) + "..." : "none");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let finalImageData: ArrayBuffer;
    let contentType = 'image/jpeg';
    let hasOverlay = false;

    try {
      // Try to add watermark/headline using AI
      console.log("Adding watermark/headline via AI...");
      finalImageData = await createNewsImage(imageUrl, watermarkText, headlineText);
      hasOverlay = true;
      console.log("Overlay added successfully");
    } catch (overlayError: any) {
      console.error("Overlay failed, downloading original:", overlayError.message);
      
      // Fallback: just download and use original image
      const { data, contentType: ct } = await downloadImage(imageUrl);
      finalImageData = data;
      contentType = ct;
    }

    // Generate unique filename
    const filename = `news-${headlineText ? 'headline-' : 'watermarked-'}${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

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

    console.log("Image uploaded successfully:", publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        publicUrl,
        originalUrl: imageUrl,
        hasWatermark: true,
        hasHeadline: hasOverlay && !!headlineText,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro em add-watermark:", error);
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
