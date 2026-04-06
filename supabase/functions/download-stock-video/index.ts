import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Authorized YouTube channels (with explicit permission from owners)
const AUTHORIZED_CHANNELS = [
  {
    handle: "@REALIDADEIMPRESSIONANTE",
    name: "Realidade Impressionante",
    searchQuery: "Realidade Impressionante",
    topics: ["tecnologia", "robôs", "inteligência artificial", "futuro", "inovação"],
  },
];

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

    // === PRIORITY 1: Authorized YouTube channels ===
    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (youtubeApiKey && (source === "auto" || source === "youtube" || source === "authorized_channel")) {
      console.log(`[download-stock-video] Trying authorized YouTube channels first...`);
      const channelResult = await tryAuthorizedChannels(query, workspace_id, supabase, youtubeApiKey);
      if (channelResult) {
        return new Response(JSON.stringify(channelResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // === PRIORITY 2: YouTube Creative Commons ===
    if (youtubeApiKey && (source === "auto" || source === "youtube")) {
      console.log(`[download-stock-video] Trying YouTube CC videos...`);
      const ccResult = await tryYouTubeCC(query, workspace_id, supabase, youtubeApiKey);
      if (ccResult) {
        return new Response(JSON.stringify(ccResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // === PRIORITY 3: Pexels stock ===
    const pexelsApiKey = Deno.env.get("PEXELS_API_KEY");
    if (pexelsApiKey) {
      const pexelsResult = await tryPexelsSource(query, orientation, per_page, workspace_id, pexelsApiKey, supabase);
      if (pexelsResult) {
        return new Response(JSON.stringify(pexelsResult), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

// ========== AUTHORIZED CHANNELS (Priority 1) ==========
async function tryAuthorizedChannels(
  query: string, workspaceId: string, supabase: any, youtubeApiKey: string
): Promise<any | null> {
  try {
    // Pick the most relevant authorized channel
    const channel = AUTHORIZED_CHANNELS[0]; // For now, just one

    // Step 1: Find the channel ID
    const channelSearchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    channelSearchUrl.searchParams.set("part", "snippet");
    channelSearchUrl.searchParams.set("q", channel.searchQuery);
    channelSearchUrl.searchParams.set("type", "channel");
    channelSearchUrl.searchParams.set("maxResults", "1");
    channelSearchUrl.searchParams.set("key", youtubeApiKey);

    const channelRes = await fetch(channelSearchUrl.toString());
    if (!channelRes.ok) {
      console.warn("[download-stock-video] Channel search failed");
      return null;
    }

    const channelData = await channelRes.json();
    const channelId = channelData.items?.[0]?.id?.channelId;
    if (!channelId) {
      console.warn("[download-stock-video] Channel not found:", channel.handle);
      return null;
    }

    console.log(`[download-stock-video] Found channel: ${channel.name} (${channelId})`);

    // Step 2: Search for recent videos from this channel matching the query
    const videoSearchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    videoSearchUrl.searchParams.set("part", "snippet");
    videoSearchUrl.searchParams.set("channelId", channelId);
    videoSearchUrl.searchParams.set("q", query);
    videoSearchUrl.searchParams.set("type", "video");
    videoSearchUrl.searchParams.set("maxResults", "10");
    videoSearchUrl.searchParams.set("order", "date");
    videoSearchUrl.searchParams.set("key", youtubeApiKey);

    const searchRes = await fetch(videoSearchUrl.toString());
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const items = searchData.items || [];
    if (items.length === 0) return null;

    // Step 3: Get video details
    const videoIds = items.map((i: any) => i.id.videoId).join(",");
    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.searchParams.set("part", "contentDetails,statistics,snippet");
    detailsUrl.searchParams.set("id", videoIds);
    detailsUrl.searchParams.set("key", youtubeApiKey);

    const detailsRes = await fetch(detailsUrl.toString());
    if (!detailsRes.ok) return null;
    const detailsData = await detailsRes.json();

    // Pick the best video (most views, prefer shorter)
    const videos = (detailsData.items || [])
      .map((v: any) => ({
        id: v.id,
        title: v.snippet?.title || "",
        description: (v.snippet?.description || "").substring(0, 300),
        channel: v.snippet?.channelTitle || channel.name,
        thumbnail: v.snippet?.thumbnails?.maxres?.url || v.snippet?.thumbnails?.high?.url || "",
        duration: parseDuration(v.contentDetails?.duration || "PT0S"),
        views: parseInt(v.statistics?.viewCount || "0"),
        publishedAt: v.snippet?.publishedAt || "",
      }))
      .filter((v: any) => v.duration > 30 && v.duration < 600) // 30s to 10min
      .sort((a: any, b: any) => b.views - a.views);

    if (videos.length === 0) return null;

    const bestVideo = videos[0];
    
    // Save thumbnail to storage
    let thumbnailUrl = bestVideo.thumbnail;
    if (thumbnailUrl) {
      try {
        const thumbRes = await fetch(thumbnailUrl);
        if (thumbRes.ok) {
          const thumbData = new Uint8Array(await thumbRes.arrayBuffer());
          const thumbPath = `${workspaceId}/yt-auth-${bestVideo.id}.jpg`;
          await supabase.storage.from("post-images").upload(thumbPath, thumbData, {
            contentType: "image/jpeg",
            upsert: true,
          });
          const { data: pubUrl } = supabase.storage.from("post-images").getPublicUrl(thumbPath);
          thumbnailUrl = pubUrl.publicUrl;
        }
      } catch (e) {
        console.warn("[download-stock-video] Thumbnail save failed");
      }
    }

    console.log(`[download-stock-video] ✅ Authorized channel video: "${bestVideo.title}" (${bestVideo.duration}s, ${bestVideo.views} views)`);

    return {
      success: true,
      video_url: `https://www.youtube.com/watch?v=${bestVideo.id}`,
      thumbnail_url: thumbnailUrl,
      source: {
        platform: "youtube_authorized",
        video_id: bestVideo.id,
        duration: bestVideo.duration,
        title: bestVideo.title,
        description: bestVideo.description,
        channel: bestVideo.channel,
        channel_handle: channel.handle,
        youtube_url: `https://www.youtube.com/watch?v=${bestVideo.id}`,
        views: bestVideo.views,
        published_at: bestVideo.publishedAt,
        license: "authorized_partner",
      },
      requires_download: true,
      requires_processing: true, // Flag: needs mute + re-narrate + brand
    };
  } catch (e) {
    console.error("[download-stock-video] Authorized channel error:", e);
    return null;
  }
}

// ========== YOUTUBE CC (Priority 2) ==========
async function tryYouTubeCC(
  query: string, workspaceId: string, supabase: any, youtubeApiKey: string
): Promise<any | null> {
  try {
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
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const items = searchData.items || [];
    if (items.length === 0) return null;

    const videoIds = items.map((i: any) => i.id.videoId).join(",");
    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.searchParams.set("part", "contentDetails,statistics,snippet");
    detailsUrl.searchParams.set("id", videoIds);
    detailsUrl.searchParams.set("key", youtubeApiKey);

    const detailsRes = await fetch(detailsUrl.toString());
    if (!detailsRes.ok) return null;
    const detailsData = await detailsRes.json();

    const bestVideo = (detailsData.items || [])[0];
    if (!bestVideo) return null;

    const duration = parseDuration(bestVideo.contentDetails?.duration || "PT0S");

    // Save thumbnail
    let thumbnailUrl = bestVideo.snippet?.thumbnails?.high?.url || "";
    if (thumbnailUrl) {
      try {
        const thumbRes = await fetch(thumbnailUrl);
        if (thumbRes.ok) {
          const thumbData = new Uint8Array(await thumbRes.arrayBuffer());
          const thumbPath = `${workspaceId}/yt-cc-${bestVideo.id}.jpg`;
          await supabase.storage.from("post-images").upload(thumbPath, thumbData, {
            contentType: "image/jpeg",
            upsert: true,
          });
          const { data: pubUrl } = supabase.storage.from("post-images").getPublicUrl(thumbPath);
          thumbnailUrl = pubUrl.publicUrl;
        }
      } catch (e) { /* ignore */ }
    }

    return {
      success: true,
      video_url: `https://www.youtube.com/watch?v=${bestVideo.id}`,
      thumbnail_url: thumbnailUrl,
      source: {
        platform: "youtube_cc",
        video_id: bestVideo.id,
        duration,
        title: bestVideo.snippet?.title || "",
        channel: bestVideo.snippet?.channelTitle || "",
        youtube_url: `https://www.youtube.com/watch?v=${bestVideo.id}`,
        license: "creativeCommon",
      },
      requires_download: true,
      requires_processing: false,
    };
  } catch (e) {
    console.error("[download-stock-video] YouTube CC error:", e);
    return null;
  }
}

// ========== PEXELS (Priority 3) ==========
async function tryPexelsSource(
  query: string, orientation: string, perPage: number, workspaceId: string,
  pexelsApiKey: string, supabase: any
): Promise<any | null> {
  const searchUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${perPage}&size=medium`;
  console.log(`[download-stock-video] Searching Pexels: "${query}"`);

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: pexelsApiKey },
  });

  if (!searchRes.ok) return null;

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

  // Download and upload
  const videoRes = await fetch(bestFile.link);
  if (!videoRes.ok) return null;

  const videoBytes = new Uint8Array(await videoRes.arrayBuffer());
  const fileName = `stock-${bestVideo.id}-${Date.now()}.mp4`;
  const filePath = `${workspaceId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("post-videos")
    .upload(filePath, videoBytes, { contentType: "video/mp4", upsert: false });

  if (uploadError) return null;

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
    requires_processing: false,
  };
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || "0") * 3600 + parseInt(match[2] || "0") * 60 + parseInt(match[3] || "0");
}
