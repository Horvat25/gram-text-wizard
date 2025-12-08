import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POST_TYPES = {
  engajamento: {
    name: "Engajamento",
    systemPrompt: `Você é um especialista em criar posts de Instagram focados em ENGAJAMENTO.

OBJETIVO: Gerar interação (comentários, compartilhamentos, salvamentos).

ESTRUTURA (MÁXIMO 2-3 PARÁGRAFOS):
1. HOOK FORTE (1-2 linhas) - pergunta impactante ou afirmação que prende
2. Desenvolvimento CURTO (2-3 linhas) - direto ao ponto
3. CTA claro (1 linha) - "Comenta aqui", "Marca alguém", "Salva"

REGRAS OBRIGATÓRIAS:
- MÁXIMO 400-700 caracteres (seja CONCISO!)
- Use 2-3 emojis estratégicos (não exagere)
- Parágrafos CURTOS (2-3 linhas máximo)
- Tom conversacional
- 8 hashtags MIX: 4 pequenas + 3 médias + 1 grande`,
  },
  educacional: {
    name: "Educacional",
    systemPrompt: `Você é um especialista em criar posts EDUCACIONAIS para Instagram.

OBJETIVO: Entregar conhecimento de forma rápida e aplicável.

ESTRUTURA (MÁXIMO 3 PARÁGRAFOS):
1. HOOK: "X dicas para..." ou "Descubra como..." (1-2 linhas)
2. Conteúdo: 3-4 pontos rápidos com emojis
3. CTA: "Salva esse post" (1 linha)

REGRAS OBRIGATÓRIAS:
- MÁXIMO 500-800 caracteres
- Seja DIRETO - ninguém quer ler textão
- Use bullet points ou números
- 8 hashtags educacionais`,
  },
  storytelling: {
    name: "Storytelling",
    systemPrompt: `Você é um especialista em STORYTELLING para Instagram.

OBJETIVO: Criar conexão através de histórias curtas.

ESTRUTURA (MÁXIMO 3 PARÁGRAFOS):
1. HOOK EMOCIONAL (1-2 linhas)
2. História RESUMIDA (3-4 linhas)
3. Lição + CTA (1-2 linhas)

REGRAS OBRIGATÓRIAS:
- MÁXIMO 500-700 caracteres
- Conte a essência, não todos os detalhes
- Tom intimista
- 2-3 emojis
- 8 hashtags de nicho`,
  },
  viral: {
    name: "Viral",
    systemPrompt: `Você é um especialista em criar conteúdo VIRAL para Instagram.

OBJETIVO: Máximo alcance e compartilhamentos.

ESTRUTURA (MÁXIMO 2 PARÁGRAFOS):
1. HOOK EXPLOSIVO (1-2 linhas) - dado chocante ou opinião forte
2. Desenvolvimento RÁPIDO (2-3 linhas)
3. CTA viral: "Manda pra quem precisa ver" (1 linha)

REGRAS OBRIGATÓRIAS:
- MÁXIMO 400-600 caracteres (posts virais são CURTOS!)
- Tom provocativo mas não ofensivo
- Emojis 🔥⚡
- 8-10 hashtags trending`,
  },
  vendas: {
    name: "Vendas",
    systemPrompt: `Você é um especialista em copywriting para conversão no Instagram.

OBJETIVO: Gerar ação (DM, clique, compra).

ESTRUTURA (MÁXIMO 3 PARÁGRAFOS):
1. DOR do cliente (1-2 linhas)
2. SOLUÇÃO + benefício (2-3 linhas)
3. CTA DIRETO + urgência (1-2 linhas)

REGRAS OBRIGATÓRIAS:
- MÁXIMO 500-700 caracteres
- Foco em BENEFÍCIOS
- CTA único e claro
- 8 hashtags de conversão`,
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, postType = "engajamento", customInstructions } = await req.json();

    if (!topic || typeof topic !== "string") {
      throw new Error("Topic é obrigatório e deve ser uma string");
    }

    const selectedType = POST_TYPES[postType as keyof typeof POST_TYPES] || POST_TYPES.engajamento;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    console.log(`Gerando caption tipo: ${selectedType.name} para tópico: ${topic}`);

    // Build system prompt with custom instructions if provided
    let systemPrompt = selectedType.systemPrompt;
    if (customInstructions) {
      systemPrompt += `\n\nINSTRUÇÕES PERSONALIZADAS DO USUÁRIO:\n${customInstructions}`;
    }

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
          {
            role: "user",
            content: `Crie uma legenda de Instagram otimizada sobre: "${topic}"
            
REGRAS OBRIGATÓRIAS:
- Retorne APENAS a legenda pronta (sem títulos ou explicações)
- NÃO USE MARKDOWN: sem **, _, \`
- MÁXIMO 2-3 parágrafos curtos (no máximo 4 em casos especiais)
- MÁXIMO 400-700 caracteres (seja CONCISO!)
- Ninguém quer ler textão - vá DIRETO ao ponto
- Use 2-3 emojis estratégicos
- Use CAPS para ênfase quando necessário
- Hashtags separadas por linha em branco no final
- Tom: brasileiro, natural, direto`,
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
    let fullText = data.choices[0].message.content;

    // Remove any remaining markdown formatting
    fullText = fullText
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove **bold**
      .replace(/\*([^*]+)\*/g, '$1')       // Remove *italic*
      .replace(/__([^_]+)__/g, '$1')       // Remove __bold__
      .replace(/_([^_]+)_/g, '$1')         // Remove _italic_
      .replace(/`([^`]+)`/g, '$1');        // Remove `code`

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