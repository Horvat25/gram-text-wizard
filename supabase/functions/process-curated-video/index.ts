import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * PROCESS CURATED VIDEO - v3
 * 
 * Pipeline:
 * 1. Research the video topic (YouTube API + Firecrawl)
 * 2. Generate narration script that MATCHES the video content
 * 3. Add CTA segment at the end
 * 4. Narrate with Edge TTS (gratuito) + Edge TTS for CTA
 * 5. Prepare render job with per-segment timing
 */

// --- Helper: Research the topic ---
async function researchTopic(
  title: string,
  description: string,
  channel: string,
  supabaseUrl: string,
  supabaseKey: string,
  youtubeApiKey: string | undefined,
  firecrawlKey: string | undefined,
): Promise<string> {
  const researchParts: string[] = [];

  // Extract keywords from title
  const keywords = title
    .replace(/[^\w\sáàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(" ");

  // YouTube search for related videos
  if (youtubeApiKey) {
    try {
      const ytRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keywords)}&type=video&maxResults=3&relevanceLanguage=pt&key=${youtubeApiKey}`,
      );
      if (ytRes.ok) {
        const ytData = await ytRes.json();
        const titles = (ytData.items || [])
          .map((i: any) => `- ${i.snippet?.title}`)
          .join("\n");
        if (titles) {
          researchParts.push(`VÍDEOS RELACIONADOS NO YOUTUBE:\n${titles}`);
        }
      }
    } catch (e) {
      console.warn("[research] YouTube search failed:", e);
    }
  }

  // Firecrawl web search for recent articles
  if (firecrawlKey) {
    try {
      const fcRes = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ query: keywords, limit: 3 }),
      });
      if (fcRes.ok) {
        const fcData = await fcRes.json();
        const articles = (fcData.results || [])
          .map((r: any) => `- ${r.title}: ${(r.description || "").slice(0, 150)}`)
          .join("\n");
        if (articles) {
          researchParts.push(`ARTIGOS RECENTES:\n${articles}`);
        }
      }
    } catch (e) {
      console.warn("[research] Firecrawl search failed:", e);
    }
  }

  researchParts.push(`VÍDEO ORIGINAL: "${title}" por ${channel}`);
  if (description) {
    researchParts.push(`DESCRIÇÃO: ${description.slice(0, 500)}`);
  }

  return researchParts.join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      post_id,
      video_source,
      headline,
      workspace_id,
      user_id,
      clip_script,
    } = await req.json();

    if (!post_id || !video_source || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "post_id, video_source e workspace_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const renderServiceUrl = Deno.env.get("RENDER_SERVICE_URL");
    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

    console.log(`[process-curated-video] Processing post ${post_id}`);
    console.log(`[process-curated-video] Source: ${video_source.platform} - "${video_source.title}"`);

    // =========================================
    // Step 1: Research the topic
    // =========================================
    console.log("[process-curated-video] 🔍 Researching topic...");
    const researchContext = await researchTopic(
      video_source.title || "",
      video_source.description || "",
      video_source.channel || "",
      supabaseUrl,
      supabaseKey,
      youtubeApiKey,
      firecrawlKey,
    );
    console.log(`[process-curated-video] Research: ${researchContext.length} chars`);

    // =========================================
    // Step 2: Generate narration script
    // =========================================
    let narrationScript = clip_script?.narration || "";
    let narrationHeadline = clip_script?.headline || headline || "";
    let segments: Array<{ text: string; duration: number }> = Array.isArray(clip_script?.segments)
      ? clip_script.segments
      : [];
    let ctaText = "Siga o Neural Update para mais novidades de tecnologia e inteligência artificial!";

    if (!narrationScript && lovableApiKey) {
      console.log("[process-curated-video] 📝 Generating script with research context...");
      try {
        const scriptRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `Você é o roteirista do canal Neural Update no Instagram.
Crie uma narração para um Reels sobre tecnologia que OBRIGATORIAMENTE esteja 100% conectada ao tema do vídeo original.

CONTEXTO DE PESQUISA (use estes dados reais na narração):
${researchContext}

REGRAS CRÍTICAS:
1. A narração DEVE falar EXATAMENTE sobre o mesmo assunto do vídeo original
2. Use dados concretos da pesquisa (nomes de empresas, números, datas)
3. NÃO invente dados - use apenas o que está na pesquisa ou no título/descrição do vídeo
4. NÃO mencione o canal original ou criador do vídeo
5. Fale como se fosse conteúdo editorial original do Neural Update
6. Idioma: PT-BR

ESTRUTURA (4 segmentos + CTA separado):
- GANCHO (3-4s, ~15 palavras): Frase impactante que prende atenção, SOBRE O TEMA DO VÍDEO
- CONTEXTO (6-8s, ~25 palavras): O que está acontecendo, dados concretos
- IMPACTO (6-8s, ~25 palavras): Por que isso importa, consequências
- CONCLUSÃO (3-4s, ~12 palavras): Fechamento provocativo

TOTAL: máximo 80 palavras nos 4 segmentos (sem contar CTA)

HEADLINE: Crie uma manchete curta (max 45 chars) que resuma o tema do vídeo.

IMPORTANTE: Cada segmento deve ser uma frase COMPLETA que faça sentido sozinha.
As transições de imagem acontecem entre segmentos, então cada um deve terminar naturalmente.

Responda em JSON:
{
  "narration": "texto completo sem CTA...",
  "headline": "MANCHETE AQUI",
  "segments": [
    { "text": "frase completa do gancho...", "duration": 4 },
    { "text": "frase completa do contexto...", "duration": 7 },
    { "text": "frase completa do impacto...", "duration": 7 },
    { "text": "frase completa da conclusão...", "duration": 4 }
  ],
  "cta": "Siga o Neural Update para ficar por dentro das maiores novidades de tecnologia!",
  "topic_keywords": ["keyword1", "keyword2", "keyword3"]
}`,
              },
              {
                role: "user",
                content: `Crie a narração para este vídeo:\nTítulo: "${video_source.title}"\nDescrição: ${video_source.description || "Vídeo sobre tecnologia"}\nCanal: ${video_source.channel}\nDuração: ${video_source.duration}s`,
              },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (scriptRes.ok) {
          const scriptData = await scriptRes.json();
          const parsed = JSON.parse(scriptData.choices?.[0]?.message?.content || "{}");
          narrationScript = parsed.narration || "";
          narrationHeadline = parsed.headline || narrationHeadline;
          segments = parsed.segments || [];
          ctaText = parsed.cta || ctaText;
          console.log(`[process-curated-video] ✅ Script: ${narrationScript.length} chars, ${segments.length} segments`);
          console.log(`[process-curated-video] Headline: ${narrationHeadline}`);
          console.log(`[process-curated-video] CTA: ${ctaText}`);
        } else {
          console.error("[process-curated-video] Script generation failed:", scriptRes.status);
        }
      } catch (e) {
        console.error("[process-curated-video] Script generation error:", e);
      }
    }

    // =========================================
    // Step 3: Generate narration audio (Edge TTS — gratuito)
    // =========================================
    let narrationAudioUrl = "";

    if (narrationScript) {
      console.log("[process-curated-video] 🎙️ Generating narration (edge-tts)...");
      try {
        const edgeTtsRes = await fetch(`${supabaseUrl}/functions/v1/edge-tts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            text: narrationScript,
            voice: "pt-BR-FranciscaNeural",
            rate: "+5%",
          }),
        });

        if (edgeTtsRes.ok) {
          const edgeTtsData = await edgeTtsRes.json();
          if (edgeTtsData.audioContent) {
            const audioBytes = Uint8Array.from(atob(edgeTtsData.audioContent), (c) => c.charCodeAt(0));
            const audioPath = `${workspace_id}/narration-${post_id}-${Date.now()}.mp3`;
            const { error: uploadErr } = await supabase.storage
              .from("post-videos")
              .upload(audioPath, audioBytes, {
                contentType: "audio/mpeg",
                upsert: true,
              });
            if (!uploadErr) {
              const { data: pubUrl } = supabase.storage
                .from("post-videos")
                .getPublicUrl(audioPath);
              narrationAudioUrl = pubUrl.publicUrl;
              console.log(`[process-curated-video] ✅ Narration audio uploaded`);
            }
          } else {
            narrationAudioUrl = edgeTtsData.audioUrl || "";
          }
        }
      } catch (e) {
        console.error("[process-curated-video] TTS failed:", e);
      }
    }

    // =========================================
    // Step 4: Generate CTA audio (Edge TTS - different voice)
    // =========================================
    let ctaAudioUrl = "";
    if (ctaText) {
      console.log("[process-curated-video] 📢 Generating CTA audio...");
      try {
        const ctaTtsRes = await fetch(`${supabaseUrl}/functions/v1/edge-tts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            text: ctaText,
            voice: "pt-BR-AntonioNeural",
            rate: "+10%",
          }),
        });

        if (ctaTtsRes.ok) {
          const ctaData = await ctaTtsRes.json();
          ctaAudioUrl = ctaData.audioUrl || "";
          console.log(`[process-curated-video] ✅ CTA audio generated`);
        }
      } catch (e) {
        console.warn("[process-curated-video] CTA TTS failed:", e);
      }
    }

    // =========================================
    // Step 5: Prepare render job with segment timing
    // =========================================
    const renderJob = {
      type: "curated_video",
      template: "branded-video",
      post_id,
      workspace_id,
      user_id,
      source_video: {
        youtube_url: video_source.youtube_url,
        video_id: video_source.video_id,
        duration: video_source.duration,
        requires_download: true,
        mute_original: true,
      },
      branding: {
        headline: narrationHeadline.toUpperCase(),
        handle: "@neuralupdate",
        tagline: "IA • Tecnologia • Futuro",
        watermark: "NEURAL UPDATE",
        source_credit: `Via ${video_source.channel}`,
      },
      narration: {
        audio_url: narrationAudioUrl,
        script: narrationScript,
        segments, // Per-segment timing for image transitions
      },
      cta: {
        text: ctaText,
        audio_url: ctaAudioUrl,
        duration: 4, // 4 seconds CTA screen
        handle: "@neuralupdate",
        tagline: "IA • Tecnologia • Futuro",
        button_text: "SEGUIR AGORA",
      },
      output: {
        resolution: "1080x1920",
        format: "mp4",
        max_duration: 35, // 30s content + 4s CTA + 1s buffer
      },
      research_context: researchContext.slice(0, 500), // Store for debugging
    };

    // Step 6: Send to render service if available
    if (renderServiceUrl) {
      console.log(`[process-curated-video] Sending to render service...`);
      try {
        const renderRes = await fetch(`${renderServiceUrl}/render-curated`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(renderJob),
        });

        if (renderRes.ok) {
          const renderData = await renderRes.json();
          if (renderData.video_url) {
            await supabase.from("posts").update({
              video_url: renderData.video_url,
              status: "scheduled",
              overlay_metadata: {
                ...renderJob,
                rendered: true,
                rendered_at: new Date().toISOString(),
              },
            }).eq("id", post_id);

            return new Response(
              JSON.stringify({ success: true, video_url: renderData.video_url, rendered: true }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      } catch (e) {
        console.warn("[process-curated-video] Render service failed:", e);
      }
    }

    // Step 7: Save metadata for later processing
    await supabase.from("posts").update({
      overlay_metadata: {
        ...renderJob,
        rendered: false,
        pending_render: true,
      },
      image_url: video_source.thumbnail || null,
    }).eq("id", post_id);

    console.log(`[process-curated-video] ✅ Saved. Narration: ${narrationAudioUrl ? "yes" : "no"}, CTA: ${ctaAudioUrl ? "yes" : "no"}`);

    return new Response(
      JSON.stringify({
        success: true,
        rendered: false,
        pending_render: true,
        narration_generated: !!narrationAudioUrl,
        cta_generated: !!ctaAudioUrl,
        headline: narrationHeadline,
        script_length: narrationScript.length,
        segments_count: segments.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[process-curated-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
