import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Free TTS using VoiceRSS API (neural voices, actually free!)
 * Much better quality than Google Translate TTS
 */

interface VoiceConfig {
  name: string;
  voiceRSSVoice: string;
  lang: string;
  gender: string;
}

// VoiceRSS Brazilian Portuguese voices - natural neural quality
const VOICES: Record<string, VoiceConfig> = {
  // Brazilian Portuguese - Female (natural, not robotic)
  "camila": { name: "Camila", voiceRSSVoice: "Luciana", lang: "pt-br", gender: "Female" },
  "vitoria": { name: "Vitória", voiceRSSVoice: "Luciana", lang: "pt-br", gender: "Female" },
  "francisca": { name: "Francisca", voiceRSSVoice: "Luciana", lang: "pt-br", gender: "Female" },
  // Brazilian Portuguese - Male
  "thiago": { name: "Thiago", voiceRSSVoice: "Luciana", lang: "pt-br", gender: "Male" },
  "ricardo": { name: "Ricardo", voiceRSSVoice: "Luciana", lang: "pt-br", gender: "Male" },
  "antonio": { name: "Antonio", voiceRSSVoice: "Luciana", lang: "pt-br", gender: "Male" },
  // Portuguese Portugal
  "fernanda": { name: "Fernanda", voiceRSSVoice: "Luciana", lang: "pt-br", gender: "Female" },
  // English voices
  "matthew": { name: "Matthew", voiceRSSVoice: "John", lang: "en-us", gender: "Male" },
  "joanna": { name: "Joanna", voiceRSSVoice: "Mary", lang: "en-us", gender: "Female" },
  "brian": { name: "Brian", voiceRSSVoice: "John", lang: "en-gb", gender: "Male" },
};

const DEFAULT_VOICE = "camila";

// VoiceRSS API Key (free tier - 350 requests/day)
const VOICERSS_API_KEY = "f16d908cfc664ad7a5b13a89f4de84a4";

/**
 * Generate speech using VoiceRSS API (free, neural quality)
 */
async function generateVoiceRSSTTS(text: string, voiceKey: string = DEFAULT_VOICE): Promise<Uint8Array> {
  const voice = VOICES[voiceKey] || VOICES[DEFAULT_VOICE];
  
  console.log(`[EdgeTTS] Using VoiceRSS voice: ${voice.voiceRSSVoice} (${voice.lang})`);
  console.log(`[EdgeTTS] Text length: ${text.length} chars`);
  
  const params = new URLSearchParams({
    key: VOICERSS_API_KEY,
    src: text,
    hl: voice.lang,
    v: voice.voiceRSSVoice,
    c: "MP3",
    f: "44khz_16bit_stereo",
    r: "0", // Normal speed
  });

  const response = await fetch(`https://api.voicerss.org/?${params.toString()}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[EdgeTTS] VoiceRSS error: ${response.status} - ${errorText}`);
    throw new Error(`VoiceRSS error: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  
  // VoiceRSS returns text/plain on error
  if (contentType.includes("text")) {
    const errorText = await response.text();
    console.error(`[EdgeTTS] VoiceRSS returned text error: ${errorText}`);
    throw new Error(`VoiceRSS error: ${errorText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  console.log(`[EdgeTTS] VoiceRSS success! Size: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);
  
  return new Uint8Array(audioBuffer);
}

/**
 * Fallback: ResponsiveVoice API (also free, decent quality)
 */
async function generateResponsiveVoiceTTS(text: string, lang: string = "pt-BR"): Promise<Uint8Array> {
  console.log(`[EdgeTTS] Fallback to ResponsiveVoice...`);
  
  const params = new URLSearchParams({
    text: text,
    lang: "Brazilian Portuguese Female",
    pitch: "0.5",
    rate: "0.5",
    vol: "1",
    key: "qlsXP1Ow", // Public demo key
  });

  const url = `https://texttospeech.responsivevoice.org/v1/text:synthesize?${params.toString()}`;
  
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  
  if (!response.ok) {
    throw new Error(`ResponsiveVoice error: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  console.log(`[EdgeTTS] ResponsiveVoice success! Size: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);
  
  return new Uint8Array(audioBuffer);
}

/**
 * Last resort: Google Translate TTS (more robotic but always works)
 */
async function generateGoogleTTS(text: string): Promise<Uint8Array> {
  console.log(`[EdgeTTS] Last fallback: Google Translate TTS`);
  
  const chunks: Uint8Array[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) continue;
    
    // Split long sentences
    const maxLen = 180;
    const parts = trimmed.length > maxLen 
      ? trimmed.match(new RegExp(`.{1,${maxLen}}(\\s|$)`, 'g')) || [trimmed]
      : [trimmed];
    
    for (const part of parts) {
      const cleanPart = part.trim();
      if (!cleanPart) continue;
      
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanPart)}&tl=pt-BR&client=tw-ob`;
      
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
  }
  
  if (chunks.length === 0) {
    throw new Error("Google TTS failed to generate any audio");
  }
  
  // Concatenate all chunks
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const audioData = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    audioData.set(chunk, offset);
    offset += chunk.length;
  }
  
  console.log(`[EdgeTTS] Google TTS success! Size: ${(audioData.length / 1024).toFixed(1)}KB`);
  return audioData;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice } = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[EdgeTTS] Request: "${text.substring(0, 80)}..."`);
    console.log(`[EdgeTTS] Voice requested: ${voice || DEFAULT_VOICE}`);

    let audioData: Uint8Array;
    let usedProvider = "unknown";
    
    // Try VoiceRSS first (best quality)
    try {
      audioData = await generateVoiceRSSTTS(text, voice || DEFAULT_VOICE);
      usedProvider = "VoiceRSS";
    } catch (voiceRSSError) {
      console.error(`[EdgeTTS] VoiceRSS failed:`, voiceRSSError);
      
      // Try ResponsiveVoice next
      try {
        audioData = await generateResponsiveVoiceTTS(text);
        usedProvider = "ResponsiveVoice";
      } catch (rvError) {
        console.error(`[EdgeTTS] ResponsiveVoice failed:`, rvError);
        
        // Last resort: Google TTS
        try {
          audioData = await generateGoogleTTS(text);
          usedProvider = "Google";
        } catch (googleError) {
          console.error(`[EdgeTTS] Google TTS failed:`, googleError);
          throw new Error("All TTS providers failed");
        }
      }
    }
    
    if (audioData.length === 0) {
      throw new Error("No audio data generated");
    }
    
    const base64Audio = base64Encode(new Uint8Array(audioData).buffer as ArrayBuffer);
    
    console.log(`[EdgeTTS] ✅ Success with ${usedProvider}! Size: ${(audioData.length / 1024).toFixed(1)}KB`);

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "mp3",
        voice: voice || DEFAULT_VOICE,
        provider: usedProvider,
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
