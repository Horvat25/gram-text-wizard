// Background music utilities for video generation

export interface MusicTrack {
  id: string;
  name: string;
  url: string;
  duration: number;
  genre: string;
  mood: string;
}

const tracks: MusicTrack[] = [
  {
    id: "ambient-pulse",
    name: "Ambient Pulse",
    url: "generated://ambient-pulse",
    duration: 18,
    genre: "ambient",
    mood: "calm",
  },
  {
    id: "tech-drive",
    name: "Tech Drive",
    url: "generated://tech-drive",
    duration: 18,
    genre: "electronic",
    mood: "energetic",
  },
];

const generatedTrackCache = new Map<string, string>();

export function getRandomTrack(genre?: string): MusicTrack {
  const filtered = genre ? tracks.filter((t) => t.genre === genre) : tracks;
  const source = filtered.length > 0 ? filtered : tracks;
  return source[Math.floor(Math.random() * source.length)];
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function pcmToWavBase64(samples: Float32Array, sampleRate: number): string {
  const channels = 1;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const wavSize = 44 + dataSize;

  const buffer = new ArrayBuffer(wavSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function envelope(t: number, duration: number): number {
  const attack = Math.min(0.5, duration * 0.05);
  const release = Math.min(0.9, duration * 0.08);
  if (t < attack) return t / Math.max(attack, 0.001);
  if (t > duration - release) return Math.max(0, (duration - t) / Math.max(release, 0.001));
  return 1;
}

function createProceduralSamples(kind: string, durationSeconds: number, sampleRate: number): Float32Array {
  const length = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const samples = new Float32Array(length);

  const bassFreq = kind === "tech-drive" ? 105 : 92;
  const padFreq = kind === "tech-drive" ? 210 : 176;
  const leadFreq = kind === "tech-drive" ? 420 : 352;
  const beatHz = kind === "tech-drive" ? 2.2 : 1.2;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const env = envelope(t, durationSeconds);

    const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.35;
    const pad = Math.sin(2 * Math.PI * padFreq * t + Math.sin(2 * Math.PI * 0.12 * t) * 0.8) * 0.22;
    const lead = Math.sin(2 * Math.PI * leadFreq * t) * 0.08;

    const pulse = (Math.sin(2 * Math.PI * beatHz * t) * 0.5 + 0.5);
    const gated = (bass + pad + lead) * (0.55 + pulse * 0.45);

    const noise = (Math.sin(2 * Math.PI * 37 * t) * Math.sin(2 * Math.PI * 29 * t)) * 0.03;

    samples[i] = (gated + noise) * env * 0.75;
  }

  return samples;
}

async function generateProceduralTrack(kind: string, durationSeconds = 18): Promise<string> {
  const cacheKey = `${kind}:${durationSeconds}`;
  if (generatedTrackCache.has(cacheKey)) {
    return generatedTrackCache.get(cacheKey)!;
  }

  const sampleRate = 44100;
  const samples = createProceduralSamples(kind, durationSeconds, sampleRate);
  const base64 = pcmToWavBase64(samples, sampleRate);
  const dataUrl = `data:audio/wav;base64,${base64}`;

  generatedTrackCache.set(cacheKey, dataUrl);
  return dataUrl;
}

export async function preloadTrack(track: MusicTrack): Promise<string> {
  if (!track.url) {
    return generateProceduralTrack("ambient-pulse", track.duration || 18);
  }

  if (track.url.startsWith("generated://")) {
    const kind = track.url.replace("generated://", "") || "ambient-pulse";
    return generateProceduralTrack(kind, track.duration || 18);
  }

  return track.url;
}
