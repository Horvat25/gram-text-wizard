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
    const { niche, language = "pt-BR" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const currentDate = new Date().toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const systemPrompt = `Você é um especialista em marketing digital e criação de conteúdo para Instagram. 
Sua tarefa é gerar sugestões criativas e atuais de posts baseadas em tendências, notícias recentes e temas virais.

Data atual: ${currentDate}

IMPORTANTE: 
- Gere sugestões REAIS e ATUAIS baseadas em tendências de ${currentDate}
- Considere eventos sazonais, feriados próximos, tendências do momento
- Foque em conteúdo que gera engajamento alto
- Seja criativo e inovador nas sugestões`;

    const userPrompt = `Gere 6 sugestões de posts para Instagram no nicho: "${niche || 'tecnologia e inovação'}"

Para cada sugestão, forneça em formato JSON:
{
  "suggestions": [
    {
      "id": "1",
      "title": "Título chamativo e curto",
      "topic": "Tema/Tendência atual",
      "postType": "engajamento|educacional|storytelling|viral|vendas",
      "captionIdea": "Ideia completa de legenda com emojis (máximo 300 caracteres)",
      "imagePrompt": "Prompt detalhado em inglês para gerar imagem com IA (estilo, cores, elementos visuais)",
      "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
      "whyItWorks": "Explicação breve de por que esse post funcionaria bem",
      "bestTime": "Melhor horário para postar (ex: 19h)",
      "trendScore": 85
    }
  ]
}

Certifique-se de variar os tipos de post e criar sugestões que realmente engajem. 
Use tendências REAIS e ATUAIS do momento.
Retorne APENAS o JSON válido, sem texto adicional.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos à sua conta." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content received from AI");
    }

    // Parse JSON from response
    let suggestions;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Parse error:", parseError, "Content:", content);
      throw new Error("Failed to parse AI response");
    }

    return new Response(JSON.stringify(suggestions), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in generate-suggestions:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});