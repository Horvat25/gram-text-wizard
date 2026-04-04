import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateVideoFromSegments, uploadVideoToStorage } from "@/lib/video-encoder";
import { VIDEO_CONFIG } from "@/lib/video-config";
import { getRandomTrack, preloadTrack } from "@/lib/background-music";

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

export function useNarrativeStory(options: UseNarrativeStoryOptions = {}) {
  const { 
    segmentCount = VIDEO_CONFIG.SEGMENT_COUNT, 
    segmentDuration = VIDEO_CONFIG.SEGMENT_DURATION_BASE,
  } = options;
  
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

      let currentTime = 0;
      const segments: StorySegment[] = data.segments.map((seg: any, index: number) => {
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
    
    const updatedSegments = [...segments];
    
    try {
      const { data: searchResult, error: searchError } = await supabase.functions.invoke('search-images-for-video', {
        body: {
          topic: topic || segments[0]?.text || 'tecnologia',
          segments: segments.map(s => ({ text: s.text, imagePrompt: s.imagePrompt })),
        }
      });
      
      if (searchError) throw new Error(searchError.message || 'Erro na busca de imagens');

      if (searchResult?.success && searchResult.images?.length > 0) {
        searchResult.images.forEach((img: any, index: number) => {
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
    } catch (e) {
      console.warn('[IMAGES] Search failed:', e);
    }

    const validSegments = updatedSegments.filter(s => s.imageUrl);
    
    if (validSegments.length === 0) {
      setError("Nenhuma imagem foi encontrada ou gerada.");
      return null;
    }
    
    if (validSegments.length < updatedSegments.length && validSegments.length >= 2) {
      toast.warning(`${updatedSegments.length - validSegments.length} imagens falharam, continuando com ${validSegments.length}`);
    }

    let currentTime = 0;
    validSegments.forEach(seg => {
      seg.startTime = currentTime;
      currentTime += seg.duration;
    });

    setState(prev => ({ 
      ...prev, 
      segments: validSegments,
      totalDuration: currentTime,
      progress: 70,
    }));

    toast.success(`📸 ${validSegments.length} imagens prontas!`);
    return validSegments;
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

  // ═══ Step 3: Generate per-segment narration — ElevenLabs Sarah ONLY ═══
  const generateAudio = useCallback(async (segments: StorySegment[]) => {
    if (abortRef.current) return { narrationUrl: "", ctaNarrationUrl: "", backgroundMusicUrl: "", fullScript: "", segmentDurations: [] as number[] };
    setState(prev => ({ ...prev, step: "audio", progress: 72 }));
    
    const fullScript = segments.map(s => s.text).join(" ");
    
    const ctaTexts = [
      "E aí, curtiu? Então segue a gente pra não perder nenhuma novidade!",
      "Gostou do conteúdo? Segue pra ficar por dentro das últimas notícias!",
      "Quer mais conteúdo assim? Então já segue a gente!",
    ];
    const ctaScript = ctaTexts[Math.floor(Math.random() * ctaTexts.length)];
    
    let narrationUrl = "";
    let ctaNarrationUrl = "";
    let backgroundMusicUrl = "";
    const segmentDurations: number[] = [];
    
    // ─── TTS: ElevenLabs Sarah ONLY — zero fallbacks ───────
    const callElevenLabsTTS = async (text: string): Promise<string | null> => {
      if (abortRef.current) return null;
      
      try {
        const result = await supabase.functions.invoke("edge-tts", {
          body: { text },
        });
        if (!result.error && result.data?.audioContent && !result.data?.error) {
          return `data:audio/mp3;base64,${result.data.audioContent}`;
        }
        if (result.data?.error) {
          console.error(`[TTS] ElevenLabs error: ${result.data.error}`);
        }
      } catch (e) { 
        console.error("[TTS] ElevenLabs Sarah failed:", e); 
      }
      
      return null;
    };
    
    // ─── Background music: ElevenLabs Music → MusicGen → Procedural ───
    const generateBackgroundMusic = async (mood?: string): Promise<string> => {
      if (abortRef.current) return "";
      
      // 1️⃣ ElevenLabs Music
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        
        const musicPrompt = "Modern electronic background music for technology news video, professional and engaging, subtle beats, clean synths, cinematic feel";
        
        const response = await fetch(`${supabaseUrl}/functions/v1/elevenlabs-music`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ prompt: musicPrompt, duration: 30 }),
        });
        
        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("audio")) {
            const audioBlob = await response.blob();
            console.log("[Music] ✅ ElevenLabs Music generated!");
            toast.success("🎵 Trilha sonora profissional gerada!");
            return URL.createObjectURL(audioBlob);
          }
        }
        // Consume response body to prevent resource leaks
        await response.text().catch(() => {});
        console.warn(`[Music] ElevenLabs Music unavailable (${response.status}), trying fallback...`);
      } catch (e) {
        console.warn("[Music] ElevenLabs Music error:", e);
      }
      
      if (abortRef.current) return "";
      
      // 2️⃣ MusicGen (HuggingFace)
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
      
      if (abortRef.current) return "";
      
      // 3️⃣ Procedural Web Audio (always works)
      try {
        const track = getRandomTrack(mood);
        const musicUrl = await preloadTrack(track);
        if (musicUrl) return musicUrl;
      } catch (e) { console.warn("[Music] Procedural error:", e); }
      
      return "";
    };
    
    try {
      // ═══ PER-SEGMENT TTS → exact duration → perfect sync ═══
      console.log("[TTS] 🎯 Generating PER-SEGMENT narration (ElevenLabs Sarah)...");
      
      const segmentAudioUrls: string[] = [];
      
      for (let i = 0; i < segments.length; i++) {
        if (abortRef.current) break;
        console.log(`[TTS] Segment ${i + 1}/${segments.length}: "${segments[i].text.substring(0, 40)}..."`);
        
        const audioUrl = await callElevenLabsTTS(segments[i].text);
        if (audioUrl) {
          segmentAudioUrls.push(audioUrl);
          
          // ★ KEY: Measure EXACT audio duration — this becomes the segment duration
          const duration = await getAudioDuration(audioUrl);
          const segDuration = duration > 0 
            ? Math.max(VIDEO_CONFIG.MIN_SEGMENT_DURATION, duration + 0.3) // +0.3s breathing room
            : Math.max(VIDEO_CONFIG.SEGMENT_DURATION_BASE, segments[i].text.split(/\s+/).length / 2.5);
          segmentDurations.push(segDuration);
          console.log(`[TTS] Segment ${i + 1}: audio=${duration.toFixed(1)}s → visual=${segDuration.toFixed(1)}s`);
        } else {
          // No audio — estimate from word count
          const estimated = Math.max(VIDEO_CONFIG.SEGMENT_DURATION_BASE, segments[i].text.split(/\s+/).length / 2.5);
          segmentDurations.push(estimated);
          segmentAudioUrls.push("");
        }
      }
      
      console.log(`[TTS] ✅ Per-segment durations: ${segmentDurations.map(d => d.toFixed(1) + 's').join(', ')}`);
      
      // ─── Concatenate segment audios into single narration ───
      if (segmentAudioUrls.some(url => url)) {
        try {
          const offlineCtx = new AudioContext();
          const buffers: (AudioBuffer | null)[] = [];
          
          for (const url of segmentAudioUrls) {
            if (!url) { buffers.push(null); continue; }
            try {
              let arrayBuffer: ArrayBuffer;
              if (url.startsWith('data:')) {
                const base64 = url.split(',')[1];
                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                arrayBuffer = bytes.buffer;
              } else {
                const resp = await fetch(url);
                arrayBuffer = await resp.arrayBuffer();
              }
              buffers.push(await offlineCtx.decodeAudioData(arrayBuffer));
            } catch (e) {
              console.warn("[TTS] Failed to decode segment audio:", e);
              buffers.push(null);
            }
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
          console.log(`[TTS] 🎵 Concatenated narration: ${totalNarrationDuration.toFixed(1)}s`);
          
          offlineCtx.close().catch(() => {});
        } catch (e) {
          console.warn("[TTS] Concatenation failed, using first segment:", e);
          narrationUrl = segmentAudioUrls.find(url => url) || "";
        }
      }
      
      // ─── CTA narration (also ElevenLabs Sarah) ───
      if (narrationUrl) {
        const ctaUrl = await callElevenLabsTTS(ctaScript);
        ctaNarrationUrl = ctaUrl || "";
      }
      
      // ─── Background music ───
      backgroundMusicUrl = await generateBackgroundMusic();
      
      // ─── Update segment durations in state ───
      setState(prev => {
        let currentTime = 0;
        const updatedSegments = prev.segments.map((seg, i) => {
          const segDuration = segmentDurations[i] || VIDEO_CONFIG.SEGMENT_DURATION_BASE;
          const updated = { ...seg, duration: segDuration, startTime: currentTime };
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
      
      return { narrationUrl, ctaNarrationUrl, backgroundMusicUrl, fullScript, segmentDurations };
    } catch (error: any) {
      console.warn("TTS error:", error);
      setState(prev => ({ ...prev, progress: 80 }));
      return { narrationUrl: "", ctaNarrationUrl: "", backgroundMusicUrl: "", fullScript, segmentDurations: [] as number[] };
    }
  }, [getAudioDuration]);

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
      // ─── Duration validation (audio-driven, no arbitrary clamping) ───
      let totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
      
      if (totalDuration > VIDEO_CONFIG.MAX_TOTAL_DURATION) {
        const ratio = VIDEO_CONFIG.MAX_TOTAL_DURATION / totalDuration;
        segments.forEach(seg => {
          seg.duration = Math.max(VIDEO_CONFIG.MIN_SEGMENT_DURATION, seg.duration * ratio);
        });
        totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
        console.warn(`[generateVideo] ⚠️ Scaled to ${totalDuration.toFixed(1)}s`);
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
  }, [setError]);

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
    existingSegments: Array<{ text: string; imagePrompt: string }>, 
    title?: string, 
    articleInfo?: { articleUrl?: string; articleImageUrl?: string },
    preExistingImageUrls?: string[]
  ) => {
    abortRef.current = false;
    setIsGenerating(true);
    setState(prev => ({ ...prev, step: "idle", progress: 0, error: null, videoUrl: "" }));

    let currentTime = 0;
    const segments: StorySegment[] = existingSegments.map((seg, index) => {
      const segment: StorySegment = {
        id: `seg-${index}`,
        text: seg.text,
        imagePrompt: seg.imagePrompt,
        imageUrl: preExistingImageUrls?.[index] || "",
        duration: segmentDuration,
        startTime: currentTime,
      };
      currentTime += segmentDuration;
      return segment;
    });

    setState(prev => ({ 
      ...prev, 
      step: "script",
      title: title || "Reels",
      segments,
      totalDuration: currentTime,
      progress: 15,
    }));
    
    toast.success(`Usando roteiro existente: ${segments.length} cenas`);

    const allHaveImages = segments.every(s => !!s.imageUrl);
    let segmentsWithImages: StorySegment[];
    
    if (allHaveImages) {
      setState(prev => ({ ...prev, step: "images", progress: 70 }));
      segmentsWithImages = segments;
    } else {
      const result = await generateImages(segments, title, articleInfo);
      if (!result || abortRef.current) { setIsGenerating(false); return; }
      segmentsWithImages = result;
    }

    const audioResult = await generateAudio(segmentsWithImages);
    if (abortRef.current) { setIsGenerating(false); return; }

    await generateVideo(
      segmentsWithImages, 
      audioResult?.narrationUrl || "", 
      audioResult?.ctaNarrationUrl || "",
      audioResult?.backgroundMusicUrl || ""
    );
    setIsGenerating(false);
  }, [segmentDuration, generateImages, generateAudio, generateVideo]);

  return {
    state,
    isGenerating,
    generateStory,
    renderFromScript,
    reset,
  };
}
