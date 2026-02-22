import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  extractEntities,
  containsForbidden,
  scoreImage,
  selectBestImages,
  ImageCandidate,
} from "../_shared/image-relevance.ts";

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
      body: JSON.stringify({ url, formats: ['markdown', 'html'], onlyMainContent: false }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const result = data.data || data;
    const html = result.html || '';
    const markdown = result.markdown || '';
    const metadata = result.metadata || {};
    const ogImage = metadata.ogImage || metadata.og?.image || null;
    const images: string[] = [];
    if (ogImage) images.push(ogImage);
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const src = imgMatch[1];
      if (src.startsWith('http') && !src.includes('icon') && !src.includes('logo') &&
          !src.includes('1x1') && !src.includes('pixel') && !images.includes(src)) {
        images.push(src);
      }
    }
    const mdImgRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi;
    let mdMatch;
    while ((mdMatch = mdImgRegex.exec(markdown)) !== null) {
      const u = mdMatch[1];
      if (!images.includes(u) && !u.includes('icon') && !u.includes('logo')) images.push(u);
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

// ============= AI-POWERED SMART QUERY GENERATION =============
async function generateSmartQueries(title: string, description: string = ''): Promise<[string, string, string]> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableKey) {
    console.log('[images] No LOVABLE_API_KEY, falling back to heuristic queries');
    return buildHeuristicQueries(title, description);
  }

  try {
    const prompt = `You are an image search expert. Given a news article title and description, generate exactly 3 short English search queries for finding relevant stock photos on Pexels/Unsplash.

RULES:
- Each query must be 3-5 words maximum
- Queries must describe VISUAL SCENES that represent the article's main subject
- Focus on the PRIMARY subject (company, product, technology) NOT secondary mentions
- For AI/tech companies: describe their products, logos, offices, or technology visuals
- For people: describe what they're known for, not generic portraits
- NEVER use generic terms like "technology" or "innovation" alone
- Make queries specific and visually descriptive

Title: ${title}
Description: ${description || 'N/A'}

Respond with ONLY 3 lines, one query per line. No numbering, no quotes, no explanation.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.warn('[images] AI query generation failed:', response.status);
      return buildHeuristicQueries(title, description);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    
    if (!content) {
      return buildHeuristicQueries(title, description);
    }

    const lines = content.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 2);
    const q1 = lines[0] || 'technology innovation';
    const q2 = lines[1] || q1;
    const q3 = lines[2] || q1;

    console.log('[images] 🤖 AI-generated queries:', q1, '|', q2, '|', q3);
    return [q1, q2, q3];
  } catch (e) {
    console.warn('[images] AI query generation error:', e);
    return buildHeuristicQueries(title, description);
  }
}

// ============= HEURISTIC FALLBACK QUERIES =============
function buildHeuristicQueries(title: string, description: string = ''): [string, string, string] {
  const entities = extractEntities(title + ' ' + description);
  const text = (title + ' ' + (description || '')).replace(/["""''«»\[\]()]/g, '').trim();

  const knownEntities: Record<string, string> = {
    'openai': 'OpenAI ChatGPT AI interface screen',
    'chatgpt': 'ChatGPT AI chatbot conversation screen',
    'gpt': 'OpenAI GPT AI model neural network',
    'o1': 'OpenAI AI reasoning model screen',
    'claude': 'Anthropic AI research laboratory',
    'anthropic': 'Anthropic AI safety research lab',
    'gemini': 'Google Gemini AI interface',
    'copilot': 'Microsoft Copilot AI assistant',
    'meta ai': 'Meta AI laboratory',
    'llama': 'Meta LLaMA AI model server',
    'nvidia': 'Nvidia GPU data center server rack',
    'tesla': 'Tesla electric vehicle autopilot',
    'spacex': 'SpaceX rocket launch pad',
    'apple': 'Apple iPhone MacBook product',
    'microsoft': 'Microsoft Windows office technology',
    'google': 'Google search data center server',
    'amazon': 'Amazon AWS cloud computing server',
    'robot': 'humanoid robot close up',
    'humanoid': 'humanoid robot futuristic',
    'quantum': 'quantum computer laboratory',
    'chip': 'microchip silicon wafer macro',
    'bitcoin': 'Bitcoin cryptocurrency digital gold',
    'blockchain': 'blockchain network visualization',
    'deepmind': 'Google DeepMind AI research',
    'mistral': 'AI model server rack data center',
    'sora': 'AI video generation screen',
    'samsung': 'Samsung Galaxy smartphone display',
    'intel': 'Intel processor chip macro',
    'arm': 'ARM chip semiconductor wafer',
    'h100': 'Nvidia H100 GPU data center',
    'sam altman': 'OpenAI CEO tech conference stage',
    'elon musk': 'Tesla SpaceX rocket technology',
  };

  const textLower = text.toLowerCase();
  let entityQuery = '';
  for (const [key, value] of Object.entries(knownEntities)) {
    if (textLower.includes(key)) { entityQuery = value; break; }
  }

  if (!entityQuery && entities.length > 0) {
    entityQuery = entities.slice(0, 3).join(' ');
  }

  const subject = entityQuery.split(' ')[0] || entities[0] || 'technology';
  const q1 = entityQuery || entities.join(' ') || 'technology futuristic';
  const q2 = entityQuery
    ? `${subject} close up dramatic lighting`
    : `${entities.slice(0, 3).join(' ')} dramatic`;
  const q3 = entityQuery
    ? `${subject} innovation research laboratory`
    : `${entities.slice(0, 2).join(' ')} future`;

  console.log('[images] 📋 Heuristic queries:', q1, '|', q2, '|', q3);
  return [q1, q2, q3];
}

// ============= SEARCH PEXELS (with metadata) =============
async function searchPexels(query: string, limit: number = 6): Promise<ImageCandidate[]> {
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
      description: p.alt || '',
      altDescription: p.alt || '',
      tags: [],
    }));
  } catch { return []; }
}

// ============= SEARCH UNSPLASH (with metadata) =============
async function searchUnsplash(query: string, limit: number = 6): Promise<ImageCandidate[]> {
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
      description: p.description || '',
      altDescription: p.alt_description || '',
      tags: (p.tags || []).map((t: any) => t.title || ''),
    }));
  } catch { return []; }
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
  } catch { return null; }
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
  } catch { return null; }
}

// ============= PROCESS IMAGE: watermark → store =============
async function processImage(
  url: string,
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  index: number,
  skipWatermark = false,
): Promise<string | null> {
  if (!skipWatermark) {
    const watermarked = await applyWatermark(url, supabaseUrl, supabaseKey);
    if (watermarked) return watermarked;
  }
  return await downloadAndStore(url, supabase, index);
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
      articleUrl,
      articleTitle,
      articleDescription,
      articleImageUrl,
      useArticleMode = false,
      skipWatermark = false,
    } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);
    const usedIds = new Set<string>(usedImageIds);

    const searchQuery = query || topic || articleTitle;
    if (!searchQuery && (!segments || segments.length === 0)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Topic, query or segments required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============= INTELLIGENT POOL-BASED MODE =============
    if ((articleUrl || useArticleMode) && (articleUrl || articleTitle || articleImageUrl)) {
      console.log('[images] 🎯 POOL MODE — engine: extractEntities + containsForbidden + scoreImage');
      console.log('[images] articleImageUrl provided:', articleImageUrl ? 'yes' : 'no');

      // Step 1: Scrape article
      let articleData: { title: string; description: string; ogImage: string | null; images: string[]; content: string } | null = null;
      if (articleUrl && firecrawlKey) {
        articleData = await scrapeArticle(articleUrl, firecrawlKey);
        if (articleData) {
          console.log(`[images] Article scraped: ${articleData.images.length} imgs, og:image: ${articleData.ogImage ? 'yes' : 'no'}`);
        }
      }

      const finalTitle = articleData?.title || articleTitle || searchQuery;
      const finalDescription = articleData?.description || articleDescription || '';
      const articleImages = articleData?.images || [];

      // Step 2: Extract entities from title (core of the engine)
      const entities = extractEntities(finalTitle + ' ' + finalDescription);
      console.log('[images] Entities:', entities);

      // Step 3: Build 3 search queries using AI (with heuristic fallback)
      const [q1, q2, q3] = await generateSmartQueries(finalTitle, finalDescription);

      // Step 4: Fetch pool in parallel
      console.log('[images] Fetching pool from Pexels + Unsplash (3 queries each)...');
      const [pexels1, pexels2, pexels3, unsplash1, unsplash2, unsplash3] = await Promise.all([
        searchPexels(q1, 8),
        searchPexels(q2, 6),
        searchPexels(q3, 6),
        searchUnsplash(q1, 8),
        searchUnsplash(q2, 6),
        searchUnsplash(q3, 6),
      ]);

      // Step 5: Build candidate pool
      const pool: ImageCandidate[] = [];

      // Article images — run through full engine (NOT auto-accepted)
      for (let i = 0; i < articleImages.length; i++) {
        const img = articleImages[i];
        const sid = `article_${i}`;
        if (usedIds.has(sid)) continue;

        const candidate: ImageCandidate = {
          url: img, sourceId: sid, source: 'article',
          description: finalTitle, // use title as proxy description for og:image
          altDescription: finalDescription,
          tags: entities,
        };

        if (containsForbidden(candidate, entities)) {
          console.warn(`[images] ⛔ Article image[${i}] rejected by engine`);
          continue;
        }

        const score = scoreImage(candidate, entities, finalTitle);
        // Article images get a +20 priority boost if they pass the engine
        pool.push({ ...candidate, score: score + 20, query: finalTitle });
      }

      // Pexels pool
      const pexelsBatches = [
        { results: pexels1, q: q1 }, { results: pexels2, q: q2 }, { results: pexels3, q: q3 },
      ];
      for (const { results, q } of pexelsBatches) {
        for (const c of results) {
          if (!usedIds.has(c.sourceId)) {
            pool.push({ ...c, source: 'pexels', query: q });
          }
        }
      }

      // Unsplash pool
      const unsplashBatches = [
        { results: unsplash1, q: q1 }, { results: unsplash2, q: q2 }, { results: unsplash3, q: q3 },
      ];
      for (const { results, q } of unsplashBatches) {
        for (const c of results) {
          if (!usedIds.has(c.sourceId)) {
            pool.push({ ...c, source: 'unsplash', query: q });
          }
        }
      }

      console.log(`[images] Raw pool size: ${pool.length}`);

      // Step 6: Engine selection — filter forbidden + score + rank
      const selected = selectBestImages(pool, entities, finalTitle, 4, 2);

      console.log(`[images] Selected ${selected.length} images after engine:`);
      selected.forEach((c, i) =>
        console.log(`  [${i + 1}] ${c.source} score:${c.score} — ${c.url.substring(0, 70)}`)
      );

      // Fallback: if engine returns 0 results (very strict), relax to 0 min score
      if (selected.length === 0) {
        const relaxed = selectBestImages(pool, entities, finalTitle, 4, 0);
        selected.push(...relaxed);
        console.warn('[images] ⚠️ Engine returned 0 — relaxed to minScore=0');
      }

      // Step 7: Process (watermark + store)
      // If articleImageUrl was provided directly, force it as the FIRST image (skip engine for it)
      const results: { imageUrl: string; source: string; sourceId: string }[] = [];
      
      if (articleImageUrl) {
        console.log('[images] 📰 Force-including article image as first result:', articleImageUrl.substring(0, 60));
        const processed = await processImage(articleImageUrl, supabase, supabaseUrl, supabaseKey, 0, skipWatermark);
        if (processed) {
          results.push({ imageUrl: processed, source: 'article-direct', sourceId: 'article_direct_0' });
          console.log('[images] ✅ Article image processed successfully');
        } else {
          console.warn('[images] ❌ Article image failed to process, continuing with pool');
        }
      }
      
      const startIndex = results.length;
      for (let i = 0; i < selected.length && results.length < 4; i++) {
        const candidate = selected[i];
        const processed = await processImage(candidate.url, supabase, supabaseUrl, supabaseKey, startIndex + i, skipWatermark);
        if (processed) {
          usedIds.add(candidate.sourceId);
          results.push({ imageUrl: processed, source: candidate.source || 'unknown', sourceId: candidate.sourceId });
          console.log(`[images] ✅ [${results.length}/${Math.min(4, selected.length + startIndex)}] ${candidate.source} score:${candidate.score}`);
        } else {
          console.warn(`[images] ❌ [${i + 1}] Failed to process ${candidate.url.substring(0, 60)}`);
        }
      }

      const stats = {
        total: results.length,
        poolSize: pool.length,
        article: results.filter(r => r.source === 'article').length,
        pexels: results.filter(r => r.source === 'pexels').length,
        unsplash: results.filter(r => r.source === 'unsplash').length,
        entities,
        mode: 'engine_pool',
        queries: [q1, q2, q3],
      };

      console.log('[images] 🎯 Engine mode results:', JSON.stringify(stats));

      return new Response(
        JSON.stringify({
          success: true,
          images: results.map(r => ({ imageUrl: r.imageUrl, source: r.source })),
          imageIds: results.map(r => r.sourceId),
          stats,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============= AI GENERATION MODE (Videos/Carousels) =============
    // Generate 4 AI images using generate-image (Gemini Flash Image ~$0.02/img)
    // This ensures visual consistency and relevance instead of random stock photos
    const neededCount = segments?.length || 4;
    console.log(`[images] 🎨 AI GENERATION MODE: ${neededCount} images for: "${searchQuery}"`);

    const results: { imageUrl: string; source: string; sourceId: string }[] = [];

    // Build progressive prompts based on segments for visual consistency
    const baseContext = searchQuery || topic || 'tecnologia';
    const progressiveThemes = ['contexto e cenário', 'desenvolvimento e detalhe', 'impacto e consequência', 'conclusão e futuro'];

    for (let i = 0; i < neededCount; i++) {
      const segPrompt = segments?.[i]?.imagePrompt || segments?.[i]?.text || baseContext;
      const themePhase = progressiveThemes[i] || progressiveThemes[0];
      
      // Build a rich, specific prompt for AI generation
      const aiPrompt = `Crie uma imagem cinematográfica para um vídeo de notícias de tecnologia.
Tema principal: ${baseContext}
Cena ${i + 1} de ${neededCount} (${themePhase}): ${segPrompt}
Estilo: fotorrealista, dramático, iluminação cinematográfica, formato vertical 9:16.
IMPORTANTE: Manter identidade visual consistente com as outras cenas do mesmo vídeo.`;

      console.log(`[images] Segment [${i + 1}/${neededCount}] Generating AI image...`);

      try {
        const genResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            prompt: aiPrompt,
            format: 'portrait', // 9:16 for Reels
            applyWatermark: !skipWatermark,
          }),
        });

        if (genResponse.ok) {
          const genResult = await genResponse.json();
          if (genResult.imageUrl) {
            results.push({
              imageUrl: genResult.imageUrl,
              source: 'ai-generated',
              sourceId: `ai_gen_${Date.now()}_${i}`,
            });
            console.log(`[images] ✅ Segment [${i + 1}] AI image generated — model: ${genResult.modelUsed || 'gemini'}`);
          } else {
            console.warn(`[images] ❌ Segment [${i + 1}] AI generation returned no URL`);
          }
        } else {
          const errText = await genResponse.text();
          console.error(`[images] ❌ Segment [${i + 1}] AI generation failed:`, genResponse.status, errText);
        }
      } catch (genError) {
        console.error(`[images] ❌ Segment [${i + 1}] AI generation error:`, genError);
      }

      // Small delay between generations to avoid rate limiting
      if (i < neededCount - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const stats = {
      total: results.length,
      aiGenerated: results.length,
      mode: 'ai_generation',
    };

    console.log(`[images] 🎨 AI generation complete: ${results.length}/${neededCount} images`);

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
