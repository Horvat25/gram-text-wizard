import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageResult {
  url: string;
  source: 'pexels' | 'unsplash' | 'firecrawl' | 'ai';
  sourceId?: string; // ID da imagem na fonte (para evitar repetição)
}

// ============= PEXELS (PRINCIPAL) =============
async function searchPexels(query: string, limit: number = 5): Promise<ImageResult[]> {
  const apiKey = Deno.env.get('PEXELS_API_KEY');
  if (!apiKey) { console.log('[images] Pexels: no API key'); return []; }

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=portrait&size=large`,
      { headers: { 'Authorization': apiKey } }
    );
    if (!response.ok) { console.log('[images] Pexels error:', response.status); return []; }

    const data = await response.json();
    return (data.photos || []).map((p: any) => ({
      url: p.src?.large2x || p.src?.large || p.src?.original,
      source: 'pexels' as const,
      sourceId: `pexels_${p.id}`,
    }));
  } catch (e) {
    console.error('[images] Pexels error:', e);
    return [];
  }
}

// ============= UNSPLASH (FALLBACK) =============
async function searchUnsplash(query: string, limit: number = 5): Promise<ImageResult[]> {
  const accessKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!accessKey) { console.log('[images] Unsplash: no API key'); return []; }

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=portrait`,
      { headers: { 'Authorization': `Client-ID ${accessKey}` } }
    );
    if (!response.ok) { console.log('[images] Unsplash error:', response.status); return []; }

    const data = await response.json();
    return (data.results || []).map((p: any) => ({
      url: p.urls?.regular || p.urls?.full,
      source: 'unsplash' as const,
      sourceId: `unsplash_${p.id}`,
    }));
  } catch (e) {
    console.error('[images] Unsplash error:', e);
    return [];
  }
}

// ============= FIRECRAWL (ÚLTIMO RECURSO WEB) =============
async function searchFirecrawl(query: string, limit: number = 5): Promise<ImageResult[]> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) return [];

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `${query} imagens fotos`,
        limit,
        lang: 'pt-BR',
        country: 'BR',
        scrapeOptions: { formats: ['html'] },
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const images: ImageResult[] = [];

    for (const result of (data.data || [])) {
      const html = result.html || '';
      const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      if (ogMatch?.[1]) {
        images.push({ url: ogMatch[1], source: 'firecrawl', sourceId: `fc_${images.length}` });
      }
    }

    return images.slice(0, limit);
  } catch (e) {
    console.error('[images] Firecrawl error:', e);
    return [];
  }
}

// ============= DOWNLOAD + UPLOAD TO STORAGE =============
async function downloadAndStore(
  imageUrl: string,
  supabase: any,
  index: number
): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*',
      }
    });

    if (!response.ok) {
      console.warn(`[images] Download failed (${response.status}): ${imageUrl.slice(0, 80)}`);
      return null;
    }

    const blob = await response.blob();
    
    // Verificar se é realmente uma imagem
    if (!blob.type.startsWith('image/')) {
      console.warn(`[images] Not an image: ${blob.type}`);
      return null;
    }

    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    const fileName = `video-${Date.now()}-${index}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(fileName, blob, {
        contentType: blob.type || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error(`[images] Upload error:`, uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('post-images')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (e) {
    console.error(`[images] Download/store error:`, e);
    return null;
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
      body: JSON.stringify({ imageUrl, watermarkText: "Neural Update" }),
    });

    if (response.ok) {
      const result = await response.json();
      return result.publicUrl || null;
    }
    return null;
  } catch (e) {
    console.warn('[images] Watermark error:', e);
    return null;
  }
}

// ============= MAIN =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, segments, query, usedImageIds = [] } = await req.json();

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

    const neededCount = segments?.length || 4;
    const searchTerms = [
      searchQuery,
      ...(segments || []).map((s: any) => s.imagePrompt || s.text).slice(0, 2)
    ].filter(Boolean);

    console.log(`[images] Need ${neededCount} images for: ${searchTerms[0]}`);
    console.log(`[images] Used IDs to avoid: ${usedImageIds.length}`);

    const results: { imageUrl: string; source: string; sourceId: string }[] = [];

    // ============= ESTRATÉGIA: Pexels → Unsplash → Firecrawl =============

    // 1. PEXELS (principal) - buscar com múltiplos termos
    let allCandidates: ImageResult[] = [];
    
    const pexelsResults = await Promise.all(
      searchTerms.slice(0, 2).map(q => searchPexels(q, 6))
    );
    allCandidates.push(...pexelsResults.flat());
    console.log(`[images] Pexels: ${allCandidates.length} candidatas`);

    // 2. UNSPLASH (fallback) - só se Pexels não tiver o suficiente
    if (allCandidates.length < neededCount) {
      const unsplashResults = await Promise.all(
        searchTerms.slice(0, 2).map(q => searchUnsplash(q, 5))
      );
      allCandidates.push(...unsplashResults.flat());
      console.log(`[images] + Unsplash: total ${allCandidates.length} candidatas`);
    }

    // 3. FIRECRAWL (último recurso web)
    if (allCandidates.length < neededCount) {
      const firecrawlResults = await searchFirecrawl(searchTerms[0], 5);
      allCandidates.push(...firecrawlResults);
      console.log(`[images] + Firecrawl: total ${allCandidates.length} candidatas`);
    }

    // Deduplicate e filtrar imagens já usadas
    const seenUrls = new Set<string>();
    const usedSet = new Set(usedImageIds);
    const uniqueCandidates = allCandidates.filter(img => {
      if (!img.url || seenUrls.has(img.url)) return false;
      if (img.sourceId && usedSet.has(img.sourceId)) return false;
      seenUrls.add(img.url);
      return true;
    });

    console.log(`[images] Unique candidates after dedup: ${uniqueCandidates.length}`);

    // ============= DOWNLOAD + STORE (garante CORS no render) =============
    
    for (let i = 0; i < Math.min(neededCount, uniqueCandidates.length); i++) {
      const candidate = uniqueCandidates[i];

      // Tentar watermark primeiro (já faz upload)
      const watermarkedUrl = await applyWatermark(candidate.url, supabaseUrl, supabaseKey);
      
      if (watermarkedUrl) {
        results.push({
          imageUrl: watermarkedUrl,
          source: candidate.source,
          sourceId: candidate.sourceId || `${candidate.source}_${i}`,
        });
        console.log(`[images] ✅ ${i + 1}/${neededCount} from ${candidate.source} + watermark`);
        continue;
      }

      // Fallback: download direto pro storage (sem watermark)
      const storedUrl = await downloadAndStore(candidate.url, supabase, i);
      if (storedUrl) {
        results.push({
          imageUrl: storedUrl,
          source: candidate.source,
          sourceId: candidate.sourceId || `${candidate.source}_${i}`,
        });
        console.log(`[images] ✅ ${i + 1}/${neededCount} from ${candidate.source} (no watermark)`);
      } else {
        console.warn(`[images] ❌ Failed to store image ${i + 1} from ${candidate.source}`);
      }
    }

    // ============= FALLBACK AI (se não tiver imagens suficientes) =============
    
    const remaining = neededCount - results.length;
    if (remaining > 0) {
      console.log(`[images] Generating ${remaining} AI fallback images...`);
      
      for (let i = 0; i < remaining; i++) {
        const segIdx = results.length;
        const prompt = segments?.[segIdx]?.imagePrompt || 
                      segments?.[segIdx]?.text || 
                      searchQuery;
        
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              prompt: `${prompt}. Cinematografico, vertical 9:16, ultra HD. NENHUM TEXTO.`,
              format: 'portrait',
              model: 'gemini',
            }),
          });

          if (response.ok) {
            const imgData = await response.json();
            if (imgData.imageUrl) {
              const watermarkedUrl = await applyWatermark(imgData.imageUrl, supabaseUrl, supabaseKey);
              results.push({
                imageUrl: watermarkedUrl || imgData.imageUrl,
                source: 'ai',
                sourceId: `ai_${Date.now()}_${i}`,
              });
              console.log(`[images] ✅ AI image ${i + 1}/${remaining}`);
            }
          }
        } catch (e) {
          console.warn(`[images] AI generation failed:`, e);
        }
      }
    }

    const stats = {
      total: results.length,
      pexels: results.filter(r => r.source === 'pexels').length,
      unsplash: results.filter(r => r.source === 'unsplash').length,
      firecrawl: results.filter(r => r.source === 'firecrawl').length,
      ai: results.filter(r => r.source === 'ai').length,
    };

    console.log(`[images] Final:`, JSON.stringify(stats));

    return new Response(
      JSON.stringify({
        success: true,
        images: results.map(r => ({ imageUrl: r.imageUrl, source: r.source })),
        imageIds: results.map(r => r.sourceId), // Para controle de repetição
        stats,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[images] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
