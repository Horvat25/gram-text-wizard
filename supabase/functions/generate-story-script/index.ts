import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const { topic, segmentCount = 4, wordsPerSegment = 12, totalDuration = 20, style, brandName } = await req.json();

    if (!topic) {
      throw new Error("Tópico é obrigatório");
    }

    console.log("Generating story script for:", topic);
    console.log("Segments:", segmentCount, "| Words per segment:", wordsPerSegment);

    // VIRAL OPTIMIZATION: Prompts otimizados para ganchos que capturam atenção nos primeiros 3 segundos
    const systemPrompt = `Você é um roteirista VIRAL de vídeos curtos para um canal de tecnologia e futuro.
Seu ÚNICO objetivo é criar vídeos que PRENDAM a atenção nos PRIMEIROS 3 SEGUNDOS.

REGRAS DE OURO PARA VIRALIZAR:
1. GANCHO IRRESISTÍVEL: Primeira frase DEVE criar curiosidade instantânea
   - Use números específicos: "Em 2025, 90% dos empregos vão..."
   - Faça afirmações ousadas: "Isso vai mudar TUDO que você sabe sobre..."
   - Crie urgência: "A maioria das pessoas não percebeu, mas..."
   - Use padrão interruptor: "Espera... você sabia que..."
2. RITMO ACELERADO: Frases curtas, diretas, sem enrolação
3. EMOÇÃO: Provoque espanto, curiosidade ou medo de perder algo
4. VISUAL: Descreva cenas cinematográficas impactantes

NÃO mencione marcas, empresas ou URLs.
Use português brasileiro conversacional e envolvente.`;

    const userPrompt = `Crie um roteiro VIRAL sobre: "${topic}"

⚡ REGRA CRÍTICA - PRIMEIRO SEGMENTO (GANCHO):
A primeira frase DEVE usar uma dessas técnicas:
- "Você NÃO vai acreditar no que..."
- "Em [ano], [número]% das pessoas vão..."  
- "Isso vai ACABAR com [algo comum]..."
- "A verdade que ninguém te contou sobre..."
- "Se você não souber isso agora, vai..."
- Pergunta provocativa que cria suspense

ESPECIFICAÇÕES:
- Exatamente ${segmentCount} segmentos
- ${wordsPerSegment}-${wordsPerSegment + 5} palavras por segmento
- Estilo: ${style || "impactante e provocativo"}

ESTRUTURA VIRAL:
1. GANCHO (0-3s): Frase que OBRIGA a pessoa a continuar assistindo
2. REVELAÇÃO: Desenvolva a promessa do gancho com fatos surpreendentes
3. PROVA: Exemplos concretos que validam a afirmação
4. CONCLUSÃO: Feche com reflexão poderosa sobre o futuro

Para cada segmento:
- text: narração em português (${wordsPerSegment} palavras) - SEM enrolação!
- imagePrompt: cena cinematográfica em inglês, dramática e visualmente impactante

Responda APENAS com JSON:
{
  "title": "Título curto e provocativo",
  "segments": [
    {
      "text": "Texto da narração",
      "imagePrompt": "Cinematic dramatic shot of..."
    }
  ]
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`Erro na API de IA: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";
    
    // Clean JSON from markdown code blocks
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Resposta da IA inválida");
    }

    if (!parsed.segments || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
      throw new Error("Nenhum segmento gerado");
    }

    console.log("Generated story:", parsed.title);
    console.log("Segments count:", parsed.segments.length);

    return new Response(
      JSON.stringify({
        title: parsed.title,
        segments: parsed.segments,
        totalDuration,
        segmentCount: parsed.segments.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in generate-story-script:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar roteiro" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
