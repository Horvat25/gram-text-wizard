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
      console.error("[ElevenLabs SFX] API Key not configured");
      throw new Error("ELEVENLABS_API_KEY não configurada");
    }

    // Default prompt for tech sound effects
    const sfxPrompt = prompt || "subtle digital whoosh, futuristic transition sound, clean tech interface";
    const sfxDuration = duration || 2;

    console.log("[ElevenLabs SFX] Generating with prompt:", sfxPrompt);
    console.log("[ElevenLabs SFX] Duration:", sfxDuration, "seconds");
    console.log("[ElevenLabs SFX] API Key present:", !!ELEVENLABS_API_KEY);

    const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: sfxPrompt,
        duration_seconds: sfxDuration,
        prompt_influence: 0.3,
      }),
    });

    console.log("[ElevenLabs SFX] Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ElevenLabs SFX] Error response:", response.status, errorText);
      
      // Return graceful fallback for payment/quota issues
      if (response.status === 402 || response.status === 401 || response.status === 403 || response.status === 429) {
        console.log("[ElevenLabs SFX] Unavailable (requires paid plan or quota exceeded), returning fallback");
        return new Response(
          JSON.stringify({ 
            audioContent: null,
            error: "SFX generation requires ElevenLabs paid plan",
            fallback: true,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      throw new Error(`ElevenLabs SFX error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    
    // Use Deno's safe base64 encoder (prevents stack overflow with large buffers)
    const base64Audio = base64Encode(audioBuffer);

    console.log("[ElevenLabs SFX] ✅ Generated successfully, audio size:", audioBuffer.byteLength, "bytes, base64 length:", base64Audio.length);

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: "mp3",
        duration: sfxDuration,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[ElevenLabs SFX] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar efeito sonoro" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
