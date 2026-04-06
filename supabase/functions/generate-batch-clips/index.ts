import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_SOURCE_VIDEO_DURATION = 180;

const parseDuration = (iso: string): number => {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const sanitizeSourceQuery = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\/(www\.)?youtube\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/^(channel|c|user)\//i, "")
    .split(/[/?#]/)[0];

async function resolveChannel(youtubeApiKey: string, rawSource: string) {
  const sanitized = sanitizeSourceQuery(rawSource);

  if (sanitized.startsWith("UC")) {
    const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    channelUrl.searchParams.set("part", "snippet");
    channelUrl.searchParams.set("id", sanitized);
    channelUrl.searchParams.set("key", youtubeApiKey);

    const response = await fetch(channelUrl.toString());
    const data = response.ok ? await response.json() : { items: [] };
    const channel = data.items?.[0];

    if (channel) {
      return {
        channelId: channel.id,
        channelTitle: channel.snippet?.title || rawSource,
      };
    }
  }

  if (sanitized && !sanitized.includes(" ")) {
    try {
      const handleUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
      handleUrl.searchParams.set("part", "snippet");
      handleUrl.searchParams.set("forHandle", sanitized);
      handleUrl.searchParams.set("key", youtubeApiKey);

      const handleResponse = await fetch(handleUrl.toString());
      const handleData = handleResponse.ok ? await handleResponse.json() : { items: [] };
      const channel = handleData.items?.[0];

      if (channel) {
        return {
          channelId: channel.id,
          channelTitle: channel.snippet?.title || rawSource,
        };
      }
    } catch (error) {
      console.warn("[batch-clips] forHandle lookup failed", error);
    }
  }

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", rawSource);
  searchUrl.searchParams.set("type", "channel");
  searchUrl.searchParams.set("maxResults", "5");
  searchUrl.searchParams.set("key", youtubeApiKey);

  const searchResponse = await fetch(searchUrl.toString());
  if (!searchResponse.ok) {
    const errorText = await searchResponse.text();
    throw new Error(`Falha ao buscar o canal: ${errorText}`);
  }

  const searchData = await searchResponse.json();
  const candidates = searchData.items || [];

  if (candidates.length === 0) {
    throw new Error("Não encontrei esse perfil no YouTube");
  }

  const normalizedQuery = normalize(sanitized || rawSource);
  const bestMatch =
    candidates.find((item: any) => {
      const title = normalize(item.snippet?.channelTitle || item.snippet?.title || "");
      return title === normalizedQuery || title.includes(normalizedQuery) || normalizedQuery.includes(title);
    }) || candidates[0];

  return {
    channelId: bestMatch.id?.channelId || bestMatch.snippet?.channelId,
    channelTitle: bestMatch.snippet?.channelTitle || bestMatch.snippet?.title || rawSource,
  };
}

async function getLatestSourceVideo(youtubeApiKey: string, channelId: string, channelTitle: string) {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("channelId", channelId);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("order", "date");
  searchUrl.searchParams.set("maxResults", "8");
  searchUrl.searchParams.set("key", youtubeApiKey);

  const searchResponse = await fetch(searchUrl.toString());
  if (!searchResponse.ok) {
    const errorText = await searchResponse.text();
    throw new Error(`Falha ao buscar vídeos do canal: ${errorText}`);
  }

  const searchData = await searchResponse.json();
  const items = searchData.items || [];

  if (items.length === 0) {
    throw new Error("Esse perfil não tem vídeos disponíveis");
  }

  const videoIds = items.map((item: any) => item.id?.videoId).filter(Boolean).join(",");
  const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  detailsUrl.searchParams.set("part", "contentDetails,statistics,snippet");
  detailsUrl.searchParams.set("id", videoIds);
  detailsUrl.searchParams.set("key", youtubeApiKey);

  const detailsResponse = await fetch(detailsUrl.toString());
  const detailsData = detailsResponse.ok ? await detailsResponse.json() : { items: [] };
  const detailsMap = new Map((detailsData.items || []).map((item: any) => [item.id, item]));

  const videos = items
    .map((item: any) => {
      const details = detailsMap.get(item.id?.videoId);
      return {
        video_id: item.id?.videoId,
        title: details?.snippet?.title || item.snippet?.title || "",
        description: (details?.snippet?.description || item.snippet?.description || "").slice(0, 400),
        channel: details?.snippet?.channelTitle || item.snippet?.channelTitle || channelTitle,
        thumbnail:
          details?.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.default?.url ||
          "",
        duration_seconds: parseDuration(details?.contentDetails?.duration || "PT0S"),
        view_count: parseInt(details?.statistics?.viewCount || "0", 10),
        published_at: details?.snippet?.publishedAt || item.snippet?.publishedAt || "",
        youtube_url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      };
    })
    .filter((video: any) => video.video_id);

  return videos.find((video: any) => video.duration_seconds >= MIN_SOURCE_VIDEO_DURATION) || videos[0] || null;
}

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      workspace_id,
      clips_count = 1,
      source_profile,
      source_label,
    } = await req.json();

    if (!workspace_id || !source_profile) {
      return new Response(
        JSON.stringify({ error: "workspace_id e source_profile são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!youtubeApiKey || !lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "Configuração de vídeo incompleta no backend" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const safeClipsCount = Math.min(5, Math.max(1, Number(clips_count) || 1));

    console.log(`[batch-clips] Resolving source profile: ${source_profile}`);
    const resolvedChannel = await resolveChannel(youtubeApiKey, source_profile);
    const sourceVideo = await getLatestSourceVideo(
      youtubeApiKey,
      resolvedChannel.channelId,
      resolvedChannel.channelTitle,
    );

    if (!sourceVideo) {
      return new Response(
        JSON.stringify({ error: "Não encontrei um vídeo recente suficiente para cortar" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[batch-clips] Source video: ${sourceVideo.title}`);
    console.log(`[batch-clips] Generating ${safeClipsCount} angles...`);

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
            content: `Você é o roteirista do canal Neural Update.
Crie ${safeClipsCount} cortes DIFERENTES do mesmo vídeo-fonte para Reels/TikTok.

REGRAS:
- Todos os cortes devem ser fiéis ao vídeo-fonte
- Cada corte precisa atacar um ângulo diferente do MESMO vídeo
- Tom: notícia de tecnologia, claro, objetivo e envolvente
- Cada corte tem 4 segmentos: gancho, contexto, impacto e conclusão
- Máximo de 70 palavras por corte
- Não cite o canal original
- Escreva em PT-BR

Responda em JSON:
{
  "clips": [
    {
      "angle": "ângulo editorial",
      "headline": "manchete curta",
      "narration": "roteiro completo do corte",
      "segments": [
        { "text": "gancho", "duration": 3 },
        { "text": "contexto", "duration": 6 },
        { "text": "impacto", "duration": 6 },
        { "text": "conclusão", "duration": 3 }
      ],
      "hashtags": ["ia", "tecnologia", "futuro"],
      "caption": "legenda do post"
    }
  ]
}`,
          },
          {
            role: "user",
            content: `Gere ${safeClipsCount} cortes usando o vídeo mais recente do perfil ${source_label || resolvedChannel.channelTitle}.\n\nTÍTULO: ${sourceVideo.title}\nDESCRIÇÃO: ${sourceVideo.description || "Vídeo sobre tecnologia"}\nCANAL: ${sourceVideo.channel}\nDURAÇÃO: ${sourceVideo.duration_seconds}s\nLINK: ${sourceVideo.youtube_url}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!anglesRes.ok) {
      const errText = await anglesRes.text();
      console.error(`[batch-clips] AI failed: ${errText}`);
      return new Response(
        JSON.stringify({ error: "Falha ao gerar os roteiros dos cortes" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anglesData = await anglesRes.json();
    const parsed = JSON.parse(anglesData.choices?.[0]?.message?.content || "{}");
    const clips = Array.isArray(parsed?.clips) ? parsed.clips : [];

    if (clips.length === 0) {
      return new Response(
        JSON.stringify({ error: "A IA não retornou nenhum corte válido" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const createdPosts: any[] = [];

    for (let index = 0; index < clips.length; index++) {
      const clip = clips[index];
      const hashtags = Array.isArray(clip?.hashtags)
        ? clip.hashtags.map((tag: string) => tag.replace(/^#/, ""))
        : [];

      const postData = {
        user_id: user.id,
        workspace_id,
        caption: clip?.caption || `${clip?.headline}\n\n${clip?.narration}`,
        hashtags,
        status: "draft",
        media_type: "reels",
        post_type: "video_curated",
        platforms: ["instagram", "tiktok"],
        image_url: sourceVideo.thumbnail,
        overlay_metadata: {
          type: "curated_clip",
          clip_index: index + 1,
          total_clips: clips.length,
          angle: clip?.angle || "",
          headline: clip?.headline || "",
          narration: clip?.narration || "",
          segments: Array.isArray(clip?.segments) ? clip.segments : [],
          source_profile,
          source_label: source_label || resolvedChannel.channelTitle,
          source_video: {
            video_id: sourceVideo.video_id,
            title: sourceVideo.title,
            channel: sourceVideo.channel,
            channel_id: resolvedChannel.channelId,
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
        console.error(`[batch-clips] Failed to create post ${index + 1}:`, insertErr);
        continue;
      }

      createdPosts.push({
        id: post.id,
        angle: clip?.angle || "",
        headline: clip?.headline || "",
        caption: clip?.caption || "",
        narration: clip?.narration || "",
        segments: Array.isArray(clip?.segments) ? clip.segments : [],
      });
    }

    // NOTE: Rendering is now triggered manually per clip from the UI.
    // No automatic background processing.

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
