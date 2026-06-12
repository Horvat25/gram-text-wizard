// Reproduz EXATAMENTE o pipeline de src/lib/kokoro-voice.ts em Node.
import { KokoroTTS } from "kokoro-js";
import ESpeakNg from "espeak-ng";
import fs from "fs";

const TEXT = "Olá! Este é um teste da voz Dora, falando em português brasileiro sobre tecnologia e inteligência artificial em dois mil e vinte e seis.";

async function phonemizePtBr(text) {
  const espeak = await ESpeakNg({
    arguments: ["--phonout", "generated", '--sep=""', "-q", "-b", "1", "--ipa=3", "-v", "pt-br", "-f", "input.txt"],
    preRun: [(mod) => mod.FS.writeFile("input.txt", text)],
  });
  const raw = espeak.FS.readFile("generated", { encoding: "utf8" });
  return raw
    .replace(/\u200d/g, "")
    .replace(/\([a-z-]+\)/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const phonemes = await phonemizePtBr(TEXT);
console.log("PHONEMES:", JSON.stringify(phonemes));

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });

// Verifica quantos tokens viram UNK (token 0 fora dos delimitadores)
const { input_ids } = tts.tokenizer(phonemes, { truncation: true });
const ids = Array.from(input_ids.data).map(Number);
console.log("TOKENS:", ids.length, "| primeiros 30:", ids.slice(0, 30).join(","));
const unk = ids.slice(1, -1).filter((t) => t === 0).length;
console.log("UNK tokens internos:", unk, "/", ids.length - 2);

const audio = await tts.generate_from_ids(input_ids, { voice: "pf_dora", speed: 1 });
const samples = audio.audio;
console.log("AUDIO samples:", samples.length, "dur:", (samples.length / 24000).toFixed(2), "s");

// estatísticas básicas
let max = 0, sum = 0;
for (const s of samples) { max = Math.max(max, Math.abs(s)); sum += s * s; }
console.log("peak:", max.toFixed(3), "rms:", Math.sqrt(sum / samples.length).toFixed(4));

await audio.save("/tmp/teste-dora.wav");
console.log("WAV salvo em /tmp/teste-dora.wav");
