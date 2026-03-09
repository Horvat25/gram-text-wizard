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
    const systemPrompt = `Você é um ESTRATEGISTA EDITORIAL e roteirista de vídeos curtos do perfil ${BRAND}.

DATA ATUAL: ${new Date().toLocaleDateString('pt-BR')} (ANO ${currentYear})

🎯 MISSÃO:
Criar vídeos com POSICIONAMENTO e AUTORIDADE — não apenas informativos.
Cada vídeo deve DEFENDER UMA TESE sobre o tema, como um editorial de jornal em formato Reels.

⚡ ESTRUTURA EDITORIAL (4 CENAS):

1) 🔥 GANCHO (0-3s) — OBRIGATÓRIO ser impactante:
   - Use PERGUNTA PROVOCATIVA ou AFIRMAÇÃO POLÊMICA
   - Exemplos bons: "A OpenAI está mentindo pra você.", "Isso vai acabar com 40% dos empregos em 2 anos.", "Você está usando IA errado."
   - Exemplos RUINS (PROIBIDO): "Vamos falar sobre...", "Hoje eu quero mostrar...", "Você sabia que..."
   - O gancho deve criar TENSÃO e CURIOSIDADE imediata

2) 📐 CONTEXTO + TESE (3-8s):
   - Explique o fato brevemente
   - Declare sua TESE: "E isso importa porque..." / "O problema real é..."
   - NÃO seja neutro — tome uma posição clara

3) 💡 PROVA + IMPACTO (8-15s):
   - 1 argumento forte que sustente a tese
   - Use comparação, dado concreto ou exemplo prático
   - Mostre POR QUE isso muda algo na vida do espectador

4) 🎬 CONCLUSÃO PROVOCATIVA (final):
   - NÃO use "Siga para mais" ou "Curta e compartilhe"
   - Termine com: reflexão forte, previsão ousada, ou pergunta que fica na cabeça
   - Exemplos: "A questão não é SE isso vai acontecer. É se você vai estar preparado.", "Daqui a 5 anos, você vai lembrar desse momento."

📝 REGRAS DE TEXTO:
- Frases curtas (8-16 palavras por segmento)
- Português brasileiro PERFEITO com acentuação correta
- Tom: confiante, direto, inteligente — NUNCA genérico
- PROIBIDO inglês — tudo em PT-BR
- PROIBIDO anos anteriores a ${currentYear}
- Acentos obrigatórios: você, através, é, está, já, até, revolução, atenção, decisão, diagnóstico, automático, análise, possível, próximo, inteligência, tecnologia, saúde

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
□ Cena 1 começa com pergunta provocativa OU afirmação polêmica (NUNCA "Vamos falar sobre...")
□ Cena 2 declara uma TESE clara sobre o tema
□ Cena 3 sustenta com 1 argumento/dado concreto
□ Cena 4 termina com reflexão forte (NUNCA "Siga para mais")
□ Todos os textos em PT-BR com ortografia perfeita
□ visualKeywords são cinematográficas e específicas (NUNCA genéricas)

PRIORIDADE: Melhor 2-3 imagens FORTES do que 4-5 genéricas. Se necessário, repita a mesma keyword cinematográfica forte em mais de uma cena.

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
