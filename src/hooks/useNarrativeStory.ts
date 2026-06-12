import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateVideoFromSegments, uploadVideoToStorage } from "@/lib/video-encoder";
import { VIDEO_CONFIG } from "@/lib/video-config";
import { getRandomTrack, preloadTrack } from "@/lib/background-music";
import { pickLocalImageBankImages } from "@/lib/local-image-bank";
import { synthesizeWithNeuralVoice, getNeuralVoiceStatus } from "@/lib/neural-voice";
import { synthesizeWithKokoro, preloadKokoro } from "@/lib/kokoro-voice";

// Helper to convert AudioBuffer to WAV Blob for concatenated narration
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export interface StorySegment {
  id: string;
  text: string;
  imageUrl: string;
  imagePrompt: string;
  duration: number;
  startTime: number;
  audioUrl?: string;
}

export interface NarrativeStoryState {
  step: "idle" | "script" | "images" | "audio" | "video" | "complete" | "error";
  progress: number;
  title: string;
  segments: StorySegment[];
  narrationUrl: string;
  ctaNarrationUrl: string;
  backgroundMusicUrl: string;
  videoUrl: string;
  totalDuration: number;
  error: string | null;
}

interface UseNarrativeStoryOptions {
  brandName?: string;
  segmentCount?: number;
  segmentDuration?: number;
  preferredVoice?: string;
}

const normalizeNarrationText = (text: string) => text.replace(/\s+/g, " ").trim();

const dedupeImageUrls = (urls?: string[]) => {
  if (!urls?.length) return [];

  const unique = urls.filter((url, index, array) => {
    if (!url) return false;
    if (index === 0) return true;
    return url !== array[index - 1] && array.slice(0, index).filter(existing => existing === url).length < 1;
  });

  return unique.length >= 2 ? unique : urls.filter(Boolean);
};

const countUniqueImageUrls = (urls: string[]) => new Set(urls.filter(Boolean)).size;

const buildProgrammaticFallbackFrame = (topic: string | undefined, index: number) => {
  if (typeof document === "undefined") return "";

  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const palettes = [
    ["#05070d", "#12343b", "#ffd700"],
    ["#06111f", "#243b6b", "#45f3ff"],
    ["#090b12", "#3b1d5f", "#ffd700"],
    ["#07130d", "#1f5a42", "#8affc1"],
    ["#120709", "#6b2438", "#ffcf5a"],
    ["#070a14", "#314159", "#ffffff"],
  ];
  const [bg, mid, accent] = palettes[index % palettes.length];
  const grad = ctx.createLinearGradient(0, 0, 720, 1280);
  grad.addColorStop(0, bg);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, "#000000");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 720, 1280);

  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  for (let y = 120; y < 1180; y += 120) {
    ctx.beginPath();
    ctx.moveTo(50, y + Math.sin(index + y) * 28);
    ctx.bezierCurveTo(220, y - 90, 480, y + 100, 680, y - 20);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = accent;
  ctx.fillRect(74 + index * 7, 220, 86, 4);
  ctx.fillRect(560 - index * 9, 980, 88, 4);

  ctx.globalAlpha = 0.08;
  ctx.font = '900 86px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText("NEURAL", 360, 560);
  ctx.fillText("UPDATE", 360, 650);

  ctx.globalAlpha = 0.75;
  ctx.font = '700 24px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = accent;
  ctx.textAlign = "left";
  ctx.fillText((topic || "TECNOLOGIA").slice(0, 34).toUpperCase(), 74, 1080);
  ctx.globalAlpha = 1;

  return canvas.toDataURL("image/png");
};

const buildNarrationCandidates = (text: string) => {
  const normalized = normalizeNarrationText(text);
  if (!normalized) return [""];

  // SEMPRE tenta o texto COMPLETO primeiro — a voz deve falar a legenda inteira.
  // Só encurta se o áudio estourar o teto de tempo, e mesmo assim cortando
  // por FRONTEIRA DE FRASE (nunca no meio de uma ideia).
  const candidates = [normalized];
  const sentences = normalized.split(/(?<=[.!?…])\s+/).filter(Boolean);
  for (let keep = sentences.length - 1; keep >= 1; keep--) {
    const candidate = sentences.slice(0, keep).join(" ").trim();
    if (candidate) candidates.push(candidate);
  }

  return Array.from(new Set(candidates));
};

const DEFAULT_NARRATION_PADDING = 0.45;

async function audioUrlToArrayBuffer(audioUrl: string): Promise<ArrayBuffer> {
  if (audioUrl.startsWith("data:")) {
    const base64 = audioUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  const response = await fetch(audioUrl);
  return await response.arrayBuffer();
}

function fitSegmentDurationsToBudget(
  durations: number[],
  speechDurations: number[],
  maxTotalDuration: number,
): number[] | null {
  const adjustedDurations = [...durations];
  let overflow = adjustedDurations.reduce((sum, duration) => sum + duration, 0) - maxTotalDuration;

  if (overflow <= 0.01) {
    return adjustedDurations;
  }

  for (let index = adjustedDurations.length - 1; index >= 0 && overflow > 0.01; index--) {
    const minDuration = Math.max(
      VIDEO_CONFIG.MIN_SEGMENT_DURATION,
      speechDurations[index] || VIDEO_CONFIG.MIN_SEGMENT_DURATION,
    );
    const removableDuration = Math.max(0, adjustedDurations[index] - minDuration);

    if (removableDuration <= 0) continue;

    const reduction = Math.min(removableDuration, overflow);
    adjustedDurations[index] -= reduction;
    overflow -= reduction;
  }

  return overflow <= 0.01 ? adjustedDurations : null;
}

export function useNarrativeStory(options: UseNarrativeStoryOptions = {}) {
  const requestedSegmentCount = options.segmentCount ?? VIDEO_CONFIG.SEGMENT_COUNT;
  const requestedSegmentDuration = options.segmentDuration ?? VIDEO_CONFIG.SEGMENT_DURATION_BASE;
  const segmentCount = Math.min(requestedSegmentCount, VIDEO_CONFIG.SEGMENT_COUNT);
  const segmentDuration = Math.min(
    Math.max(requestedSegmentDuration, VIDEO_CONFIG.MIN_SEGMENT_DURATION),
    VIDEO_CONFIG.MAX_SEGMENT_DURATION,
  );
  
  const [state, setState] = useState<NarrativeStoryState>({
    step: "idle",
    progress: 0,
    title: "",
    segments: [],
    narrationUrl: "",
    ctaNarrationUrl: "",
    backgroundMusicUrl: "",
    videoUrl: "",
    totalDuration: 0,
    error: null,
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const abortRef = useRef(false);

  const reset = useCallback(() => {
    abortRef.current = true;
    setState({
      step: "idle",
      progress: 0,
      title: "",
      segments: [],
      narrationUrl: "",
      ctaNarrationUrl: "",
      backgroundMusicUrl: "",
      videoUrl: "",
      totalDuration: 0,
      error: null,
    });
    setIsGenerating(false);
    setTimeout(() => { abortRef.current = false; }, 100);
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, step: "error", error }));
    setIsGenerating(false);
    toast.error(error);
  }, []);

  // ═══ Step 1: Generate structured script ═══
  const generateScript = useCallback(async (topic: string) => {
    setState(prev => ({ ...prev, step: "script", progress: 5 }));
    
    try {
      const totalDuration = segmentCount * segmentDuration;
      
      const { data, error } = await supabase.functions.invoke("generate-story-script", {
        body: { 
          topic, 
          segmentCount,
          wordsPerSegment: VIDEO_CONFIG.WORDS_PER_SEGMENT,
          totalDuration,
          style: VIDEO_CONFIG.SCRIPT_STYLE,
        },
      });

      if (error) throw error;
      if (!data?.segments || data.segments.length === 0) {
        throw new Error("Nenhum roteiro gerado");
      }

      const scriptSegments = data.segments.slice(0, segmentCount);
      if (scriptSegments.length < segmentCount) {
        throw new Error(`O roteiro retornou ${scriptSegments.length} cena(s), mas o vídeo precisa de ${segmentCount}.`);
      }

      let currentTime = 0;
      const segments: StorySegment[] = scriptSegments.map((seg: any, index: number) => {
        const segment: StorySegment = {
          id: `seg-${index}`,
          text: seg.text,
          imagePrompt: seg.imagePrompt,
          imageUrl: "",
          duration: segmentDuration,
          startTime: currentTime,
        };
        currentTime += segmentDuration;
        return segment;
      });

      setState(prev => ({ 
        ...prev, 
        title: data.title || topic,
        segments,
        totalDuration: currentTime,
        progress: 15,
      }));
      
      toast.success(`Roteiro: ${segments.length} cenas criadas`);
      return segments;
    } catch (error: any) {
      setError(error.message || "Erro ao gerar roteiro");
      return null;
    }
  }, [segmentCount, segmentDuration, setError]);

  // ═══ Step 2: Search/generate images ═══
  const generateImages = useCallback(async (segments: StorySegment[], topic?: string, articleInfo?: { articleUrl?: string; articleImageUrl?: string }) => {
    setState(prev => ({ ...prev, step: "images", progress: 20 }));
    
    const updatedSegments = segments.map(segment => ({ ...segment }));
    
    try {
      const imageQuery = [
        topic,
        ...segments.map(segment => `${segment.text} ${segment.imagePrompt}`),
      ].filter(Boolean).join(" ");
      const bankImages = await pickLocalImageBankImages(imageQuery || "tecnologia inteligencia artificial", updatedSegments.length);

      bankImages.forEach((asset, index) => {
        if (index < updatedSegments.length && !updatedSegments[index].imageUrl) {
          updatedSegments[index] = { ...updatedSegments[index], imageUrl: asset.url };
        }
      });

      if (bankImages.length > 0) {
        console.log(`[IMAGES] Banco local: ${bankImages.length} imagem(ns) selecionada(s)`);
      }
    } catch (e) {
      console.warn("[IMAGES] Local image bank failed:", e);
    }

    try {
      const missingBeforeSearch = updatedSegments
        .map((segment, index) => (!segment.imageUrl ? index : -1))
        .filter(index => index >= 0);

      if (missingBeforeSearch.length > 0) {
        const { data: searchResult, error: searchError } = await supabase.functions.invoke('search-images-for-video', {
          body: {
            topic: topic || segments[0]?.text || 'tecnologia',
            segments: missingBeforeSearch.map(index => ({ text: segments[index].text, imagePrompt: segments[index].imagePrompt })),
          }
        });
        
        if (searchError) throw new Error(searchError.message || 'Erro na busca de imagens');

        if (searchResult?.success && searchResult.images?.length > 0) {
          searchResult.images.forEach((img: any, resultIndex: number) => {
            const index = missingBeforeSearch[resultIndex];
            if (index < updatedSegments.length) {
            const imageUrl = typeof img === 'string' ? img : img.imageUrl;
            if (imageUrl) {
              updatedSegments[index] = { ...updatedSegments[index], imageUrl };
            }
          }
          });
          
          if (searchResult.imageIds?.length > 0) {
            try {
              const stored = JSON.parse(localStorage.getItem('usedImageIds') || '[]');
              const updated = [...new Set([...stored, ...searchResult.imageIds])].slice(-100);
              localStorage.setItem('usedImageIds', JSON.stringify(updated));
            } catch (e) { /* ignore */ }
          }
        }
      }
    } catch (e) {
      console.warn('[IMAGES] Search failed:', e);
    }

    const missingImageIndexes = updatedSegments
      .map((segment, index) => (!segment.imageUrl ? index : -1))
      .filter(index => index >= 0);

    if (missingImageIndexes.length > 0) {
      console.warn(`[IMAGES] ${missingImageIndexes.length} cena(s) sem imagem — criando frames editoriais locais para manter transições.`);

      missingImageIndexes.forEach(index => {
        const fallbackFrame = buildProgrammaticFallbackFrame(topic || segments[index]?.text, index);
        if (fallbackFrame) {
          updatedSegments[index] = { ...updatedSegments[index], imageUrl: fallbackFrame };
        }
      });
    }

    if (countUniqueImageUrls(updatedSegments.map(segment => segment.imageUrl)) < 2 && updatedSegments.length > 1) {
      console.warn('[IMAGES] Só havia 1 imagem única — adicionando frames editoriais para o vídeo não ficar travado.');
      updatedSegments.forEach((segment, index) => {
        if (index === 0 && segment.imageUrl) return;
        const fallbackFrame = buildProgrammaticFallbackFrame(topic || segment.text, index);
        if (fallbackFrame) {
          updatedSegments[index] = { ...segment, imageUrl: fallbackFrame };
        }
      });
    }

    const unresolvedImages = updatedSegments
      .map((segment, index) => (!segment.imageUrl ? index + 1 : null))
      .filter((index): index is number => index !== null);

    if (unresolvedImages.length > 0) {
      setError(`Não consegui preparar as imagens das cenas ${unresolvedImages.join(", ")}. O vídeo foi cancelado para não sair quebrado.`);
      return null;
    }

    let currentTime = 0;
    const finalizedSegments = updatedSegments.map(segment => {
      const updatedSegment = { ...segment, startTime: currentTime };
      currentTime += segment.duration;
      return updatedSegment;
    });

    setState(prev => ({ 
      ...prev, 
      segments: finalizedSegments,
      totalDuration: currentTime,
      progress: 70,
    }));

    toast.success(`📸 ${finalizedSegments.length} imagens prontas!`);
    return finalizedSegments;
  }, [setError]);

  // Helper to get exact audio duration
  const getAudioDuration = useCallback((audioUrl: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = "metadata";
      
      const timeout = setTimeout(() => {
        console.warn("[getAudioDuration] Timeout");
        resolve(0);
      }, 10000);
      
      audio.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve(audio.duration);
      };
      
      audio.onerror = () => {
        clearTimeout(timeout);
        resolve(0);
      };
      
      audio.src = audioUrl;
    });
  }, []);

  const decodeAudioBuffer = useCallback(async (audioUrl: string): Promise<AudioBuffer | null> => {
    const AudioContextConstructor = globalThis.AudioContext;
    if (!AudioContextConstructor) {
      return null;
    }

    let audioContext: AudioContext | null = null;

    try {
      audioContext = new AudioContextConstructor();
      if (audioContext.state === "suspended") {
        await audioContext.resume().catch(() => {});
      }

      const arrayBuffer = await audioUrlToArrayBuffer(audioUrl);
      return await audioContext.decodeAudioData(arrayBuffer.slice(0));
    } catch (error) {
      console.warn("[decodeAudioBuffer] Failed to decode audio", error);
      return null;
    } finally {
      if (audioContext) {
        await audioContext.close().catch(() => {});
      }
    }
  }, []);

  // ═══ Step 3: Generate per-segment narration — ElevenLabs first, with safe fallbacks ═══
  const generateAudio = useCallback(async (segments: StorySegment[]) => {
    if (abortRef.current) return { narrationUrl: "", ctaNarrationUrl: "", backgroundMusicUrl: "", fullScript: "", segmentDurations: [] as number[] };
    setState(prev => ({ ...prev, step: "audio", progress: 72 }));
    
    const fullScript = segments.map(s => s.text).join(" ");
    const maxNarrationDuration = VIDEO_CONFIG.MAX_TOTAL_DURATION - VIDEO_CONFIG.NARRATION_CTA_GAP - VIDEO_CONFIG.CTA_MAX_DURATION;
    
    // CTAs curtos (≤10 palavras) — precisam caber INTEIROS na cena final
    const ctaTexts = [
      "Análise completa no blog Neural Update. Salva esse Reels.",
      "Salva agora. A leitura completa está no Neural Update.",
      "Quer o impacto real? Está no blog Neural Update.",
    ];
    const ctaScript = ctaTexts[Math.floor(Math.random() * ctaTexts.length)];
    
    let narrationUrl = "";
    let ctaNarrationUrl = "";
    let backgroundMusicUrl = "";
    const segmentDurations: number[] = [];
    
    const buildAudioDataUrl = (audioContent: string, format = "mp3") => `data:audio/${format};base64,${audioContent}`;

    const invokeTTS = async (
      functionName: string,
      body: Record<string, unknown>,
      provider: string,
    ): Promise<{ audioUrl: string | null; provider: string }> => {
      if (abortRef.current) return { audioUrl: null, provider };
      
      try {
        const result = await supabase.functions.invoke(functionName, {
          body,
        });

        if (!result.error && result.data?.audioContent && !result.data?.error) {
          return {
            audioUrl: buildAudioDataUrl(result.data.audioContent, result.data.format || "mp3"),
            provider,
          };
        }

        if (result.data?.error) {
          console.error(`[TTS] ${provider} error: ${result.data.error}`);
        }
        if (result.error) {
          console.error(`[TTS] ${provider} invoke error: ${result.error.message}`);
        }
      } catch (e) { 
        console.error(`[TTS] ${provider} failed:`, e); 
      }
      
      return { audioUrl: null, provider };
    };

    const userVoice = (options.preferredVoice && options.preferredVoice !== "default")
      ? options.preferredVoice
      : "thalita";

    const callNarrationTTS = async (text: string): Promise<{ audioUrl: string | null; provider: string }> => {
      // Voz ÚNICA: Kokoro rodando 100% no navegador (open source, sem custo, sem servidor).
      // Sem fallbacks — se falhar, o erro sobe e o render é cancelado para evitar voz ruim.
      const kokoro = await synthesizeWithKokoro(text, {
        voice: userVoice === "antonio" ? "male" : "female",
      });
      if (kokoro?.audioUrl) {
        return { audioUrl: kokoro.audioUrl, provider: kokoro.provider };
      }
      throw new Error("Kokoro não retornou áudio. Recarregue a página para baixar o modelo novamente.");
    };
    
    // ─── Background music: Procedural → MusicGen (sem APIs pagas) ───
    const generateBackgroundMusic = async (mood?: string): Promise<string> => {
      if (abortRef.current) return "";

      try {
        const track = getRandomTrack(mood);
        const musicUrl = await preloadTrack(track);
        if (musicUrl) return musicUrl;
      } catch (e) { console.warn("[Music] Procedural error:", e); }

      if (abortRef.current) return "";

      // Fallback: MusicGen (HuggingFace, grátis)
      try {
        const musicResult = await supabase.functions.invoke("huggingface-musicgen", {
          body: { mood: mood || "technology", duration: 15 },
        });
        const audioContent = musicResult.data?.audioContent;
        if (!musicResult.error && typeof audioContent === 'string' && audioContent.length > 100 && !musicResult.data?.fallback) {
          const format = musicResult.data?.format || "wav";
          console.log("[Music] ✅ MusicGen success!");
          return `data:audio/${format};base64,${audioContent}`;
        }
      } catch (e) { console.warn("[Music] MusicGen error:", e); }

      return "";
    };
    
    try {
      // ═══ PER-SEGMENT TTS → exact duration → perfect sync ═══
      console.log("[TTS] 🎯 Generating PER-SEGMENT narration with protected fallback chain...");
      
      const segmentAudioUrls: string[] = [];
      const segmentAudioBuffers: (AudioBuffer | null)[] = [];
      const finalSegmentTexts: string[] = [];
      let accumulatedNarrationDuration = 0;
      
      for (let i = 0; i < segments.length; i++) {
        if (abortRef.current) break;
        console.log(`[TTS] Segment ${i + 1}/${segments.length}: "${segments[i].text.substring(0, 40)}..."`);

        const remainingSegments = segments.length - i - 1;
        const remainingMinimumDuration = remainingSegments * VIDEO_CONFIG.MIN_SEGMENT_DURATION;
        const remainingBudget = maxNarrationDuration - accumulatedNarrationDuration;
        // Cota justa: cada cena pode usar sua fatia do orçamento restante (+35% de folga),
        // evitando que as primeiras cenas consumam todo o tempo das últimas.
        const fairShare = (remainingBudget / (remainingSegments + 1)) * 1.35;
        const maxAllowedForCurrent = Math.min(
          VIDEO_CONFIG.MAX_SEGMENT_DURATION,
          Math.max(
            VIDEO_CONFIG.MIN_SEGMENT_DURATION,
            Math.min(fairShare, remainingBudget - remainingMinimumDuration),
          ),
        );

        let selectedAudioUrl: string | null = null;
        let selectedAudioBuffer: AudioBuffer | null = null;
        let selectedProvider = "none";
        let selectedText = segments[i].text;
        let selectedDuration = 0;

        // Narração SEMPRE via Neural Voice — áudio do servidor (se existir) é ignorado
        // para garantir a voz premium local em todos os vídeos.
        if (!selectedAudioUrl) {
          const narrationCandidates = buildNarrationCandidates(segments[i].text);
          selectedText = narrationCandidates[0] || normalizeNarrationText(segments[i].text);

          for (const candidateText of narrationCandidates) {
            const { audioUrl, provider } = await callNarrationTTS(candidateText);
            if (!audioUrl) continue;

            const decodedBuffer = await decodeAudioBuffer(audioUrl);
            const measuredDuration = decodedBuffer?.duration || await getAudioDuration(audioUrl);
            const safePadding = measuredDuration > 0
              ? Math.min(DEFAULT_NARRATION_PADDING, Math.max(0, maxAllowedForCurrent - measuredDuration))
              : DEFAULT_NARRATION_PADDING;
            const visualDuration = measuredDuration > 0
              ? Math.max(VIDEO_CONFIG.MIN_SEGMENT_DURATION, measuredDuration + safePadding)
              : Math.max(VIDEO_CONFIG.SEGMENT_DURATION_BASE, candidateText.split(/\s+/).length / 2.0);

            selectedAudioUrl = audioUrl;
            selectedAudioBuffer = decodedBuffer;
            selectedProvider = provider;
            selectedText = candidateText;
            selectedDuration = visualDuration;

            if (visualDuration <= maxAllowedForCurrent + 0.05) {
              break;
            }

            console.warn(
              `[TTS] Segment ${i + 1} excedeu o teto seguro (${visualDuration.toFixed(1)}s > ${maxAllowedForCurrent.toFixed(1)}s). Encurtando texto...`,
            );
          }
        }

        if (!selectedAudioUrl) {
          throw new Error(`Nenhuma voz disponível para a cena ${i + 1}. Verifique o Neural Voice local ou tente novamente.`);
        }

        segmentAudioUrls.push(selectedAudioUrl);
        segmentAudioBuffers.push(selectedAudioBuffer);
        finalSegmentTexts.push(selectedText);
        segmentDurations.push(selectedDuration);
        accumulatedNarrationDuration += selectedDuration;

        if (selectedText !== segments[i].text) {
          console.log(`[TTS] Segment ${i + 1}: texto encurtado para manter sincronização e caber no vídeo.`);
        }

        console.log(`[TTS] Segment ${i + 1}: provider=${selectedProvider} | visual=${selectedDuration.toFixed(1)}s`);
      }

      if (accumulatedNarrationDuration > maxNarrationDuration + 0.1) {
        console.warn(
          `[TTS] Narração total ${accumulatedNarrationDuration.toFixed(1)}s > limite ${maxNarrationDuration.toFixed(1)}s — fitSegmentDurationsToBudget vai aparar os respiros entre cenas.`,
        );
      }
      
      console.log(`[TTS] ✅ Per-segment durations: ${segmentDurations.map(d => d.toFixed(1) + 's').join(', ')}`);
      
      // ─── Concatenate segment audios into single narration ───
      if (segmentAudioUrls.some(url => url)) {
        try {
          const buffers: (AudioBuffer | null)[] = [];
          const speechDurations: number[] = [];
          
           for (let i = 0; i < segmentAudioUrls.length; i++) {
              const url = segmentAudioUrls[i];
            try {
               const cachedBuffer = segmentAudioBuffers[i];
               const decoded = cachedBuffer || (await decodeAudioBuffer(url));
               if (!decoded) {
                 throw new Error(`Falha ao decodificar o áudio da cena ${i + 1}.`);
               }
              buffers.push(decoded);
               speechDurations.push(decoded.duration);
              
              // ★ RECONCILE: Use decoded buffer duration as ground truth
              // This catches cases where getAudioDuration returned 0 but buffer is valid
              if (decoded.duration > 0) {
                 const correctedDuration = Math.max(
                   VIDEO_CONFIG.MIN_SEGMENT_DURATION,
                   decoded.duration + Math.max(0, Math.min(DEFAULT_NARRATION_PADDING, segmentDurations[i] - decoded.duration)),
                 );
                 const idx = buffers.length - 1;
                if (Math.abs(correctedDuration - segmentDurations[idx]) > 0.5) {
                  console.log(`[TTS] ⚡ Reconciled seg ${idx + 1}: ${segmentDurations[idx].toFixed(1)}s → ${correctedDuration.toFixed(1)}s (from decoded buffer)`);
                  segmentDurations[idx] = correctedDuration;
                }
              }
            } catch (e) {
               console.error(`[TTS] Failed to decode segment audio ${i + 1}:`, e);
               throw new Error(`Falha ao processar o áudio da cena ${i + 1}. O vídeo foi cancelado para não sair com silêncio.`);
            }
          }

           let adjustedDurations = fitSegmentDurationsToBudget(segmentDurations, speechDurations, maxNarrationDuration);
           if (!adjustedDurations) {
             // Não coube com CTA máximo — tenta o orçamento estendido (CTA mínimo)
             const extendedBudget = VIDEO_CONFIG.MAX_TOTAL_DURATION - VIDEO_CONFIG.NARRATION_CTA_GAP - VIDEO_CONFIG.CTA_MIN_DURATION;
             console.warn(`[TTS] Narração não coube no orçamento padrão — usando orçamento estendido de ${extendedBudget.toFixed(1)}s (CTA mínimo).`);
             adjustedDurations = fitSegmentDurationsToBudget(segmentDurations, speechDurations, extendedBudget);
           }
           if (!adjustedDurations) {
             // Último recurso: remove todos os respiros e usa a duração exata da fala — NUNCA falha
             console.warn("[TTS] Fala pura excede o orçamento — usando durações exatas da fala; o CTA será comprimido no render.");
             adjustedDurations = speechDurations.map(d => Math.max(VIDEO_CONFIG.MIN_SEGMENT_DURATION, d));
           }

           if (adjustedDurations.some((duration, index) => Math.abs(duration - segmentDurations[index]) > 0.01)) {
             console.log("[TTS] Ajustando pequenos intervalos entre cenas para manter o vídeo dentro do limite.");
             segmentDurations.splice(0, segmentDurations.length, ...adjustedDurations);
           }
          
          const totalNarrationDuration = segmentDurations.reduce((a, b) => a + b, 0);
          const sampleRate = buffers.find(b => b)?.sampleRate || 44100;
          const numChannels = buffers.find(b => b)?.numberOfChannels || 1;
          const offline = new OfflineAudioContext(numChannels, Math.ceil(sampleRate * totalNarrationDuration), sampleRate);
          
          let audioOffset = 0;
          for (let i = 0; i < buffers.length; i++) {
            if (buffers[i]) {
              const src = offline.createBufferSource();
              src.buffer = buffers[i]!;
              src.connect(offline.destination);
              src.start(audioOffset);
            }
            audioOffset += segmentDurations[i];
          }
          
          const renderedBuffer = await offline.startRendering();
          const wavBlob = audioBufferToWavBlob(renderedBuffer);
          narrationUrl = URL.createObjectURL(wavBlob);
          console.log(`[TTS] 🎵 Concatenated narration: ${totalNarrationDuration.toFixed(1)}s (reconciled durations)`);
        } catch (e) {
          console.warn("[TTS] Concatenation failed, using first segment:", e);
          narrationUrl = segmentAudioUrls.find(url => url) || "";
        }
      }
      
      // ─── CTA narration (also ElevenLabs Sarah) ───
       if (narrationUrl) {
         const { audioUrl: ctaUrl } = await callNarrationTTS(ctaScript);
         ctaNarrationUrl = ctaUrl || "";
      }
      
      // ─── Background music ───
      backgroundMusicUrl = await generateBackgroundMusic();
      
      // ─── Update segment durations in state ───
      setState(prev => {
        let currentTime = 0;
        const updatedSegments = prev.segments.map((seg, i) => {
          const segDuration = segmentDurations[i] || VIDEO_CONFIG.SEGMENT_DURATION_BASE;
          const updated = {
            ...seg,
            // Legenda exibida = EXATAMENTE o que a voz fala (sincronização perfeita).
            // Se a narração foi encurtada (por frase inteira), a legenda acompanha.
            text: finalSegmentTexts[i] || seg.text,
            duration: segDuration,
            startTime: currentTime,
          };
          currentTime += segDuration;
          return updated;
        });
        return { 
          ...prev, 
          segments: updatedSegments,
          totalDuration: currentTime,
          narrationUrl, 
          ctaNarrationUrl,
          backgroundMusicUrl,
          progress: 80 
        };
      });

      const finalFullScript = finalSegmentTexts.join(" ") || fullScript;
      
      return { narrationUrl, ctaNarrationUrl, backgroundMusicUrl, fullScript: finalFullScript, segmentDurations };
    } catch (error: any) {
      console.warn("TTS error:", error);
      setState(prev => ({ ...prev, progress: 80 }));
      return { narrationUrl: "", ctaNarrationUrl: "", backgroundMusicUrl: "", fullScript, segmentDurations: [] as number[] };
    }
  }, [decodeAudioBuffer, getAudioDuration]);

  // ═══ Step 4: Generate video ═══
  const generateVideo = useCallback(async (
    segmentsInput: StorySegment[], 
    narrationUrl: string,
    ctaNarrationUrl: string,
    backgroundMusicUrl: string
  ) => {
    if (abortRef.current) return null;
    
    // Get latest segments (with audio-driven durations)
    const latestState = await new Promise<NarrativeStoryState>(resolve => {
      setState(prev => {
        resolve(prev);
        return { ...prev, step: "video", progress: 82 };
      });
    });
    
    const segments = latestState.segments.length > 0 ? latestState.segments : segmentsInput;
    
    try {
      if (!narrationUrl) {
        throw new Error("A narração não ficou pronta. O vídeo foi cancelado para evitar descompasso.");
      }

      if (segments.length > VIDEO_CONFIG.MAX_SEGMENTS) {
        throw new Error(`Esse formato aceita no máximo ${VIDEO_CONFIG.MAX_SEGMENTS} cenas.`);
      }

      const visualContentDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
      const narrationAudioDuration = await getAudioDuration(narrationUrl);
      const narrationDuration = Math.max(visualContentDuration, narrationAudioDuration || visualContentDuration);
      const ctaAudioDuration = ctaNarrationUrl ? await getAudioDuration(ctaNarrationUrl) : 0;
      // O CTA se ajusta ao espaço restante — comprime em vez de derrubar o render
      const remainingForCta = VIDEO_CONFIG.MAX_TOTAL_DURATION - narrationDuration - VIDEO_CONFIG.NARRATION_CTA_GAP;
      const desiredCta = ctaNarrationUrl
        ? Math.max(VIDEO_CONFIG.CTA_MIN_DURATION, ctaAudioDuration + 0.5)
        : VIDEO_CONFIG.CTA_MIN_DURATION;
      const ctaDuration = Math.max(
        VIDEO_CONFIG.CTA_MIN_DURATION,
        Math.min(desiredCta, VIDEO_CONFIG.CTA_MAX_DURATION, remainingForCta),
      );
      const totalDuration = narrationDuration + VIDEO_CONFIG.NARRATION_CTA_GAP + ctaDuration;

      if (totalDuration > VIDEO_CONFIG.MAX_TOTAL_DURATION + 0.15) {
        console.warn(
          `[generateVideo] Duração ${totalDuration.toFixed(1)}s acima do alvo de ${VIDEO_CONFIG.MAX_TOTAL_DURATION}s — seguindo com CTA comprimido (a narração nunca é cortada).`,
        );
      }
      
      toast.info(`Renderizando vídeo (${totalDuration.toFixed(1)}s, ${segments.length} cenas)...`);
      console.log("[generateVideo] Segment durations:", segments.map(s => Number(s.duration.toFixed(1))));
      
      const videoBlob = await generateVideoFromSegments({
        width: VIDEO_CONFIG.WIDTH,
        height: VIDEO_CONFIG.HEIGHT,
        fps: VIDEO_CONFIG.FPS,
        audioUrl: narrationUrl || undefined,
        ctaAudioUrl: ctaNarrationUrl || undefined,
        backgroundMusicUrl: backgroundMusicUrl || undefined,
        segments: segments.map(seg => ({
          imageUrl: seg.imageUrl,
          duration: seg.duration,
          text: seg.text,
        })),
        onProgress: (progress) => {
          setState(prev => ({ ...prev, progress: 82 + Math.floor(progress * 0.13) }));
        },
      });
      
      console.log("[generateVideo] WebM:", (videoBlob.size / 1024 / 1024).toFixed(2), "MB");
      setState(prev => ({ ...prev, progress: 96 }));
      
      toast.info("Enviando vídeo...");
      const videoUrl = await uploadVideoToStorage(videoBlob, supabase, "post-videos");
      
      setState(prev => ({ 
        ...prev, 
        videoUrl,
        progress: 100,
        step: "complete",
      }));
      
      toast.success("Vídeo criado com sucesso!");
      return videoUrl;
    } catch (error: any) {
      console.error("[generateVideo] Error:", error);
      setError(`Erro ao gerar vídeo: ${error.message}`);
      return null;
    }
  }, [getAudioDuration, setError]);

  // ═══ Full pipeline ═══
  const generateStory = useCallback(async (topic: string) => {
    abortRef.current = false;
    setIsGenerating(true);
    setState(prev => ({ ...prev, step: "idle", progress: 0, error: null, videoUrl: "" }));

    const segments = await generateScript(topic);
    if (!segments || abortRef.current) { setIsGenerating(false); return; }

    const segmentsWithImages = await generateImages(segments, topic);
    if (!segmentsWithImages || abortRef.current) { setIsGenerating(false); return; }

    const audioResult = await generateAudio(segmentsWithImages);
    if (abortRef.current) { setIsGenerating(false); return; }

    await generateVideo(
      segmentsWithImages, 
      audioResult?.narrationUrl || "", 
      audioResult?.ctaNarrationUrl || "",
      audioResult?.backgroundMusicUrl || ""
    );
    setIsGenerating(false);
  }, [generateScript, generateImages, generateAudio, generateVideo]);

  // ═══ Render from existing script ═══
  const renderFromScript = useCallback(async (
    existingSegments: Array<{ text: string; imagePrompt: string; imageUrl?: string | null; audioUrl?: string | null; duration?: number }>,
    title?: string,
    articleInfo?: { articleUrl?: string; articleImageUrl?: string },
    preExistingImageUrls?: string[]
  ) => {
    abortRef.current = false;
    setIsGenerating(true);
    setState(prev => ({ ...prev, step: "idle", progress: 0, error: null, videoUrl: "" }));

    // Probe rápido: avisa se Neural Voice local está offline, mas NÃO aborta —
    // o pipeline tem fallback automático: Kokoro no navegador → Edge Neural TTS.
    const voiceUp = await getNeuralVoiceStatus();
    if (!voiceUp) {
      console.warn("[Render] Neural Voice local offline — usando Kokoro no navegador.");
      toast.info("🎙️ Servidor de voz offline — baixando voz neural Kokoro no navegador (1ª vez pode demorar ~1min).");
      preloadKokoro(); // começa o download do modelo já, em paralelo com roteiro/imagens
    }

    const normalizedScript = existingSegments.slice(0, segmentCount);
    const usableImageUrls = dedupeImageUrls(preExistingImageUrls);
    let currentTime = 0;
    let segments: StorySegment[] = normalizedScript.map((seg, index) => {
      const dur = seg.duration && seg.duration > 0 ? seg.duration : segmentDuration;
      const segment: StorySegment = {
        id: `seg-${index}`,
        text: seg.text,
        imagePrompt: seg.imagePrompt,
        imageUrl: seg.imageUrl || usableImageUrls[index % usableImageUrls.length] || "",
        audioUrl: seg.audioUrl || undefined,
        duration: dur,
        startTime: currentTime,
      };
      currentTime += dur;
      return segment;
    });

    if (segments.some(segment => !!segment.imageUrl) && countUniqueImageUrls(segments.map(segment => segment.imageUrl)) < 2 && segments.length > 1) {
      segments = segments.map((segment, index) => {
        if (index === 0 && segment.imageUrl) return segment;
        const fallbackFrame = buildProgrammaticFallbackFrame(title || segment.text, index);
        return fallbackFrame ? { ...segment, imageUrl: fallbackFrame } : segment;
      });
    }

    setState(prev => ({ 
      ...prev, 
      step: "script",
      title: title || "Reels",
      segments,
      totalDuration: currentTime,
      progress: 15,
    }));
    
    toast.success(`Usando roteiro existente: ${segments.length} cenas`);

    // Always search local image bank first — server images (Pexels) are a fallback only.
    // Strip server imageUrls so generateImages prioritises the bank, then restore them
    // for any scene the bank or Pexels couldn't fill.
    const serverImageFallbacks = segments.map(s => s.imageUrl || "");
    const segmentsForBank = segments.map(s => ({ ...s, imageUrl: "" }));

    setState(prev => ({ ...prev, step: "images", progress: 20 }));
    const bankResult = await generateImages(segmentsForBank, title, articleInfo);
    if (!bankResult || abortRef.current) { setIsGenerating(false); return; }

    // Merge: prefer bank/search result, fall back to server image, then programmatic frame
    let segmentsWithImages: StorySegment[] = bankResult.map((seg, i) => ({
      ...seg,
      imageUrl: seg.imageUrl || serverImageFallbacks[i] || "",
    }));

    const audioResult = await generateAudio(segmentsWithImages);
    if (abortRef.current) { setIsGenerating(false); return; }

    await generateVideo(
      segmentsWithImages, 
      audioResult?.narrationUrl || "", 
      audioResult?.ctaNarrationUrl || "",
      audioResult?.backgroundMusicUrl || ""
    );
    setIsGenerating(false);
  }, [segmentCount, segmentDuration, generateImages, generateAudio, generateVideo, setError]);

  return {
    state,
    isGenerating,
    generateStory,
    renderFromScript,
    reset,
  };
}
