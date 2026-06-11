interface NeuralVoiceResponse {
  ok: boolean;
  audioUrl?: string;
  duration?: number;
  engine?: string;
  voice?: string;
  trackingCode?: string;
  error?: string;
}

export async function synthesizeWithNeuralVoice(
  text: string,
  options: { postId?: string; voice?: string; platform?: string; channel?: string } = {},
): Promise<{ audioUrl: string; duration: number; provider: string } | null> {
  // Use env override or fall back to local agent running on the user's machine.
  // Browsers allow http://localhost from HTTPS pages (secure-context exception).
  const baseUrl = (import.meta.env.VITE_NEURAL_VOICE_URL || "http://localhost:3032").replace(/\/+$/, "");
  if (!text.trim()) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 700); // fast-fail if server not running

    const response = await fetch(`${baseUrl}/synthesize`, {
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

    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = (await response.json()) as NeuralVoiceResponse;
    if (!data.ok || !data.audioUrl) return null;

    return {
      audioUrl: data.audioUrl,
      duration: data.duration || 0,
      provider: `neural-voice:${data.engine || "edge"}`,
    };
  } catch (error: any) {
    if (error?.name !== "AbortError") {
      console.warn("[neural-voice] local agent unavailable, falling back to Supabase TTS", error);
    }
    return null;
  }
}
