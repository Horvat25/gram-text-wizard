import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Function to search real-time news and trends
async function searchRealTimeTrends(niche: string, apiKey: string): Promise<string> {
  try {
    const currentDate = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const searchPrompt = `Você é um pesquisador de tendências com acesso a informações atualizadas. 
    
TAREFA: Liste as 5-6 principais notícias, tendências e assuntos mais comentados HOJE (${currentDate}) sobre "${niche}".

Para cada item, forneça:
1. O assunto/notícia específica
2. Por que está em alta/viral
3. Dados ou números relevantes se disponíveis

FOQUE EM:
- Notícias das últimas 24-72 horas
- Trending topics do Twitter/X Brasil
- Assuntos virais no TikTok e Instagram
- Lançamentos e novidades recentes
- Polêmicas e debates do momento
- Eventos atuais e acontecimentos

Seja ESPECÍFICO com nomes, datas e eventos reais. Responda em português de forma objetiva.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "user", content: searchPrompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error("Error searching trends:", response.status);
      return "";
    }

    const data = await response.json();
    const trendsContent = data.choices?.[0]?.message?.content || "";
    console.log("Real-time trends found:", trendsContent.substring(0, 200));
    return trendsContent;
  } catch (error) {
    console.error("Error in searchRealTimeTrends:", error);
    return "";
  }
}

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

    console.log("Generating suggestions for niche:", niche);

    const currentDate = new Date().toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // First, search for real-time trends and news
    console.log("Searching for real-time trends...");
    const realTimeTrends = await searchRealTimeTrends(niche, LOVABLE_API_KEY);

    const systemPrompt = `Você é um especialista em marketing digital e criação de conteúdo para Instagram. 
Sua tarefa é gerar sugestões criativas e ATUAIS de posts baseadas em tendências, notícias recentes e temas virais.

Data atual: ${currentDate}

IMPORTANTE: 
- Use as tendências e notícias REAIS fornecidas no contexto
- Crie sugestões que aproveitem os assuntos do MOMENTO
- Foque em conteúdo com alto potencial de engajamento
- Seja criativo e inovador`;

    const userPrompt = `Gere 6 sugestões de posts para Instagram no nicho: "${niche || 'tecnologia e inovação'}"

${realTimeTrends ? `
=== TENDÊNCIAS E NOTÍCIAS ATUAIS (${currentDate}) ===
${realTimeTrends}
=== FIM DAS TENDÊNCIAS ===

IMPORTANTE: Use essas informações REAIS e ATUAIS para criar sugestões relevantes. Mencione eventos, notícias ou tendências específicas quando apropriado.
` : ''}

Para cada sugestão, forneça em formato JSON:
{
  "suggestions": [
    {
      "id": "1",
      "title": "Título chamativo e curto relacionado à tendência atual",
      "topic": "Tema/Tendência/Notícia atual específica",
      "postType": "engajamento|educacional|storytelling|viral|vendas",
      "captionIdea": "Ideia completa de legenda com emojis, mencionando o assunto atual (máximo 300 caracteres)",
      "imagePrompt": "Prompt detalhado em inglês para gerar imagem com IA (estilo, cores, elementos visuais)",
      "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
      "whyItWorks": "Por que esse post funcionaria bem AGORA, conectado à tendência atual",
      "bestTime": "Melhor horário para postar (ex: 19h)",
      "trendScore": 85
    }
  ]
}

REGRAS:
1. Cada sugestão DEVE estar conectada a uma tendência ou notícia atual quando possível
2. Varie os tipos de post (engajamento, educacional, storytelling, viral, vendas)
3. Crie sugestões que realmente engajem aproveitando o momento
4. trendScore deve refletir o quão atual/viral é o tema (70-95)
5. Retorne APENAS o JSON válido, sem texto adicional`;

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

    // Parse JSON from response - handle markdown code blocks
    let suggestions;
    try {
      let jsonContent = content;
      
      // Remove markdown code blocks if present
      if (jsonContent.includes("```json")) {
        jsonContent = jsonContent.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonContent.includes("```")) {
        jsonContent = jsonContent.replace(/```\s*/g, "");
      }
      
      // Trim whitespace
      jsonContent = jsonContent.trim();
      
      // Try to parse the JSON
      suggestions = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error("Parse error:", parseError, "Content:", content.substring(0, 500));
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
