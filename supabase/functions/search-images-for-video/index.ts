import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= SCRAPE ARTICLE VIA FIRECRAWL =============
async function scrapeArticle(url: string, firecrawlKey: string): Promise<{
  title: string;
  description: string;
  ogImage: string | null;
  images: string[];
  content: string;
} | null> {
  if (!url || !firecrawlKey) return null;

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        onlyMainContent: false,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const result = data.data || data;

    const html = result.html || '';
    const markdown = result.markdown || '';
    const metadata = result.metadata || {};

    // Extract OG image (most reliable)
    const ogImage = metadata.ogImage || metadata.og?.image || null;

    // Extract all images from HTML
    const images: string[] = [];
    if (ogImage) images.push(ogImage);

    // Parse srcset and img src from HTML
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const src = imgMatch[1];
      if (src.startsWith('http') && !src.includes('icon') && !src.includes('logo') &&
          !src.includes('1x1') && !src.includes('pixel') && !images.includes(src)) {
        images.push(src);
      }
    }

    // Extract from markdown
    const mdImgRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi;
    let mdMatch;
    while ((mdMatch = mdImgRegex.exec(markdown)) !== null) {
      const url = mdMatch[1];
      if (!images.includes(url) && !url.includes('icon') && !url.includes('logo')) {
        images.push(url);
      }
    }

    return {
      title: metadata.title || '',
      description: metadata.description || '',
      ogImage,
      images: images.slice(0, 5),
      content: markdown.slice(0, 3000),
    };
  } catch (e) {
    console.warn('[images] Firecrawl scrape failed:', e);
    return null;
  }
}

// ============= GENERATE SEARCH QUERIES FROM TITLE (SEM IA — CUSTO ZERO) =============
/**
 * Gera 4 queries de busca diretamente a partir do título, sem chamar nenhuma IA.
 * Custo: $0.00 (era ~$0.0002 por vídeo com flash-lite, mas desnecessário)
 */
function buildSearchQueriesFromTitle(title: string, description: string = ''): {
  companies: string[];
  products: string[];
  technologies: string[];
  people: string[];
  searchQueries: {
    image1: string;
    image2: string;
    image3: string;
    image4: string;
  };
} {
  // Palavras chave extraídas do título (primeiras palavras significativas)
  const cleanTitle = title.replace(/["""''«»\[\]()]/g, '').trim();
  
  // Pega as primeiras 4-5 palavras do título como query principal
  const titleWords = cleanTitle.split(/\s+/).filter(w => w.length > 2);
  const shortTitle = titleWords.slice(0, 5).join(' ');
  
  // Combina título + início da descrição para contexto
  const contextWords = description ? description.split(/\s+/).slice(0, 4).join(' ') : '';

  const searchQueries = {
    image1: shortTitle,
    image2: titleWords.slice(0, 4).join(' ') + ' technology',
    image3: titleWords.slice(0, 3).join(' ') + (contextWords ? ' ' + contextWords.split(' ')[0] : ' innovation'),
    image4: titleWords.slice(0, 3).join(' ') + ' future',
  };

  console.log('[images] 💰 Queries sem IA (custo zero):', JSON.stringify(searchQueries));

  return {
    companies: [],
    products: [],
    technologies: [],
    people: [],
    searchQueries,
  };
}

// ============= VALIDATE IMAGE RELEVANCE =============
async function validateImageRelevance(
  imageUrl: string,
  query: string,
  entities: string[],
  lovableKey: string
): Promise<boolean> {
  // Basic URL validation - check if domain matches entity names
  const urlLower = imageUrl.toLowerCase();
  const queryWords = query.toLowerCase().split(' ').filter(w => w.length > 3);

  // Auto-approve official domains and known press image CDNs
  const trustedCdns = ['images.apple.com', 'newsroom.apple.com', 'static01.nyt', 
    'media.wired', 'techcrunch.com', 'arstechnica.net', 'cdn.vox-cdn',
    'images.macrumors', 'assets.bwbx.io', 'image.cnbc', 'zdnet', 'verge',
    'engadget', 'theguardian', 'reuters', 'apnews', 'bloomberg'];
  
  if (trustedCdns.some(cdn => urlLower.includes(cdn))) return true;

  // Check if entity names appear in the URL path (good signal)
  const entitiesInUrl = entities.some(e => urlLower.includes(e.toLowerCase().replace(' ', '')));
  if (entitiesInUrl) return true;

  // Reject obviously irrelevant: ads, tracking, tiny images
  const rejected = ['ads', 'tracking', 'banner', 'sponsor', 'promo', 'pixel', 
                    'avatar', '1x1', 'favicon', 'icon', 'badge'];
  if (rejected.some(r => urlLower.includes(r))) return false;

  return true; // Default: accept
}

// ============= SEARCH PEXELS =============
async function searchPexels(query: string, limit: number = 5): Promise<{ url: string; sourceId: string }[]> {
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

// ============= SEARCH UNSPLASH =============
async function searchUnsplash(query: string, limit: number = 5): Promise<{ url: string; sourceId: string }[]> {
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
        'Referer': new URL(imageUrl).origin,
      }
    });

    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;

    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
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

// ============= APPLY WATERMARK =============
async function applyWatermark(imageUrl: string, supabaseUrl: string, supabaseKey: string): Promise<string | null> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
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

// ============= FIND ONE IMAGE FOR A SLOT =============
async function findImageForSlot(
  slot: 'image1' | 'image2' | 'image3' | 'image4',
  searchQuery: string,
  articleImages: string[],
  usedIds: Set<string>,
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  slotIndex: number,
  lovableKey: string,
  entities: string[]
): Promise<{ imageUrl: string; source: string; sourceId: string } | null> {
  
  console.log(`[images] Slot ${slot} (${slotIndex + 1}/4): "${searchQuery}"`);

  // === SLOT 1: Try article og:image first ===
  if (slot === 'image1' && articleImages.length > 0) {
    for (const artImg of articleImages) {
      const isValid = await validateImageRelevance(artImg, searchQuery, entities, lovableKey);
      if (isValid) {
        const sourceId = `article_${slotIndex}`;
        if (usedIds.has(sourceId)) continue;
        usedIds.add(sourceId);
        
        const watermarked = await applyWatermark(artImg, supabaseUrl, supabaseKey);
        if (watermarked) {
          console.log(`[images] ✅ Slot ${slot}: article og:image with watermark`);
          return { imageUrl: watermarked, source: 'article', sourceId };
        }
        // Fallback: store directly
        const stored = await downloadAndStore(artImg, supabase, slotIndex);
        if (stored) {
          console.log(`[images] ✅ Slot ${slot}: article og:image stored`);
          return { imageUrl: stored, source: 'article', sourceId };
        }
      }
    }
  }

  // === Search Pexels with specific entity-based query ===
  let pexelsCandidates = await searchPexels(searchQuery, 5);
  pexelsCandidates = pexelsCandidates.filter(c => !usedIds.has(c.sourceId));

  if (pexelsCandidates.length > 0) {
    const chosen = pexelsCandidates[0];
    usedIds.add(chosen.sourceId);
    const watermarked = await applyWatermark(chosen.url, supabaseUrl, supabaseKey);
    if (watermarked) {
      console.log(`[images] ✅ Slot ${slot}: Pexels "${searchQuery}"`);
      return { imageUrl: watermarked, source: 'pexels', sourceId: chosen.sourceId };
    }
    const stored = await downloadAndStore(chosen.url, supabase, slotIndex);
    if (stored) {
      console.log(`[images] ✅ Slot ${slot}: Pexels stored`);
      return { imageUrl: stored, source: 'pexels', sourceId: chosen.sourceId };
    }
  }

  // === Fallback to Unsplash ===
  let unsplashCandidates = await searchUnsplash(searchQuery, 5);
  unsplashCandidates = unsplashCandidates.filter(c => !usedIds.has(c.sourceId));

  if (unsplashCandidates.length > 0) {
    const chosen = unsplashCandidates[0];
    usedIds.add(chosen.sourceId);
    const watermarked = await applyWatermark(chosen.url, supabaseUrl, supabaseKey);
    if (watermarked) {
      console.log(`[images] ✅ Slot ${slot}: Unsplash "${searchQuery}"`);
      return { imageUrl: watermarked, source: 'unsplash', sourceId: chosen.sourceId };
    }
    const stored = await downloadAndStore(chosen.url, supabase, slotIndex);
    if (stored) {
      console.log(`[images] ✅ Slot ${slot}: Unsplash stored`);
      return { imageUrl: stored, source: 'unsplash', sourceId: chosen.sourceId };
    }
  }

  // === Last resort: try article images for non-slot1 ===
  if (slot !== 'image1' && articleImages.length > slotIndex) {
    const artImg = articleImages[slotIndex] || articleImages[articleImages.length - 1];
    if (artImg) {
      const sourceId = `article_fallback_${slotIndex}`;
      if (!usedIds.has(sourceId)) {
        usedIds.add(sourceId);
        const stored = await downloadAndStore(artImg, supabase, slotIndex + 100);
        if (stored) {
          console.log(`[images] ✅ Slot ${slot}: article image fallback`);
          return { imageUrl: stored, source: 'article', sourceId };
        }
      }
    }
  }

  console.warn(`[images] ❌ Slot ${slot}: all sources failed`);
  return null;
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
      query, 
      usedImageIds = [],
      // New: article-based mode
      articleUrl,
      articleTitle,
      articleDescription,
      useArticleMode = false, // explicit flag to use intelligent mode
    } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);
    const usedIds = new Set<string>(usedImageIds);

    const searchQuery = query || topic || articleTitle;
    if (!searchQuery && (!segments || segments.length === 0)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Topic, query or segments required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============= INTELLIGENT ARTICLE-BASED MODE =============
    // Activated when articleUrl is provided OR useArticleMode is true
    if ((articleUrl || useArticleMode) && (articleUrl || articleTitle)) {
      console.log('[images] 🎯 INTELLIGENT MODE: Article-based image curation');
      console.log('[images] Article URL:', articleUrl || '(no URL)');
      console.log('[images] Article title:', articleTitle || searchQuery);

      // Step 1: Scrape the article
      let articleData: { title: string; description: string; ogImage: string | null; images: string[]; content: string } | null = null;
      
      if (articleUrl && firecrawlKey) {
        console.log('[images] Scraping article with Firecrawl...');
        articleData = await scrapeArticle(articleUrl, firecrawlKey);
        if (articleData) {
          console.log(`[images] Article scraped: ${articleData.images.length} images found, og:image: ${articleData.ogImage ? 'yes' : 'no'}`);
        }
      }

      // Use provided data as fallback if scraping failed/not possible
      const finalTitle = articleData?.title || articleTitle || searchQuery;
      const finalContent = articleData?.content || articleDescription || '';
      const articleImages = articleData?.images || [];

      // Step 2: Gerar queries de busca a partir do título — SEM chamar IA (custo zero)
      console.log('[images] 💰 Gerando queries sem IA...');
      const entities = buildSearchQueriesFromTitle(finalTitle, finalContent);

      const slots: Array<'image1' | 'image2' | 'image3' | 'image4'> = ['image1', 'image2', 'image3', 'image4'];
      const results: { imageUrl: string; source: string; sourceId: string }[] = [];

      // Step 3: Find one image per slot
      const allEntities: string[] = [];

      for (let i = 0; i < 4; i++) {
        const slot = slots[i];
        const slotQuery = entities.searchQueries[slot];
        
        const result = await findImageForSlot(
          slot,
          slotQuery,
          articleImages,
          usedIds,
          supabase,
          supabaseUrl,
          supabaseKey,
          i,
          lovableKey || '',
          allEntities
        );

        if (result) {
          results.push(result);
        }
      }

      const stats = {
        total: results.length,
        article: results.filter(r => r.source === 'article').length,
        pexels: results.filter(r => r.source === 'pexels').length,
        unsplash: results.filter(r => r.source === 'unsplash').length,
        mode: 'intelligent_article',
        entities: {
          companies: entities.companies,
          products: entities.products,
          people: entities.people,
        }
      };

      console.log(`[images] 🎯 Intelligent mode results:`, JSON.stringify(stats));

      return new Response(
        JSON.stringify({
          success: true,
          images: results.map(r => ({ imageUrl: r.imageUrl, source: r.source })),
          imageIds: results.map(r => r.sourceId),
          stats,
          searchQueries: entities.searchQueries,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============= LEGACY: SEGMENT-BASED MODE (for NarrativeVideoGenerator) =============
    const neededCount = segments?.length || 4;
    console.log(`[images] Legacy mode: ${neededCount} images for: "${searchQuery}"`);

    const results: { imageUrl: string; source: string; sourceId: string }[] = [];

    for (let i = 0; i < neededCount; i++) {
      const segQuery = segments?.[i]?.imagePrompt || segments?.[i]?.text || searchQuery;
      
      // 💰 CUSTO ZERO: usar query diretamente (sem tradução com IA)
      // Pexels aceita pt-BR muito bem, e o título em inglês já é comum em tech
      const englishQuery = segQuery;

      // Try Pexels first, then Unsplash
      let pexels = (await searchPexels(englishQuery, 5)).filter(c => !usedIds.has(c.sourceId));
      
      if (pexels.length > 0) {
        const chosen = pexels[0];
        usedIds.add(chosen.sourceId);
        const wm = await applyWatermark(chosen.url, supabaseUrl, supabaseKey);
        if (wm) {
          results.push({ imageUrl: wm, source: 'pexels', sourceId: chosen.sourceId });
          continue;
        }
        const stored = await downloadAndStore(chosen.url, supabase, i);
        if (stored) {
          results.push({ imageUrl: stored, source: 'pexels', sourceId: chosen.sourceId });
          continue;
        }
      }

      let unsplash = (await searchUnsplash(englishQuery, 5)).filter(c => !usedIds.has(c.sourceId));
      if (unsplash.length > 0) {
        const chosen = unsplash[0];
        usedIds.add(chosen.sourceId);
        const wm = await applyWatermark(chosen.url, supabaseUrl, supabaseKey);
        if (wm) {
          results.push({ imageUrl: wm, source: 'unsplash', sourceId: chosen.sourceId });
          continue;
        }
        const stored = await downloadAndStore(chosen.url, supabase, i);
        if (stored) {
          results.push({ imageUrl: stored, source: 'unsplash', sourceId: chosen.sourceId });
        }
      }
    }

    const stats = {
      total: results.length,
      pexels: results.filter(r => r.source === 'pexels').length,
      unsplash: results.filter(r => r.source === 'unsplash').length,
      mode: 'legacy_segment',
    };

    console.log(`[images] Legacy mode final:`, JSON.stringify(stats));

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
