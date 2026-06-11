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

// Health-check result cached per page load — one fast probe, then synthesis
// calls go straight through without racing an abort timer.
let healthPromise: Promise<boolean> | null = null;

async function isNeuralVoiceUp(): Promise<boolean> {
  if (!healthPromise) {
    healthPromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(`${BASE_URL}/health`, { signal: controller.signal });
        clearTimeout(timer);
        const data = await res.json().catch(() => null);
        return !!data?.ok;
      } catch {
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

    const response = await fetch(`${BASE_URL}/synthesize`, {
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
    });

    clearTimeout(timer);

    if (!response.ok) return null;
    const data = (await response.json()) as NeuralVoiceResponse;
    if (!data.ok || !data.audioUrl) return null;

    // Server may return a relative path — resolve against the base URL.
    const audioUrl = data.audioUrl.startsWith("http")
      ? data.audioUrl
      : `${BASE_URL}${data.audioUrl.startsWith("/") ? "" : "/"}${data.audioUrl}`;

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
