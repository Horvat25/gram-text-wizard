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
    const { text, voiceId, language } = await req.json();
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY não configurada");
    }

    if (!text) {
      throw new Error("Texto é obrigatório");
    }

    console.log("Generating TTS for text:", text.substring(0, 100) + "...");
    console.log("Voice ID:", voiceId || "default (Brian)");
    console.log("Language:", language || "pt-BR");

    // Default voice: Brian (Portuguese-friendly)
    // Alternative voices: 
    // - "onwK4e9ZLuTAKqWW03F9" (Daniel - male, clear)
    // - "EXAVITQu4vr4xnSDxMaL" (Sarah - female)
    // - "nPczCjzI2devNBz1zQrb" (Brian - male, narrator)
    const selectedVoiceId = voiceId || "nPczCjzI2devNBz1zQrb";

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          output_format: "mp3_44100_128",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs TTS error:", response.status, errorText);
      throw new Error(`ElevenLabs TTS error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    
    // Use Deno's base64 encoder (safer for large buffers)
    const base64Audio = base64Encode(audioBuffer);

    console.log("ElevenLabs TTS generated successfully, audio size:", audioBuffer.byteLength, "base64 length:", base64Audio.length);

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: "mp3",
        duration_estimate: Math.ceil(text.length / 15), // rough estimate
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in elevenlabs-tts:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar narração" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
