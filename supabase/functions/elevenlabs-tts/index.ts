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
    console.log("Voice ID/Name requested:", voiceId || "default");
    console.log("Language:", language || "pt-BR");

    // Map voice names to ElevenLabs voice IDs
    const voiceIdMap: Record<string, string> = {
      // Portuguese-friendly voices
      "camila": "onwK4e9ZLuTAKqWW03F9", // Daniel - works well with Portuguese
      "vitoria": "EXAVITQu4vr4xnSDxMaL", // Sarah - female
      "ricardo": "JBFqnCBsd6RMkjVDRZzb", // George - male
      "fernanda": "XrExE9yKIg1WjnnlVkGX", // Matilda - female
      // Standard ElevenLabs voices
      "brian": "nPczCjzI2devNBz1zQrb",
      "daniel": "onwK4e9ZLuTAKqWW03F9",
      "sarah": "EXAVITQu4vr4xnSDxMaL",
      "george": "JBFqnCBsd6RMkjVDRZzb",
      "matilda": "XrExE9yKIg1WjnnlVkGX",
      "alice": "Xb7hH8MSUJpSbSDYk0k2",
      "charlie": "IKne3meq5aSn9XLyUdCD",
      "jessica": "cgSgspJ2msm6clMCkdW9",
      "chris": "iP95p4xoKVk53GoZ742B",
      "lily": "pFZP5JQG7iQjIQuC4Bku",
    };
    
    // Resolve voice: check if it's already an ID, otherwise look up in map
    let selectedVoiceId = voiceId || "onwK4e9ZLuTAKqWW03F9"; // Default: Daniel
    
    // If it looks like a name (lowercase, no special chars), try to map it
    if (selectedVoiceId && selectedVoiceId.length < 25 && /^[a-z]+$/i.test(selectedVoiceId)) {
      const mappedId = voiceIdMap[selectedVoiceId.toLowerCase()];
      if (mappedId) {
        console.log(`Mapped voice name "${selectedVoiceId}" to ID "${mappedId}"`);
        selectedVoiceId = mappedId;
      } else {
        console.log(`Voice name "${selectedVoiceId}" not found in map, using default`);
        selectedVoiceId = "onwK4e9ZLuTAKqWW03F9"; // Default to Daniel
      }
    }
    
    console.log("Final voice ID:", selectedVoiceId);

    // IMPORTANT: output_format MUST be passed as query parameter, NOT in body!
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
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
      
      // Return specific error codes for client-side fallback handling
      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ 
            error: "ElevenLabs account issue - use fallback",
            code: "ELEVENLABS_BLOCKED",
            fallback: true 
          }),
          {
            status: 503, // Service unavailable - signals to use fallback
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
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
