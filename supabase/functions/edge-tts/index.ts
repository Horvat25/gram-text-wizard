import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * TTS — Voz padrão: ElevenLabs Sarah (PT-BR neural premium via free tier).
 *
 * Cadeia:
 *   1. ElevenLabs Sarah (free tier ~10k chars/mês = ~30 reels)
 *   2. HuggingFace MMS-TTS Portuguese (se a chave HF responder)
 *   3. Google Translate TTS (último recurso quando o free estoura)
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanedText = prepareTextForTTS(text);
    console.log(`[TTS] Request: ${cleanedText.length} chars`);

    let audioData: Uint8Array | null = null;
    let provider = "";
    let voice = "";

    // ── 1) Padrão: ElevenLabs Sarah (free tier) ──
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (ELEVENLABS_API_KEY) {
      try {
        audioData = await generateElevenLabs(cleanedText, ELEVENLABS_API_KEY);
        provider = "ElevenLabs Neural";
        voice = "Sarah";
        console.log(`[TTS] ✅ ElevenLabs Sarah: ${(audioData.length / 1024).toFixed(1)}KB`);
      } catch (e: any) {
        console.warn(`[TTS] ElevenLabs falhou (provável quota free): ${e.message}`);
      }
    }

    // ── 2) Fallback: HuggingFace MMS-TTS PT ──
    if (!audioData) {
      const HF_API_KEY = Deno.env.get("HF_API_KEY");
      if (HF_API_KEY) {
        try {
          audioData = await generateHuggingFaceTTS(cleanedText, HF_API_KEY);
          provider = "HuggingFace MMS Neural";
          voice = "mms-tts-por";
          console.log(`[TTS] ✅ HF MMS-TTS: ${(audioData.length / 1024).toFixed(1)}KB`);
        } catch (e: any) {
          console.warn(`[TTS] HF MMS falhou, fallback Google: ${e.message}`);
        }
      }
    }

    // ── 3) Último recurso: Google Translate TTS ──
    if (!audioData) {
      audioData = await generateGoogleTTS(cleanedText);
      provider = "Google Translate TTS";
      voice = "pt-BR";
      console.log(`[TTS] ⚠️ Google fallback (quota ElevenLabs free provavelmente estourou)`);
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

// ========== HuggingFace MMS-TTS Portuguese (neural, GRÁTIS) ==========
// Modelo facebook/mms-tts-por do Meta (Massively Multilingual Speech).
// Free tier do HF Inference API. Retorna WAV diretamente como bytes.

async function generateHuggingFaceTTS(text: string, apiKey: string): Promise<Uint8Array> {
  // MMS-TTS lida bem com chunks de até ~600 chars.
  const chunks = splitForTTS(text, 550);
  const buffers: ArrayBuffer[] = [];

  for (let i = 0; i < chunks.length; i++) {
    let attempts = 0;
    let success = false;
    let lastError = "";

    // O HF Inference pode retornar 503 quando o modelo está "loading".
    // Tentamos 3 vezes com backoff.
    while (attempts < 3 && !success) {
      attempts++;
      const resp = await fetch(
        "https://api-inference.huggingface.co/models/facebook/mms-tts-por",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "audio/wav",
          },
          body: JSON.stringify({
            inputs: chunks[i],
            options: { wait_for_model: true, use_cache: false },
          }),
        }
      );

      if (resp.ok) {
        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("audio") || contentType.includes("octet-stream")) {
          buffers.push(await resp.arrayBuffer());
          success = true;
          break;
        }
        // Caso retorne JSON (erro mascarado)
        const txt = await resp.text();
        lastError = `HF resposta inesperada: ${txt.substring(0, 200)}`;
      } else {
        const txt = await resp.text();
        lastError = `HF ${resp.status}: ${txt.substring(0, 200)}`;
        // 503 = modelo carregando; aguarda e tenta de novo
        if (resp.status === 503) {
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        break;
      }
    }

    if (!success) throw new Error(lastError || "HF MMS-TTS falhou");
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
        // Turbo v2.5 = metade dos créditos do multilingual_v2, qualidade PT-BR ótima
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.40,        // mais variação prosódica = humano
          similarity_boost: 0.82, // mantém timbre da Sarah
          style: 0.45,            // inflexão editorial marcada
          use_speaker_boost: true,
          speed: 1.22,            // ritmo Reels viral (22% + rápido, ainda claro)
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
