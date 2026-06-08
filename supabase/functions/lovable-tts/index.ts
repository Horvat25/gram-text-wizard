import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * FREE TTS:
 *  1) Microsoft Edge Neural TTS (WebSocket, sem API key)  → Thalita / Antonio / Francisca
 *  2) StreamElements (Amazon Polly)                       → Camila / Vitoria / Ricardo
 *  3) Google Translate TTS                                → fallback final
 */

type VoiceCfg = { provider: "edge" | "polly"; voice: string };

const VOICE_MAPPING: Record<string, VoiceCfg> = {
  // Microsoft Edge Neural (qualidade premium, grátis)
  thalita:    { provider: "edge",  voice: "pt-BR-ThalitaMultilingualNeural" },
  thalita_br: { provider: "edge",  voice: "pt-BR-ThalitaNeural" },
  francisca:  { provider: "edge",  voice: "pt-BR-FranciscaNeural" },
  antonio:    { provider: "edge",  voice: "pt-BR-AntonioNeural" },
  // Amazon Polly (StreamElements)
  camila:     { provider: "polly", voice: "Camila" },
  vitoria:    { provider: "polly", voice: "Vitoria" },
  fernanda:   { provider: "polly", voice: "Camila" },
  thiago:     { provider: "polly", voice: "Ricardo" },
  ricardo:    { provider: "polly", voice: "Ricardo" },
  default:    { provider: "edge",  voice: "pt-BR-ThalitaMultilingualNeural" },
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

    const requestedVoice = voice || "thalita";
    const cfg = VOICE_MAPPING[requestedVoice] || VOICE_MAPPING["default"];
    console.log(`[TTS] Voice: ${requestedVoice} -> ${cfg.provider}:${cfg.voice} (${text.length} chars)`);

    let audioBytes: Uint8Array | null = null;
    let usedProvider = "";

    // 1) Edge Neural
    if (cfg.provider === "edge") {
      try {
        audioBytes = await generateEdgeTTS(text, cfg.voice);
        usedProvider = "edge-neural";
      } catch (e: any) {
        console.warn(`[TTS] Edge falhou: ${e.message}. Fallback Polly Camila.`);
      }
    }

    // 2) Polly via StreamElements
    if (!audioBytes) {
      try {
        const pollyVoice = cfg.provider === "polly" ? cfg.voice : "Camila";
        audioBytes = await generatePolly(text, pollyVoice);
        usedProvider = "polly-" + pollyVoice;
      } catch (e: any) {
        console.warn(`[TTS] Polly falhou: ${e.message}. Fallback Google.`);
      }
    }

    // 3) Google Translate
    if (!audioBytes) {
      audioBytes = await generateGoogleTTS(text);
      usedProvider = "google-translate";
    }

    const base64Audio = bytesToBase64(audioBytes);
    console.log(`[TTS] ✅ ${usedProvider}: ${(audioBytes.length / 1024).toFixed(1)}KB`);

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "mp3",
        voice: requestedVoice,
        provider: usedProvider,
        duration_estimate: Math.ceil(text.length / 15),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[TTS] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar narração" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// =============== Microsoft Edge Neural TTS (WebSocket) ===============

const EDGE_TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

async function generateEdgeTTS(text: string, voice: string): Promise<Uint8Array> {
  const reqId = crypto.randomUUID().replace(/-/g, "");
  const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TRUSTED_TOKEN}&ConnectionId=${reqId}`;

  return await new Promise<Uint8Array>((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    const chunks: Uint8Array[] = [];
    let settled = false;

    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(new Error(msg));
    };

    const timeout = setTimeout(() => fail("Edge TTS timeout 20s"), 20000);

    ws.onopen = () => {
      const ts = new Date().toISOString();
      const cfg =
        `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(cfg);

      const safeText = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'>` +
        `<voice name='${voice}'>` +
        `<prosody rate='+32%' pitch='+3Hz'>${safeText}</prosody>` +
        `</voice></speak>`;

      const ssmlMsg =
        `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        if (ev.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          if (settled) return;
          settled = true;
          ws.close();
          const total = chunks.reduce((s, c) => s + c.length, 0);
          if (total === 0) return reject(new Error("Edge TTS sem áudio"));
          const out = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) { out.set(c, off); off += c.length; }
          resolve(out);
        }
      } else {
        // binary frame: header (txt) + 0x0D 0x0A 0x0D 0x0A + mp3 chunk
        const bytes = new Uint8Array(ev.data as ArrayBuffer);
        // first 2 bytes are header length (big endian)
        const headerLen = (bytes[0] << 8) | bytes[1];
        const audio = bytes.slice(2 + headerLen);
        if (audio.length > 0) chunks.push(audio);
      }
    };

    ws.onerror = () => fail("Edge TTS ws error");
    ws.onclose = (ev) => {
      if (!settled) fail(`Edge TTS ws closed (${ev.code})`);
    };
  });
}

// =============== Polly via StreamElements ===============

async function generatePolly(text: string, pollyVoice: string): Promise<Uint8Array> {
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=${pollyVoice}&text=${encodeURIComponent(text)}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!resp.ok) throw new Error(`StreamElements ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

// =============== Google Translate fallback ===============

async function generateGoogleTTS(text: string): Promise<Uint8Array> {
  const maxLen = 180;
  const chunks: string[] = [];
  let rem = text;
  while (rem.length > 0) {
    if (rem.length <= maxLen) { chunks.push(rem); break; }
    let bp = rem.lastIndexOf(".", maxLen);
    if (bp === -1) bp = rem.lastIndexOf(" ", maxLen);
    if (bp === -1) bp = maxLen;
    chunks.push(rem.slice(0, bp + 1));
    rem = rem.slice(bp + 1).trim();
  }
  const parts: Uint8Array[] = [];
  for (const c of chunks) {
    const u = `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-BR&client=tw-ob&q=${encodeURIComponent(c)}`;
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
    if (r.ok) parts.push(new Uint8Array(await r.arrayBuffer()));
  }
  if (parts.length === 0) throw new Error("Google TTS sem áudio");
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
