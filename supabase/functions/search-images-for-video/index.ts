import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      topic, 
      segments, // Array of { text, imagePrompt } for each video segment
      preferRealImages = true 
    } = await req.json();

    if (!topic && (!segments || segments.length === 0)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Topic or segments required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[search-images-for-video] Topic:', topic);
    console.log('[search-images-for-video] Segments:', segments?.length || 0);
    console.log('[search-images-for-video] Prefer real images:', preferRealImages);

    const results: { imageUrl: string; source: 'web' | 'ai'; sourceUrl?: string }[] = [];

    // Strategy: Search for images on the web first
    if (preferRealImages && apiKey) {
      console.log('[search-images-for-video] Searching for real images on the web...');
      
      // Create search queries based on topic and segment prompts
      const searchQueries = [
        topic,
        ...(segments || []).map((s: any) => s.imagePrompt || s.text).slice(0, 3)
      ].filter(Boolean);

      const allImages: { url: string; query: string; sourceUrl?: string }[] = [];

      // Search for each query
      for (const query of searchQueries.slice(0, 2)) { // Limit to 2 searches
        try {
          console.log('[search-images-for-video] Searching:', query.substring(0, 50) + '...');
          
          const response = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `${query} imagens fotos`,
              limit: 5,
              lang: 'pt-BR',
              country: 'BR',
              scrapeOptions: {
                formats: ['html'],
              },
            }),
          });

          if (response.ok) {
            const data = await response.json();
            
            // Extract images from results
            for (const result of (data.data || [])) {
              const html = result.html || '';
              const sourceUrl = result.metadata?.sourceURL || result.url;
              
              // Extract og:image (highest quality, most relevant)
              const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
              if (ogImageMatch && ogImageMatch[1]) {
                allImages.push({ url: ogImageMatch[1], query, sourceUrl });
              }
              
              // Extract twitter:image
              const twitterMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
              if (twitterMatch && twitterMatch[1]) {
                allImages.push({ url: twitterMatch[1], query, sourceUrl });
              }
              
              // Extract large images from HTML
              const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
              let match;
              while ((match = imgRegex.exec(html)) !== null) {
                const src = match[1];
                // Filter out icons, logos, avatars
                const isValid = src.startsWith('http') && 
                               src.length > 50 && // Usually good images have long URLs
                               !src.includes('icon') && 
                               !src.includes('logo') && 
                               !src.includes('avatar') &&
                               !src.includes('1x1') &&
                               !src.includes('pixel') &&
                               !src.includes('thumb') &&
                               !src.includes('sprite') &&
                               !src.includes('data:image');
                if (isValid) {
                  allImages.push({ url: src, query, sourceUrl });
                }
              }
            }
          }
        } catch (e) {
          console.warn('[search-images-for-video] Search error:', e);
        }
      }

      console.log('[search-images-for-video] Found', allImages.length, 'candidate images');

      // Deduplicate and select best images
      const uniqueImages = Array.from(new Map(allImages.map(img => [img.url, img])).values());
      
      // Select images for each segment (or as many as needed)
      const segmentCount = segments?.length || 4;
      for (let i = 0; i < segmentCount && i < uniqueImages.length; i++) {
        const img = uniqueImages[i];
        
        // Upload image to Supabase storage with watermark
        try {
          const imageResponse = await fetch(img.url);
          if (imageResponse.ok) {
            const imageBlob = await imageResponse.blob();
            const fileName = `video-${Date.now()}-${i}.jpg`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('post-images')
              .upload(fileName, imageBlob, { 
                contentType: imageBlob.type || 'image/jpeg',
                upsert: true 
              });
            
            if (!uploadError && uploadData) {
              const { data: urlData } = supabase.storage
                .from('post-images')
                .getPublicUrl(fileName);
              
              results.push({
                imageUrl: urlData.publicUrl,
                source: 'web',
                sourceUrl: img.sourceUrl
              });
              console.log(`[search-images-for-video] ✅ Image ${i + 1} saved from web`);
            }
          }
        } catch (e) {
          console.warn(`[search-images-for-video] Failed to process image ${i}:`, e);
        }
      }
    }

    // Fallback: Generate remaining images with AI
    const neededCount = (segments?.length || 4) - results.length;
    if (neededCount > 0 && LOVABLE_API_KEY) {
      console.log(`[search-images-for-video] Need to generate ${neededCount} images with AI...`);
      
      // Use Gemini for image generation as fallback
      for (let i = 0; i < neededCount; i++) {
        const segmentIndex = results.length;
        const prompt = segments?.[segmentIndex]?.imagePrompt || 
                      segments?.[segmentIndex]?.text || 
                      topic;
        
        try {
          console.log(`[search-images-for-video] Generating AI image ${i + 1}/${neededCount}...`);
          
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-pro-image-preview",
              messages: [
                {
                  role: "user",
                  content: `Gere uma imagem fotorrealística e cinematográfica sobre: ${prompt}. 
                           Estilo: editorial de tecnologia, iluminação dramática, formato vertical 9:16.
                           Sem texto na imagem. Alta qualidade.`
                }
              ],
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const imageContent = data.choices?.[0]?.message?.content;
            
            // If it's a URL or base64 image
            if (imageContent && (imageContent.startsWith('http') || imageContent.startsWith('data:image'))) {
              results.push({
                imageUrl: imageContent,
                source: 'ai'
              });
              console.log(`[search-images-for-video] ✅ AI image ${i + 1} generated`);
            }
          }
        } catch (e) {
          console.warn(`[search-images-for-video] AI generation failed:`, e);
        }
      }
    }

    console.log(`[search-images-for-video] Total images: ${results.length} (web: ${results.filter(r => r.source === 'web').length}, AI: ${results.filter(r => r.source === 'ai').length})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        images: results,
        stats: {
          total: results.length,
          fromWeb: results.filter(r => r.source === 'web').length,
          fromAI: results.filter(r => r.source === 'ai').length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[search-images-for-video] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
