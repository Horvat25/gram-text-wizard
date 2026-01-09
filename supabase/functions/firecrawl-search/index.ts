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
        scrapeOptions: {
          formats: ['markdown', 'links'],
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

    // Process results to extract images from markdown content
    const processedResults = (data.data || []).map((result: any) => {
      // Extract image URLs from markdown
      const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi;
      const images: string[] = [];
      let match;
      
      const content = result.markdown || '';
      while ((match = imageRegex.exec(content)) !== null) {
        const url = match[1];
        // Filter out small icons, logos, and tracking pixels
        if (url && !url.includes('icon') && !url.includes('logo') && !url.includes('avatar') && 
            !url.includes('1x1') && !url.includes('pixel') && !images.includes(url)) {
          images.push(url);
        }
      }
      
      // Also check for og:image in metadata if available
      if (result.metadata?.ogImage && !images.includes(result.metadata.ogImage)) {
        images.unshift(result.metadata.ogImage);
      }
      
      return {
        title: result.metadata?.title || result.title || '',
        description: result.metadata?.description || result.description || '',
        url: result.metadata?.sourceURL || result.url || '',
        markdown: content,
        images: images.slice(0, 5), // Limit to 5 images per result
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
