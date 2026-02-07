import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Free TTS using Microsoft Azure Edge Neural Voices
 * These are the SAME voices used by Microsoft Edge browser - high quality, natural sounding!
 * 
 * Free alternatives with neural quality:
 * 1. Microsoft Edge TTS (via edge-tts Python library API proxy)
 * 2. StreamElements (uses Amazon Polly under the hood)
 * 3. Google Translate TTS (last resort)
 */

interface VoiceConfig {
  name: string;
  msVoice: string;  // Microsoft Edge voice name
  pollyVoice: string; // Amazon Polly voice for StreamElements fallback
  lang: string;
}

// Microsoft Edge TTS voices - Brazilian Portuguese (EXCELLENT quality!)
const VOICES: Record<string, VoiceConfig> = {
  // Brazilian Portuguese - Female (most natural)
  "camila": { name: "Camila", msVoice: "pt-BR-FranciscaNeural", pollyVoice: "Camila", lang: "pt-BR" },
  "francisca": { name: "Francisca", msVoice: "pt-BR-FranciscaNeural", pollyVoice: "Camila", lang: "pt-BR" },
  "vitoria": { name: "Vitória", msVoice: "pt-BR-FranciscaNeural", pollyVoice: "Vitoria", lang: "pt-BR" },
  "leticia": { name: "Letícia", msVoice: "pt-BR-LeticiaNeural", pollyVoice: "Camila", lang: "pt-BR" },
  "manuela": { name: "Manuela", msVoice: "pt-BR-ManuelaNeural", pollyVoice: "Camila", lang: "pt-BR" },
  "yara": { name: "Yara", msVoice: "pt-BR-YaraNeural", pollyVoice: "Camila", lang: "pt-BR" },
  "elza": { name: "Elza", msVoice: "pt-BR-ElzaNeural", pollyVoice: "Camila", lang: "pt-BR" },
  "brenda": { name: "Brenda", msVoice: "pt-BR-BrendaNeural", pollyVoice: "Camila", lang: "pt-BR" },
  // Brazilian Portuguese - Male
  "antonio": { name: "Antonio", msVoice: "pt-BR-AntonioNeural", pollyVoice: "Ricardo", lang: "pt-BR" },
  "ricardo": { name: "Ricardo", msVoice: "pt-BR-AntonioNeural", pollyVoice: "Ricardo", lang: "pt-BR" },
  "thiago": { name: "Thiago", msVoice: "pt-BR-AntonioNeural", pollyVoice: "Ricardo", lang: "pt-BR" },
  "fábio": { name: "Fábio", msVoice: "pt-BR-FabioNeural", pollyVoice: "Ricardo", lang: "pt-BR" },
  "humberto": { name: "Humberto", msVoice: "pt-BR-HumbertoNeural", pollyVoice: "Ricardo", lang: "pt-BR" },
  "julio": { name: "Julio", msVoice: "pt-BR-JulioNeural", pollyVoice: "Ricardo", lang: "pt-BR" },
  "nicolau": { name: "Nicolau", msVoice: "pt-BR-NicolauNeural", pollyVoice: "Ricardo", lang: "pt-BR" },
  // English
  "matthew": { name: "Matthew", msVoice: "en-US-GuyNeural", pollyVoice: "Matthew", lang: "en-US" },
  "joanna": { name: "Joanna", msVoice: "en-US-JennyNeural", pollyVoice: "Joanna", lang: "en-US" },
};

const DEFAULT_VOICE = "camila";

/**
 * Get Microsoft Edge TTS authorization token
 * This is the same method Edge browser uses!
 */
async function getEdgeToken(): Promise<{ token: string; region: string }> {
  const response = await fetch(
    "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0",
    {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get Edge token: ${response.status}`);
  }

  const data = await response.json();
  return {
    token: data.t || data.accessToken,
    region: data.r || "eastus",
  };
}

/**
 * Generate speech using Microsoft Edge TTS (real neural voices, FREE!)
 */
async function generateMicrosoftEdgeTTS(text: string, voiceKey: string): Promise<Uint8Array> {
  const voice = VOICES[voiceKey] || VOICES[DEFAULT_VOICE];
  console.log(`[EdgeTTS] Using Microsoft voice: ${voice.msVoice}`);
  
  // Get auth token
  const { token, region } = await getEdgeToken();
  
  // Build SSML for natural speech
  const ssml = `
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.lang}">
      <voice name="${voice.msVoice}">
        <prosody rate="0%" pitch="0%">
          ${escapeXml(text)}
        </prosody>
      </voice>
    </speak>
  `.trim();

  const ttsUrl = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  
  const response = await fetch(ttsUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: ssml,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[EdgeTTS] Microsoft TTS error: ${response.status} - ${errorText}`);
    throw new Error(`Microsoft TTS error: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  console.log(`[EdgeTTS] ✅ Microsoft Edge TTS success! Size: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);
  
  return new Uint8Array(audioBuffer);
}

/**
 * Fallback: StreamElements TTS (uses Amazon Polly - also high quality neural voices)
 */
async function generateStreamElementsTTS(text: string, voiceKey: string): Promise<Uint8Array> {
  const voice = VOICES[voiceKey] || VOICES[DEFAULT_VOICE];
  console.log(`[EdgeTTS] Fallback to StreamElements Polly voice: ${voice.pollyVoice}`);
  
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice.pollyVoice}&text=${encodeURIComponent(text)}`;
  
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "audio/mpeg",
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[EdgeTTS] StreamElements error: ${response.status} - ${errorText}`);
    throw new Error(`StreamElements error: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  console.log(`[EdgeTTS] ✅ StreamElements Polly success! Size: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);
  
  return new Uint8Array(audioBuffer);
}

/**
 * Last resort: Google Translate TTS (robotic but always works)
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
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
    console.log(`[EdgeTTS] Request: "${text.substring(0, 80)}..."`);
    console.log(`[EdgeTTS] Voice requested: ${voiceKey}`);
    console.log(`[EdgeTTS] Text length: ${text.length} chars`);

    let audioData: Uint8Array;
    let usedProvider = "unknown";
    
    // Try Microsoft Edge TTS first (BEST quality - same as Edge browser)
    try {
      audioData = await generateMicrosoftEdgeTTS(text, voiceKey);
      usedProvider = "Microsoft Edge Neural";
    } catch (msError: any) {
      console.error(`[EdgeTTS] Microsoft Edge TTS failed: ${msError.message}`);
      
      // Try StreamElements (Amazon Polly) next
      try {
        audioData = await generateStreamElementsTTS(text, voiceKey);
        usedProvider = "Amazon Polly";
      } catch (seError: any) {
        console.error(`[EdgeTTS] StreamElements failed: ${seError.message}`);
        
        // Last resort: Google TTS
        try {
          audioData = await generateGoogleTTS(text);
          usedProvider = "Google";
        } catch (googleError: any) {
          console.error(`[EdgeTTS] All providers failed!`);
          throw new Error("All TTS providers failed");
        }
      }
    }
    
    if (audioData.length === 0) {
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
