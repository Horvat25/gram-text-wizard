import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * PROCESS CURATED VIDEO
 * 
 * Pipeline:
 * 1. Receive YouTube video metadata (from authorized channel)
 * 2. Generate new narration script based on the video topic
 * 3. Narrate with ElevenLabs (Sarah voice)
 * 4. Prepare render job for Remotion branded template
 * 
 * The actual video download (yt-dlp), muting, and composition 
 * is done by the external RENDER_SERVICE_URL with FFmpeg.
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      post_id,
      video_source, // from download-stock-video response
      headline,
      workspace_id,
      user_id,
    } = await req.json();

    if (!post_id || !video_source || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "post_id, video_source e workspace_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY");
    const renderServiceUrl = Deno.env.get("RENDER_SERVICE_URL");

    console.log(`[process-curated-video] Processing post ${post_id}`);
    console.log(`[process-curated-video] Source: ${video_source.platform} - "${video_source.title}"`);

    // Step 1: Generate narration script based on the video topic
    let narrationScript = "";
    let narrationHeadline = headline || "";

    if (lovableApiKey) {
      console.log("[process-curated-video] Generating narration script...");
      try {
        const scriptRes = await fetch("https://api.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              {
                role: "system",
                content: `Você é o roteirista do canal Neural Update no Instagram. 
Crie uma narração curta e impactante para um Reels sobre tecnologia.

REGRAS:
- Duração: 20-30 segundos de fala (máximo 80 palavras)
- Estrutura: GANCHO (3s) → CONTEXTO (10s) → IMPACTO (10s) → CONCLUSÃO (5s)
- Tom: Informativo, envolvente, como um apresentador de telejornal tech
- Idioma: PT-BR
- NÃO mencione o canal original ou criador
- Fale como se fosse conteúdo original do Neural Update

REGRAS DE SELEÇÃO DE SEGMENTOS (CRÍTICO):
- NUNCA use trechos onde aparece um humano/apresentador falando para a câmera
- APENAS use trechos de B-roll: imagens do TEMA sendo discutido (produto, tecnologia, demonstração, animação, gráficos)
- Se o vídeo mostra alguém falando sobre carros elétricos, pegue APENAS os trechos que mostram os carros, NÃO a pessoa falando
- Ignore qualquer frame com logos/watermarks do canal original
- Priorize: demonstrações de produto > animações/gráficos > imagens aéreas > close-ups de tecnologia

Também crie uma HEADLINE curta (max 50 chars) para overlay no vídeo.

Responda em JSON:
{
  "narration": "texto completo da narração...",
  "headline": "HEADLINE AQUI",
  "segments": [
    { "text": "gancho...", "duration": 3 },
    { "text": "contexto...", "duration": 10 },
    { "text": "impacto...", "duration": 10 },
    { "text": "conclusão...", "duration": 5 }
  ],
  "broll_timestamps": [
    { "start": 0, "end": 10, "description": "imagem do produto/tecnologia sem humanos" }
  ]
}`
              },
              {
                role: "user",
                content: `Vídeo original: "${video_source.title}"\nDescrição: ${video_source.description || "Vídeo sobre tecnologia e IA"}\nCanal: ${video_source.channel}\nDuração: ${video_source.duration}s`
              }
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (scriptRes.ok) {
          const scriptData = await scriptRes.json();
          const parsed = JSON.parse(scriptData.choices?.[0]?.message?.content || "{}");
          narrationScript = parsed.narration || "";
          narrationHeadline = parsed.headline || narrationHeadline;
          console.log(`[process-curated-video] Script generated: ${narrationScript.length} chars`);
        }
      } catch (e) {
        console.error("[process-curated-video] Script generation failed:", e);
      }
    }

    // Step 2: Generate narration audio with ElevenLabs
    let narrationAudioUrl = "";

    if (elevenLabsKey && narrationScript) {
      console.log("[process-curated-video] Generating ElevenLabs narration...");
      try {
        // Use Sarah voice (or a suitable PT-BR voice)
        const voiceId = "EXAVITQu4vr4xnSDxMaL"; // Sarah - clear, professional
        
        const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenLabsKey,
          },
          body: JSON.stringify({
            text: narrationScript,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.6,
              similarity_boost: 0.8,
              style: 0.3,
              use_speaker_boost: true,
            },
          }),
        });

        if (ttsRes.ok) {
          const audioBlob = await ttsRes.arrayBuffer();
          const audioBytes = new Uint8Array(audioBlob);
          
          // Upload to storage
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
          console.warn("[process-curated-video] ElevenLabs TTS failed:", ttsRes.status);
          
          // Fallback to Edge TTS
          console.log("[process-curated-video] Fallback to Edge TTS...");
          const edgeTtsRes = await fetch(`${supabaseUrl}/functions/v1/edge-tts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              text: narrationScript,
              voice: "pt-BR-FranciscaNeural",
              rate: "+5%",
            }),
          });

          if (edgeTtsRes.ok) {
            const edgeTtsData = await edgeTtsRes.json();
            narrationAudioUrl = edgeTtsData.audioUrl || "";
          }
        }
      } catch (e) {
        console.error("[process-curated-video] TTS failed:", e);
      }
    }

    // Step 3: Prepare the render job
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
        requires_download: true, // yt-dlp needed
        mute_original: true, // Remove original audio
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
      },
      output: {
        resolution: "1080x1920",
        format: "mp4",
        max_duration: 30, // Clip to 30 seconds max
      },
    };

    // Step 4: Send to render service if available
    if (renderServiceUrl) {
      console.log(`[process-curated-video] Sending to render service: ${renderServiceUrl}`);
      try {
        const renderRes = await fetch(`${renderServiceUrl}/render-curated`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(renderJob),
        });

        if (renderRes.ok) {
          const renderData = await renderRes.json();
          
          // Update post with rendered video
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

            console.log(`[process-curated-video] ✅ Video rendered and post updated`);
            return new Response(
              JSON.stringify({ success: true, video_url: renderData.video_url, rendered: true }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      } catch (e) {
        console.warn("[process-curated-video] Render service failed:", e);
      }
    }

    // Step 5: If no render service, save metadata for later processing
    // The post stays as draft with all processing data in overlay_metadata
    await supabase.from("posts").update({
      overlay_metadata: {
        ...renderJob,
        rendered: false,
        pending_render: true,
        narration_audio_url: narrationAudioUrl,
      },
      image_url: video_source.thumbnail || null,
    }).eq("id", post_id);

    console.log(`[process-curated-video] ✅ Metadata saved (pending render). Narration: ${narrationAudioUrl ? "yes" : "no"}`);

    return new Response(
      JSON.stringify({
        success: true,
        rendered: false,
        pending_render: true,
        narration_generated: !!narrationAudioUrl,
        headline: narrationHeadline,
        script_length: narrationScript.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[process-curated-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
