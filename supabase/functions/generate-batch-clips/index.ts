import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * GENERATE BATCH CLIPS
 * 
 * Takes a YouTube video and generates N different clip variations,
 * each with unique narration angles, creating draft posts ready for review.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { workspace_id, user_id, clips_count = 5, topic } = await req.json();

    if (!workspace_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id e user_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[batch-clips] Generating ${clips_count} clips for workspace ${workspace_id}`);

    // Step 1: Find a source video from YouTube
    let sourceVideo: any = null;
    const searchQuery = topic || "tecnologia inteligência artificial novidades";

    if (youtubeApiKey) {
      console.log(`[batch-clips] Searching YouTube: "${searchQuery}"`);
      
      const searchRes = await fetch(`${supabaseUrl}/functions/v1/search-youtube-videos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          query: searchQuery,
          max_results: 5,
          duration_filter: "medium",
        }),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.videos && searchData.videos.length > 0) {
          // Pick the most viewed video
          sourceVideo = searchData.videos[0];
          console.log(`[batch-clips] Source: "${sourceVideo.title}" (${sourceVideo.duration_seconds}s)`);
        }
      }
    }

    if (!sourceVideo) {
      return new Response(
        JSON.stringify({ error: "Nenhum vídeo fonte encontrado no YouTube" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Generate N different clip angles using AI
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[batch-clips] Generating ${clips_count} unique angles...`);

    const anglesRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `Você é o roteirista do canal Neural Update no Instagram/TikTok.
Dado um vídeo de tecnologia, crie ${clips_count} CORTES DIFERENTES do mesmo vídeo.
Cada corte deve ter um ângulo/perspectiva DIFERENTE sobre o mesmo tema.

REGRAS:
- Cada clip = 4 segmentos (gancho, contexto, impacto, conclusão)
- Máximo 70 palavras por clip (sem CTA)
- Cada clip deve parecer um Reels independente
- Ganchos DIFERENTES e criativos para cada clip
- Idioma: PT-BR, tom jornalístico profissional
- NÃO mencione o canal original

ÂNGULOS SUGERIDOS (use como inspiração):
1. Foco no IMPACTO para o usuário comum
2. Foco na TECNOLOGIA por trás
3. Foco na COMPETIÇÃO entre empresas
4. Foco no FUTURO e previsões
5. Foco nos NÚMEROS e dados

Responda em JSON:
{
  "clips": [
    {
      "angle": "nome do ângulo",
      "headline": "MANCHETE CURTA (max 45 chars)",
      "narration": "texto completo...",
      "segments": [
        { "text": "gancho...", "duration": 3 },
        { "text": "contexto...", "duration": 6 },
        { "text": "impacto...", "duration": 6 },
        { "text": "conclusão...", "duration": 3 }
      ],
      "hashtags": ["#tag1", "#tag2", "#tag3"],
      "caption": "legenda para o post com emojis e hashtags"
    }
  ]
}`,
          },
          {
            role: "user",
            content: `Crie ${clips_count} cortes diferentes deste vídeo:\nTítulo: "${sourceVideo.title}"\nDescrição: ${sourceVideo.description || "Vídeo sobre tecnologia"}\nCanal: ${sourceVideo.channel}\nDuração: ${sourceVideo.duration_seconds}s`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!anglesRes.ok) {
      const errText = await anglesRes.text();
      console.error(`[batch-clips] AI failed: ${errText}`);
      return new Response(
        JSON.stringify({ error: "Falha ao gerar roteiros" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anglesData = await anglesRes.json();
    const parsed = JSON.parse(anglesData.choices?.[0]?.message?.content || "{}");
    const clips = parsed.clips || [];

    console.log(`[batch-clips] Generated ${clips.length} clip scripts`);

    // Step 3: Create draft posts for each clip
    const createdPosts: any[] = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      
      const postData = {
        user_id,
        workspace_id,
        caption: clip.caption || `${clip.headline}\n\n${clip.narration}`,
        hashtags: clip.hashtags || [],
        status: "draft",
        media_type: "video",
        post_type: "video_curated",
        platforms: ["instagram", "tiktok"],
        image_url: sourceVideo.thumbnail,
        overlay_metadata: {
          type: "curated_clip",
          clip_index: i + 1,
          total_clips: clips.length,
          angle: clip.angle,
          headline: clip.headline,
          narration: clip.narration,
          segments: clip.segments,
          source_video: {
            video_id: sourceVideo.video_id,
            title: sourceVideo.title,
            channel: sourceVideo.channel,
            youtube_url: sourceVideo.youtube_url,
            thumbnail: sourceVideo.thumbnail,
            duration: sourceVideo.duration_seconds,
          },
          branding: {
            handle: "@neuralupdate",
            tagline: "IA • Tecnologia • Futuro",
            watermark: "NEURAL UPDATE",
          },
          pending_render: true,
          created_at: new Date().toISOString(),
        },
      };

      const { data: post, error: insertErr } = await supabase
        .from("posts")
        .insert(postData)
        .select()
        .single();

      if (insertErr) {
        console.error(`[batch-clips] Failed to create post ${i + 1}:`, insertErr);
        continue;
      }

      createdPosts.push({
        id: post.id,
        angle: clip.angle,
        headline: clip.headline,
        caption: clip.caption,
      });

      console.log(`[batch-clips] ✅ Clip ${i + 1}/${clips.length}: "${clip.headline}"`);
    }

    // Step 4: Trigger process-curated-video for each clip (in background)
    for (const post of createdPosts) {
      try {
        fetch(`${supabaseUrl}/functions/v1/process-curated-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            post_id: post.id,
            video_source: sourceVideo,
            headline: post.headline,
            workspace_id,
            user_id,
          }),
        }).catch(e => console.warn(`[batch-clips] Background process failed for ${post.id}:`, e));
      } catch (e) {
        console.warn(`[batch-clips] Failed to trigger process for ${post.id}`);
      }
    }

    console.log(`[batch-clips] ✅ Done! Created ${createdPosts.length} clips from "${sourceVideo.title}"`);

    return new Response(
      JSON.stringify({
        success: true,
        source_video: {
          title: sourceVideo.title,
          channel: sourceVideo.channel,
          thumbnail: sourceVideo.thumbnail,
          youtube_url: sourceVideo.youtube_url,
        },
        clips_created: createdPosts.length,
        clips: createdPosts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[batch-clips] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
