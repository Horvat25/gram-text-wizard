import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= TRANSLATE QUERY TO ENGLISH (for better Pexels results) =============
async function translateToEnglish(query: string): Promise<string> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableKey) return query;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{
          role: "user",
          content: `Translate this image search query to English. Return ONLY the translated query, nothing else. Keep proper nouns as-is. Make it a good stock photo search query (2-4 words).

Query: "${query}"`
        }],
      }),
    });

    if (!response.ok) return query;
    const data = await response.json();
    const translated = data.choices?.[0]?.message?.content?.trim();
    if (translated && translated.length > 2 && translated.length < 100) {
      console.log(`[images] Translated: "${query}" → "${translated}"`);
      return translated;
    }
    return query;
  } catch {
    return query;
  }
}

// ============= PEXELS (per-segment search) =============
async function searchPexels(query: string, limit: number = 3): Promise<{ url: string; sourceId: string }[]> {
  const apiKey = Deno.env.get('PEXELS_API_KEY');
  if (!apiKey) return [];

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=portrait&size=large`,
      { headers: { 'Authorization': apiKey } }
    );
    if (!response.ok) return [];

    const data = await response.json();
    return (data.photos || []).map((p: any) => ({
      url: p.src?.large2x || p.src?.large || p.src?.original,
      sourceId: `pexels_${p.id}`,
    }));
  } catch {
    return [];
  }
}

// ============= UNSPLASH (fallback per-segment) =============
async function searchUnsplash(query: string, limit: number = 3): Promise<{ url: string; sourceId: string }[]> {
  const accessKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!accessKey) return [];

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=portrait`,
      { headers: { 'Authorization': `Client-ID ${accessKey}` } }
    );
    if (!response.ok) return [];

    const data = await response.json();
    return (data.results || []).map((p: any) => ({
      url: p.urls?.regular || p.urls?.full,
      sourceId: `unsplash_${p.id}`,
    }));
  } catch {
    return [];
  }
}

// ============= DOWNLOAD + UPLOAD TO STORAGE =============
async function downloadAndStore(imageUrl: string, supabase: any, index: number): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*',
      }
    });

    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;

    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    const fileName = `video-${Date.now()}-${index}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(fileName, blob, { contentType: blob.type || 'image/jpeg', upsert: true });

    if (uploadError) return null;

    const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch {
    return null;
  }
}

// ============= WATERMARK =============
async function applyWatermark(imageUrl: string, supabaseUrl: string, supabaseKey: string): Promise<string | null> {
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
  } catch {
    return null;
  }
}

// ============= FIND BEST IMAGE FOR A SEGMENT =============
async function findImageForSegment(
  searchQuery: string,
  usedIds: Set<string>,
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  segIndex: number
): Promise<{ imageUrl: string; source: string; sourceId: string } | null> {
  
  // Translate to English for better stock photo results
  const englishQuery = await translateToEnglish(searchQuery);
  
  // Try Pexels first
  let candidates = await searchPexels(englishQuery, 5);
  let source = 'pexels';
  
  // Filter already used
  candidates = candidates.filter(c => !usedIds.has(c.sourceId));
  
  // Fallback to Unsplash
  if (candidates.length === 0) {
    candidates = await searchUnsplash(englishQuery, 5);
    candidates = candidates.filter(c => !usedIds.has(c.sourceId));
    source = 'unsplash';
  }
  
  // Also try original Portuguese query if English gave nothing
  if (candidates.length === 0 && englishQuery !== searchQuery) {
    candidates = await searchPexels(searchQuery, 5);
    candidates = candidates.filter(c => !usedIds.has(c.sourceId));
    source = 'pexels';
  }
  
  if (candidates.length === 0) return null;
  
  const chosen = candidates[0];
  usedIds.add(chosen.sourceId);
  
  // Try watermark first (also uploads to storage)
  const watermarkedUrl = await applyWatermark(chosen.url, supabaseUrl, supabaseKey);
  if (watermarkedUrl) {
    console.log(`[images] ✅ Seg ${segIndex + 1}: ${source} + watermark (query: "${englishQuery}")`);
    return { imageUrl: watermarkedUrl, source, sourceId: chosen.sourceId };
  }
  
  // Fallback: direct download to storage
  const storedUrl = await downloadAndStore(chosen.url, supabase, segIndex);
  if (storedUrl) {
    console.log(`[images] ✅ Seg ${segIndex + 1}: ${source} stored (query: "${englishQuery}")`);
    return { imageUrl: storedUrl, source, sourceId: chosen.sourceId };
  }
  
  return null;
}

// ============= AI FALLBACK =============
async function generateAIImage(
  prompt: string,
  supabaseUrl: string,
  supabaseKey: string,
  segIndex: number
): Promise<{ imageUrl: string; source: string; sourceId: string } | null> {
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
        console.log(`[images] ✅ Seg ${segIndex + 1}: AI generated`);
        return {
          imageUrl: watermarkedUrl || imgData.imageUrl,
          source: 'ai',
          sourceId: `ai_${Date.now()}_${segIndex}`,
        };
      }
    }
  } catch (e) {
    console.warn(`[images] AI generation failed for seg ${segIndex}:`, e);
  }
  return null;
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
    const usedIds = new Set<string>(usedImageIds);

    console.log(`[images] Need ${neededCount} images for: "${searchQuery}"`);
    console.log(`[images] Segments with imagePrompt: ${segments?.filter((s: any) => s.imagePrompt).length || 0}`);

    const results: { imageUrl: string; source: string; sourceId: string }[] = [];

    // ============= SEARCH PER SEGMENT (each gets its own targeted query) =============
    for (let i = 0; i < neededCount; i++) {
      const segQuery = segments?.[i]?.imagePrompt || segments?.[i]?.text || searchQuery;
      
      const result = await findImageForSegment(segQuery, usedIds, supabase, supabaseUrl, supabaseKey, i);
      
      if (result) {
        results.push(result);
      } else {
        // AI fallback for this segment
        console.log(`[images] ⚠️ Seg ${i + 1}: no stock photo found, trying AI...`);
        const aiResult = await generateAIImage(segQuery, supabaseUrl, supabaseKey, i);
        if (aiResult) {
          results.push(aiResult);
        } else {
          console.warn(`[images] ❌ Seg ${i + 1}: all sources failed`);
        }
      }
    }

    const stats = {
      total: results.length,
      pexels: results.filter(r => r.source === 'pexels').length,
      unsplash: results.filter(r => r.source === 'unsplash').length,
      ai: results.filter(r => r.source === 'ai').length,
    };

    console.log(`[images] Final:`, JSON.stringify(stats));

    return new Response(
      JSON.stringify({
        success: true,
        images: results.map(r => ({ imageUrl: r.imageUrl, source: r.source })),
        imageIds: results.map(r => r.sourceId),
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
