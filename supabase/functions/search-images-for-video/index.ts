import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= MÚLTIPLAS FONTES DE IMAGENS =============

interface ImageResult {
  url: string;
  source: 'pexels' | 'unsplash' | 'pixabay' | 'firecrawl' | 'ai';
  sourceUrl?: string;
  photographer?: string;
}

// PEXELS API - Imagens de alta qualidade, gratuitas
async function searchPexels(query: string, limit: number = 5): Promise<ImageResult[]> {
  const apiKey = Deno.env.get('PEXELS_API_KEY');
  if (!apiKey) {
    console.log('[search-images] Pexels API key not configured');
    return [];
  }

  try {
    console.log('[search-images] Searching Pexels:', query);
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=portrait`,
      {
        headers: { 'Authorization': apiKey }
      }
    );

    if (!response.ok) {
      console.log('[search-images] Pexels error:', response.status);
      return [];
    }

    const data = await response.json();
    return (data.photos || []).map((photo: any) => ({
      url: photo.src?.large2x || photo.src?.large || photo.src?.original,
      source: 'pexels' as const,
      sourceUrl: photo.url,
      photographer: photo.photographer
    }));
  } catch (e) {
    console.error('[search-images] Pexels error:', e);
    return [];
  }
}

// UNSPLASH API - Imagens artísticas de alta qualidade
async function searchUnsplash(query: string, limit: number = 5): Promise<ImageResult[]> {
  const accessKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!accessKey) {
    console.log('[search-images] Unsplash API key not configured');
    return [];
  }

  try {
    console.log('[search-images] Searching Unsplash:', query);
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=portrait`,
      {
        headers: { 'Authorization': `Client-ID ${accessKey}` }
      }
    );

    if (!response.ok) {
      console.log('[search-images] Unsplash error:', response.status);
      return [];
    }

    const data = await response.json();
    return (data.results || []).map((photo: any) => ({
      url: photo.urls?.regular || photo.urls?.full,
      source: 'unsplash' as const,
      sourceUrl: photo.links?.html,
      photographer: photo.user?.name
    }));
  } catch (e) {
    console.error('[search-images] Unsplash error:', e);
    return [];
  }
}

// PIXABAY API - Grande variedade, gratuito
async function searchPixabay(query: string, limit: number = 5): Promise<ImageResult[]> {
  const apiKey = Deno.env.get('PIXABAY_API_KEY');
  if (!apiKey) {
    console.log('[search-images] Pixabay API key not configured');
    return [];
  }

  try {
    console.log('[search-images] Searching Pixabay:', query);
    const response = await fetch(
      `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=${limit}&image_type=photo&orientation=vertical&safesearch=true`
    );

    if (!response.ok) {
      console.log('[search-images] Pixabay error:', response.status);
      return [];
    }

    const data = await response.json();
    return (data.hits || []).map((photo: any) => ({
      url: photo.largeImageURL || photo.webformatURL,
      source: 'pixabay' as const,
      sourceUrl: photo.pageURL,
      photographer: photo.user
    }));
  } catch (e) {
    console.error('[search-images] Pixabay error:', e);
    return [];
  }
}

// FIRECRAWL - Busca imagens em sites de notícias
async function searchFirecrawl(query: string, limit: number = 5): Promise<ImageResult[]> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    console.log('[search-images] Firecrawl API key not configured');
    return [];
  }

  try {
    console.log('[search-images] Searching Firecrawl:', query);
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `${query} imagens fotos`,
        limit: limit,
        lang: 'pt-BR',
        country: 'BR',
        scrapeOptions: { formats: ['html'] },
      }),
    });

    if (!response.ok) {
      console.log('[search-images] Firecrawl error:', response.status);
      return [];
    }

    const data = await response.json();
    const images: ImageResult[] = [];

    for (const result of (data.data || [])) {
      const html = result.html || '';
      const sourceUrl = result.metadata?.sourceURL || result.url;

      // Extrair og:image
      const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      if (ogImageMatch?.[1]) {
        images.push({ url: ogImageMatch[1], source: 'firecrawl', sourceUrl });
      }

      // Extrair twitter:image
      const twitterMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
      if (twitterMatch?.[1] && !images.some(i => i.url === twitterMatch[1])) {
        images.push({ url: twitterMatch[1], source: 'firecrawl', sourceUrl });
      }

      // Extrair imagens grandes do HTML
      const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
      let match;
      while ((match = imgRegex.exec(html)) !== null) {
        const src = match[1];
        const isValid = src.startsWith('http') && 
                       src.length > 50 &&
                       !src.includes('icon') && 
                       !src.includes('logo') && 
                       !src.includes('avatar') &&
                       !src.includes('1x1') &&
                       !src.includes('pixel') &&
                       !src.includes('thumb') &&
                       !src.includes('sprite') &&
                       !src.includes('data:image') &&
                       !images.some(i => i.url === src);
        if (isValid) {
          images.push({ url: src, source: 'firecrawl', sourceUrl });
        }
      }
    }

    return images.slice(0, limit);
  } catch (e) {
    console.error('[search-images] Firecrawl error:', e);
    return [];
  }
}

// ============= WATERMARK =============

async function applyWatermark(
  imageUrl: string, 
  supabaseUrl: string, 
  supabaseKey: string
): Promise<string | null> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ 
        imageUrl,
        watermarkText: "Neural Update"
      }),
    });

    if (response.ok) {
      const result = await response.json();
      return result.publicUrl || null;
    }
    return null;
  } catch (e) {
    console.error('[search-images] Watermark error:', e);
    return null;
  }
}

// ============= MAIN =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      topic, 
      segments,
      preferRealImages = true,
      query // Query direta para busca
    } = await req.json();

    const searchQuery = query || topic;
    
    if (!searchQuery && (!segments || segments.length === 0)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Topic, query or segments required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    console.log('[search-images] Topic/Query:', searchQuery);
    console.log('[search-images] Segments:', segments?.length || 0);
    console.log('[search-images] Prefer real images:', preferRealImages);

    const results: { imageUrl: string; source: string; sourceUrl?: string }[] = [];
    const neededCount = segments?.length || 4;

    // ============= ESTRATÉGIA: BUSCAR EM PARALELO DE MÚLTIPLAS FONTES =============
    
    if (preferRealImages) {
      // Criar queries de busca
      const searchQueries = [
        searchQuery,
        ...(segments || []).map((s: any) => s.imagePrompt || s.text).slice(0, 3)
      ].filter(Boolean);

      console.log('[search-images] Search queries:', searchQueries.length);

      // Buscar em TODAS as fontes em paralelo
      const searchPromises = searchQueries.slice(0, 2).flatMap(q => [
        searchPexels(q, 3),
        searchUnsplash(q, 3),
        searchPixabay(q, 3),
        searchFirecrawl(q, 3),
      ]);

      const allResults = await Promise.all(searchPromises);
      const allImages = allResults.flat();

      console.log('[search-images] Found', allImages.length, 'candidate images from all sources');

      // Priorizar por fonte (Pexels/Unsplash são mais confiáveis)
      const prioritizedImages = [
        ...allImages.filter(i => i.source === 'pexels'),
        ...allImages.filter(i => i.source === 'unsplash'),
        ...allImages.filter(i => i.source === 'pixabay'),
        ...allImages.filter(i => i.source === 'firecrawl'),
      ];

      // Deduplicate por URL
      const uniqueImages = Array.from(
        new Map(prioritizedImages.map(img => [img.url, img])).values()
      );

      console.log('[search-images] Unique images:', uniqueImages.length);

      // Processar imagens (aplicar watermark e fazer upload)
      for (let i = 0; i < neededCount && i < uniqueImages.length; i++) {
        const img = uniqueImages[i];
        
        try {
          // Aplicar watermark via função dedicada
          const watermarkedUrl = await applyWatermark(img.url, supabaseUrl, supabaseKey);
          
          if (watermarkedUrl) {
            results.push({
              imageUrl: watermarkedUrl,
              source: img.source,
              sourceUrl: img.sourceUrl
            });
            console.log(`[search-images] ✅ Image ${i + 1} from ${img.source} + watermark`);
            continue;
          }
          
          // Fallback: upload sem watermark
          console.log(`[search-images] Watermark failed, uploading without...`);
          const imageResponse = await fetch(img.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'image/*',
            }
          });
          
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
                source: img.source,
                sourceUrl: img.sourceUrl
              });
              console.log(`[search-images] ✅ Image ${i + 1} from ${img.source} (no watermark)`);
            }
          }
        } catch (e) {
          console.warn(`[search-images] Failed to process image ${i}:`, e);
        }
      }
    }

    // ============= FALLBACK: GERAR COM IA =============
    
    const remainingCount = neededCount - results.length;
    if (remainingCount > 0 && LOVABLE_API_KEY) {
      console.log(`[search-images] Generating ${remainingCount} images with AI...`);
      
      for (let i = 0; i < remainingCount; i++) {
        const segmentIndex = results.length;
        const prompt = segments?.[segmentIndex]?.imagePrompt || 
                      segments?.[segmentIndex]?.text || 
                      searchQuery;
        
        try {
          console.log(`[search-images] Generating AI image ${i + 1}/${remainingCount}...`);
          
          // Usar generate-image que já tem retry logic
          const response = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              prompt: `${prompt}. Cinematográfico, vertical 9:16, ultra HD. NENHUM TEXTO.`,
              format: 'portrait',
              model: 'gemini',
            }),
          });

          if (response.ok) {
            const imgData = await response.json();
            
            if (imgData.imageUrl) {
              // Aplicar watermark na imagem gerada
              const watermarkedUrl = await applyWatermark(imgData.imageUrl, supabaseUrl, supabaseKey);
              
              results.push({
                imageUrl: watermarkedUrl || imgData.imageUrl,
                source: 'ai'
              });
              console.log(`[search-images] ✅ AI image ${i + 1} generated${watermarkedUrl ? ' + watermark' : ''}`);
            }
          }
        } catch (e) {
          console.warn(`[search-images] AI generation failed:`, e);
        }
      }
    }

    // Estatísticas por fonte
    const stats = {
      total: results.length,
      pexels: results.filter(r => r.source === 'pexels').length,
      unsplash: results.filter(r => r.source === 'unsplash').length,
      pixabay: results.filter(r => r.source === 'pixabay').length,
      firecrawl: results.filter(r => r.source === 'firecrawl').length,
      ai: results.filter(r => r.source === 'ai').length,
    };

    console.log(`[search-images] Final stats:`, stats);

    return new Response(
      JSON.stringify({ 
        success: true, 
        images: results.map(r => r.imageUrl), // Compatibilidade
        detailedImages: results, // Info completa
        stats
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[search-images] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
