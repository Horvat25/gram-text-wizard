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
  noticia: {
    name: "Notícia",
    systemPrompt: `Você é um JORNALISTA DIGITAL especializado em notícias de TECNOLOGIA e INOVAÇÃO para Instagram.

OBJETIVO: A LEGENDA é o destino final do leitor. Ele NÃO vai clicar em link nenhum — todo o ouro precisa estar AQUI. Entregue contexto, análise e provocação que valham o tempo dele.

ESTRUTURA EM 4 BLOCOS (separe por linha em branco — 800 a 1500 caracteres no total):

1. HOOK + LEAD (2-3 linhas): a frase que segura quem parou pela headline. NÃO repita a headline. Complemente com o "o quê" e "quem", de forma factual e direta.
2. CONTEXTO QUE NINGUÉM TÁ CONTANDO (3-5 linhas): por que isso importa AGORA, o que já aconteceu antes, qual é o jogo por trás. Dados concretos, nomes, números. Aqui está o ouro.
3. ANÁLISE / CONSEQUÊNCIA (2-4 linhas): sua leitura crítica. Quem ganha, quem perde, o que vem a seguir. Tom de quem entende do assunto, não de quem só repete release.
4. PROVOCAÇÃO + FONTE (2 linhas): pergunta afiada que gere comentário + linha curta "📰 Fonte: [nome do site]"

ESTILO JORNALÍSTICO:
- Tom INFORMATIVO + OPINIÃO clara (não release de empresa)
- Linguagem direta, sem jargão
- Dados e fatos concretos > adjetivos
- Sem sensacionalismo gratuito, MAS sem amenizar (chame as coisas pelo nome)
- Use 2-3 emojis no máximo, em pontos-chave (📰 🚨 ⚡ 🤖 💡 🔥)

REGRAS OBRIGATÓRIAS:
- ENTRE 800 E 1500 CARACTERES (NÃO entregue post raso)
- Parágrafos curtos (máximo 4 linhas cada) separados por linha em branco
- NÃO invente fatos — baseie-se rigorosamente na notícia fornecida
- SEMPRE incluir "📰 Fonte: [site]" na última linha
- 8 hashtags: 4 do tema específico + 2 de tech + 2 de notícias`,
  },
  reflexao_profunda: {
    name: "Reflexão Profunda",
    systemPrompt: `Você é um ANALISTA SÊNIOR de tecnologia que escreve para Instagram. Seu público parou pela headline provocativa — agora você precisa ENTREGAR.

OBJETIVO: A LEGENDA é o destino final. O leitor NÃO vai clicar em nada. Todo o conteúdo de valor precisa estar AQUI. Entregue contexto, análise e uma visão que ninguém mais está dando.

ESTRUTURA EM 4 BLOCOS (separe por linha em branco — 800 a 1500 caracteres no total):

1. PAYOFF DO HOOK (2-3 linhas): a headline criou tensão. Aqui você abre a cortina — entregue a primeira informação concreta que justifica a provocação.
2. CONTEXTO + DADOS (3-5 linhas): explique o cenário com fatos concretos. Quem está envolvido, quanto custa, o que aconteceu antes, qual é o tamanho real disso. Aqui está o ouro.
3. ANÁLISE / VISÃO DE FUTURO (2-4 linhas): sua leitura crítica como especialista. O que isso significa de verdade, quem ganha, quem perde, o que isso muda no setor.
4. PROVOCAÇÃO FINAL (1-2 linhas): pergunta afiada ou afirmação que obrigue o leitor a comentar/pensar. Sem CTA genérico do tipo "comenta aqui".

REGRAS OBRIGATÓRIAS:
- ENTRE 800 E 1500 CARACTERES (NUNCA entregue post raso)
- Parágrafos curtos (máximo 4 linhas) separados por linha em branco
- Tom de quem ENTENDE do assunto, não de quem só repete manchete
- Sem hype vazio — cada frase precisa ter informação ou opinião
- 2-3 emojis no máximo, em pontos-chave
- 8 hashtags MIX: 4 do tema + 3 de tech + 1 de comunidade`,
  },
};

// Fallback programático quando créditos acabam
function generateFallbackCaption(topic: string, postType: string, mediaType?: string) {
  const topicClean = topic.length > 200 ? topic.substring(0, 200) : topic;
  
  // Extrair primeira frase como headline
  const firstSentence = topicClean.split(/[.!?]/)[0].trim();
  const headline = firstSentence.length > 80 ? firstSentence.substring(0, 77) + '...' : firstSentence;
  
  const ctaMap: Record<string, string> = {
    engajamento: '💬 O que você acha? Comenta aqui!',
    educacional: '📌 Salva esse post para consultar depois!',
    storytelling: '❤️ Se identificou? Compartilha com alguém!',
    viral: '🔥 Manda pra quem precisa ver isso!',
    vendas: '📩 Quer saber mais? Chama no DM!',
    noticia: '📰 Segue a gente para mais notícias de tecnologia!',
  };

  const mediaCTA: Record<string, string> = {
    carousel: '\n\n🔹 ARRASTE PRO LADO para ver mais 👉',
    video: '\n\n📺 ASSISTA ATÉ O FINAL ▶️',
    reel: '\n\n📺 ASSISTA ATÉ O FINAL ▶️',
  };

  const cta = ctaMap[postType] || ctaMap.engajamento;
  const extra = mediaCTA[mediaType || ''] || '';

  const caption = `${headline.toUpperCase()}${extra}\n\n${topicClean}\n\n${cta}`;

  const defaultHashtags = ['Tecnologia', 'Inovação', 'IA', 'InteligênciaArtificial', 'Tech', 'Futuro', 'NeuralUpdate', 'Notícias'];

  return {
    caption,
    hashtags: defaultHashtags,
    postType,
    characterCount: caption.length,
    fallback: true,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, postType = "engajamento", mediaType, customInstructions } = await req.json();

    if (!topic || typeof topic !== "string") {
      throw new Error("Topic é obrigatório e deve ser uma string");
    }

    const selectedType = POST_TYPES[postType as keyof typeof POST_TYPES] || POST_TYPES.engajamento;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    console.log(`Gerando caption tipo: ${selectedType.name}, mídia: ${mediaType || 'image'} para tópico: ${topic}`);

    const currentYear = new Date().getFullYear(); // Always use current year (2025+)
    
    // CTA programático baseado no tipo de mídia
    let mediaCTA = "";
    if (mediaType === "carousel") {
      mediaCTA = "\n\n🔹 ARRASTE PRO LADO para ver mais 👉";
    } else if (mediaType === "video" || mediaType === "reel") {
      mediaCTA = "\n\n📺 ASSISTA ATÉ O FINAL ▶️";
    } else {
      // Para imagens (posts de notícia)
      mediaCTA = "\n\n👇 LEIA A LEGENDA COMPLETA";
    }

    // Build system prompt with custom instructions and year context
    let systemPrompt = selectedType.systemPrompt;
    
    // Add year context to prevent outdated references
    systemPrompt += `\n\nCONTEXTO TEMPORAL OBRIGATÓRIO:
- Data atual: ${new Date().toLocaleDateString('pt-BR')} (Ano ${currentYear})
- NUNCA mencione anos passados (2023, 2024, 2025) como se fossem atuais
- Sempre use referências temporais corretas para ${currentYear}
- Português brasileiro PERFEITO (sem erros ortográficos)
- NÃO use termos em inglês - tudo deve ser em português brasileiro`;
    
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
        model: "google/gemini-2.5-flash-lite",
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
- Tom: brasileiro, natural, direto
- PORTUGUÊS BRASILEIRO CORRETO (sem erros ortográficos!)
- Estamos em ${currentYear} - NÃO mencione anos passados como atuais`,
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
        console.warn("⚠️ Créditos insuficientes - usando fallback programático");
        const fallbackCaption = generateFallbackCaption(topic, postType, mediaType);
        return new Response(
          JSON.stringify(fallbackCaption),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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

    // Adicionar CTA programático baseado no tipo de mídia (no início da caption)
    if (mediaCTA) {
      // Inserir o CTA no início, após o primeiro parágrafo
      const paragraphs = caption.split('\n\n');
      if (paragraphs.length > 1) {
        paragraphs.splice(1, 0, mediaCTA.trim());
        caption = paragraphs.join('\n\n');
      } else {
        caption = caption + mediaCTA;
      }
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