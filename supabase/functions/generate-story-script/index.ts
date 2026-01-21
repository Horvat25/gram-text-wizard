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

    // NOVO POSICIONAMENTO: IA prática para criadores pequenos
    const systemPrompt = `Você cria roteiros de Reels para o NeuralUpdate.
POSICIONAMENTO: "IA prática para criadores pequenos que querem crescer sem virar escravos de conteúdo"

PÚBLICO-ALVO:
- Criadores com 1k-50k seguidores
- Pessoas que postam todo dia e não crescem
- Quem usa IA mas ainda se sente perdido

ESTRUTURA OBRIGATÓRIA DE CADA VÍDEO:
CENA 1 (0-2s): DOR DIRETA - Frase que faz a pessoa pensar "sou eu!"
CENA 2 (3-6s): QUEBRA DE EXPECTATIVA - "O problema não é o que você pensa"
CENA 3 (7-15s): MICRO-INSIGHT - 1 dica prática, 1 erro comum, 1 ajuste simples
CENA 4: CTA - Direto, sem enrolação

GANCHOS QUE FUNCIONAM (USE ESSES PADRÕES):
- "Se você usa ChatGPT assim, ele está te atrapalhando."
- "Criadores pequenos erram isso ao usar IA."
- "Postar todo dia e continuar com poucos seguidores cansa, né?"
- "A maioria usa IA pra parecer inteligente. Poucos usam pra crescer."
- "Você tem [X] seguidores? Isso aqui é pra você."

REGRAS:
- Frases CURTAS e DIRETAS (8-15 palavras máx)
- ZERO textão ou poesia futurista
- Tom de conversa com amigo que já tentou de tudo
- Foco em RESULTADO PRÁTICO, não teoria

Use português brasileiro conversacional.`;

    const userPrompt = `Crie um roteiro sobre: "${topic}"

ESTRUTURA EXATA:
1. CENA 1 (0-2s) - DOR DIRETA: Frase que faz criadores pequenos pararem de rolar
2. CENA 2 (3-6s) - QUEBRA: Revele que o problema não é o que eles pensam
3. CENA 3 (7-15s) - INSIGHT PRÁTICO: Uma dica acionável, um erro comum, um ajuste simples
4. CENA 4 - CTA: "Segue pra aprender a usar IA do jeito certo" ou similar

ESPECIFICAÇÕES:
- Exatamente ${segmentCount} segmentos
- ${wordsPerSegment}-${wordsPerSegment + 5} palavras por segmento (frases CURTAS!)
- Estilo: ${style || "direto, prático, empático"}

Para cada segmento:
- text: narração em português (máx ${wordsPerSegment} palavras) - SEM enrolação!
- imagePrompt: cena em inglês mostrando PESSOA REAL trabalhando, tela de celular, antes/depois, dados. NUNCA imagens abstratas/futuristas/neon genéricos.

Responda APENAS com JSON:
{
  "title": "Título curto focado no problema do criador",
  "segments": [
    {
      "text": "Texto da narração",
      "imagePrompt": "Photo of content creator looking frustrated at phone showing low engagement metrics..."
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
