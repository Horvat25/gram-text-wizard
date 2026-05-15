import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * TTS — Voz padrão: Kokoro PT-BR (neural open-source via Replicate)
 *
 * Cadeia de fallback:
 *   1. Kokoro pf_dora (Replicate) — neural natural PT-BR, ~$0.0002/run
 *   2. Polly Camila (StreamElements) — se Replicate falhar
 *   3. Google Translate TTS — último recurso
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

    // ── Padrão: Kokoro PT-BR (Replicate, ~grátis) ──
    if (!audioData) {
      const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
      if (REPLICATE_API_KEY) {
        try {
          audioData = await generateKokoro(cleanedText, REPLICATE_API_KEY);
          provider = "Kokoro PT-BR Neural";
          voice = "pf_dora";
          console.log(`[TTS] ✅ Kokoro pf_dora: ${(audioData.length / 1024).toFixed(1)}KB`);
        } catch (e: any) {
          console.warn(`[TTS] Kokoro falhou, tentando Polly: ${e.message}`);
        }
      }
    }

    // ── Fallback 1: Polly Camila (StreamElements) ──
    if (!audioData) {
      try {
        audioData = await generatePolly(cleanedText, "Camila");
        provider = "Amazon Polly";
        voice = "Camila";
        console.log(`[TTS] ✅ Polly Camila: ${(audioData.length / 1024).toFixed(1)}KB`);
      } catch (e: any) {
        console.warn(`[TTS] Polly falhou, fallback Google: ${e.message}`);
        audioData = await generateGoogleTTS(cleanedText);
        provider = "Google Translate TTS";
        voice = "pt-BR";
        console.log(`[TTS] ⚠️ Google fallback: ${(audioData.length / 1024).toFixed(1)}KB`);
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

// ========== Kokoro PT-BR via Replicate (neural, ~grátis) ==========

async function generateKokoro(text: string, apiKey: string): Promise<Uint8Array> {
  // Kokoro tem limite prático ~500 chars por inferência. Fatiamos e concatenamos.
  const chunks = splitForTTS(text, 480);
  const buffers: ArrayBuffer[] = [];

  const VERSION = "89b6fa84e4fa2dd6bd3a96be3e1f12827a3516c9fda8fddbac7a0be131c9a6f5";

  for (let i = 0; i < chunks.length; i++) {
    const resp = await fetch(
      "https://api.replicate.com/v1/predictions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Prefer": "wait=60",
        },
        body: JSON.stringify({
          version: VERSION,
          input: {
            text: chunks[i],
            voice: "pf_dora",
            language_code: "p",
            speed: 1.0,
          },
        }),
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Replicate ${resp.status}: ${err.substring(0, 200)}`);
    }

    const data = await resp.json();
    const audioUrl = typeof data.output === "string" ? data.output : data.output?.[0];
    if (!audioUrl) throw new Error(`Kokoro sem output: ${JSON.stringify(data).substring(0, 200)}`);

    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) throw new Error(`Kokoro audio fetch falhou: ${audioResp.status}`);
    buffers.push(await audioResp.arrayBuffer());
  }

  return concatBuffers(buffers);
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
