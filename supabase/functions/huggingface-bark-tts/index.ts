import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Neural TTS for Technology Content
 * 
 * Uses Microsoft Edge TTS for high-quality neural voices
 * Fallback to Google TTS if Edge fails
 * 
 * Tech Voice Options:
 * - pt-BR-AntonioNeural: Male, professional, authoritative (RECOMMENDED)
 * - pt-BR-FranciscaNeural: Female, warm, engaging
 * - pt-BR-ThalitaNeural: Female, young, dynamic
 * - pt-BR-GiovannaNeural: Female, news anchor style
 */

const MAX_CHUNK_SIZE = 200;
const TIMEOUT_MS = 15000;

interface TTSRequest {
  text: string;
  voice?: string;
  language?: string;
}

// Microsoft Edge TTS voices for technology content
const EDGE_VOICES: Record<string, string> = {
  // Male voices - professional tech
  "antonio": "pt-BR-AntonioNeural",
  "tech_male": "pt-BR-AntonioNeural",
  "professional": "pt-BR-AntonioNeural",
  
  // Female voices
  "francisca": "pt-BR-FranciscaNeural", 
  "thalita": "pt-BR-ThalitaNeural",
  "giovanna": "pt-BR-GiovannaNeural",
  "tech_female": "pt-BR-FranciscaNeural",
  
  // Default
  "default": "pt-BR-AntonioNeural", // Tech-focused male voice
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice = "tech_male", language = "pt-BR" }: TTSRequest = await req.json();

    console.log("[TTS-Neural] ========== INICIADO ==========");
    console.log(`[TTS-Neural] Texto: ${text?.length || 0} chars`);
    console.log(`[TTS-Neural] Voz: ${voice}`);

    if (!text || text.trim().length === 0) {
      console.error("[TTS-Neural] ❌ Texto vazio");
      return new Response(
        JSON.stringify({ 
          tts_status: "failed",
          error: "Texto é obrigatório",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean text for TTS
    const cleanedText = cleanTextForTTS(text);
    console.log(`[TTS-Neural] Texto limpo: ${cleanedText.length} chars`);

    // Try Microsoft Edge TTS first (neural, high quality)
    let audioData: Uint8Array | null = null;
    let usedProvider = "unknown";
    
    const edgeVoice = EDGE_VOICES[voice.toLowerCase()] || EDGE_VOICES["default"];
    
    try {
      console.log(`[TTS-Neural] Tentando Edge TTS com voz: ${edgeVoice}`);
      audioData = await generateEdgeTTS(cleanedText, edgeVoice, TIMEOUT_MS);
      usedProvider = "Microsoft Edge Neural";
      console.log(`[TTS-Neural] ✅ Edge TTS sucesso! Size: ${(audioData.length / 1024).toFixed(1)}KB`);
    } catch (edgeError: any) {
      console.warn(`[TTS-Neural] Edge TTS falhou: ${edgeError.message}`);
      
      // Fallback to Google TTS
      try {
        console.log(`[TTS-Neural] Fallback para Google TTS...`);
        audioData = await generateGoogleTTS(cleanedText, language, TIMEOUT_MS);
        usedProvider = "Google TTS";
        console.log(`[TTS-Neural] ✅ Google TTS sucesso! Size: ${(audioData.length / 1024).toFixed(1)}KB`);
      } catch (googleError: any) {
        console.error(`[TTS-Neural] ❌ Google TTS também falhou: ${googleError.message}`);
        return new Response(
          JSON.stringify({ 
            tts_status: "failed",
            error: "Todos os provedores TTS falharam",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!audioData || audioData.length === 0) {
      return new Response(
        JSON.stringify({ 
          tts_status: "failed",
          error: "Nenhum áudio gerado",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const base64Audio = base64Encode(audioData);
    
    console.log(`[TTS-Neural] ✅ SUCESSO! Provider: ${usedProvider}, Size: ${(audioData.length / 1024).toFixed(1)}KB`);
    console.log("[TTS-Neural] ========== FINALIZADO ==========");

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "mp3",
        tts_status: "success",
        model: usedProvider,
        voice: edgeVoice,
        size_kb: (audioData.length / 1024).toFixed(1),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[TTS-Neural] ❌ FALHOU:", error.message);
    console.log("[TTS-Neural] → Seguir sem voz");
    
    return new Response(
      JSON.stringify({ 
        tts_status: "failed",
        error: error.message || "Erro desconhecido",
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

/**
 * Clean text for TTS
 */
function cleanTextForTTS(text: string): string {
  return text
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, '') // Remove emojis
    .replace(/[""'']/g, '"') // Normalize quotes
    .replace(/\s+/g, ' ') // Remove extra spaces
    .replace(/…/g, '...') // Normalize ellipsis
    .replace(/[#@]/g, '') // Remove hashtags and mentions
    .trim();
}

/**
 * Split text into chunks respecting punctuation
 */
function splitTextIntoChunks(text: string, maxSize: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  let currentChunk = "";
  
  for (const sentence of sentences) {
    if ((currentChunk + " " + sentence).trim().length <= maxSize) {
      currentChunk = (currentChunk + " " + sentence).trim();
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      
      if (sentence.length > maxSize) {
        const words = sentence.split(" ");
        currentChunk = "";
        for (const word of words) {
          if ((currentChunk + " " + word).trim().length <= maxSize) {
            currentChunk = (currentChunk + " " + word).trim();
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = word;
          }
        }
      } else {
        currentChunk = sentence;
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks.filter(c => c.length > 0);
}

/**
 * Microsoft Edge TTS (high quality neural voices)
 */
async function generateEdgeTTS(
  text: string, 
  voice: string,
  timeoutMs: number
): Promise<Uint8Array> {
  const chunks = splitTextIntoChunks(text, MAX_CHUNK_SIZE);
  const audioBuffers: Uint8Array[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[Edge TTS] Chunk ${i + 1}/${chunks.length}: "${chunk.substring(0, 30)}..."`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      // Use a public Edge TTS endpoint
      const url = `https://api.tts.quest/v1/speak?text=${encodeURIComponent(chunk)}&voice=${encodeURIComponent(voice)}`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Edge TTS error: ${response.status}`);
      }
      
      const buffer = await response.arrayBuffer();
      audioBuffers.push(new Uint8Array(buffer));
      
      // Small delay between chunks
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 100));
      }
      
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === "AbortError") {
        throw new Error("Edge TTS timeout");
      }
      throw error;
    }
  }
  
  // Concatenate all buffers
  const totalSize = audioBuffers.reduce((acc, buf) => acc + buf.length, 0);
  const combinedBuffer = new Uint8Array(totalSize);
  let offset = 0;
  
  for (const buffer of audioBuffers) {
    combinedBuffer.set(buffer, offset);
    offset += buffer.length;
  }
  
  return combinedBuffer;
}

/**
 * Google Translate TTS (fallback)
 */
async function generateGoogleTTS(
  text: string, 
  language: string,
  timeoutMs: number
): Promise<Uint8Array> {
  const chunks = splitTextIntoChunks(text, MAX_CHUNK_SIZE);
  const audioBuffers: Uint8Array[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[Google TTS] Chunk ${i + 1}/${chunks.length}: "${chunk.substring(0, 30)}..."`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const encodedText = encodeURIComponent(chunk);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${language}&client=tw-ob`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "audio/mpeg",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Google TTS error: ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";
      
      if (!contentType.includes("audio")) {
        throw new Error("Response is not audio");
      }

      const buffer = await response.arrayBuffer();
      audioBuffers.push(new Uint8Array(buffer));
      
      // Small delay between chunks
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 150));
      }

    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === "AbortError") {
        throw new Error("Google TTS timeout");
      }
      
      throw error;
    }
  }
  
  // Concatenate all buffers
  const totalSize = audioBuffers.reduce((acc, buf) => acc + buf.length, 0);
  const combinedBuffer = new Uint8Array(totalSize);
  let offset = 0;
  
  for (const buffer of audioBuffers) {
    combinedBuffer.set(buffer, offset);
    offset += buffer.length;
  }
  
  return combinedBuffer;
}
