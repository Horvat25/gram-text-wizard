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

    const { topic, segmentCount: _ignored, wordsPerSegment: _ignored2, totalDuration: _ignored3, style, brandName } = await req.json();

    if (!topic) {
      throw new Error("Tópico é obrigatório");
    }

    console.log("[generate-story-script] Topic:", topic);

    const BRAND = (brandName && String(brandName).trim()) || "Neural Update";
    const STYLE = (style && String(style).trim()) || "informativo, inteligente, direto e sem hype";
    const currentYear = new Date().getFullYear();

    // ─── Helpers ─────────────────────────────────────────────
    const normalize = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

    const stopwords = new Set(["como","para","sobre","uma","um","uns","umas","de","do","da","dos","das","e","a","o","as","os","no","na","nos","nas","em","por","com","sem","que","isso","essa","esse","essas","esses","hoje","agora","futuro"]);

    const extractKeywords = (t: string) => {
      const tokens = normalize(t).split(" ").filter(Boolean).filter((w) => w.length >= 3).filter((w) => !stopwords.has(w));
      return Array.from(new Set(tokens)).slice(0, 10);
    };

    const looksOnTopic = (parsed: any, originalTopic: string) => {
      const kws = extractKeywords(originalTopic);
      if (kws.length === 0) return true;
      const hay = normalize(`${parsed?.title || ""} ${parsed?.hook || ""} ${parsed?.context || ""} ${parsed?.explanation || ""} ${parsed?.impact || ""}`);
      return kws.some((kw) => hay.includes(kw));
    };

    // ─── JSON parsing helpers ────────────────────────────────
    const stripMarkdown = (s: string) => s.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    const extractJsonCandidate = (s: string) => {
      const cleaned = stripMarkdown(s);
      const start = cleaned.search(/[\[{]/);
      if (start === -1) return cleaned;
      const open = cleaned[start];
      const close = open === "[" ? "]" : "}";
      const end = cleaned.lastIndexOf(close);
      if (end === -1) return cleaned.slice(start);
      return cleaned.slice(start, end + 1);
    };

    const looksTruncated = (s: string) => {
      const text = s.trim();
      return (text.match(/{/g) || []).length !== (text.match(/}/g) || []).length || (text.match(/\[/g) || []).length !== (text.match(/\]/g) || []).length;
    };

    const repairCommonJsonIssues = (s: string) => {
      let out = s.replace(/[\x00-\x1F\x7F]/g, "");
      out = out.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      out = out.replace(/"\s*\.\s*(\r?\n\s*")/g, '",$1');
      out = out.replace(/"\s*\.\s*(\r?\n\s*})/g, '"$1');
      return out;
    };

    const parseJsonRobust = (raw: string) => {
      const candidate = extractJsonCandidate(raw);
      if (looksTruncated(candidate)) throw new Error("Resposta da IA truncada");
      try { return JSON.parse(candidate); } catch {
        const repaired = repairCommonJsonIssues(candidate);
        try { return JSON.parse(repaired); } catch {
          console.error("Failed to parse AI response:", candidate);
          throw new Error("Resposta da IA inválida");
        }
      }
    };

    // ─── AI call ─────────────────────────────────────────────
    const callModel = async (systemPrompt: string, userPrompt: string) => {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          temperature: 0.4,
          max_tokens: 1200,
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
      const content = data.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") throw new Error("Resposta da IA inválida");

      return parseJsonRobust(content);
    };

    // ─── System prompt: 5-scene structure ────────────────────
    const systemPrompt = `Você é um ESTRATEGISTA EDITORIAL e roteirista de vídeos curtos verticais (Reels/Shorts) do perfil ${BRAND}.

DATA ATUAL: ${new Date().toLocaleDateString('pt-BR')} (ANO ${currentYear})

🎯 MISSÃO:
Criar vídeos curtos (15-20s) com ALTA RETENÇÃO. Cada vídeo segue uma estrutura rígida de 5 CENAS.

⚡ ESTRUTURA OBRIGATÓRIA — 5 CENAS:

CENA 1 — HOOK (2s):
- Frase curta e IMPACTANTE que pare o scroll
- MÁXIMO 8 PALAVRAS
- Use: pergunta provocativa, afirmação chocante, dado surpreendente
- Exemplos BOM: "Essa IA assustou cientistas", "O fim do Google?", "Ninguém esperava isso da OpenAI"
- PROIBIDO: "Vamos falar sobre...", "Hoje eu quero...", "Você sabia que..."

CENA 2 — CONTEXTO (4s):
- Explique rapidamente o QUE aconteceu
- MÁXIMO 8 PALAVRAS
- Frase direta sem rodeios

CENA 3 — EXPLICAÇÃO (4s):
- Explique a tecnologia/notícia em linguagem simples
- MÁXIMO 8 PALAVRAS
- Frase clara e objetiva

CENA 4 — IMPACTO (4s):
- Mostre POR QUE isso importa para o futuro/pessoas
- MÁXIMO 8 PALAVRAS
- Gere reflexão ou urgência

CENA 5 — CTA (3s):
- Call to action direto
- MÁXIMO 8 PALAVRAS
- Exemplo: "Siga @neuralupdate para mais IA"
- Esta cena NÃO precisa de imagem (será tela de CTA)

📝 REGRAS ABSOLUTAS:
- MÁXIMO 8 PALAVRAS por cena (incluindo artigos/preposições)
- EXATAMENTE 5 cenas, nem mais nem menos
- Tudo em PT-BR com ortografia PERFEITA
- Acentos obrigatórios: você, é, está, já, até, revolução, atenção
- PROIBIDO anos anteriores a ${currentYear}
- Tom: confiante, direto, inteligente

🖼️ KEYWORDS VISUAIS (em INGLÊS, 2-3 termos por cena):
Crie "visualKeywords" para busca de imagens cinematográficas verticais (9:16).
- SEMPRE em INGLÊS
- Específicas e concretas (ex: "robot arm assembly line", "Sam Altman speaking stage")
- PROIBIDO genérico: "technology", "innovation", "AI concept"
- Cena 5 (CTA) NÃO precisa de visualKeywords`;

    const userPrompt = `Crie um vídeo Reels de 17 segundos sobre:
"${topic}"

Estilo: ${STYLE}
Ano: ${currentYear}

⚡ CHECKLIST:
□ Cena 1 (hook): máx 8 palavras, impactante
□ Cena 2 (contexto): máx 8 palavras, o que aconteceu  
□ Cena 3 (explicação): máx 8 palavras, como funciona
□ Cena 4 (impacto): máx 8 palavras, por que importa
□ Cena 5 (cta): máx 8 palavras, call to action
□ visualKeywords em INGLÊS para cenas 1-4
□ Ortografia PT-BR perfeita

Responda APENAS com JSON:
{
  "title": "Título editorial curto",
  "thesis": "Tese central em 1 frase",
  "hook": "frase do hook (cena 1)",
  "content_type": "news|trend|insight|opinion",
  "segments": [
    { "scene": "hook", "text": "frase curta...", "visualKeywords": ["keyword1", "keyword2"] },
    { "scene": "context", "text": "frase curta...", "visualKeywords": ["keyword1", "keyword2"] },
    { "scene": "explanation", "text": "frase curta...", "visualKeywords": ["keyword1", "keyword2"] },
    { "scene": "impact", "text": "frase curta...", "visualKeywords": ["keyword1", "keyword2"] },
    { "scene": "cta", "text": "Siga @neuralupdate para mais IA", "visualKeywords": [] }
  ]
}`;

    // ─── Spelling correction ─────────────────────────────────
    const correctSpelling = async (script: any): Promise<any> => {
      const spellingPrompt = `Revise o JSON abaixo e corrija APENAS erros ortográficos/acentuação em PT-BR.
NÃO altere significado, estrutura ou quantidade de segmentos. NÃO altere visualKeywords (são em inglês).
Retorne APENAS o JSON corrigido.

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
            messages: [{ role: "user", content: spellingPrompt }],
          }),
        });

        if (!response.ok) return script;
        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || "";
        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const corrected = JSON.parse(content);
        console.log("[spelling-check] Corrections applied");
        return corrected;
      } catch {
        return script;
      }
    };

    // ─── Execute ─────────────────────────────────────────────
    let parsed = await callModel(systemPrompt, userPrompt);

    if (!looksOnTopic(parsed, topic)) {
      console.warn("[generate-story-script] Off-topic, retrying...");
      const retryPrompt = `Você ignorou o tema. Reescreva sobre: "${topic}"
Mesma estrutura de 5 cenas. MÁXIMO 8 PALAVRAS por cena. JSON apenas.`;
      parsed = await callModel(systemPrompt, retryPrompt);
    }

    parsed = await correctSpelling(parsed);

    console.log("[generate-story-script] Title:", parsed.title);
    console.log("[generate-story-script] Segments:", parsed.segments?.length);

    // ─── Validate & enforce 5-scene structure ────────────────
    const SCENE_ORDER = ["hook", "context", "explanation", "impact", "cta"];
    const SCENE_DURATIONS = [2, 4, 4, 4, 3]; // total = 17s
    
    let segments = (parsed.segments || []).slice(0, 5);
    
    // If AI returned fewer than 5, pad with defaults
    while (segments.length < 5) {
      const sceneType = SCENE_ORDER[segments.length];
      segments.push({
        scene: sceneType,
        text: sceneType === "cta" ? "Siga @neuralupdate para mais IA" : `${parsed.title || topic}`,
        visualKeywords: [],
      });
    }

    // Enforce max 8 words per segment text
    segments = segments.map((seg: any, i: number) => {
      const words = (seg.text || "").trim().split(/\s+/);
      const truncatedText = words.length > 8 ? words.slice(0, 8).join(" ") : words.join(" ");
      return {
        scene: SCENE_ORDER[i],
        text: truncatedText,
        imagePrompt: Array.isArray(seg.visualKeywords) ? seg.visualKeywords.join(", ") : (seg.imagePrompt || ""),
        visualKeywords: seg.visualKeywords || [],
        duration: SCENE_DURATIONS[i],
      };
    });

    const totalDuration = SCENE_DURATIONS.reduce((a, b) => a + b, 0);

    return new Response(
      JSON.stringify({
        title: parsed.title || topic,
        thesis: parsed.thesis || "",
        hook: parsed.hook || segments[0]?.text || "",
        content_type: parsed.content_type || "news",
        segments,
        totalDuration,
        segmentCount: segments.length,
        scene_durations: SCENE_DURATIONS,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in generate-story-script:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar roteiro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
