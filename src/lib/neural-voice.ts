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
// http://localhost se o fetch declarar targetAddressSpace. Sem isso a requisição
// é bloqueada como mixed content ANTES do preflight — parece "servidor desligado".
const localFetchInit = (init: RequestInit = {}): RequestInit =>
  ({ ...init, targetAddressSpace: "loopback" }) as RequestInit;

// Health-check result cached per page load — one fast probe, then synthesis
// calls go straight through without racing an abort timer.
let healthPromise: Promise<boolean> | null = null;

async function isNeuralVoiceUp(): Promise<boolean> {
  if (!healthPromise) {
    healthPromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${BASE_URL}/health`, localFetchInit({ signal: controller.signal }));
        clearTimeout(timer);
        const data = await res.json().catch(() => null);
        return !!data?.ok;
      } catch (e) {
        console.warn("[neural-voice] health falhou:", e);
        return false;
      }
    })();
    // Allow a re-probe if the first check failed (user may start the server mid-session)
    healthPromise.then((up) => {
      if (!up) setTimeout(() => { healthPromise = null; }, 10_000);
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
