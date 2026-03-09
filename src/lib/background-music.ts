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
    duration: 16,
    genre: "ambient",
    mood: "calm",
  },
  {
    id: "tech-drive",
    name: "Tech Drive",
    url: "generated://tech-drive",
    duration: 16,
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

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;
  const wavSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(wavSize);
  const view = new DataView(arrayBuffer);

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

  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;

  for (let sample = 0; sample < samples; sample++) {
    for (let channel = 0; channel < channels; channel++) {
      const clamped = Math.max(-1, Math.min(1, channelData[channel][sample] ?? 0));
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function getOfflineAudioContextCtor() {
  if (typeof window === "undefined") return null;
  return window.OfflineAudioContext || (window as any).webkitOfflineAudioContext || null;
}

async function generateProceduralTrack(kind: string, durationSeconds = 16): Promise<string> {
  const cacheKey = `${kind}:${durationSeconds}`;
  if (generatedTrackCache.has(cacheKey)) {
    return generatedTrackCache.get(cacheKey)!;
  }

  const OfflineContext = getOfflineAudioContextCtor();
  if (!OfflineContext) return "";

  const sampleRate = 44100;
  const length = sampleRate * durationSeconds;
  const ctx = new OfflineContext(1, length, sampleRate);

  const master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);

  const lowPass = ctx.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = kind === "tech-drive" ? 1200 : 800;
  lowPass.Q.value = 0.7;
  lowPass.connect(master);

  const padA = ctx.createOscillator();
  padA.type = "sine";
  padA.frequency.value = kind === "tech-drive" ? 110 : 96;

  const padB = ctx.createOscillator();
  padB.type = "triangle";
  padB.frequency.value = kind === "tech-drive" ? 165 : 144;

  const padGain = ctx.createGain();
  padGain.gain.value = 0.14;

  padA.connect(padGain);
  padB.connect(padGain);
  padGain.connect(lowPass);

  padA.start(0);
  padB.start(0);
  padA.stop(durationSeconds);
  padB.stop(durationSeconds);

  const pulse = ctx.createOscillator();
  pulse.type = "square";
  pulse.frequency.value = kind === "tech-drive" ? 2.4 : 1.2;

  const pulseGain = ctx.createGain();
  pulseGain.gain.value = kind === "tech-drive" ? 0.07 : 0.04;
  pulse.connect(pulseGain);
  pulseGain.connect(lowPass);
  pulse.start(0);
  pulse.stop(durationSeconds);

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.12;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 280;
  lfo.connect(lfoGain);
  lfoGain.connect(lowPass.frequency);
  lfo.start(0);
  lfo.stop(durationSeconds);

  const rendered = await ctx.startRendering();
  const wav = audioBufferToWav(rendered);
  const base64 = arrayBufferToBase64(wav);
  const dataUrl = `data:audio/wav;base64,${base64}`;

  generatedTrackCache.set(cacheKey, dataUrl);
  return dataUrl;
}

export async function preloadTrack(track: MusicTrack): Promise<string> {
  if (!track.url) {
    return generateProceduralTrack("ambient-pulse", track.duration || 16);
  }

  if (track.url.startsWith("generated://")) {
    const kind = track.url.replace("generated://", "") || "ambient-pulse";
    return generateProceduralTrack(kind, track.duration || 16);
  }

  return track.url;
}
