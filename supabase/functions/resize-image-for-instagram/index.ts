import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Target dimensions per media type
const TARGETS: Record<string, { width: number; height: number }> = {
  image: { width: 1080, height: 1350 },     // 4:5
  news: { width: 1080, height: 1350 },      // 4:5
  carousel: { width: 1080, height: 1350 },  // 4:5
  reels: { width: 1080, height: 1920 },     // 9:16
};

// Instagram acceptable ratio range for feed posts
const FEED_MIN_RATIO = 0.79; // ~4:5
const FEED_MAX_RATIO = 1.92; // ~1.91:1

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, mediaType } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ url: imageUrl, error: "imageUrl required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const target = TARGETS[mediaType] || TARGETS.image;
    const targetRatio = target.width / target.height;

    console.log(`[resize] 📐 Processing: ${mediaType} → ${target.width}x${target.height}`);
    console.log(`[resize] Source: ${imageUrl.substring(0, 80)}...`);

    // Download image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`[resize] Failed to download image: ${response.status}`);
      return new Response(
        JSON.stringify({ url: imageUrl, skipped: true, reason: "download_failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    console.log(`[resize] Downloaded: ${(buffer.length / 1024).toFixed(0)} KB`);

    // Decode image
    let image: Image;
    try {
      image = await Image.decode(buffer);
    } catch (decodeErr) {
      console.error("[resize] Failed to decode image:", decodeErr);
      return new Response(
        JSON.stringify({ url: imageUrl, skipped: true, reason: "decode_failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const originalWidth = image.width;
    const originalHeight = image.height;
    const currentRatio = originalWidth / originalHeight;

    console.log(`[resize] Original: ${originalWidth}x${originalHeight} (ratio: ${currentRatio.toFixed(3)})`);

    // Check if resize is needed
    const isReels = mediaType === "reels";
    const ratioTolerance = 0.05;
    const isAcceptable = isReels
      ? Math.abs(currentRatio - targetRatio) < ratioTolerance
      : currentRatio >= FEED_MIN_RATIO && currentRatio <= FEED_MAX_RATIO;

    // Detect external (non-Supabase) URLs — Instagram rejects URLs with query strings
    // and unstable hosts (e.g. Pexels CDN with ?auto=compress), so we always re-host.
    const isExternal = !imageUrl.includes("/storage/v1/object/public/");

    if (isAcceptable && originalWidth >= 320 && !isExternal) {
      console.log(`[resize] ✅ Aspect ratio acceptable and already hosted, skipping resize`);
      return new Response(
        JSON.stringify({ url: imageUrl, skipped: true, reason: "acceptable_ratio" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isAcceptable && originalWidth >= 320 && isExternal) {
      // No crop needed, but re-host to get a clean Supabase URL (no query string)
      console.log(`[resize] 🔁 External URL — re-hosting without crop`);
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      const ext = (response.headers.get("content-type") || "image/jpeg").includes("png") ? "png" : "jpg";
      const filename = `rehosted/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("post-images")
        .upload(filename, buffer, { contentType: response.headers.get("content-type") || "image/jpeg", upsert: true });
      if (upErr) {
        console.error("[resize] Re-host upload failed:", upErr);
        return new Response(
          JSON.stringify({ url: imageUrl, skipped: true, reason: "rehost_failed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: pub } = supabase.storage.from("post-images").getPublicUrl(filename);
      return new Response(
        JSON.stringify({ url: pub.publicUrl, original: imageUrl, skipped: false, reason: "rehosted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Center crop to target aspect ratio
    let cropX = 0, cropY = 0, cropW = originalWidth, cropH = originalHeight;

    if (currentRatio > targetRatio) {
      // Image is wider → crop width
      cropW = Math.round(originalHeight * targetRatio);
      cropX = Math.round((originalWidth - cropW) / 2);
    } else {
      // Image is taller → crop height
      cropH = Math.round(originalWidth / targetRatio);
      cropY = Math.round((originalHeight - cropH) / 2);
    }

    console.log(`[resize] Cropping: (${cropX},${cropY}) ${cropW}x${cropH}`);
    image.crop(cropX, cropY, cropW, cropH);

    // Resize to target dimensions
    image.resize(target.width, target.height);
    console.log(`[resize] Resized to: ${target.width}x${target.height}`);

    // Encode as PNG (most reliable in imagescript)
    const encoded = await image.encode();

    // Upload to Supabase Storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const filename = `resized/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;

    const { error: uploadError } = await supabase.storage
      .from("post-images")
      .upload(filename, encoded, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("[resize] Upload error:", uploadError);
      return new Response(
        JSON.stringify({ url: imageUrl, skipped: true, reason: "upload_failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: publicUrl } = supabase.storage
      .from("post-images")
      .getPublicUrl(filename);

    console.log(`[resize] ✅ Resized and uploaded: ${publicUrl.publicUrl}`);

    return new Response(
      JSON.stringify({
        url: publicUrl.publicUrl,
        original: imageUrl,
        dimensions: { width: target.width, height: target.height },
        skipped: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[resize] Error:", error);
    // Graceful fallback — return original URL so pipeline continues
    try {
      const body = await new Response(error).text();
    } catch {}
    return new Response(
      JSON.stringify({ url: null, error: error.message, skipped: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
