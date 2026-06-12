// Kokoro TTS rodando 100% no navegador (sem servidor local, sem custo).
// O modelo (~80 MB) é baixado UMA vez e fica em cache do browser.
//
// VOZES NATIVAS PT-BR: pf_dora (feminina editorial), pm_alex (masculino tech),
// pm_santa (grave/personagem). O pacote kokoro-js só lista vozes em inglês na
// validação, mas os arquivos pt-br EXISTEM no repositório do modelo. Então:
//   1. Fonemizamos o texto em "pt-br" com espeak-ng WASM (dados completos de
//      idiomas — o pacote "phonemizer" usado pelo kokoro-js só traz inglês);
//   2. Tokenizamos com o tokenizer do próprio modelo;
//   3. Chamamos tts.generate_from_ids(), que NÃO valida o nome da voz e baixa
//      o pf_dora.bin/pm_alex.bin direto do repositório.
// Resultado: voz 100% portuguesa, sem sotaque, sem fallback pago.

let ttsPromise: Promise<any> | null = null;
let loadFailed = false;
let downloadToastShown = false;

type ProgressCallback = (info: { status: string; progress?: number; file?: string }) => void;

export type KokoroVoiceId = "dora" | "alex" | "santa";

// Mapeamento das vozes PT-BR reais no repositório do modelo.
const PT_VOICES: Record<KokoroVoiceId, string> = {
  dora: "pf_dora",   // feminina editorial
  alex: "pm_alex",   // masculino tech
  santa: "pm_santa", // grave / personagem
};

async function loadKokoro(onProgress?: ProgressCallback): Promise<any | null> {
  if (loadFailed) return null;
  if (!ttsPromise) {
    ttsPromise = (async () => {
      const { KokoroTTS } = await import("kokoro-js");

      // Tenta WebGPU (mais rápido) e cai para WASM (compatível com tudo).
      try {
        return await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
          dtype: "fp32",
          device: "webgpu",
          progress_callback: onProgress as any,
        });
      } catch {
        console.warn("[kokoro] WebGPU indisponível, usando WASM (q8)...");
        return await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
          dtype: "q8",
          device: "wasm",
          progress_callback: onProgress as any,
        });
      }
    })();
    ttsPromise.catch((e) => {
      console.warn("[kokoro] falha ao carregar o modelo:", e);
      loadFailed = true;
      ttsPromise = null;
    });
  }
  try {
    return await ttsPromise;
  } catch {
    return null;
  }
}

/** Pré-carrega o modelo em background (chame cedo, ex: ao abrir a tela de Reels). */
export function preloadKokoro(): void {
  void loadKokoro();
}

// Divide o texto em pedaços que cabem no limite de ~510 tokens do modelo.
function splitIntoChunks(text: string, maxLen = 280): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .match(/[^.!?…]+[.!?…]*/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [text];

  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current && (current.length + s.length + 1) > maxLen) {
      chunks.push(current);
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
    // Frase única gigante: corta por vírgulas como último recurso.
    while (current.length > maxLen * 1.5) {
      const cut = current.lastIndexOf(",", maxLen);
      const idx = cut > 40 ? cut + 1 : maxLen;
      chunks.push(current.slice(0, idx).trim());
      current = current.slice(idx).trim();
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// Gera WAV PCM 16-bit a partir de Float32.
function floatToWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// Fonemiza PT-BR com espeak-ng WASM (dados completos de idiomas).
// Cada chamada cria uma instância CLI; o .wasm fica em cache do browser.
async function phonemizePtBr(text: string): Promise<string> {
  const [{ default: ESpeakNg }, { default: wasmUrl }] = await Promise.all([
    import("espeak-ng"),
    import("espeak-ng/dist/espeak-ng.wasm?url" as any),
  ]);

  const espeak = await ESpeakNg({
    arguments: ["--phonout", "generated", '--sep=""', "-q", "-b", "1", "--ipa=3", "-v", "pt-br", "-f", "input.txt"],
    locateFile: () => wasmUrl as string,
    preRun: [(mod: any) => mod.FS.writeFile("input.txt", text)],
  });

  const raw: string = espeak.FS.readFile("generated", { encoding: "utf8" });
  return raw
    .replace(/\u200d/g, "")          // remove "ties" (zero-width joiner) que o tokenizer não conhece
    .replace(/\([a-z-]+\)/g, "")     // remove marcadores de troca de idioma, ex: (en)
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function synthesizeChunkPtBr(tts: any, text: string, kokoroVoice: string): Promise<Float32Array> {
  const phonemes = await phonemizePtBr(text);
  if (!phonemes) return new Float32Array(0);

  const { input_ids } = tts.tokenizer(phonemes, { truncation: true });
  // generate_from_ids não valida o nome da voz → aceita pf_dora/pm_alex/pm_santa.
  const audio = await tts.generate_from_ids(input_ids, { voice: kokoroVoice, speed: 1 });
  return audio.audio as Float32Array;
}

export async function synthesizeWithKokoro(
  text: string,
  options: { voice?: "female" | "male" | KokoroVoiceId } = {},
): Promise<{ audioUrl: string; duration: number; provider: string } | null> {
  if (!text.trim()) return null;

  if (!downloadToastShown) {
    downloadToastShown = true;
    console.log("[kokoro] baixando/carregando modelo de voz local (primeira vez pode levar ~1min)...");
  }

  const tts = await loadKokoro();
  if (!tts) return null;

  // "female" → Dora, "male" → Alex; também aceita "dora"/"alex"/"santa" direto.
  const v = options.voice ?? "female";
  const kokoroVoice =
    v === "male" ? PT_VOICES.alex :
    v === "female" ? PT_VOICES.dora :
    PT_VOICES[v as KokoroVoiceId] ?? PT_VOICES.dora;

  const SAMPLE_RATE = 24000;
  const PAUSE = Math.round(SAMPLE_RATE * 0.25); // 250ms entre frases

  const chunks = splitIntoChunks(text);
  const parts: Float32Array[] = [];
  for (const chunk of chunks) {
    const samples = await synthesizeChunkPtBr(tts, chunk, kokoroVoice);
    if (samples.length > 0) parts.push(samples);
  }
  if (parts.length === 0) throw new Error("[kokoro] síntese não produziu áudio.");

  const total = parts.reduce((acc, p) => acc + p.length, 0) + PAUSE * (parts.length - 1);
  const merged = new Float32Array(total);
  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    merged.set(parts[i], offset);
    offset += parts[i].length + (i < parts.length - 1 ? PAUSE : 0);
  }

  const blob = floatToWav(merged, SAMPLE_RATE);
  return {
    audioUrl: URL.createObjectURL(blob),
    duration: merged.length / SAMPLE_RATE,
    provider: "kokoro-ptbr",
  };
}
