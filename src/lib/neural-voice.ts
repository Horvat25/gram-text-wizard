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
  const baseUrl = (import.meta.env.VITE_NEURAL_VOICE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) return null;
  if (!baseUrl || !text.trim()) return null;

  try {
    const response = await fetch(`${baseUrl}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    if (!response.ok) return null;
    const data = (await response.json()) as NeuralVoiceResponse;
    if (!data.ok || !data.audioUrl) return null;

    return {
      audioUrl: data.audioUrl,
      duration: data.duration || 0,
      provider: `neural-voice:${data.engine || "edge"}`,
    };
  } catch (error) {
    console.warn("[neural-voice] local agent unavailable, falling back to Supabase TTS", error);
    return null;
  }
}
