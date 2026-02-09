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

    console.log("[generate-story-script] Topic:", topic);
    console.log("[generate-story-script] Segments:", segmentCount, "| Words per segment:", wordsPerSegment);

    const BRAND = (brandName && String(brandName).trim()) || "Neural Update";
    const STYLE = (style && String(style).trim()) || "informativo, inteligente, direto e sem hype";
    const currentYear = new Date().getFullYear(); // Always use current year (2025+)

    // Helpers
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        // remove accents
        .replace(/\p{Diacritic}/gu, "")
        // keep letters/numbers/spaces
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const stopwords = new Set([
      "como",
      "para",
      "sobre",
      "uma",
      "um",
      "uns",
      "umas",
      "de",
      "do",
      "da",
      "dos",
      "das",
      "e",
      "a",
      "o",
      "as",
      "os",
      "no",
      "na",
      "nos",
      "nas",
      "em",
      "por",
      "com",
      "sem",
      "que",
      "isso",
      "essa",
      "esse",
      "essas",
      "esses",
      "hoje",
      "agora",
      "futuro",
    ]);

    const extractKeywords = (t: string) => {
      const tokens = normalize(t)
        .split(" ")
        .map((w) => w.trim())
        .filter(Boolean)
        .filter((w) => w.length >= 3)
        .filter((w) => !stopwords.has(w));
      return Array.from(new Set(tokens)).slice(0, 10);
    };

    const looksOnTopic = (parsed: any, originalTopic: string) => {
      const kws = extractKeywords(originalTopic);
      if (kws.length === 0) return true; // nothing to validate
      const hay = normalize(
        `${parsed?.title || ""} ${(parsed?.segments || [])
          .map((s: any) => s?.text || "")
          .join(" ")}`
      );
      return kws.some((kw) => hay.includes(kw));
    };

    const callModel = async (systemPrompt: string, userPrompt: string) => {
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
      } catch {
        console.error("Failed to parse AI response:", content);
        throw new Error("Resposta da IA inválida");
      }

      if (!parsed?.segments || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
        throw new Error("Nenhum segmento gerado");
      }

      return parsed;
    };

    // System prompt: strategy + constraints, topic-driven, with CURRENT YEAR context
    // UPDATED: Generate searchQueries for finding real images on the web instead of AI image prompts
    const systemPrompt = `Você é um estrategista de conteúdo digital do perfil ${BRAND}.

DATA ATUAL: ${new Date().toLocaleDateString('pt-BR')} (ANO ${currentYear})

OBJETIVO:
- Criar roteiros curtos para Reels/Stories com crescimento orgânico, autoridade e engajamento real.
- Conteúdo informativo e inteligente (IA aplicada ao dia a dia, tecnologia, ferramentas, tendências, notícias explicadas de forma simples).
- SEMPRE mencionar contexto atual (${currentYear}) quando relevante.

REGRAS CRÍTICAS:
- O roteiro DEVE ser sobre o TEMA fornecido pelo usuário. Não troque o assunto para "crescimento no Instagram", "criadores pequenos", etc.
- NUNCA mencionar anos passados como 2023, 2024 ou 2025 - estamos em ${currentYear}!
- Nada de conteúdo genérico/repetitivo. Sem promessas milagrosas. Sem hype vazio.
- Linguagem clara, direta e interessante.
- TUDO em PORTUGUÊS BRASILEIRO (incluindo os textos e imageSearch).
- NÃO USE INGLÊS EM NENHUMA PARTE DO ROTEIRO!

📝 ORTOGRAFIA - REGRAS OBRIGATÓRIAS:
- Revise CADA palavra antes de finalizar. ZERO erros ortográficos são aceitáveis.
- Use acentuação correta: "você", "também", "através", "é", "está", "já", "até".
- Palavras comumente erradas que devem estar CORRETAS:
  * "Inteligência" (não "Inteligencia")
  * "Tecnologia" (não "Tecnolojia") 
  * "através" (não "atraves")
  * "você" (não "voce")
  * "diagnóstico" (não "diagnostico")
  * "automático" (não "automatico")
  * "revolução" (não "revolucao")
  * "atenção" (não "atencao")
  * "decisão" (não "decisao")
  * "saúde" (não "saude")
  * "Médico" (não "Medico")
  * "análise" (não "analise")
  * "possível" (não "possivel")
  * "próximo" (não "proximo")
- PROIBIDO usar termos em inglês como "AI", "Generative AI", "Robotics", "Computing" - use equivalentes em português!

ESTRUTURA (4 CENAS):
1) GANCHO (0-2s): frase curta e específica do tema. Use formato: "IMPACTO + contexto".
2) CONTEXTO (3-6s): explique o que é / por que importa, sem jargão.
3) PROVA/INSIGHT (7-15s): 1 insight prático (ex.: passo, exemplo, erro comum, comparação).
4) CTA (final): SEMPRE use "LEIA A LEGENDA 👇" - isso é OBRIGATÓRIO para engajamento.

FORMATO:
- Frases curtas (8–16 palavras por segmento).
- Português brasileiro PERFEITO, sem NENHUM erro ortográfico ou de acentuação.

⚠️ IMPORTANTE - BUSCA DE IMAGENS REAIS:
Em vez de criar prompts para gerar imagens com IA, você vai criar QUERIES DE BUSCA para encontrar imagens REAIS na internet.

Para cada cena, crie um "imageSearch" que seja uma busca simples para encontrar fotos/imagens relevantes:
- Use termos específicos relacionados ao tema (ex: "Elon Musk Tesla", "robô humanoide Boston Dynamics")
- Prefira nomes de pessoas/empresas/produtos reais quando relevante
- Evite termos abstratos como "conceito futurista" - prefira coisas reais e fotografáveis
- O objetivo é encontrar fotos de notícias/eventos REAIS, não arte conceitual

Exemplo de imageSearch para tema "Elon Musk compra Twitter":
✅ "Elon Musk Twitter CEO"
✅ "sede Twitter San Francisco"
✅ "logotipo X Twitter"

Exemplo de imageSearch RUIM (muito abstrato):
❌ "conceito futuro redes sociais"
❌ "ilustração aquisição empresa"`;

    const userPrompt = `Crie um roteiro sobre este tema, SEM mudar de assunto:
"${topic}"

ESPECIFICAÇÕES:
- Exatamente ${segmentCount} segmentos.
- ${wordsPerSegment}-${wordsPerSegment + 5} palavras por segmento.
- Estilo: ${STYLE}.
- Estamos em ${currentYear} - NÃO mencione anos anteriores!

⚠️ REVISÃO ORTOGRÁFICA OBRIGATÓRIA:
- Antes de responder, REVISE todos os textos para garantir ortografia correta em PT-BR.
- Verifique acentos: ã, é, ê, í, ó, ô, ú, ç.
- Se o tema estiver em inglês, TRADUZA para português brasileiro.

IMPORTANTE:
- Inclua termos específicos do tema no texto (não responda com um roteiro genérico).
- Todos os textos devem estar em PORTUGUÊS BRASILEIRO CORRETO.
- Para imageSearch: crie queries simples para buscar imagens REAIS (fotos de pessoas, eventos, produtos) - não arte abstrata.

Responda APENAS com JSON no formato:
{
  "title": "Título curto e específico do tema EM PORTUGUÊS",
  "segments": [
    { "text": "texto em português com ortografia perfeita...", "imagePrompt": "query de busca para imagem real - ex: Elon Musk SpaceX foguete" }
  ]
}`;

    // Spelling correction function - validates and fixes Portuguese spelling
    const correctSpelling = async (script: any): Promise<any> => {
      const spellingPrompt = `Você é um revisor ortográfico rigoroso de português brasileiro.

TAREFA: Revise o JSON abaixo e corrija TODOS os erros ortográficos, de acentuação e gramática.

REGRAS:
- Corrija acentos faltando: você, através, é, está, já, até, revolução, atenção, decisão
- Corrija palavras em inglês para português: AI→IA, Robotics→Robótica, Computing→Computação
- NÃO altere o significado ou estrutura do conteúdo
- NÃO adicione nem remova segmentos
- Retorne APENAS o JSON corrigido, sem explicações

JSON para revisar:
${JSON.stringify(script, null, 2)}`;

      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "user", content: spellingPrompt },
            ],
          }),
        });

        if (!response.ok) {
          console.warn("[spelling-check] Failed, using original:", response.status);
          return script;
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || "";
        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

        const corrected = JSON.parse(content);
        console.log("[spelling-check] Corrections applied successfully");
        return corrected;
      } catch (e) {
        console.warn("[spelling-check] Error, using original:", e);
        return script;
      }
    };

    // Try once, then retry if the model ignored the topic
    let parsed = await callModel(systemPrompt, userPrompt);

    if (!looksOnTopic(parsed, topic)) {
      console.warn("[generate-story-script] Model output seems off-topic. Retrying...");

      const retryUserPrompt = `Você ignorou o tema e respondeu algo genérico.

Reescreva um NOVO roteiro seguindo a mesma estrutura, mas agora OBRIGATORIAMENTE sobre:
"${topic}"

LEMBRE-SE:
- Estamos em ${currentYear}, não mencione anos passados.
- Tudo em PORTUGUÊS BRASILEIRO com ortografia PERFEITA.
- Exija que pelo menos 2 cenas contenham palavras do tema.
- Se o tema estiver em inglês, TRADUZA para português.
- REVISE acentos: ã, é, ê, í, ó, ô, ú, ç antes de responder.

Responda APENAS com JSON no mesmo formato.`;

      parsed = await callModel(systemPrompt, retryUserPrompt);
    }

    // Apply spelling correction as final step
    console.log("[generate-story-script] Running spelling check...");
    parsed = await correctSpelling(parsed);

    console.log("[generate-story-script] Generated title:", parsed.title);
    console.log("[generate-story-script] Segments count:", parsed.segments.length);

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
