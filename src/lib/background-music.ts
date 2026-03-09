// Professional procedural background music engine for video generation
// Generates rich ambient/electronic tracks using Web Audio synthesis

export interface MusicTrack {
  id: string;
  name: string;
  url: string;
  duration: number;
  genre: string;
  mood: string;
}

const tracks: MusicTrack[] = [
  { id: "ambient-deep", name: "Deep Ambient", url: "generated://ambient-deep", duration: 25, genre: "ambient", mood: "calm" },
  { id: "tech-pulse", name: "Tech Pulse", url: "generated://tech-pulse", duration: 25, genre: "electronic", mood: "energetic" },
  { id: "cinematic-pad", name: "Cinematic Pad", url: "generated://cinematic-pad", duration: 25, genre: "cinematic", mood: "dramatic" },
];

const generatedTrackCache = new Map<string, string>();

export function getRandomTrack(genre?: string): MusicTrack {
  const filtered = genre ? tracks.filter((t) => t.genre === genre || t.mood === genre) : tracks;
  const source = filtered.length > 0 ? filtered : tracks;
  return source[Math.floor(Math.random() * source.length)];
}

// ─── WAV encoding ─────────────────────────────────────────────

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function floatToWavDataUrl(samples: Float32Array, sampleRate: number): string {
  const channels = 1;
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

// ─── DSP helpers ──────────────────────────────────────────────

function envelope(t: number, dur: number): number {
  const a = Math.min(1.5, dur * 0.06);
  const r = Math.min(2.0, dur * 0.1);
  if (t < a) return t / Math.max(a, 0.001);
  if (t > dur - r) return Math.max(0, (dur - t) / Math.max(r, 0.001));
  return 1;
}

function softClip(x: number): number {
  return Math.tanh(x);
}

// Simple low-pass filter state
interface LPFState { prev: number }
function lpf(sample: number, cutoff01: number, state: LPFState): number {
  const a = Math.max(0.001, Math.min(0.999, cutoff01));
  state.prev = state.prev + a * (sample - state.prev);
  return state.prev;
}

// ─── Chord/scale helpers ──────────────────────────────────────

const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]; // Natural minor

function noteFreq(baseFreq: number, semitones: number): number {
  return baseFreq * Math.pow(2, semitones / 12);
}

// ─── Track generators ─────────────────────────────────────────

function generateAmbientDeep(dur: number, sr: number): Float32Array {
  const len = Math.floor(dur * sr);
  const out = new Float32Array(len);
  const lpState: LPFState = { prev: 0 };
  
  // Chord progression: i - VI - III - VII (Am - F - C - G style)
  const root = 55; // A1
  const chords = [
    [0, 3, 7, 12],      // Am
    [5, 8, 12, 17],     // F
    [3, 7, 12, 15],     // C
    [7, 10, 14, 19],    // G
  ];
  const chordDur = dur / chords.length;

  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = envelope(t, dur);
    const chordIdx = Math.min(chords.length - 1, Math.floor(t / chordDur));
    const chord = chords[chordIdx];
    
    // Smooth chord transition
    const chordT = (t % chordDur) / chordDur;
    const fadeIn = chordT < 0.08 ? chordT / 0.08 : 1;

    // Sub bass (root note)
    const bassFreq = noteFreq(root, chord[0]);
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.3;
    
    // Warm pad (multiple detuned oscillators per note)
    let pad = 0;
    for (let n = 0; n < chord.length; n++) {
      const f = noteFreq(root * 2, chord[n]);
      const detune1 = f * 1.003;
      const detune2 = f * 0.997;
      pad += Math.sin(2 * Math.PI * f * t + Math.sin(2 * Math.PI * 0.15 * t) * 0.6) * 0.08;
      pad += Math.sin(2 * Math.PI * detune1 * t) * 0.06;
      pad += Math.sin(2 * Math.PI * detune2 * t) * 0.06;
    }

    // Slow arpeggio (one note at a time, cycling through chord)
    const arpSpeed = 0.7;
    const arpIdx = Math.floor((t * arpSpeed) % chord.length);
    const arpFreq = noteFreq(root * 4, chord[arpIdx]);
    const arpEnv = Math.pow(1 - ((t * arpSpeed) % 1), 2);
    const arp = Math.sin(2 * Math.PI * arpFreq * t) * arpEnv * 0.07;

    // Atmosphere: filtered noise shimmer
    const noise = (Math.random() * 2 - 1) * 0.012;
    const shimmer = Math.sin(2 * Math.PI * noteFreq(root * 8, chord[0] + 12) * t) * 0.02 * 
                    (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.08 * t));

    const raw = (bass + pad + arp + noise + shimmer) * fadeIn * env;
    out[i] = softClip(lpf(raw, 0.15 + 0.05 * Math.sin(2 * Math.PI * 0.04 * t), lpState) * 0.85);
  }
  return out;
}

function generateTechPulse(dur: number, sr: number): Float32Array {
  const len = Math.floor(dur * sr);
  const out = new Float32Array(len);
  const lpState: LPFState = { prev: 0 };

  const bpm = 100;
  const beatSec = 60 / bpm;
  const root = 65.41; // C2
  
  // Progression: Cm - Ab - Eb - Bb
  const chords = [
    [0, 3, 7],
    [8, 12, 15],
    [3, 7, 10],
    [10, 14, 17],
  ];
  const chordDur = dur / chords.length;

  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = envelope(t, dur);
    const chordIdx = Math.min(chords.length - 1, Math.floor(t / chordDur));
    const chord = chords[chordIdx];

    // Kick-like pulse on beats
    const beatPhase = (t % beatSec) / beatSec;
    const kick = Math.sin(2 * Math.PI * (60 - 40 * beatPhase) * beatPhase) * Math.exp(-beatPhase * 12) * 0.25;

    // Hi-hat on off-beats
    const hihatPhase = ((t + beatSec * 0.5) % beatSec) / beatSec;
    const hihat = (Math.random() * 2 - 1) * Math.exp(-hihatPhase * 20) * 0.06;

    // Sub bass with sidechain ducking
    const duck = 1 - Math.exp(-beatPhase * 8) * 0.4;
    const bassFreq = noteFreq(root, chord[0]);
    const bass = (Math.sin(2 * Math.PI * bassFreq * t) + 
                  Math.sin(2 * Math.PI * bassFreq * 2 * t) * 0.3) * 0.22 * duck;

    // Synth pad with movement
    let pad = 0;
    for (let n = 0; n < chord.length; n++) {
      const f = noteFreq(root * 2, chord[n]);
      const lfoPhase = Math.sin(2 * Math.PI * (0.1 + n * 0.03) * t);
      pad += Math.sin(2 * Math.PI * f * t + lfoPhase * 0.5) * 0.1;
      pad += Math.sin(2 * Math.PI * f * 1.005 * t) * 0.06; // Detune
    }

    // 16th note arpeggio
    const arpStep = beatSec / 4;
    const arpIdx = Math.floor(t / arpStep) % chord.length;
    const arpFreq = noteFreq(root * 4, chord[arpIdx]);
    const arpPhase = (t % arpStep) / arpStep;
    const arpEnv = Math.exp(-arpPhase * 6);
    const arp = Math.sin(2 * Math.PI * arpFreq * t) * arpEnv * 0.1;

    const raw = (kick + hihat + bass + pad + arp) * env;
    out[i] = softClip(lpf(raw, 0.25 + 0.1 * Math.sin(2 * Math.PI * 0.06 * t), lpState) * 0.9);
  }
  return out;
}

function generateCinematicPad(dur: number, sr: number): Float32Array {
  const len = Math.floor(dur * sr);
  const out = new Float32Array(len);
  const lpState: LPFState = { prev: 0 };

  const root = 73.42; // D2
  // Dm - Bb - Gm - A
  const chords = [
    [0, 3, 7, 12, 15],
    [8, 12, 15, 20],
    [5, 8, 12, 17],
    [7, 11, 14, 19],
  ];
  const chordDur = dur / chords.length;

  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = envelope(t, dur);
    const chordIdx = Math.min(chords.length - 1, Math.floor(t / chordDur));
    const chord = chords[chordIdx];
    const chordT = (t % chordDur) / chordDur;
    const crossfade = chordT < 0.12 ? chordT / 0.12 : 1;

    // Deep sub drone
    const sub = Math.sin(2 * Math.PI * noteFreq(root * 0.5, chord[0]) * t) * 0.2;

    // Rich string-like pad (many detuned voices)
    let strings = 0;
    for (let n = 0; n < chord.length; n++) {
      const f = noteFreq(root, chord[n]);
      for (let d = -2; d <= 2; d++) {
        const df = f * (1 + d * 0.002);
        const vibrato = Math.sin(2 * Math.PI * (4.5 + n * 0.3) * t) * 0.003 * f;
        strings += Math.sin(2 * Math.PI * (df + vibrato) * t) * 0.035;
      }
    }

    // Ethereal high harmonics
    const highFreq = noteFreq(root * 8, chord[0]);
    const ethereal = Math.sin(2 * Math.PI * highFreq * t) * 
                     (0.3 + 0.7 * Math.sin(2 * Math.PI * 0.05 * t)) * 0.025;

    // Filtered texture
    const texture = (Math.random() * 2 - 1) * 0.008 * 
                    (0.3 + 0.7 * Math.pow(Math.sin(2 * Math.PI * 0.03 * t), 2));

    const raw = (sub + strings + ethereal + texture) * crossfade * env;
    out[i] = softClip(lpf(raw, 0.12 + 0.06 * Math.sin(2 * Math.PI * 0.025 * t), lpState) * 0.9);
  }
  return out;
}

// ─── Generator dispatcher ─────────────────────────────────────

function createProceduralSamples(kind: string, dur: number, sr: number): Float32Array {
  switch (kind) {
    case "tech-pulse": return generateTechPulse(dur, sr);
    case "cinematic-pad": return generateCinematicPad(dur, sr);
    case "ambient-deep":
    default: return generateAmbientDeep(dur, sr);
  }
}

async function generateProceduralTrack(kind: string, durationSeconds = 25): Promise<string> {
  const cacheKey = `${kind}:${durationSeconds}`;
  if (generatedTrackCache.has(cacheKey)) return generatedTrackCache.get(cacheKey)!;

  const sampleRate = 44100;
  console.log(`[Music] 🎹 Generating procedural track: ${kind} (${durationSeconds}s)`);
  const samples = createProceduralSamples(kind, durationSeconds, sampleRate);
  const dataUrl = floatToWavDataUrl(samples, sampleRate);

  generatedTrackCache.set(cacheKey, dataUrl);
  console.log(`[Music] ✅ Procedural track ready: ${kind}`);
  return dataUrl;
}

export async function preloadTrack(track: MusicTrack): Promise<string> {
  if (!track.url || track.url.startsWith("generated://")) {
    const kind = track.url?.replace("generated://", "") || "ambient-deep";
    return generateProceduralTrack(kind, track.duration || 25);
  }
  return track.url;
}
