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
      if (!images.includes(u) && !u.includes('icon') && !u.includes('logo')) {
        images.push(u);
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

// ============= BUILD 3 SEARCH QUERIES FROM TITLE =============
function buildThreeQueries(title: string, description: string = ''): [string, string, string] {
  const text = (title + ' ' + (description || '')).replace(/["""''«»\[\]()]/g, '').trim();

  // Known tech entities — if found, use as the anchor of all queries
  const knownEntities: Record<string, string> = {
    'openai': 'OpenAI artificial intelligence', 'chatgpt': 'ChatGPT AI chatbot',
    'gpt': 'OpenAI GPT language model', 'claude': 'Anthropic Claude AI',
    'gemini': 'Google Gemini AI', 'copilot': 'Microsoft Copilot AI',
    'meta ai': 'Meta AI laboratory', 'llama': 'Meta LLaMA AI model',
    'nvidia': 'Nvidia GPU data center', 'tesla': 'Tesla electric vehicle',
    'spacex': 'SpaceX rocket launch', 'apple': 'Apple technology product',
    'microsoft': 'Microsoft technology', 'google': 'Google technology',
    'amazon': 'Amazon technology cloud', 'robot': 'humanoid robot close up',
    'humanoid': 'humanoid robot futuristic', 'quantum': 'quantum computer laboratory',
    'chip': 'microchip silicon wafer macro', 'bitcoin': 'Bitcoin cryptocurrency',
    'blockchain': 'blockchain network visualization', 'deepmind': 'Google DeepMind AI',
    'anthropic': 'Anthropic AI research', 'mistral': 'AI model server',
    'sora': 'AI video generation screen', 'samsung': 'Samsung technology display',
    'intel': 'Intel processor chip macro', 'arm': 'ARM chip semiconductor',
  };

  const textLower = text.toLowerCase();
  let entityQuery = '';
  for (const [key, value] of Object.entries(knownEntities)) {
    if (textLower.includes(key)) { entityQuery = value; break; }
  }

  // Stopwords filter
  const stopwords = new Set(['de','da','do','dos','das','em','no','na','por','com','para',
    'como','que','uma','um','o','a','e','é','vai','foi','ser','ter','está','isso','essa',
    'esse','agora','hoje','novo','nova','já','mais','mas','são','tem','sua','seu','the',
    'and','for','with','this','that','from','has','was','are','will','can','its','not']);

  const words = text.split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !stopwords.has(w.toLowerCase()))
    .filter(w => /^[a-zA-ZÀ-ÿ]/.test(w));

  // Build queries with fallback
  const q1 = entityQuery || words.slice(0, 4).join(' ') || 'technology futuristic';
  const subject = entityQuery.split(' ')[0] || words[0] || 'technology';
  const q2 = entityQuery ? `${subject} close up dramatic lighting` : `${words.slice(0, 3).join(' ')} dramatic`;
  const q3 = entityQuery ? `${subject} innovation research laboratory` : `${words.slice(0, 2).join(' ')} future`;

  console.log('[images] 3 queries:', q1, '|', q2, '|', q3);
  return [q1, q2, q3];
}

// ============= CHECK ARTICLE IMAGE TOPIC RELEVANCE =============
function isArticleImageRelevant(imageUrl: string, title: string, description: string): boolean {
  const urlLower = imageUrl.toLowerCase();
  const textLower = (title + ' ' + description).toLowerCase();

  // Always reject tracking/icon images
  const badSignals = ['1x1', 'pixel', 'tracking', 'favicon', 'icon', 'avatar'];
  if (badSignals.some(s => urlLower.includes(s))) return false;

  // Sinais de que o tema é tech/IA/negócios
  const techKeywords = ['ai', 'openai', 'google', 'apple', 'microsoft', 'meta', 'nvidia',
    'robot', 'tech', 'gpt', 'llm', 'chip', 'software', 'data', 'cloud', 'cyber',
    'startup', 'crypto', 'bitcoin', 'space', 'tesla', 'samsung', 'amazon',
    'anthropic', 'claude', 'gemini', 'copilot', 'mistral', 'deepmind', 'xai'];

  const isTechTopic = techKeywords.some(k => textLower.includes(k));

  if (!isTechTopic) return true; // Não é tech → aceitar qualquer imagem do artigo

  // Se é tech, rejeitar imagens com sinais de conteúdo humano/político/esportivo na URL
  const humanSignals = [
    'politician', 'presidente', 'candidato', 'eleicao', 'bolsonaro', 'lula',
    'futebol', 'soccer', 'sport', 'athlete', 'celebrit', 'actor', 'singer',
    'jersey', 'stadium', 'rally', 'protest', 'manifestacao', 'partido',
    'campaign', 'election', 'vote', 'politica',
    '/people/', '/person/', '/face/', '/portrait/',
  ];

  if (humanSignals.some(s => urlLower.includes(s))) {
    console.warn('[images] ⚠️ Article og:image rejected — human/political signal in URL:', imageUrl.substring(0, 80));
    return false;
  }

  // ⚡ KEY FIX: Rejeitar imagens de CDNs de marketing corporativo tech.
  // og:images de blogs de empresas tech (Anthropic, OpenAI, etc.) costumam ser
  // anúncios com rostos humanos, não imagens de produto.
  const marketingCdnSignals = [
    'prismic.io',            // Anthropic e outras AI startups usam Prismic
    'cdn.sanity.io',         // Sanity CMS (sites de marketing)
    'images.ctfassets.net',  // Contentful (Anthropic, OpenAI blog)
    'assets.anthropic.com',
    'images.openai.com',
    'cdn.openai.com',
    'storage.googleapis.com/openai',
    '/og-image',
    '/social-card',
    '/social-share',
    '/opengraph',
    '/hero-image',
    '/banner',
    '/marketing/',
    '/ads/',
    '/blog-images/',
  ];

  if (marketingCdnSignals.some(s => urlLower.includes(s))) {
    console.warn('[images] ⚠️ Article og:image rejected — marketing CDN:', imageUrl.substring(0, 80));
    return false;
  }

  return true;
}

// ============= SCORE CANDIDATE =============
function scoreCandidate(url: string, query: string, isArticleImage: boolean): number {
  let score = 50;

  // Artigo tem prioridade APENAS se relevante (validado antes de chamar esta função)
  if (isArticleImage) score += 25;

  const urlLower = url.toLowerCase();
  const queryWords = query.toLowerCase().split(' ').filter(w => w.length > 3);

  // Domínios confiáveis de press/tech
  const trustedCdns = ['images.apple.com', 'newsroom.apple.com', 'static01.nyt',
    'media.wired', 'techcrunch.com', 'arstechnica.net', 'cdn.vox-cdn',
    'images.macrumors', 'assets.bwbx.io', 'image.cnbc', 'zdnet', 'verge',
    'engadget', 'theguardian', 'reuters', 'apnews', 'bloomberg'];
  if (trustedCdns.some(cdn => urlLower.includes(cdn))) score += 20;

  // Palavras do query na URL = relevância
  const matchedWords = queryWords.filter(w => urlLower.includes(w));
  score += matchedWords.length * 5;

  // Penalizar conteúdo irrelevante
  const badSignals = ['ads', 'tracking', 'banner', 'sponsor', 'promo', 'pixel',
                      'avatar', '1x1', 'favicon', 'icon', 'badge', 'button'];
  if (badSignals.some(r => urlLower.includes(r))) score -= 40;

  return Math.max(0, Math.min(100, score));
}

// ============= SEARCH PEXELS =============
async function searchPexels(query: string, limit: number = 6): Promise<{ url: string; sourceId: string }[]> {
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
async function searchUnsplash(query: string, limit: number = 6): Promise<{ url: string; sourceId: string }[]> {
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
      useArticleMode = false,
      skipWatermark = false, // When true: skip watermark so caller can apply its own overlay
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
    if ((articleUrl || useArticleMode) && (articleUrl || articleTitle)) {
      console.log('[images] 🎯 POOL MODE: 1 article + 3 queries → score → top 4');

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

      // Step 2: Build 3 search queries
      const [q1, q2, q3] = buildThreeQueries(finalTitle, finalDescription);

      // Step 3: Gather ALL candidates in parallel
      console.log('[images] Fetching pool from Pexels + Unsplash (3 queries each)...');
      const [
        pexels1, pexels2, pexels3,
        unsplash1, unsplash2, unsplash3,
      ] = await Promise.all([
        searchPexels(q1, 6),
        searchPexels(q2, 4),
        searchPexels(q3, 4),
        searchUnsplash(q1, 6),
        searchUnsplash(q2, 4),
        searchUnsplash(q3, 4),
      ]);

      // Step 4: Build scored pool
      interface Candidate {
        url: string;
        sourceId: string;
        source: string;
        score: number;
        query: string;
      }

      const pool: Candidate[] = [];

      // Article images — alta prioridade SOMENTE se relevantes ao tema
      for (let i = 0; i < articleImages.length; i++) {
        const img = articleImages[i];
        const sid = `article_${i}`;
        if (!usedIds.has(sid)) {
          const relevant = isArticleImageRelevant(img, finalTitle, finalDescription);
          if (!relevant) {
            console.warn(`[images] ⛔ Skipping article image[${i}] — not relevant to topic`);
            continue;
          }
          pool.push({
            url: img,
            sourceId: sid,
            source: 'article',
            score: scoreCandidate(img, finalTitle, true),
            query: finalTitle,
          });
        }
      }

      // Pexels
      const pexelsBatches = [
        { results: pexels1, q: q1 },
        { results: pexels2, q: q2 },
        { results: pexels3, q: q3 },
      ];
      for (const { results, q } of pexelsBatches) {
        for (const c of results) {
          if (!usedIds.has(c.sourceId)) {
            pool.push({ ...c, source: 'pexels', score: scoreCandidate(c.url, q, false), query: q });
          }
        }
      }

      // Unsplash
      const unsplashBatches = [
        { results: unsplash1, q: q1 },
        { results: unsplash2, q: q2 },
        { results: unsplash3, q: q3 },
      ];
      for (const { results, q } of unsplashBatches) {
        for (const c of results) {
          if (!usedIds.has(c.sourceId)) {
            pool.push({ ...c, source: 'unsplash', score: scoreCandidate(c.url, q, false), query: q });
          }
        }
      }

      // Step 5: Sort by score, pick top 4 unique
      pool.sort((a, b) => b.score - a.score);
      console.log(`[images] Pool size: ${pool.length}, top scores: ${pool.slice(0, 5).map(c => c.score).join(', ')}`);

      const selected: Candidate[] = [];
      const selectedIds = new Set<string>();
      for (const candidate of pool) {
        if (selected.length >= 4) break;
        if (selectedIds.has(candidate.sourceId)) continue;
        selectedIds.add(candidate.sourceId);
        selected.push(candidate);
      }

      // Step 6: Process selected images (watermark + store)
      console.log(`[images] Processing ${selected.length} selected images...`);
      const results: { imageUrl: string; source: string; sourceId: string }[] = [];

      for (let i = 0; i < selected.length; i++) {
        const candidate = selected[i];
        const processed = await processImage(candidate.url, supabase, supabaseUrl, supabaseKey, i, skipWatermark);
        if (processed) {
          usedIds.add(candidate.sourceId);
          results.push({ imageUrl: processed, source: candidate.source, sourceId: candidate.sourceId });
          console.log(`[images] ✅ [${i + 1}/4] ${candidate.source} score:${candidate.score} q:"${candidate.query}"`);
        } else {
          console.warn(`[images] ❌ [${i + 1}] failed to process ${candidate.url.substring(0, 60)}`);
        }
      }

      const stats = {
        total: results.length,
        poolSize: pool.length,
        article: results.filter(r => r.source === 'article').length,
        pexels: results.filter(r => r.source === 'pexels').length,
        unsplash: results.filter(r => r.source === 'unsplash').length,
        mode: 'pool_scored',
        queries: [q1, q2, q3],
      };

      console.log('[images] 🎯 Pool mode results:', JSON.stringify(stats));

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

    // ============= LEGACY: SEGMENT-BASED MODE =============
    const neededCount = segments?.length || 4;
    console.log(`[images] Legacy mode: ${neededCount} images for: "${searchQuery}"`);

    const results: { imageUrl: string; source: string; sourceId: string }[] = [];

    for (let i = 0; i < neededCount; i++) {
      const segQuery = segments?.[i]?.imagePrompt || segments?.[i]?.text || searchQuery;

      let pexels = (await searchPexels(segQuery, 5)).filter(c => !usedIds.has(c.sourceId));
      if (pexels.length > 0) {
        const chosen = pexels[0];
        usedIds.add(chosen.sourceId);
        const processed = await processImage(chosen.url, supabase, supabaseUrl, supabaseKey, i, skipWatermark);
        if (processed) {
          results.push({ imageUrl: processed, source: 'pexels', sourceId: chosen.sourceId });
          continue;
        }
      }

      let unsplash = (await searchUnsplash(segQuery, 5)).filter(c => !usedIds.has(c.sourceId));
      if (unsplash.length > 0) {
        const chosen = unsplash[0];
        usedIds.add(chosen.sourceId);
        const processed = await processImage(chosen.url, supabase, supabaseUrl, supabaseKey, i, skipWatermark);
        if (processed) {
          results.push({ imageUrl: processed, source: 'unsplash', sourceId: chosen.sourceId });
        }
      }
    }

    const stats = {
      total: results.length,
      pexels: results.filter(r => r.source === 'pexels').length,
      unsplash: results.filter(r => r.source === 'unsplash').length,
      mode: 'legacy_segment',
    };

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
