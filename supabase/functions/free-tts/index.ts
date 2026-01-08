import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Free TTS using Google Translate's text-to-speech
 * No API key required! Works great with Portuguese.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, language } = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lang = language || "pt-BR";
    console.log(`[FreeTTS] Generating audio for: "${text.substring(0, 50)}..." (${lang})`);

    // Google Translate TTS has a character limit per request (~200 chars)
    // We'll split long text into chunks and concatenate
    const maxChunkLength = 180;
    const chunks: string[] = [];
    
    // Split by sentences first, then by chunk length
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = "";
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= maxChunkLength) {
        currentChunk += sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        // If single sentence is too long, split by words
        if (sentence.length > maxChunkLength) {
          const words = sentence.split(" ");
          currentChunk = "";
          for (const word of words) {
            if ((currentChunk + " " + word).length <= maxChunkLength) {
              currentChunk += (currentChunk ? " " : "") + word;
            } else {
              if (currentChunk) chunks.push(currentChunk.trim());
              currentChunk = word;
            }
          }
        } else {
          currentChunk = sentence;
        }
      }
    }
    if (currentChunk) chunks.push(currentChunk.trim());

    console.log(`[FreeTTS] Split into ${chunks.length} chunks`);

    // Fetch audio for each chunk
    const audioBuffers: ArrayBuffer[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const encodedText = encodeURIComponent(chunk);
      
      // Google Translate TTS endpoint (free, no key required)
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${lang}&client=tw-ob`;
      
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://translate.google.com/",
        },
      });

      if (!response.ok) {
        console.error(`[FreeTTS] Chunk ${i + 1} failed:`, response.status);
        continue;
      }

      const buffer = await response.arrayBuffer();
      audioBuffers.push(buffer);
      
      // Small delay between requests to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    if (audioBuffers.length === 0) {
      throw new Error("Failed to generate any audio chunks");
    }

    // Concatenate all audio buffers
    const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const buffer of audioBuffers) {
      combined.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    // Encode to base64 (convert Uint8Array to ArrayBuffer)
    const base64Audio = base64Encode(combined.buffer);

    console.log(`[FreeTTS] Success! Total size: ${(totalLength / 1024).toFixed(1)}KB, chunks: ${audioBuffers.length}`);

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "mp3",
        chunks: audioBuffers.length,
        duration_estimate: Math.ceil(text.length / 12), // ~12 chars per second for PT-BR
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[FreeTTS] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate audio" }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
