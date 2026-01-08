import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * FREE TTS using StreamElements (Amazon Polly voices)
 * 
 * Portuguese Brazilian voices available:
 * - Camila (female, neural) - Natural and warm
 * - Vitoria (female, standard) - Clear and professional
 * - Ricardo (male, standard) - Deep and authoritative
 */

// Map our voice IDs to StreamElements/Polly voices
const VOICE_MAPPING: Record<string, string> = {
  // Female voices
  "camila": "Camila",      // Neural, warm (best quality)
  "vitoria": "Vitoria",    // Standard, clear
  "fernanda": "Camila",    // Map to Camila
  // Male voices
  "thiago": "Ricardo",     // Standard male
  "ricardo": "Ricardo",    // Standard male
  // Fallback
  "default": "Camila",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Texto é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map voice to Polly voice
    const requestedVoice = voice || "camila";
    const pollyVoice = VOICE_MAPPING[requestedVoice] || VOICE_MAPPING["default"];
    
    console.log(`[TTS] Voice: ${requestedVoice} -> Polly: ${pollyVoice}`);
    console.log(`[TTS] Text length: ${text.length} chars`);

    // Use StreamElements API (free Amazon Polly)
    const encodedText = encodeURIComponent(text);
    const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${pollyVoice}&text=${encodedText}`;
    
    console.log(`[TTS] Calling StreamElements API...`);
    
    const response = await fetch(ttsUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TTS] StreamElements Error: ${response.status} - ${errorText}`);
      
      // Fallback to Google Translate TTS
      console.log(`[TTS] Trying Google TTS fallback...`);
      return await googleTTSFallback(text, corsHeaders);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioArray = new Uint8Array(audioBuffer);
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < audioArray.length; i++) {
      binary += String.fromCharCode(audioArray[i]);
    }
    const base64Audio = btoa(binary);

    console.log(`[TTS] ✅ Success! Size: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: "mp3",
        voice: requestedVoice,
        pollyVoice: pollyVoice,
        duration_estimate: Math.ceil(text.length / 15),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[TTS] Error:", error);
    
    // Try Google TTS as ultimate fallback
    try {
      const { text } = await req.clone().json();
      if (text) {
        return await googleTTSFallback(text, corsHeaders);
      }
    } catch {}
    
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar narração" }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

async function googleTTSFallback(text: string, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    // Split text into chunks (Google TTS has a limit)
    const maxLength = 200;
    const chunks: string[] = [];
    
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }
      
      // Find a good break point
      let breakPoint = remaining.lastIndexOf('.', maxLength);
      if (breakPoint === -1) breakPoint = remaining.lastIndexOf(' ', maxLength);
      if (breakPoint === -1) breakPoint = maxLength;
      
      chunks.push(remaining.substring(0, breakPoint + 1));
      remaining = remaining.substring(breakPoint + 1).trim();
    }
    
    console.log(`[TTS] Google fallback: ${chunks.length} chunks`);
    
    // Get audio for each chunk
    const audioChunks: Uint8Array[] = [];
    
    for (const chunk of chunks) {
      const encodedChunk = encodeURIComponent(chunk);
      const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-BR&client=tw-ob&q=${encodedChunk}`;
      
      const response = await fetch(googleUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        audioChunks.push(new Uint8Array(buffer));
      }
    }
    
    if (audioChunks.length === 0) {
      throw new Error("No audio generated");
    }
    
    // Combine all chunks
    const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < combined.length; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    const base64Audio = btoa(binary);
    
    console.log(`[TTS] ✅ Google fallback success! Size: ${(combined.length / 1024).toFixed(1)}KB`);
    
    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: "mp3",
        voice: "google",
        duration_estimate: Math.ceil(text.length / 15),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[TTS] Google fallback error:", error);
    throw error;
  }
}
