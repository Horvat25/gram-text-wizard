import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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
      console.error("[ElevenLabs Music] API Key not configured");
      throw new Error("ELEVENLABS_API_KEY não configurada");
    }

    // Default prompt for ambient tech music
    const musicPrompt = prompt || "Ambient tech futuristic background music, subtle synth pads, modern, clean, minimal, 80bpm";
    const musicDuration = duration || 15;

    console.log("[ElevenLabs Music] Generating with prompt:", musicPrompt);
    console.log("[ElevenLabs Music] Duration:", musicDuration, "seconds");
    console.log("[ElevenLabs Music] API Key present:", !!ELEVENLABS_API_KEY);

    const response = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: musicPrompt,
        duration_seconds: musicDuration,
      }),
    });

    console.log("[ElevenLabs Music] Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ElevenLabs Music] Error response:", response.status, errorText);
      
      // Return graceful fallback for payment/quota issues (music is optional)
      if (response.status === 402 || response.status === 401 || response.status === 403 || response.status === 429) {
        console.log("[ElevenLabs Music] Unavailable (requires paid plan or quota exceeded), returning fallback");
        return new Response(
          JSON.stringify({ 
            audioContent: null,
            error: "Music generation requires ElevenLabs paid plan",
            fallback: true,
          }),
          {
            status: 200, // Return 200 so client handles gracefully
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      throw new Error(`ElevenLabs Music error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    
    // Use Deno's safe base64 encoder (prevents stack overflow with large buffers)
    const base64Audio = base64Encode(audioBuffer);

    console.log("[ElevenLabs Music] ✅ Generated successfully, audio size:", audioBuffer.byteLength, "bytes, base64 length:", base64Audio.length);

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: "mp3",
        duration: musicDuration,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[ElevenLabs Music] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar música" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
