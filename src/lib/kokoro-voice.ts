// Kokoro TTS rodando 100% no navegador (sem servidor local, sem custo).
// O modelo (~80 MB, quantizado q8) é baixado UMA vez e fica em cache do browser.
// Vozes PT-BR do Kokoro: pf_dora (feminina) e pm_alex / pm_santa (masculinas).

let ttsPromise: Promise<any> | null = null;
let loadFailed = false;
let downloadToastShown = false;

type ProgressCallback = (info: { status: string; progress?: number; file?: string }) => void;

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

export async function synthesizeWithKokoro(
  text: string,
  options: { voice?: "female" | "male" } = {},
): Promise<{ audioUrl: string; duration: number; provider: string } | null> {
  if (!text.trim()) return null;

  if (!downloadToastShown) {
    downloadToastShown = true;
    console.log("[kokoro] baixando/carregando modelo de voz local (primeira vez pode levar ~1min)...");
  }

  const tts = await loadKokoro();
  if (!tts) return null;

  try {
    // Vozes disponíveis no Kokoro v1.0 ONNX (alta qualidade).
    // af_heart = feminina natural / am_michael = masculina natural.
    const voice = options.voice === "male" ? "am_michael" : "af_heart";
    const audio = await tts.generate(text, { voice });

    const blob: Blob = typeof audio.toBlob === "function"
      ? audio.toBlob()
      : new Blob([audio.toWav()], { type: "audio/wav" });

    const duration =
      audio.audio && audio.sampling_rate
        ? audio.audio.length / audio.sampling_rate
        : 0;

    return {
      audioUrl: URL.createObjectURL(blob),
      duration,
      provider: "kokoro-browser",
    };
  } catch (e) {
    console.warn("[kokoro] síntese falhou:", e);
    throw e;
  }
}
