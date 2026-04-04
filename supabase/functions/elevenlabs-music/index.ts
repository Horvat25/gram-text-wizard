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
    const { prompt, duration } = await req.json();
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

    if (!ELEVENLABS_API_KEY) {
      console.warn("[ElevenLabs Music] No API key configured, returning fallback");
      return new Response(
        JSON.stringify({ fallback: true, provider: "elevenlabs-music", reason: "no_api_key" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ElevenLabs Music] Generating: "${prompt.substring(0, 80)}..." (${duration || 30}s)`);

    const response = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        duration_seconds: duration || 30,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ElevenLabs Music] Upstream ${response.status}: ${errorText.substring(0, 200)}`);
      // Always return 200 + JSON so client falls through gracefully
      return new Response(
        JSON.stringify({
          fallback: true,
          provider: "elevenlabs-music",
          reason: response.status === 402 ? "paid_plan_required" : `upstream_${response.status}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    console.log(`[ElevenLabs Music] ✅ Generated ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);

    return new Response(audioBuffer, {
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg" },
    });
  } catch (error: any) {
    console.error("[ElevenLabs Music] Error:", error.message);
    // Return fallback JSON, never a 500 that would crash the client
    return new Response(
      JSON.stringify({ fallback: true, provider: "elevenlabs-music", reason: "exception" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
