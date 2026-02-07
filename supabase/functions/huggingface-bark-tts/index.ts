import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * TTS Neural - ÚNICA ENGINE (Google Translate TTS)
 * 
 * Por que Google TTS:
 * - Bark/HuggingFace: endpoints migraram, 404 em todos os modelos
 * - ElevenLabs: quota esgotada (86/10000 créditos)
 * 
 * Regras (conforme prompt definitivo):
 * - Única tentativa
 * - Timeout: 10 segundos por chunk
 * - Chunking: 200 chars por chunk
 * - Se falhar → tts_status: "failed", vídeo continua só com trilha
 * - Sem fallback, sem retry
 */

const MAX_CHUNK_SIZE = 200;
const TIMEOUT_MS = 10000;

interface TTSRequest {
  text: string;
  voice?: string;
  language?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, language = "pt-BR" }: TTSRequest = await req.json();

    console.log("[TTS] ========== INICIADO ==========");
    console.log(`[TTS] Texto: ${text?.length || 0} chars`);
    console.log(`[TTS] Idioma: ${language}`);

    if (!text || text.trim().length === 0) {
      console.error("[TTS] ❌ Texto vazio");
      return new Response(
        JSON.stringify({ 
          tts_status: "failed",
          error: "Texto é obrigatório",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limpar texto
    const cleanedText = cleanTextForTTS(text);
    console.log(`[TTS] Texto limpo: ${cleanedText.length} chars`);

    // Chunking do texto
    const chunks = splitTextIntoChunks(cleanedText, MAX_CHUNK_SIZE);
    console.log(`[TTS] Chunks: ${chunks.length}`);

    // Gerar áudio para cada chunk
    const audioBuffers: ArrayBuffer[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[TTS] Chunk ${i + 1}/${chunks.length}: "${chunk.substring(0, 30)}..."`);
      
      try {
        const audioBuffer = await callGoogleTTSWithTimeout(chunk, language, TIMEOUT_MS);
        
        if (!audioBuffer || audioBuffer.byteLength === 0) {
          console.error(`[TTS] ❌ Chunk ${i + 1} vazio`);
          return new Response(
            JSON.stringify({ 
              tts_status: "failed",
              error: `Chunk ${i + 1} sem áudio`,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        audioBuffers.push(audioBuffer);
        console.log(`[TTS] ✓ Chunk ${i + 1}: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);
        
      } catch (chunkError: any) {
        console.error(`[TTS] ❌ Chunk ${i + 1} erro: ${chunkError.message}`);
        return new Response(
          JSON.stringify({ 
            tts_status: "failed",
            error: chunkError.message,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Concatenar todos os buffers
    const totalSize = audioBuffers.reduce((acc, buf) => acc + buf.byteLength, 0);
    const combinedBuffer = new Uint8Array(totalSize);
    let offset = 0;
    
    for (const buffer of audioBuffers) {
      combinedBuffer.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    const base64Audio = base64Encode(combinedBuffer);
    
    console.log(`[TTS] ✅ SUCESSO! Size: ${(totalSize / 1024).toFixed(1)}KB`);
    console.log("[TTS] ========== FINALIZADO ==========");

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "mp3",
        tts_status: "success",
        model: "google-tts",
        chunks_processed: chunks.length,
        size_kb: (totalSize / 1024).toFixed(1),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[TTS] ❌ FALHOU:", error.message);
    console.log("[TTS] → Seguir sem voz");
    
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
 * Limpa texto para TTS
 */
function cleanTextForTTS(text: string): string {
  return text
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, '') // Remove emojis
    .replace(/[""'']/g, '"') // Normaliza aspas
    .replace(/\s+/g, ' ') // Remove espaços extras
    .replace(/…/g, '...') // Normaliza reticências
    .replace(/[#@]/g, '') // Remove hashtags e menções
    .trim();
}

/**
 * Divide texto em chunks respeitando pontuação
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
 * Chama Google Translate TTS (100% gratuito)
 */
async function callGoogleTTSWithTimeout(
  text: string, 
  language: string,
  timeoutMs: number
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const encodedText = encodeURIComponent(text);
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
      throw new Error("Resposta não é áudio");
    }

    return await response.arrayBuffer();

  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === "AbortError") {
      throw new Error("Timeout: Google TTS não respondeu em 10s");
    }
    
    throw error;
  }
}
