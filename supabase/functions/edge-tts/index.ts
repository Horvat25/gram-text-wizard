import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * TTS — Voz padrão: Microsoft Edge Neural PT-BR (Francisca/Antonio)
 * 100% GRÁTIS, sem chave, via WebSocket público do navegador Edge.
 *
 * Cadeia de fallback:
 *   1. Edge TTS Francisca neural (PT-BR feminina natural)
 *   2. Edge TTS Antonio neural (PT-BR masculino)
 *   3. Google Translate TTS (último recurso, robótico)
 *
 * ElevenLabs Sarah só é usada se `preferPaid: true`.
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, preferPaid } = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanedText = prepareTextForTTS(text);
    console.log(`[TTS] Request: ${cleanedText.length} chars (preferPaid=${!!preferPaid})`);

    let audioData: Uint8Array | null = null;
    let provider = "";
    let voice = "";

    // ── Caminho opcional: ElevenLabs Sarah (se pedido + chave disponível) ──
    if (preferPaid) {
      const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
      if (ELEVENLABS_API_KEY) {
        try {
          audioData = await generateElevenLabs(cleanedText, ELEVENLABS_API_KEY);
          provider = "ElevenLabs Neural";
          voice = "Sarah";
          console.log(`[TTS] ✅ ElevenLabs: ${(audioData.length / 1024).toFixed(1)}KB`);
        } catch (e: any) {
          console.warn(`[TTS] ElevenLabs falhou, caindo pra Polly: ${e.message}`);
        }
      }
    }

    // ── Padrão: Microsoft Edge TTS PT-BR (Francisca neural, GRÁTIS, sem chave) ──
    if (!audioData) {
      try {
        audioData = await generateEdgeTTS(cleanedText, "pt-BR-FranciscaNeural");
        provider = "Microsoft Edge Neural";
        voice = "Francisca";
        console.log(`[TTS] ✅ Edge TTS Francisca: ${(audioData.length / 1024).toFixed(1)}KB`);
      } catch (e: any) {
        console.warn(`[TTS] Edge TTS Francisca falhou, tentando Antonio: ${e.message}`);
        try {
          audioData = await generateEdgeTTS(cleanedText, "pt-BR-AntonioNeural");
          provider = "Microsoft Edge Neural";
          voice = "Antonio";
          console.log(`[TTS] ✅ Edge TTS Antonio: ${(audioData.length / 1024).toFixed(1)}KB`);
        } catch (e2: any) {
          console.warn(`[TTS] Edge TTS indisponível, fallback Google: ${e2.message}`);
          audioData = await generateGoogleTTS(cleanedText);
          provider = "Google Translate TTS";
          voice = "pt-BR";
          console.log(`[TTS] ⚠️ Google fallback: ${(audioData.length / 1024).toFixed(1)}KB`);
        }
      }
    }

    const base64Audio = base64Encode(audioData);

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "mp3",
        voice,
        provider,
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

// ========== Microsoft Edge TTS PT-BR (neural, GRÁTIS via WebSocket) ==========
// Usa o mesmo endpoint público do navegador Microsoft Edge. Sem chave, sem cadastro.
// Vozes PT-BR neurais: pt-BR-FranciscaNeural (feminina), pt-BR-AntonioNeural (masculina).

const EDGE_TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TRUSTED_TOKEN}`;

async function generateEdgeTTS(text: string, voiceName: string): Promise<Uint8Array> {
  // Fatia o texto em pedaços de ~800 chars (Edge TTS suporta bem chunks grandes).
  const chunks = splitForTTS(text, 800);
  const audioBuffers: Uint8Array[] = [];

  for (const chunk of chunks) {
    const audio = await synthesizeEdgeChunk(chunk, voiceName);
    audioBuffers.push(audio);
  }

  const total = audioBuffers.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of audioBuffers) { out.set(b, off); off += b.length; }
  return out;
}

function synthesizeEdgeChunk(text: string, voiceName: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const connectionId = crypto.randomUUID().replace(/-/g, "");
    const requestId = crypto.randomUUID().replace(/-/g, "");
    const url = `${EDGE_WSS_URL}&ConnectionId=${connectionId}`;

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    const audioChunks: Uint8Array[] = [];
    let finished = false;

    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        try { ws.close(); } catch (_) { /* noop */ }
        reject(new Error("Edge TTS timeout (30s)"));
      }
    }, 30000);

    ws.onopen = () => {
      // 1) Configuração: formato de saída MP3.
      const configMsg =
        `X-Timestamp:${new Date().toISOString()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configMsg);

      // 2) Requisição SSML.
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'>` +
        `<voice name='${voiceName}'>` +
        `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escaped}</prosody>` +
        `</voice></speak>`;
      const ssmlMsg =
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${new Date().toISOString()}\r\n` +
        `Path:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        // Mensagens de controle (turn.start, turn.end, response).
        if (event.data.includes("Path:turn.end")) {
          finished = true;
          clearTimeout(timeout);
          try { ws.close(); } catch (_) { /* noop */ }
          const total = audioChunks.reduce((s, b) => s + b.length, 0);
          if (total === 0) {
            reject(new Error("Edge TTS retornou áudio vazio"));
            return;
          }
          const out = new Uint8Array(total);
          let off = 0;
          for (const c of audioChunks) { out.set(c, off); off += c.length; }
          resolve(out);
        }
      } else {
        // Frame binário: header ASCII + "\r\n\r\n" + bytes de áudio.
        const buf = new Uint8Array(event.data as ArrayBuffer);
        // Os primeiros 2 bytes são o tamanho do header (big-endian).
        const headerLen = (buf[0] << 8) | buf[1];
        const audioStart = 2 + headerLen;
        if (audioStart < buf.length) {
          audioChunks.push(buf.slice(audioStart));
        }
      }
    };

    ws.onerror = (e) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        reject(new Error(`Edge TTS WS erro: ${(e as any).message || "unknown"}`));
      }
    };

    ws.onclose = (ev) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        reject(new Error(`Edge TTS WS fechou: code=${ev.code} reason=${ev.reason}`));
      }
    };
  });
}

// ========== Polly via StreamElements (fallback) ==========

async function generatePolly(text: string, voice: string): Promise<Uint8Array> {
  // StreamElements limita ~500 chars por chamada, então fatiamos por sentença.
  const chunks = splitForTTS(text, 480);
  const buffers: ArrayBuffer[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(chunk)}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`StreamElements ${resp.status}: ${err.substring(0, 120)}`);
    }
    buffers.push(await resp.arrayBuffer());
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 120));
  }

  return concatBuffers(buffers);
}

// ========== Google Translate TTS (último fallback) ==========

async function generateGoogleTTS(text: string): Promise<Uint8Array> {
  const chunks = splitForTTS(text, 180);
  const buffers: ArrayBuffer[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunks[i])}&tl=pt-BR&client=tw-ob`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://translate.google.com/",
      },
    });
    if (!resp.ok) continue;
    buffers.push(await resp.arrayBuffer());
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 120));
  }

  if (buffers.length === 0) throw new Error("Google TTS retornou vazio");
  return concatBuffers(buffers);
}

// ========== ElevenLabs Sarah (opcional, pago) ==========

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

  return new Uint8Array(await response.arrayBuffer());
}

// ========== HELPERS ==========

function splitForTTS(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length <= maxLen) {
      current += s;
    } else {
      if (current) chunks.push(current.trim());
      if (s.length > maxLen) {
        const words = s.split(" ");
        current = "";
        for (const w of words) {
          if ((current + " " + w).length <= maxLen) current += (current ? " " : "") + w;
          else { if (current) chunks.push(current.trim()); current = w; }
        }
      } else {
        current = s;
      }
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

function concatBuffers(buffers: ArrayBuffer[]): Uint8Array {
  const total = buffers.reduce((s, b) => s + b.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of buffers) { out.set(new Uint8Array(b), off); off += b.byteLength; }
  return out;
}

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
