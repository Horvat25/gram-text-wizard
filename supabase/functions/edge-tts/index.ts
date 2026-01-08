import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Free TTS using Streamlabs Polly API (neural voices)
 * High quality voices, no API key required
 */

interface VoiceConfig {
  name: string;
  pollyVoice: string;
  lang: string;
  gender: string;
}

// Mapping to Amazon Polly neural voices via Streamlabs
const VOICES: Record<string, VoiceConfig> = {
  // Brazilian Portuguese - Neural voices
  "antonio": { name: "Thiago", pollyVoice: "Thiago", lang: "pt-BR", gender: "Male" },
  "francisca": { name: "Camila", pollyVoice: "Camila", lang: "pt-BR", gender: "Female" },
  "vitoria": { name: "Vitoria", pollyVoice: "Vitoria", lang: "pt-BR", gender: "Female" },
  // English
  "matthew": { name: "Matthew", pollyVoice: "Matthew", lang: "en-US", gender: "Male" },
  "joanna": { name: "Joanna", pollyVoice: "Joanna", lang: "en-US", gender: "Female" },
  "brian": { name: "Brian", pollyVoice: "Brian", lang: "en-GB", gender: "Male" },
};

const DEFAULT_VOICE = "antonio";

/**
 * Generate speech using Streamlabs Polly API (free, high quality)
 */
async function generatePollyTTS(text: string, voiceKey: string = DEFAULT_VOICE): Promise<Uint8Array> {
  const voice = VOICES[voiceKey] || VOICES[DEFAULT_VOICE];
  
  console.log(`[EdgeTTS] Using Polly voice: ${voice.pollyVoice}`);
  console.log(`[EdgeTTS] Text length: ${text.length} chars`);
  
  // Streamlabs Polly API - free and high quality
  const response = await fetch("https://streamlabs.com/polly/speak", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: JSON.stringify({
      text: text,
      voice: voice.pollyVoice,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[EdgeTTS] Polly API error: ${response.status} - ${errorText}`);
    throw new Error(`Polly API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.speak_url) {
    throw new Error("No audio URL in response");
  }

  console.log(`[EdgeTTS] Got audio URL, downloading...`);
  
  // Download the audio file
  const audioResponse = await fetch(data.speak_url);
  
  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio: ${audioResponse.status}`);
  }

  const audioBuffer = await audioResponse.arrayBuffer();
  console.log(`[EdgeTTS] Downloaded ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);
  
  return new Uint8Array(audioBuffer);
}

/**
 * Fallback: Use VoiceRSS API (also free tier available)
 */
async function generateVoiceRSSTTS(text: string, lang: string = "pt-br"): Promise<Uint8Array> {
  console.log(`[EdgeTTS] Fallback to VoiceRSS`);
  
  // VoiceRSS has a free tier - this is a demo key
  const params = new URLSearchParams({
    key: "f16d908cfc664ad7a5b13a89f4de84a4", // Free demo key
    src: text,
    hl: lang,
    v: "Luciana", // Brazilian Portuguese voice
    c: "MP3",
    f: "44khz_16bit_stereo",
  });

  const response = await fetch(`https://api.voicerss.org/?${params.toString()}`);
  
  if (!response.ok) {
    throw new Error(`VoiceRSS error: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text")) {
    const errorText = await response.text();
    throw new Error(`VoiceRSS error: ${errorText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  return new Uint8Array(audioBuffer);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice, rate } = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[EdgeTTS] Request: ${text.substring(0, 80)}...`);
    console.log(`[EdgeTTS] Voice: ${voice || DEFAULT_VOICE}`);

    let audioData: Uint8Array;
    
    try {
      // Try Streamlabs Polly first
      audioData = await generatePollyTTS(text, voice || DEFAULT_VOICE);
    } catch (pollyError) {
      console.error(`[EdgeTTS] Polly failed:`, pollyError);
      
      // Fallback to Google Translate TTS
      console.log(`[EdgeTTS] Falling back to Google TTS`);
      const chunks: Uint8Array[] = [];
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length === 0) continue;
        
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(trimmed)}&tl=pt-BR&client=tw-ob`;
        
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          chunks.push(new Uint8Array(buffer));
        }
      }
      
      if (chunks.length === 0) {
        throw new Error("All TTS methods failed");
      }
      
      // Concatenate
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      audioData = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        audioData.set(chunk, offset);
        offset += chunk.length;
      }
    }
    
    if (audioData.length === 0) {
      throw new Error("No audio data generated");
    }
    
    const base64Audio = base64Encode(new Uint8Array(audioData).buffer as ArrayBuffer);
    
    console.log(`[EdgeTTS] Success! Size: ${(audioData.length / 1024).toFixed(1)}KB`);

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "mp3",
        voice: voice || DEFAULT_VOICE,
        duration_estimate: Math.ceil(text.length / 14),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[EdgeTTS] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate audio" }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
