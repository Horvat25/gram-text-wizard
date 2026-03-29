import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * TTS Premium - Hierarquia de vozes neurais
 * 
 * 1️⃣ ElevenLabs (melhor qualidade, se tiver crédito)
 * 2️⃣ Edge TTS - Microsoft FranciscaNeural (grátis, alta qualidade)
 * 3️⃣ Google Neural TTS (grátis, fallback confiável)
 * 4️⃣ TikTok TTS br_005 (último recurso)
 */

const MAX_CHUNK_SIZE = 250;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice, forceElevenLabs, skipElevenLabs } = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanedText = prepareTextForTTS(text);
    console.log(`[TTS] Request: ${cleanedText.length} chars, forceElevenLabs=${!!forceElevenLabs}, skipElevenLabs=${!!skipElevenLabs}`);

    let audioData: Uint8Array | null = null;
    let usedProvider = "unknown";

    // 1️⃣ ElevenLabs (melhor qualidade) - skip if skipElevenLabs flag is set
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (ELEVENLABS_API_KEY && !skipElevenLabs) {
      try {
        console.log("[TTS] 1️⃣ Tentando ElevenLabs...");
        audioData = await generateElevenLabs(cleanedText, ELEVENLABS_API_KEY);
        usedProvider = "ElevenLabs Neural";
        console.log(`[TTS] ✅ ElevenLabs sucesso! ${(audioData.length / 1024).toFixed(1)}KB`);
      } catch (e: any) {
        console.warn(`[TTS] ElevenLabs falhou: ${e.message}`);
        // If forceElevenLabs was requested and it failed, return error to let client handle
        if (forceElevenLabs) {
          console.warn(`[TTS] ⚠️ forceElevenLabs requested but failed, falling back`);
        }
      }
    }

    // 2️⃣ Edge TTS - Microsoft FranciscaNeural (grátis)
    if (!audioData) {
      try {
        console.log("[TTS] 2️⃣ Tentando Edge TTS (FranciscaNeural)...");
        audioData = await generateEdgeTTS(cleanedText, "pt-BR-FranciscaNeural");
        usedProvider = "Edge TTS FranciscaNeural";
        console.log(`[TTS] ✅ Edge TTS sucesso! ${(audioData.length / 1024).toFixed(1)}KB`);
      } catch (e: any) {
        console.warn(`[TTS] Edge TTS falhou: ${e.message}`);
      }
    }

    // 3️⃣ Google Neural TTS (grátis, confiável)
    if (!audioData) {
      try {
        console.log("[TTS] 3️⃣ Tentando Google Neural TTS...");
        audioData = await generateGoogleTTS(cleanedText);
        usedProvider = "Google Neural";
        console.log(`[TTS] ✅ Google TTS sucesso! ${(audioData.length / 1024).toFixed(1)}KB`);
      } catch (e: any) {
        console.warn(`[TTS] Google TTS falhou: ${e.message}`);
      }
    }

    // 4️⃣ TikTok TTS (último recurso)
    if (!audioData) {
      try {
        console.log("[TTS] 4️⃣ Último recurso: TikTok TTS...");
        audioData = await generateTikTokTTS(cleanedText);
        usedProvider = "TikTok TTS";
        console.log(`[TTS] ✅ TikTok TTS sucesso! ${(audioData.length / 1024).toFixed(1)}KB`);
      } catch (e: any) {
        console.error(`[TTS] ❌ Todos falharam: ${e.message}`);
        return new Response(
          JSON.stringify({ error: "All TTS providers failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const base64Audio = base64Encode(audioData);
    console.log(`[TTS] ✅ SUCESSO! Provider: ${usedProvider}, Size: ${(audioData.length / 1024).toFixed(1)}KB`);

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "mp3",
        voice: voice || "francisca",
        provider: usedProvider,
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

// ========== PROVIDERS ==========

/**
 * 1️⃣ ElevenLabs - Melhor qualidade neural
 */
async function generateElevenLabs(text: string, apiKey: string): Promise<Uint8Array> {
  // Voz Sarah (EXAVITQu4vr4xnSDxMaL) - funciona bem com português
  const voiceId = "EXAVITQu4vr4xnSDxMaL";
  
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

/**
 * 2️⃣ Edge TTS - Microsoft Neural (FranciscaNeural)
 * Usa WebSocket para speech.platform.bing.com
 */
async function generateEdgeTTS(text: string, voiceName: string): Promise<Uint8Array> {
  const chunks = splitChunks(text, MAX_CHUNK_SIZE);
  const audioBuffers: Uint8Array[] = [];

  for (const chunk of chunks) {
    const audio = await edgeTTSChunk(chunk, voiceName);
    if (audio.length > 0) {
      audioBuffers.push(audio);
    }
    if (chunks.length > 1) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  if (audioBuffers.length === 0) {
    throw new Error("Edge TTS produced no audio");
  }

  return concatBuffers(audioBuffers);
}

async function edgeTTSChunk(text: string, voiceName: string): Promise<Uint8Array> {
  // Edge TTS WebSocket connection
  const connectionId = crypto.randomUUID().replace(/-/g, "");
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { ws.close(); } catch (_) {}
      reject(new Error("Edge TTS timeout"));
    }, 20000);

    const audioChunks: Uint8Array[] = [];
    let headersSent = false;

    const ws = new WebSocket(wsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        "Origin": "chrome-extension://jdiccldimpdaibmpdmdnlbipompfkiin",
      },
    } as any);

    ws.onopen = () => {
      // Send config
      const configMsg = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configMsg);

      // Send SSML
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'><voice name='${voiceName}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
      const ssmlMsg = `X-RequestId:${connectionId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
      headersSent = true;
    };

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        // Text message - check for turn.end
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          ws.close();
          resolve(concatBuffers(audioChunks));
        }
      } else if (event.data instanceof ArrayBuffer) {
        // Binary audio data
        const view = new Uint8Array(event.data);
        // Find the separator between header and audio data
        const headerEnd = findHeaderEnd(view);
        if (headerEnd > 0 && headerEnd < view.length) {
          audioChunks.push(view.slice(headerEnd));
        }
      } else if (event.data instanceof Blob) {
        // Handle Blob data
        event.data.arrayBuffer().then((ab: ArrayBuffer) => {
          const view = new Uint8Array(ab);
          const headerEnd = findHeaderEnd(view);
          if (headerEnd > 0 && headerEnd < view.length) {
            audioChunks.push(view.slice(headerEnd));
          }
        });
      }
    };

    ws.onerror = (error: Event) => {
      clearTimeout(timeout);
      reject(new Error("Edge TTS WebSocket error"));
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      if (audioChunks.length > 0) {
        resolve(concatBuffers(audioChunks));
      }
    };
  });
}

function findHeaderEnd(data: Uint8Array): number {
  // Binary messages have a 2-byte header length prefix
  if (data.length < 2) return -1;
  const headerLen = (data[0] << 8) | data[1];
  return 2 + headerLen;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 3️⃣ Google Translate TTS (grátis, confiável)
 */
async function generateGoogleTTS(text: string): Promise<Uint8Array> {
  const chunks = splitChunks(text, 180);
  const audioBuffers: Uint8Array[] = [];

  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=pt-BR&client=tw-ob`;
    
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        audioBuffers.push(new Uint8Array(buffer));
      }
    } catch (_) {}

    await new Promise(r => setTimeout(r, 150));
  }

  if (audioBuffers.length === 0) {
    throw new Error("Google TTS failed");
  }

  return concatBuffers(audioBuffers);
}

/**
 * 4️⃣ TikTok TTS (último recurso)
 */
async function generateTikTokTTS(text: string): Promise<Uint8Array> {
  const chunks = splitChunks(text, 250);
  const audioBuffers: Uint8Array[] = [];

  for (const chunk of chunks) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("https://tiktok-tts.weilnet.workers.dev/api/generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chunk, voice: "br_005" }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`TikTok ${response.status}`);

      const data = await response.json();
      if (data.data) {
        const binaryString = atob(data.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        audioBuffers.push(bytes);
      }

      await new Promise(r => setTimeout(r, 100));
    } catch (e: any) {
      clearTimeout(timeoutId);
      throw e;
    }
  }

  if (audioBuffers.length === 0) throw new Error("TikTok TTS failed");
  return concatBuffers(audioBuffers);
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

function splitChunks(text: string, maxSize: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).length <= maxSize) {
      current = (current + " " + sentence).trim();
    } else {
      if (current) chunks.push(current);
      current = sentence.length > maxSize ? sentence.substring(0, maxSize) : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text.substring(0, maxSize)];
}

function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const totalSize = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const buffer of buffers) {
    combined.set(buffer, offset);
    offset += buffer.length;
  }
  return combined;
}
