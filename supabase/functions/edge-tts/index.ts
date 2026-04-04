import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * TTS — ElevenLabs Sarah ONLY (sem fallbacks)
 * Voz: Sarah (EXAVITQu4vr4xnSDxMaL) — eleven_multilingual_v2
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanedText = prepareTextForTTS(text);
    console.log(`[TTS] Request: ${cleanedText.length} chars — ElevenLabs Sarah ONLY`);

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY not configured. Please add credits and set the key." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let audioData: Uint8Array;
    try {
      audioData = await generateElevenLabs(cleanedText, ELEVENLABS_API_KEY);
      console.log(`[TTS] ✅ ElevenLabs Sarah success! ${(audioData.length / 1024).toFixed(1)}KB`);
    } catch (e: any) {
      console.error(`[TTS] ❌ ElevenLabs failed: ${e.message}`);
      return new Response(
        JSON.stringify({ error: `ElevenLabs failed: ${e.message}. Check credits at elevenlabs.io` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const base64Audio = base64Encode(audioData);

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "mp3",
        voice: "Sarah",
        provider: "ElevenLabs Neural",
        duration_estimate: Math.ceil(cleanedText.length / 14),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[TTS] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate audio" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ========== ElevenLabs Sarah ==========

async function generateElevenLabs(text: string, apiKey: string): Promise<Uint8Array> {
  const voiceId = "EXAVITQu4vr4xnSDxMaL"; // Sarah

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs ${response.status}: ${errorText.substring(0, 200)}`);
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

// ========== HELPERS ==========

function prepareTextForTTS(text: string): string {
  return text
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, '')
    .replace(/[""'']/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/…/g, '...')
    .replace(/[#@]/g, '')
    .replace(/\bR\$/g, 'reais ')
    .replace(/\bUS\$/g, 'dólares ')
    .replace(/(\d+)%/g, '$1 por cento')
    .replace(/(\d+)k/gi, '$1 mil')
    .replace(/(\d+)M/g, '$1 milhões')
    .replace(/(\d+)B/g, '$1 bilhões')
    .trim();
}
