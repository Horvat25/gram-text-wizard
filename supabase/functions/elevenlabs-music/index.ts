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

    // Default prompt for ambient tech music
    const musicPrompt = prompt || "Ambient tech futuristic background music, subtle synth pads, modern, clean, minimal, 80bpm";
    const musicDuration = duration || 15;

    console.log("Generating music with prompt:", musicPrompt);
    console.log("Duration:", musicDuration, "seconds");

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

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs Music error:", response.status, errorText);
      throw new Error(`ElevenLabs Music error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    
    // Encode as base64 for JSON response
    const base64Audio = btoa(
      Array.from(new Uint8Array(audioBuffer))
        .map(b => String.fromCharCode(b))
        .join('')
    );

    console.log("Music generated successfully, audio size:", audioBuffer.byteLength);

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
    console.error("Error in elevenlabs-music:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar música" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
