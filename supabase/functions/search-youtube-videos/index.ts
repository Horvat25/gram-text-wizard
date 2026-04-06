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
    const { query, max_results = 5, duration_filter = "short" } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: "query é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!youtubeApiKey) {
      return new Response(
        JSON.stringify({ error: "YOUTUBE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Search YouTube for videos
    // videoDuration: "short" = <4min, "medium" = 4-20min
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", String(max_results));
    searchUrl.searchParams.set("videoDuration", duration_filter);
    searchUrl.searchParams.set("videoLicense", "creativeCommon"); // Only CC-licensed videos
    searchUrl.searchParams.set("order", "relevance");
    searchUrl.searchParams.set("relevanceLanguage", "pt");
    searchUrl.searchParams.set("key", youtubeApiKey);

    console.log(`[search-youtube] Searching: "${query}" (duration: ${duration_filter})`);

    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error("[search-youtube] YouTube API failed:", errText);
      return new Response(
        JSON.stringify({ error: "Falha na busca do YouTube", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchData = await searchRes.json();
    const items = searchData.items || [];

    if (items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum vídeo encontrado", query }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get video details (duration, stats)
    const videoIds = items.map((item: any) => item.id.videoId).join(",");
    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.searchParams.set("part", "contentDetails,statistics,snippet");
    detailsUrl.searchParams.set("id", videoIds);
    detailsUrl.searchParams.set("key", youtubeApiKey);

    const detailsRes = await fetch(detailsUrl.toString());
    const detailsData = detailsRes.ok ? await detailsRes.json() : { items: [] };

    // Map results
    const videos = (detailsData.items || []).map((video: any) => {
      const duration = parseDuration(video.contentDetails?.duration || "PT0S");
      return {
        video_id: video.id,
        title: video.snippet?.title || "",
        description: (video.snippet?.description || "").substring(0, 200),
        channel: video.snippet?.channelTitle || "",
        thumbnail: video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.default?.url || "",
        duration_seconds: duration,
        view_count: parseInt(video.statistics?.viewCount || "0"),
        like_count: parseInt(video.statistics?.likeCount || "0"),
        published_at: video.snippet?.publishedAt || "",
        youtube_url: `https://www.youtube.com/watch?v=${video.id}`,
        license: "creativeCommon",
      };
    });

    // Sort by view count (most popular first)
    videos.sort((a: any, b: any) => b.view_count - a.view_count);

    console.log(`[search-youtube] Found ${videos.length} CC-licensed videos`);

    return new Response(
      JSON.stringify({ success: true, videos, total: videos.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[search-youtube] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Parse ISO 8601 duration (PT1M30S -> 90)
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");
  return hours * 3600 + minutes * 60 + seconds;
}
