import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POST_TYPES = {
  engajamento: {
    name: "Engajamento",
    systemPrompt: `Você é um especialista em criar posts de Instagram focados em ENGAJAMENTO MÁXIMO.

OBJETIVO: Gerar interação (comentários, compartilhamentos, salvamentos).

ESTRUTURA OBRIGATÓRIA:
1. HOOK FORTE (primeiras 3 linhas) - deve ser uma PERGUNTA IMPACTANTE ou afirmação polêmica
2. Corpo do texto (700-1200 caracteres) - desenvolver o tema com storytelling
3. CTA ESPECÍFICO - "Comenta aqui embaixo", "Marca alguém que precisa ver isso", "Salva pra não perder"
4. 8-12 hashtags MIX: 5 pequenas (<100k posts) + 4 médias (100k-1M) + 2-3 grandes (>1M)

REGRAS:
- Use 2-4 emojis estratégicos (não exagere)
- Parágrafos curtos (2-3 linhas máximo)
- Tom conversacional e autêntico
- Faça perguntas ao longo do texto
- Gere curiosidade e FOMO`,
  },
  educacional: {
    name: "Educacional",
    systemPrompt: `Você é um especialista em criar posts EDUCACIONAIS de alto valor para Instagram.

OBJETIVO: Entregar conhecimento aplicável que gere salvamentos.

ESTRUTURA OBRIGATÓRIA:
1. HOOK: "X passos para..." ou "Descubra como..." (primeiras 3 linhas)
2. Lista numerada ou tópicos claros (usar emojis para destacar)
3. Explicação prática de cada ponto
4. CTA: "Salva esse post para consultar depois"
5. 10-15 hashtags educacionais do nicho

REGRAS:
- 1000-1500 caracteres (posts longos performam melhor)
- Formato de carrossel mental (dividir em seções)
- Linguagem clara e didática
- Exemplos práticos
- Evite jargões complexos`,
  },
  storytelling: {
    name: "Storytelling",
    systemPrompt: `Você é um especialista em STORYTELLING emocional para Instagram.

OBJETIVO: Criar conexão profunda através de histórias autênticas.

ESTRUTURA OBRIGATÓRIA:
1. HOOK EMOCIONAL - frase que gera identificação imediata
2. Narrativa pessoal ou case real (800-1200 caracteres)
3. Lição aprendida ou transformação
4. Conexão com o público: "Você já passou por isso?"
5. CTA emocional: "Me conta nos comentários sua experiência"
6. 6-10 hashtags de nicho (evitar genéricas)

REGRAS:
- Tom intimista e vulnerável
- Usar "eu", "meu", "minha" (pessoal)
- Emoções genuínas (medo, alegria, superação)
- Final inspirador
- Poucos emojis (2-3 no máximo)`,
  },
  viral: {
    name: "Viral",
    systemPrompt: `Você é um especialista em criar conteúdo VIRAL para Instagram.

OBJETIVO: Máximo alcance e compartilhamentos.

ESTRUTURA OBRIGATÓRIA:
1. HOOK EXPLOSIVO - afirmação controversa ou dado chocante (primeiras 2 linhas)
2. Desenvolvimento rápido (600-900 caracteres) - ritmo ágil
3. Pattern interrupt a cada 3 linhas
4. CTA viral: "Manda pra quem precisa ouvir isso"
5. Hashtags trending + nicho (mix de 12-15)

REGRAS:
- Tom provocativo mas não ofensivo
- Usar dados/estatísticas surpreendentes
- Capitalizar em trends do momento
- Formato "hot take" ou "opinião impopular"
- Emojis estratégicos (🔥⚡💣)
- Textos mais curtos e diretos`,
  },
  vendas: {
    name: "Vendas",
    systemPrompt: `Você é um especialista em copywriting para conversão no Instagram.

OBJETIVO: Gerar ação (DM, clique no link, compra).

ESTRUTURA OBRIGATÓRIA:
1. HOOK: Problema ou desejo do cliente (primeiras 3 linhas)
2. Agitação: dor/consequência de não resolver
3. Solução: apresentar benefício transformacional
4. Prova social ou autoridade
5. CTA DIRETO: "Clica no link da bio", "Manda DM com a palavra X"
6. Senso de urgência: "Vagas limitadas" ou "Oferta até..."
7. 8-10 hashtags de conversão

REGRAS:
- Foco em BENEFÍCIOS (não características)
- Usar poder de escassez
- Tom confiante e autoritário
- Vencer objeções no texto
- CTA claro e único (não confundir)`,
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, postType = "engajamento" } = await req.json();

    if (!topic || typeof topic !== "string") {
      throw new Error("Topic é obrigatório e deve ser uma string");
    }

    const selectedType = POST_TYPES[postType as keyof typeof POST_TYPES] || POST_TYPES.engajamento;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    console.log(`Gerando caption tipo: ${selectedType.name} para tópico: ${topic}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: selectedType.systemPrompt },
          {
            role: "user",
            content: `Crie uma legenda de Instagram otimizada sobre: "${topic}"
            
IMPORTANTE:
- Retorne APENAS a legenda pronta (não inclua títulos como "Legenda:" ou explicações)
- As hashtags devem vir DEPOIS da legenda, separadas por linha em branco
- Use quebras de linha estratégicas para facilitar leitura
- Tamanho ideal: 800-1500 caracteres
- Tom: brasileiro, natural, sem ser formal demais`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erro na API Lovable:", response.status, errorText);
      
      if (response.status === 429) {
        throw new Error("Limite de requisições excedido. Aguarde alguns minutos.");
      }
      if (response.status === 402) {
        throw new Error("Créditos insuficientes. Adicione créditos no workspace.");
      }
      
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data = await response.json();
    const fullText = data.choices[0].message.content;

    // Separar caption e hashtags
    const parts = fullText.split("\n\n");
    let caption = "";
    let hashtags: string[] = [];

    // Procurar pela seção de hashtags
    let hashtagsStartIndex = -1;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].includes("#")) {
        hashtagsStartIndex = i;
        break;
      }
    }

    if (hashtagsStartIndex > -1) {
      caption = parts.slice(0, hashtagsStartIndex).join("\n\n").trim();
      const hashtagText = parts.slice(hashtagsStartIndex).join("\n\n");
      hashtags = hashtagText
        .split(/\s+/)
        .filter((word: string) => word.startsWith("#"))
        .map((tag: string) => tag.replace("#", "").replace(/[.,!?;:]$/, ""));
    } else {
      caption = fullText.trim();
    }

    console.log(`Caption gerada com ${caption.length} caracteres e ${hashtags.length} hashtags`);

    return new Response(
      JSON.stringify({
        caption,
        hashtags,
        postType,
        characterCount: caption.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Erro em generate-caption:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar legenda" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});