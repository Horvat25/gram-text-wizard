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
      throw new Error("ELEVENLABS_API_KEY não configurada");
    }

    // Default prompt for tech sound effects
    const sfxPrompt = prompt || "subtle digital whoosh, futuristic transition sound, clean tech interface";
    const sfxDuration = duration || 2;

    console.log("Generating SFX with prompt:", sfxPrompt);
    console.log("Duration:", sfxDuration, "seconds");

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

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs SFX error:", response.status, errorText);
      throw new Error(`ElevenLabs SFX error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    
    // Encode as base64 for JSON response
    const base64Audio = btoa(
      Array.from(new Uint8Array(audioBuffer))
        .map(b => String.fromCharCode(b))
        .join('')
    );

    console.log("SFX generated successfully, audio size:", audioBuffer.byteLength);

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
    console.error("Error in elevenlabs-sfx:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar efeito sonoro" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
