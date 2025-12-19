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
    const { topic, duration, style } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    if (!topic) {
      throw new Error("Tópico é obrigatório");
    }

    // Calculate target word count based on duration
    // Average speaking rate: ~150 words per minute = 2.5 words per second
    const targetDuration = duration || 10; // default 10 seconds
    const targetWords = Math.ceil(targetDuration * 2.5);

    console.log("Generating script for topic:", topic);
    console.log("Target duration:", targetDuration, "seconds");
    console.log("Target words:", targetWords);

    const systemPrompt = `Você é um roteirista profissional de vídeos curtos para Instagram Reels.
Sua tarefa é criar roteiros de narração concisos, impactantes e envolventes.

REGRAS:
- Escreva em Português do Brasil
- Máximo de ${targetWords} palavras (aproximadamente ${targetDuration} segundos de narração)
- Tom ${style || 'profissional e inspirador'}
- Comece com um gancho forte
- Use frases curtas e diretas
- Termine com um call-to-action sutil ou reflexão
- NÃO use hashtags ou emojis no roteiro
- NÃO use aspas ou marcações
- Escreva apenas o texto da narração, sem instruções

Formato de saída:
Retorne APENAS o texto da narração, nada mais.`;

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
          { role: "user", content: `Crie um roteiro de narração sobre: "${topic}"` },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const script = data.choices?.[0]?.message?.content?.trim() || "";

    if (!script) {
      throw new Error("Nenhum roteiro gerado");
    }

    // Calculate actual duration estimate
    const wordCount = script.split(/\s+/).length;
    const estimatedDuration = Math.ceil(wordCount / 2.5);

    console.log("Script generated:", script.substring(0, 100) + "...");
    console.log("Word count:", wordCount);
    console.log("Estimated duration:", estimatedDuration, "seconds");

    return new Response(
      JSON.stringify({
        script,
        wordCount,
        estimatedDuration,
        targetDuration,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in generate-script:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar roteiro" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
