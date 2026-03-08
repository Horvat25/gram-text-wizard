import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { productName, affiliateUrl } = await req.json();

    if (!productName) {
      return new Response(
        JSON.stringify({ error: 'productName é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let scrapedContent = '';
    let searchContent = '';

    // Step 1: Try to scrape the affiliate URL if provided
    if (affiliateUrl && FIRECRAWL_API_KEY) {
      try {
        console.log('Scraping affiliate URL:', affiliateUrl);
        const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: affiliateUrl,
            formats: ['markdown'],
            onlyMainContent: true,
          }),
        });

        if (scrapeRes.ok) {
          const scrapeData = await scrapeRes.json();
          const md = scrapeData?.data?.markdown || scrapeData?.markdown || '';
          // Limit to first 3000 chars to keep prompt manageable
          scrapedContent = md.substring(0, 3000);
          console.log('Scraped content length:', scrapedContent.length);
        } else {
          console.log('Scrape failed with status:', scrapeRes.status);
        }
      } catch (e) {
        console.error('Error scraping URL:', e);
      }
    }

    // Step 2: Search the web for the product
    if (FIRECRAWL_API_KEY) {
      try {
        console.log('Searching web for:', productName);
        const searchRes = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `${productName} produto review o que é benefícios`,
            limit: 3,
            lang: 'pt',
            country: 'BR',
            scrapeOptions: { formats: ['markdown'] },
          }),
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const results = searchData?.data || [];
          // Combine top 3 search results (limited)
          searchContent = results
            .map((r: any) => {
              const title = r.title || '';
              const desc = r.description || '';
              const md = (r.markdown || '').substring(0, 1000);
              return `## ${title}\\\\n${desc}\\\\n${md}`;
            })
            .join('\\\\n\\\\n')
            .substring(0, 4000);
          console.log('Search content length:', searchContent.length);
        }
      } catch (e) {
        console.error('Error searching:', e);
      }
    }

    // Step 3: Generate description with AI using the researched context
    const contextParts: string[] = [];
    if (scrapedContent) {
      contextParts.push(`=== CONTEÚDO DO SITE DO PRODUTO ===\\\\n${scrapedContent}`);
    }
    if (searchContent) {
      contextParts.push(`=== RESULTADOS DE PESQUISA NA WEB ===\\\\n${searchContent}`);
    }

    const contextText = contextParts.length > 0
      ? `\\\\n\\\\nAqui está o que eu encontrei pesquisando sobre o produto:\\\\n\\\\n${contextParts.join('\\\\n\\\\n')}`
      : '';

    const prompt = `Você é um especialista em marketing de afiliados. Gere uma descrição CURTA e OBJETIVA (máximo 3 frases) sobre o produto \\\"${productName}\\\" para uso interno.\\n\\nA descrição deve conter:\\n1. O que é o produto\\n2. Principal benefício/diferencial\\n3. Para quem é indicado\\n\\nRegras:\\n- NÃO use hashtags, emojis ou formatação markdown\\n- NÃO invente informações que não estejam no contexto pesquisado\\n- Seja direto e factual\\n- Escreva em português brasileiro${contextText}`;

    console.log('Generating description with AI...');
    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit atingido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos na sua conta.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errText = await aiRes.text();
      console.error('AI error:', aiRes.status, errText);
      throw new Error('Erro ao gerar descrição com IA');
    }

    const aiData = await aiRes.json();
    const description = aiData.choices?.[0]?.message?.content?.trim() || '';

    console.log('Description generated successfully');

    return new Response(
      JSON.stringify({
        description,
        sources: {
          scraped: !!scrapedContent,
          searched: !!searchContent,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
