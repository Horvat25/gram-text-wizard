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
    const { text, voice } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY não configurada");
    }

    if (!text) {
      throw new Error("Texto é obrigatório");
    }

    console.log("Generating TTS for text:", text.substring(0, 100) + "...");
    console.log("Voice:", voice || "alloy");

    // OpenAI TTS voices: alloy, echo, fable, onyx, nova, shimmer
    const selectedVoice = voice || "alloy";

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: selectedVoice,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI TTS error:", response.status, errorText);
      
      // Return error in body with 200 status so client can handle gracefully
      return new Response(
        JSON.stringify({ 
          error: `OpenAI TTS error: ${response.status}`,
          status: response.status,
          retryable: response.status === 429,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    
    // Use Deno's base64 encoder (safer for large buffers)
    const base64Audio = base64Encode(audioBuffer);

    console.log("OpenAI TTS generated successfully, audio size:", audioBuffer.byteLength, "base64 length:", base64Audio.length);

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: "mp3",
        duration_estimate: Math.ceil(text.length / 15),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in openai-tts:", error);
    // Return error in body with 200 status for graceful handling
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar narração" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
