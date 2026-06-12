interface NeuralVoiceResponse {
  ok: boolean;
  audioUrl?: string;
  duration?: number;
  engine?: string;
  voice?: string;
  trackingCode?: string;
  error?: string;
}

const BASE_URL = (import.meta.env.VITE_NEURAL_VOICE_URL || "http://localhost:3032").replace(/\/+$/, "");

// Chrome 2026 (Local Network Access): páginas HTTPS públicas só podem chamar
// http://localhost se o fetch declarar targetAddressSpace E o servidor responder
// com `Access-Control-Allow-Private-Network: true` no preflight. Tentamos primeiro
// com a flag, depois sem (browsers que ainda não suportam LNA quebram com ela).
async function localFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, targetAddressSpace: "loopback" } as RequestInit);
  } catch (e) {
    // Fallback: tenta sem a flag (Firefox/Safari, ou Chrome com LNA desabilitado)
    return await fetch(url, init);
  }
}

// Health-check result cached per page load, mas com re-probe rápido em caso de falha
let healthPromise: Promise<boolean> | null = null;
let lastHealthCheck = 0;

async function isNeuralVoiceUp(): Promise<boolean> {
  const now = Date.now();
  // Re-probe a cada 5s se a última falhou
  if (!healthPromise || (now - lastHealthCheck > 5000)) {
    lastHealthCheck = now;
    healthPromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await localFetch(`${BASE_URL}/health`, { signal: controller.signal });
        clearTimeout(timer);
        const data = await res.json().catch(() => null);
        return !!data?.ok;
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (msg.includes("Failed to fetch")) {
          console.warn(
            `[neural-voice] bloqueado pelo browser (${BASE_URL}). ` +
            `O servidor local precisa responder preflight com header ` +
            `'Access-Control-Allow-Private-Network: true' OU você precisa rodar a página em http://localhost / túnel HTTPS (ngrok).`
          );
        } else {
          console.warn("[neural-voice] health falhou:", msg);
        }
        return false;
      }
    })();
    healthPromise.then((up) => {
      if (!up) healthPromise = null; // permite re-probe imediato na próxima chamada após 5s
    });
  }
  return healthPromise;
}

export async function getNeuralVoiceStatus(): Promise<boolean> {
  return isNeuralVoiceUp();
}

export async function synthesizeWithNeuralVoice(
  text: string,
  options: { postId?: string; voice?: string; platform?: string; channel?: string } = {},
): Promise<{ audioUrl: string; duration: number; provider: string } | null> {
  if (!text.trim()) return null;

  // Fast probe first — synthesis itself takes seconds and must NOT be aborted early.
  if (!(await isNeuralVoiceUp())) {
    console.warn("[neural-voice] servidor local não está rodando (inicie com iniciar.ps1)");
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000); // generous: real synthesis time

    const response = await fetch(`${BASE_URL}/synthesize`, localFetchInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        text,
        engine: "edge",
        voice: options.voice || "female",
        platform: options.platform || "reels",
        channel: options.channel || "instagram",
        postId: options.postId,
        withTimings: true,
      }),
    }));

    clearTimeout(timer);

    if (!response.ok) return null;
    const data = (await response.json()) as NeuralVoiceResponse;
    if (!data.ok || !data.audioUrl) return null;

    // Server may return a relative path — resolve against the base URL.
    const remoteUrl = data.audioUrl.startsWith("http")
      ? data.audioUrl
      : `${BASE_URL}${data.audioUrl.startsWith("/") ? "" : "/"}${data.audioUrl}`;

    // Baixa o MP3 AGORA (única outra chamada a localhost) e vira blob URL —
    // o resto do pipeline (decode, encoder) nunca mais toca a rede local.
    const audioRes = await fetch(remoteUrl, localFetchInit());
    if (!audioRes.ok) {
      console.warn("[neural-voice] falha ao baixar o MP3:", audioRes.status);
      return null;
    }
    const audioBlob = await audioRes.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    return {
      audioUrl,
      duration: data.duration || 0,
      provider: `neural-voice:${data.engine || "edge"}`,
    };
  } catch (error) {
    console.warn("[neural-voice] síntese falhou", error);
    return null;
  }
}
