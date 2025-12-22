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

    const systemPrompt = `Você é um roteirista profissional de vídeos curtos virais para Instagram Reels.
Crie histórias envolventes com COMEÇO, MEIO e FIM claros.
Cada segmento deve ter uma imagem distinta e impactante.
Use linguagem conversacional em português brasileiro.
Seja direto, impactante e mantenha a atenção do espectador.`;

    const userPrompt = `Crie um roteiro para um vídeo sobre: "${topic}"

REGRAS IMPORTANTES:
- Exatamente ${segmentCount} segmentos/cenas
- Cada segmento deve ter ${wordsPerSegment}-${wordsPerSegment + 5} palavras para narração
- Estilo: ${style || "profissional e envolvente"}
- Marca: ${brandName || "não especificada"}

ESTRUTURA OBRIGATÓRIA:
1. ABERTURA (gancho forte, pergunta ou fato impactante)
2. DESENVOLVIMENTO (informação principal, benefícios, exemplos)
3. CLÍMAX (ponto alto, revelação, momento de impacto)
4. FECHAMENTO (call-to-action, conclusão memorável)

Para cada segmento, forneça:
- text: texto exato para narração (${wordsPerSegment} palavras)
- imagePrompt: descrição detalhada da imagem em inglês, estilo cinematográfico

Responda APENAS com JSON válido no formato:
{
  "title": "Título curto e impactante",
  "segments": [
    {
      "text": "Texto da narração aqui",
      "imagePrompt": "Cinematic shot of..."
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
        model: "google/gemini-2.5-flash",
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
