import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, orientation = "portrait", per_page = 5, workspace_id, source = "auto" } = await req.json();

    if (!query || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "query e workspace_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try YouTube first (if available and source allows)
    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (youtubeApiKey && (source === "auto" || source === "youtube")) {
      console.log(`[download-stock-video] Trying YouTube first: "${query}"`);
      const ytResult = await tryYouTubeSource(query, workspace_id, supabase, supabaseUrl);
      if (ytResult) {
        return new Response(JSON.stringify(ytResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("[download-stock-video] YouTube failed, falling back to Pexels");
    }

    // Fallback to Pexels
    const pexelsApiKey = Deno.env.get("PEXELS_API_KEY");
    if (!pexelsApiKey) {
      return new Response(
        JSON.stringify({ error: "Nenhuma fonte de vídeo configurada (YOUTUBE_API_KEY ou PEXELS_API_KEY)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pexelsResult = await tryPexelsSource(query, orientation, per_page, workspace_id, pexelsApiKey, supabase);
    if (pexelsResult) {
      return new Response(JSON.stringify(pexelsResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Nenhum vídeo encontrado em nenhuma fonte" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[download-stock-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ========== YOUTUBE SOURCE ==========
async function tryYouTubeSource(
  query: string, workspaceId: string, supabase: any, supabaseUrl: string
): Promise<any | null> {
  try {
    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY")!;

    // Search for CC-licensed short videos
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", `${query} technology AI`);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", "10");
    searchUrl.searchParams.set("videoDuration", "short");
    searchUrl.searchParams.set("videoLicense", "creativeCommon");
    searchUrl.searchParams.set("order", "viewCount");
    searchUrl.searchParams.set("key", youtubeApiKey);

    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) {
      console.warn("[download-stock-video] YouTube search failed:", await searchRes.text());
      return null;
    }

    const searchData = await searchRes.json();
    const items = searchData.items || [];
    if (items.length === 0) return null;

    // Get video details
    const videoIds = items.map((i: any) => i.id.videoId).join(",");
    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.searchParams.set("part", "contentDetails,statistics,snippet");
    detailsUrl.searchParams.set("id", videoIds);
    detailsUrl.searchParams.set("key", youtubeApiKey);

    const detailsRes = await fetch(detailsUrl.toString());
    if (!detailsRes.ok) return null;
    const detailsData = await detailsRes.json();

    // Pick the best video (most views, under 4 min)
    const bestVideo = (detailsData.items || [])[0];
    if (!bestVideo) return null;

    const duration = parseDuration(bestVideo.contentDetails?.duration || "PT0S");

    // YouTube doesn't allow direct download via API
    // We store the metadata and the YouTube URL for the Remotion pipeline
    // Remotion can use the video URL via yt-dlp on the render server
    const videoMeta = {
      video_id: bestVideo.id,
      title: bestVideo.snippet?.title || "",
      channel: bestVideo.snippet?.channelTitle || "",
      thumbnail: bestVideo.snippet?.thumbnails?.high?.url || "",
      duration_seconds: duration,
      youtube_url: `https://www.youtube.com/watch?v=${bestVideo.id}`,
      license: "creativeCommon",
    };

    // Download the thumbnail as a preview image
    if (videoMeta.thumbnail) {
      try {
        const thumbRes = await fetch(videoMeta.thumbnail);
        if (thumbRes.ok) {
          const thumbData = new Uint8Array(await thumbRes.arrayBuffer());
          const thumbPath = `${workspaceId}/yt-thumb-${bestVideo.id}.jpg`;
          await supabase.storage.from("post-images").upload(thumbPath, thumbData, {
            contentType: "image/jpeg",
            upsert: true,
          });
          const { data: thumbUrl } = supabase.storage.from("post-images").getPublicUrl(thumbPath);
          videoMeta.thumbnail = thumbUrl.publicUrl;
        }
      } catch (e) {
        console.warn("[download-stock-video] Thumbnail upload failed:", e);
      }
    }

    console.log(`[download-stock-video] ✅ YouTube video found: ${videoMeta.title} (${duration}s)`);

    return {
      success: true,
      video_url: videoMeta.youtube_url, // URL for yt-dlp on render server
      thumbnail_url: videoMeta.thumbnail,
      source: {
        platform: "youtube",
        video_id: videoMeta.video_id,
        duration: videoMeta.duration_seconds,
        title: videoMeta.title,
        channel: videoMeta.channel,
        youtube_url: videoMeta.youtube_url,
        license: videoMeta.license,
      },
      requires_download: true, // Flag for render server to use yt-dlp
    };
  } catch (e) {
    console.error("[download-stock-video] YouTube error:", e);
    return null;
  }
}

// ========== PEXELS SOURCE ==========
async function tryPexelsSource(
  query: string, orientation: string, perPage: number, workspaceId: string,
  pexelsApiKey: string, supabase: any
): Promise<any | null> {
  const searchUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${perPage}&size=medium`;
  console.log(`[download-stock-video] Searching Pexels: "${query}"`);

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: pexelsApiKey },
  });

  if (!searchRes.ok) {
    console.error("[download-stock-video] Pexels search failed:", await searchRes.text());
    return null;
  }

  const searchData = await searchRes.json();
  const videos = searchData.videos || [];

  let bestVideo = null;
  let bestFile = null;

  for (const video of videos) {
    if (video.duration > 60) continue;
    const files = video.video_files || [];
    const hdFile = files.find((f: any) => f.quality === "hd" && f.height >= 720);
    const sdFile = files.find((f: any) => f.quality === "sd");
    const selectedFile = hdFile || sdFile || files[0];
    if (selectedFile) {
      bestVideo = video;
      bestFile = selectedFile;
      break;
    }
  }

  if (!bestVideo || !bestFile) return null;

  console.log(`[download-stock-video] Pexels selected: ${bestVideo.id} (${bestVideo.duration}s, ${bestFile.width}x${bestFile.height})`);

  // Download the video
  const videoRes = await fetch(bestFile.link);
  if (!videoRes.ok) return null;

  const videoBytes = new Uint8Array(await videoRes.arrayBuffer());
  const fileName = `stock-${bestVideo.id}-${Date.now()}.mp4`;
  const filePath = `${workspaceId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("post-videos")
    .upload(filePath, videoBytes, { contentType: "video/mp4", upsert: false });

  if (uploadError) {
    console.error("[download-stock-video] Upload failed:", uploadError);
    return null;
  }

  const { data: publicUrl } = supabase.storage.from("post-videos").getPublicUrl(filePath);

  console.log(`[download-stock-video] ✅ Pexels uploaded: ${publicUrl.publicUrl}`);

  return {
    success: true,
    video_url: publicUrl.publicUrl,
    source: {
      platform: "pexels",
      video_id: bestVideo.id,
      duration: bestVideo.duration,
      width: bestFile.width,
      height: bestFile.height,
      photographer: bestVideo.user?.name || "Pexels",
      pexels_url: bestVideo.url,
    },
    requires_download: false,
  };
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || "0") * 3600 + parseInt(match[2] || "0") * 60 + parseInt(match[3] || "0");
}
