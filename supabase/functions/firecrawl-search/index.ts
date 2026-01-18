import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, limit = 5, lang = 'pt-BR', country = 'BR' } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Searching with Firecrawl:', query);

    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit,
        lang,
        country,
        tbs: 'qdr:d', // Last 24 hours for fresher news
        scrapeOptions: {
          formats: ['markdown', 'links', 'html'],
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Request failed with status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process results to extract images from multiple sources
    const processedResults = (data.data || []).map((result: any) => {
      const images: string[] = [];
      const content = result.markdown || '';
      const html = result.html || '';
      
      // 1. Check og:image first (most relevant)
      if (result.metadata?.ogImage) {
        images.push(result.metadata.ogImage);
      }
      
      // 2. Extract images from HTML meta tags
      const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      if (ogImageMatch && ogImageMatch[1] && !images.includes(ogImageMatch[1])) {
        images.push(ogImageMatch[1]);
      }
      
      // 3. Extract twitter:image
      const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
      if (twitterImageMatch && twitterImageMatch[1] && !images.includes(twitterImageMatch[1])) {
        images.push(twitterImageMatch[1]);
      }
      
      // 4. Extract from srcset (high-res images)
      const srcsetRegex = /srcset=["']([^"']+)["']/gi;
      let srcsetMatch;
      while ((srcsetMatch = srcsetRegex.exec(html)) !== null) {
        const srcsetUrls = srcsetMatch[1].split(',').map(s => s.trim().split(' ')[0]);
        // Get the largest image from srcset
        const largestUrl = srcsetUrls[srcsetUrls.length - 1];
        if (largestUrl && largestUrl.startsWith('http') && !images.includes(largestUrl)) {
          const isRelevant = !largestUrl.includes('icon') && !largestUrl.includes('logo') && 
                            !largestUrl.includes('avatar') && !largestUrl.includes('1x1') && 
                            !largestUrl.includes('pixel') && !largestUrl.includes('thumb');
          if (isRelevant) images.push(largestUrl);
        }
      }
      
      // 5. Extract large images from img src (filter small ones)
      const imgSrcRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
      let imgMatch;
      while ((imgMatch = imgSrcRegex.exec(html)) !== null) {
        const url = imgMatch[0];
        const src = imgMatch[1];
        // Check if image has reasonable dimensions (width/height > 200)
        const hasGoodSize = /width=["']?(\d+)/.test(url) ? parseInt(url.match(/width=["']?(\d+)/)?.[1] || '0') > 200 : true;
        const isRelevant = src.startsWith('http') && 
                          !src.includes('icon') && !src.includes('logo') && 
                          !src.includes('avatar') && !src.includes('1x1') && 
                          !src.includes('pixel') && !src.includes('thumb') &&
                          !src.includes('data:image') && !images.includes(src);
        if (isRelevant && hasGoodSize) images.push(src);
      }
      
      // 6. Extract from markdown as fallback
      const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi;
      let match;
      while ((match = imageRegex.exec(content)) !== null) {
        const url = match[1];
        const isRelevant = !url.includes('icon') && !url.includes('logo') && 
                          !url.includes('avatar') && !url.includes('1x1') && 
                          !url.includes('pixel') && !images.includes(url);
        if (isRelevant) images.push(url);
      }
      
      return {
        title: result.metadata?.title || result.title || '',
        description: result.metadata?.description || result.description || '',
        url: result.metadata?.sourceURL || result.url || '',
        markdown: content,
        images: images.slice(0, 10), // Increased limit for carousel support
      };
    });

    console.log('Search successful, found', processedResults.length, 'results');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: processedResults,
        query 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in firecrawl-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to search';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
