import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * validate-image-coherence
 * 
 * Uses Gemini vision to check if an image matches the headline and caption.
 * Returns { coherent: boolean, reason: string, confidence: number }
 * 
 * Input: { imageUrl, headline, caption?, articleTitle? }
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, headline, caption, articleTitle } = await req.json();

    if (!imageUrl || !headline) {
      return new Response(
        JSON.stringify({ coherent: true, reason: 'missing_params', confidence: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[COHERENCE] Validating image vs headline:', headline.substring(0, 60));
    console.log('[COHERENCE] Image:', imageUrl.substring(0, 80));

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.warn('[COHERENCE] No LOVABLE_API_KEY, skipping validation');
      return new Response(
        JSON.stringify({ coherent: true, reason: 'no_api_key', confidence: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the validation prompt
    const context = articleTitle ? `Título do artigo: "${articleTitle}"\n` : '';
    const captionCtx = caption ? `Legenda: "${caption.substring(0, 200)}"\n` : '';

    const prompt = `Você é um editor visual de um perfil de notícias de tecnologia no Instagram.

Analise a imagem fornecida e verifique se ela é COERENTE com a headline abaixo.

${context}Headline: "${headline}"
${captionCtx}
REGRAS DE VALIDAÇÃO:
1. A imagem deve mostrar algo RELACIONADO ao tema da headline
2. Se a headline fala de "Motorola" mas a imagem mostra um eletrodoméstico → INCOERENTE
3. Se a headline fala de "IA" mas a imagem mostra comida → INCOERENTE  
4. Se a headline fala de "Samsung Galaxy" mas a imagem mostra um produto de outra marca → INCOERENTE
5. Imagens genéricas de tecnologia (chips, servidores, telas) são ACEITÁVEIS para temas tech
6. Imagens com o PRODUTO ou MARCA corretos mencionados na headline são COERENTES
7. Imagens com logotipos ou produtos de OUTRA marca/categoria são INCOERENTES

Responda APENAS com um JSON válido (sem markdown, sem \`\`\`):
{"coherent": true/false, "reason": "explicação curta em português", "confidence": 0.0-1.0}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 200,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[COHERENCE] AI API error:', response.status, errText);
      return new Response(
        JSON.stringify({ coherent: true, reason: 'ai_error', confidence: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || '';
    console.log('[COHERENCE] AI response:', rawContent);

    // Parse JSON from response
    let result = { coherent: true, reason: 'parse_fallback', confidence: 0.5 };
    try {
      // Extract JSON from possible markdown code blocks
      const jsonMatch = rawContent.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.warn('[COHERENCE] Failed to parse AI response:', parseErr);
      // If we can't parse, check for obvious keywords
      const lower = rawContent.toLowerCase();
      if (lower.includes('"coherent": false') || lower.includes('"coherent":false')) {
        result = { coherent: false, reason: 'Imagem não corresponde ao conteúdo', confidence: 0.7 };
      }
    }

    console.log(`[COHERENCE] Result: coherent=${result.coherent}, confidence=${result.confidence}, reason=${result.reason}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[COHERENCE] Error:', error);
    return new Response(
      JSON.stringify({ coherent: true, reason: 'error_fallback', confidence: 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
