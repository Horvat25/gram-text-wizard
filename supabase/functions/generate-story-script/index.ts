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

    // System prompt: strategy + constraints, but topic-driven
    const systemPrompt = `Você é um estrategista de conteúdo digital do perfil ${BRAND}.

OBJETIVO:
- Criar roteiros curtos para Reels/Stories com crescimento orgânico, autoridade e engajamento real.
- Conteúdo informativo e inteligente (IA aplicada ao dia a dia, tecnologia, ferramentas, tendências, notícias explicadas de forma simples).

REGRAS CRÍTICAS:
- O roteiro DEVE ser sobre o TEMA fornecido pelo usuário. Não troque o assunto para “crescimento no Instagram”, “criadores pequenos”, etc.
- Nada de conteúdo genérico/repetitivo. Sem promessas milagrosas. Sem hype vazio.
- Linguagem clara, direta e interessante.

ESTRUTURA (4 CENAS):
1) GANCHO (0-2s): frase curta e específica do tema.
2) CONTEXTO (3-6s): explique o que é / por que importa, sem jargão.
3) PROVA/INSIGHT (7-15s): 1 insight prático (ex.: passo, exemplo, erro comum, comparação).
4) CTA (final): peça ação de engajamento (salvar/comentar/seguir) de forma natural.

FORMATO:
- Frases curtas (8–16 palavras por segmento).
- Português brasileiro.
- Para cada cena, crie um imagePrompt em INGLÊS com visual REALISTA e relacionado ao tema (evite neon/futurista genérico/abstrato).`;

    const userPrompt = `Crie um roteiro sobre este tema, SEM mudar de assunto:
"${topic}"

ESPECIFICAÇÕES:
- Exatamente ${segmentCount} segmentos.
- ${wordsPerSegment}-${wordsPerSegment + 5} palavras por segmento.
- Estilo: ${STYLE}.

IMPORTANTE:
- Inclua termos específicos do tema no texto (não responda com um roteiro genérico).

Responda APENAS com JSON no formato:
{
  "title": "Título curto e específico do tema",
  "segments": [
    { "text": "...", "imagePrompt": "..." }
  ]
}`;

    // Try once, then retry if the model ignored the topic
    let parsed = await callModel(systemPrompt, userPrompt);

    if (!looksOnTopic(parsed, topic)) {
      console.warn("[generate-story-script] Model output seems off-topic. Retrying...");

      const retryUserPrompt = `Você ignorou o tema e respondeu algo genérico.

Reescreva um NOVO roteiro seguindo a mesma estrutura, mas agora OBRIGATORIAMENTE sobre:
"${topic}"

Exija que pelo menos 2 cenas contenham palavras do tema.
Responda APENAS com JSON no mesmo formato.`;

      parsed = await callModel(systemPrompt, retryUserPrompt);
    }

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
