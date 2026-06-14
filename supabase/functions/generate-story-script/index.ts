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

    const { topic, segmentCount = 5, wordsPerSegment = 24, totalDuration = 50, style, brandName } = await req.json();

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

      if (/mythos|mythons/.test(normalize(originalTopic))) {
        return /mythos/.test(hay) && !/sonnet/.test(hay);
      }

      return kws.some((kw) => hay.includes(kw));
    };

    const isClaudeMythosTopic = /mythos|mythons/.test(normalize(topic));
    const topicSpecificRules = isClaudeMythosTopic ? `
🚨 REGRA ESPECÍFICA — CLAUDE MYTHOS:
- O tema central é CLAUDE MYTHOS. NUNCA substitua por Claude Sonnet, Opus, Haiku ou Fable.
- NÃO invente ficha técnica, benchmark, preço, arquitetura interna, relação com Claude 4, data de treino ou "modelo base".
- Conte a HISTÓRIA editorial: por que viralizou, promessa de contexto longo, agentes persistentes, impacto para devs/usuários e o risco de confiança excessiva.
- Se faltar dado técnico confirmado, fale de CONSEQUÊNCIA PRÁTICA, não de especificação inventada.
` : "";

    const callModel = async (systemPrompt: string, userPrompt: string, attempt = 1): Promise<any> => {
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
          response_format: { type: "json_object" },
          max_tokens: 5000,
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
        console.error("Failed to parse AI response (attempt", attempt, "):", content.substring(0, 200));
        if (attempt < 2) {
          console.log("Retrying with explicit JSON instruction...");
          return callModel(systemPrompt, userPrompt + "\n\nIMPORTANTE: Responda SOMENTE com JSON válido, sem texto adicional.", attempt + 1);
        }
        throw new Error("Resposta da IA inválida");
      }

      if (!parsed?.segments || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
        throw new Error("Nenhum segmento gerado");
      }

      return parsed;
    };

    // System prompt: strategy + constraints, topic-driven, with CURRENT YEAR context
    // UPDATED: Generate searchQueries for finding real images on the web instead of AI image prompts
    const systemPrompt = `Você é um ESTRATEGISTA EDITORIAL e roteirista de vídeos curtos do perfil ${BRAND}.

DATA ATUAL: ${new Date().toLocaleDateString('pt-BR')} (ANO ${currentYear})

🎯 MISSÃO:
Criar vídeos com POSICIONAMENTO e AUTORIDADE — não apenas informativos.
Cada vídeo deve DEFENDER UMA TESE sobre o tema, como um editorial de jornal em formato Reels.

⚡ ESTRUTURA EDITORIAL (${segmentCount} CENAS, total ~${totalDuration}s — Reels DENSO de tecnologia):

1) 🔥 GANCHO (cena 1, 2-3s) — MÁXIMO 10 PALAVRAS:
   - PERGUNTA PROVOCATIVA ou AFIRMAÇÃO POLÊMICA
   - Exemplos bons: "A OpenAI está mentindo pra você.", "Isso vai apagar 40% dos empregos."
   - PROIBIDO: "Vamos falar sobre...", "Hoje eu quero mostrar...", "Você sabia que..."

2) 📐 CONTEXTO + FATO CONCRETO (cena 2):
   - Nome real de empresa/produto/pessoa + número, data ou dado da notícia
   - COMO funciona tecnicamente (1 frase explicativa, sem jargão vazio)

3) 💡 TESE + ARGUMENTO (cenas do meio):
   - Tome POSIÇÃO clara — "O problema real é..." / "E isso importa porque..."
   - Cada cena sustenta com 1 comparação, dado ou exemplo prático
   - Cada cena entrega informação NOVA — nunca repita ideias

4) 🎯 IMPACTO PRÁTICO (penúltima cena):
   - O que MUDA na vida do espectador (dev, profissional, usuário)
   - Exemplo concreto de uso, oportunidade ou risco real

5) 🎬 CONCLUSÃO + CTA ACIONÁVEL (última cena):
   - Reflexão forte OU previsão ousada
   - 1 CTA CURTO ligado ao tema (NUNCA "siga", "curta", "compartilhe", "link na bio" genéricos)
   - Bons: "Salva antes que apaguem.", "Comenta: você usaria?", "Marca o dev que precisa ver."

📝 REGRAS DE TEXTO:
- Cada cena: ${wordsPerSegment}-${wordsPerSegment + 6} palavras (GANCHO = máx 10)
- NÃO corte frases no meio — cada segmento é uma frase COMPLETA com começo, meio e fim
- Português brasileiro PERFEITO com acentuação correta
- Tom: confiante, denso, EXPLICATIVO — NUNCA superficial, NUNCA genérico
- PROIBIDO inglês — tudo em PT-BR (exceto nomes próprios)
- PROIBIDO anos anteriores a ${currentYear}
- ZERO clichês: "futuro chegou", "revolução da IA", "mudou tudo"
- Acentos obrigatórios: você, através, é, está, já, até, revolução, atenção, decisão, análise, possível, inteligência

🖼️ KEYWORDS VISUAIS CINEMATOGRÁFICAS (OBRIGATÓRIO EM INGLÊS):
Crie "visualKeywords": array de 2-4 termos ESPECÍFICOS em INGLÊS para busca no Pexels/Unsplash.

🚨 REGRA CRÍTICA: visualKeywords SEMPRE em INGLÊS — o sistema de busca usa APIs anglófonas.

REGRAS para visualKeywords:
- SEMPRE em INGLÊS — nunca em português
- Cada keyword deve ser uma frase de busca curta e específica (3-5 palavras)
- PROIBIDO termos ultra-genéricos: "technology", "AI", "innovation", "business", "computer"
- PRIORIZE: imagens de produtos REAIS, empresas REAIS, hardware específico, cenários concretos
- Use nomes REAIS: "OpenAI headquarters", "Nvidia GPU chip", "Boston Dynamics robot", "Sam Altman speaking"
- Pense como um DIRETOR DE ARTE buscando stock photos: contraste, profundidade, textura
- Formato VERTICAL (9:16) — termos que funcionem em portrait

Exemplos BONS de visualKeywords (INGLÊS + ESPECÍFICO):
✅ ["humanoid robot close up face", "neural circuit neon macro", "city night silhouette futuristic"]
✅ ["Sam Altman conference stage", "robot factory assembly line", "server datacenter corridor blue lights"]
✅ ["Nvidia GPU chip macro", "OpenAI logo screen", "AI data visualization hologram"]
✅ ["quantum computer close up", "microchip silicon wafer macro", "space rocket launch dramatic"]

Exemplos RUINS (PROIBIDO):
❌ ["tecnologia", "inteligência artificial", "inovação"] ← português!
❌ ["technology concept", "artificial intelligence", "innovation"] ← muito genérico!
❌ ["person working laptop", "business meeting", "modern office"] ← clichê!`;

    const userPrompt = `Crie um VÍDEO EDITORIAL com tese e posicionamento sobre:
"${topic}"

ESPECIFICAÇÕES:
- Exatamente ${segmentCount} segmentos (${wordsPerSegment}-${wordsPerSegment + 5} palavras cada)
- Estilo: ${STYLE}
- Ano: ${currentYear} — NÃO mencione anos anteriores

⚡ CHECKLIST OBRIGATÓRIO:
□ Cena 1 começa com pergunta provocativa OU afirmação polêmica (MÁX 10 palavras)
□ Cenas do meio entregam fato concreto + tese + argumento (CADA UMA com info NOVA)
□ Penúltima cena traz impacto prático na vida do espectador
□ Última cena fecha com reflexão FORTE + CTA específico e acionável (NUNCA "Siga para mais")
□ Total de ${segmentCount} cenas — NÃO entregue menos
□ Cada cena ${wordsPerSegment}-${wordsPerSegment + 6} palavras, frase COMPLETA
□ Todos os textos em PT-BR com ortografia perfeita
□ visualKeywords são cinematográficas e específicas (NUNCA genéricas)

Responda APENAS com JSON:
{
  "title": "Título editorial provocativo EM PORTUGUÊS",
  "thesis": "A tese central do vídeo em 1 frase",
  "segments": [
    { "text": "texto impactante...", "visualKeywords": ["keyword cinematográfica 1", "keyword cinematográfica 2", "keyword cinematográfica 3"] }
  ]
}`;

    // Spelling correction function - validates and fixes Portuguese spelling
    const correctSpelling = async (script: any): Promise<any> => {
      const spellingPrompt = `Você é um EDITOR-CHEFE rigoroso de português brasileiro e revisor de roteiros de Reels de tecnologia.

TAREFA: Revise o JSON abaixo aplicando uma ANÁLISE DE REDAÇÃO COMPLETA e retorne a versão melhorada.

CHECKLIST OBRIGATÓRIO:
1. ✅ FRASES COMPLETAS: NENHUMA frase pode terminar no meio (sem "e...", "que...", "para...", "porque..." pendurados no fim). Se achar truncamento, REESCREVA terminando a ideia.
2. ✅ ORTOGRAFIA: você, através, é, está, já, até, revolução, atenção, decisão, análise, inteligência
3. ✅ TRADUÇÃO: AI→IA, Robotics→Robótica, Computing→Computação, Startup→startup (minúsculo)
4. ✅ RITMO ÁGIL: corte palavras-muleta ("basicamente", "então", "tipo assim", "vale lembrar que"). Cada frase deve ser DIRETA e densa.
5. ✅ VALOR: se um segmento estiver vago/genérico, reescreva com fato concreto, número, nome de empresa ou exemplo prático.
6. ✅ FLUIDEZ: cada cena conecta naturalmente com a próxima. Sem repetir ideias.
7. ❌ NÃO altere número de segmentos. NÃO altere visualKeywords.

Retorne APENAS o JSON corrigido, sem explicações.

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

Reescreva um NOVO roteiro EDITORIAL seguindo a mesma estrutura, mas OBRIGATORIAMENTE sobre:
"${topic}"

LEMBRE-SE:
- Comece com pergunta provocativa ou afirmação polêmica
- Declare uma TESE clara — tome posição
- Estamos em ${currentYear}, não mencione anos passados
- Tudo em PORTUGUÊS BRASILEIRO com ortografia PERFEITA
- visualKeywords devem ser cinematográficas e específicas
- REVISE acentos: ã, é, ê, í, ó, ô, ú, ç

Responda APENAS com JSON no mesmo formato.`;

      parsed = await callModel(systemPrompt, retryUserPrompt);
    }

    // Apply spelling correction as final step
    console.log("[generate-story-script] Running spelling check...");
    parsed = await correctSpelling(parsed);

    console.log("[generate-story-script] Generated title:", parsed.title);
    console.log("[generate-story-script] Segments count:", parsed.segments.length);

    // Backward compatibility: map visualKeywords to imagePrompt for downstream consumers
    const mappedSegments = (parsed.segments || []).map((seg: any) => ({
      text: seg.text,
      imagePrompt: Array.isArray(seg.visualKeywords) 
        ? seg.visualKeywords.join(", ") 
        : (seg.imagePrompt || seg.visualKeywords || ""),
      visualKeywords: seg.visualKeywords || [],
    }));

    return new Response(
      JSON.stringify({
        title: parsed.title,
        thesis: parsed.thesis || "",
        segments: mappedSegments,
        totalDuration,
        segmentCount: mappedSegments.length,
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
