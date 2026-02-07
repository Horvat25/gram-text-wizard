import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * High-Quality Neural TTS with smart fallback
 * 
 * Priority:
 * 1. ElevenLabs (Best quality, you have API key!)
 * 2. Google Translate TTS (reliable fallback)
 */

interface VoiceConfig {
  name: string;
  elevenLabsVoiceId: string;
  lang: string;
}

// ElevenLabs voice IDs - Brazilian Portuguese voices
const VOICES: Record<string, VoiceConfig> = {
  // Female voices
  "camila": { name: "Camila", elevenLabsVoiceId: "EXAVITQu4vr4xnSDxMaL", lang: "pt-BR" }, // Bella - works well with Portuguese
  "francisca": { name: "Francisca", elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM", lang: "pt-BR" }, // Rachel
  "vitoria": { name: "Vitória", elevenLabsVoiceId: "AZnzlk1XvdvUeBnXmlld", lang: "pt-BR" }, // Domi
  "leticia": { name: "Letícia", elevenLabsVoiceId: "MF3mGyEYCl7XYWbV9V6O", lang: "pt-BR" }, // Elli
  
  // Male voices
  "antonio": { name: "Antonio", elevenLabsVoiceId: "VR6AewLTigWG4xSOukaG", lang: "pt-BR" }, // Arnold
  "ricardo": { name: "Ricardo", elevenLabsVoiceId: "pNInz6obpgDQGcFmaJgB", lang: "pt-BR" }, // Adam
  "thiago": { name: "Thiago", elevenLabsVoiceId: "yoZ06aMxZJJ28mfd3POQ", lang: "pt-BR" }, // Sam
  
  // English fallbacks
  "matthew": { name: "Matthew", elevenLabsVoiceId: "VR6AewLTigWG4xSOukaG", lang: "en-US" },
  "joanna": { name: "Joanna", elevenLabsVoiceId: "EXAVITQu4vr4xnSDxMaL", lang: "en-US" },
};

const DEFAULT_VOICE = "camila";

/**
 * Generate speech using ElevenLabs API (Best quality!)
 */
async function generateElevenLabsTTS(text: string, voiceKey: string, apiKey: string): Promise<Uint8Array> {
  const voice = VOICES[voiceKey] || VOICES[DEFAULT_VOICE];
  console.log(`[EdgeTTS] Using ElevenLabs voice: ${voice.name} (${voice.elevenLabsVoiceId})`);
  
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.elevenLabsVoiceId}`,
    {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_multilingual_v2", // Best for Portuguese
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
    console.error(`[EdgeTTS] ElevenLabs error: ${response.status} - ${errorText}`);
    throw new Error(`ElevenLabs error: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  console.log(`[EdgeTTS] ✅ ElevenLabs success! Size: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);
  
  return new Uint8Array(audioBuffer);
}

/**
 * Google Translate TTS (reliable fallback)
 */
async function generateGoogleTTS(text: string, lang: string = "pt-BR"): Promise<Uint8Array> {
  console.log(`[EdgeTTS] Using Google Translate TTS (lang: ${lang})`);
  
  const chunks: Uint8Array[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) continue;
    
    const maxLen = 180;
    const parts = trimmed.length > maxLen 
      ? trimmed.match(new RegExp(`.{1,${maxLen}}(\\s|$)`, 'g')) || [trimmed]
      : [trimmed];
    
    for (const part of parts) {
      const cleanPart = part.trim();
      if (!cleanPart) continue;
      
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanPart)}&tl=${lang}&client=tw-ob`;
      
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          chunks.push(new Uint8Array(buffer));
        }
      } catch (e) {
        console.warn(`[EdgeTTS] Google TTS chunk failed:`, e);
      }
      
      await new Promise(r => setTimeout(r, 150));
    }
  }
  
  if (chunks.length === 0) {
    throw new Error("Google TTS failed to generate any audio");
  }
  
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const audioData = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    audioData.set(chunk, offset);
    offset += chunk.length;
  }
  
  console.log(`[EdgeTTS] ✅ Google TTS success! Size: ${(audioData.length / 1024).toFixed(1)}KB`);
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

    const voiceKey = (voice || DEFAULT_VOICE).toLowerCase();
    const voiceConfig = VOICES[voiceKey] || VOICES[DEFAULT_VOICE];
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    
    console.log(`[EdgeTTS] Request: "${text.substring(0, 80)}..."`);
    console.log(`[EdgeTTS] Voice: ${voiceKey}, Lang: ${voiceConfig.lang}`);
    console.log(`[EdgeTTS] Text length: ${text.length} chars`);
    console.log(`[EdgeTTS] ElevenLabs API key available: ${!!ELEVENLABS_API_KEY}`);

    let audioData: Uint8Array | null = null;
    let usedProvider = "unknown";
    
    // Try ElevenLabs first (BEST quality!)
    if (ELEVENLABS_API_KEY) {
      try {
        audioData = await generateElevenLabsTTS(text, voiceKey, ELEVENLABS_API_KEY);
        usedProvider = "ElevenLabs Neural";
      } catch (elevenError: any) {
        console.warn(`[EdgeTTS] ElevenLabs failed: ${elevenError.message}`);
      }
    }
    
    // Fallback to Google TTS
    if (!audioData) {
      try {
        audioData = await generateGoogleTTS(text, voiceConfig.lang);
        usedProvider = "Google";
      } catch (googleError: any) {
        console.error(`[EdgeTTS] Google TTS also failed!`);
        throw new Error("All TTS providers failed");
      }
    }
    
    if (!audioData || audioData.length === 0) {
      throw new Error("No audio data generated");
    }
    
    const base64Audio = base64Encode(audioData);
    
    console.log(`[EdgeTTS] ✅ Success with ${usedProvider}! Size: ${(audioData.length / 1024).toFixed(1)}KB`);

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "mp3",
        voice: voiceKey,
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
