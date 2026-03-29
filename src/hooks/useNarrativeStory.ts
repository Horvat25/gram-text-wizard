import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateVideoFromSegments, uploadVideoToStorage } from "@/lib/video-encoder";
import { initFFmpeg, convertWebMToMP4 } from "@/lib/video-converter";
import { estimateSpeechDuration } from "@/lib/browser-tts";
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
  duration: number; // in seconds
  startTime: number; // in seconds
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
  // Default to camila voice, faster-paced 4s segments for dynamic reels
  const { segmentCount = 4, segmentDuration = 4, preferredVoice = "tech_male" } = options;
  
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

  // Step 1: Generate structured script with segments
  const generateScript = useCallback(async (topic: string) => {
    setState(prev => ({ ...prev, step: "script", progress: 5 }));
    
    try {
      const totalDuration = segmentCount * segmentDuration;
      const wordsPerSegment = Math.ceil(segmentDuration * 2.5); // ~2.5 words per second
      
      const { data, error } = await supabase.functions.invoke("generate-story-script", {
        body: { 
          topic, 
          segmentCount,
          wordsPerSegment,
          totalDuration,
          style: "informativo, envolvente, com começo-meio-fim",
        },
      });

      if (error) throw error;
      if (!data?.segments || data.segments.length === 0) {
        throw new Error("Nenhum roteiro gerado");
      }

      // Build segments with timing
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

  // Step 2: Search for real images (Pexels > Unsplash > Firecrawl > AI)
  // TODAS as imagens são salvas no Storage antes de retornar (elimina CORS no render)
  const generateImages = useCallback(async (segments: StorySegment[], topic?: string, articleInfo?: { articleUrl?: string; articleImageUrl?: string }) => {
    setState(prev => ({ ...prev, step: "images", progress: 20 }));
    
    const updatedSegments = [...segments];
    
    console.log('[IMAGES] 🎨 Gerando imagens via IA para vídeo/carrossel...');
    
    try {
      const { data: searchResult, error: searchError } = await supabase.functions.invoke('search-images-for-video', {
        body: {
          topic: topic || segments[0]?.text || 'tecnologia',
          segments: segments.map(s => ({ text: s.text, imagePrompt: s.imagePrompt })),
        }
      });
      
      if (searchError) {
        console.error('[IMAGES] Search error:', searchError);
        throw new Error(searchError.message || 'Erro na busca de imagens');
      }

      if (searchResult?.success && searchResult.images?.length > 0) {
        const images = searchResult.images;
        const stats = searchResult.stats || {};
        
        console.log(`[IMAGES] ✅ ${images.length} imagens encontradas!`);
        console.log(`[IMAGES] Stats: Pexels=${stats.pexels||0} Unsplash=${stats.unsplash||0} Firecrawl=${stats.firecrawl||0} AI=${stats.ai||0}`);
        
        // Assign images to segments (all are already in Storage = no CORS issues)
        images.forEach((img: any, index: number) => {
          if (index < updatedSegments.length) {
            const imageUrl = typeof img === 'string' ? img : img.imageUrl;
            if (imageUrl) {
              updatedSegments[index] = { ...updatedSegments[index], imageUrl };
              console.log(`[IMAGES] Segment ${index + 1}: ${typeof img === 'object' ? img.source : 'storage'}`);
            }
          }
        });
        
        // Store used image IDs for repetition control
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

    // Filter segments that got images
    const validSegments = updatedSegments.filter(s => s.imageUrl);
    const failedCount = updatedSegments.length - validSegments.length;
    
    if (validSegments.length === 0) {
      setError("Nenhuma imagem foi encontrada ou gerada. Verifique as API keys (Pexels/Unsplash).");
      return null;
    }
    
    if (failedCount > 0 && validSegments.length >= 2) {
      toast.warning(`${failedCount} de ${updatedSegments.length} imagens falharam, continuando com ${validSegments.length} cenas`);
    }

    // Recalculate timings
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

    const stats = { total: validSegments.length };
    toast.success(`📸 ${validSegments.length} imagens prontas (todas no storage)!`);
    return validSegments;
  }, [setError]);

  // Helper to get audio duration from URL
  const getAudioDuration = useCallback((audioUrl: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = "metadata";
      
      const timeout = setTimeout(() => {
        console.warn("[getAudioDuration] Timeout, using estimate");
        resolve(0);
      }, 10000);
      
      audio.onloadedmetadata = () => {
        clearTimeout(timeout);
        console.log("[getAudioDuration] Audio duration:", audio.duration, "seconds");
        resolve(audio.duration);
      };
      
      audio.onerror = () => {
        clearTimeout(timeout);
        console.warn("[getAudioDuration] Error loading audio");
        resolve(0);
      };
      
      audio.src = audioUrl;
    });
  }, []);

  // Step 3: Generate narration audio - PER-SEGMENT for perfect sync
  // Each segment gets its own TTS call → exact duration → image changes only when narration ends
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
    
    // TTS provider hierarchy
    // NARRATION: ElevenLabs ONLY (premium voice) — fallback to Edge TTS only if ElevenLabs unavailable
    const tryNarrationTTS = async (text: string): Promise<{ url: string; provider: string } | null> => {
      if (abortRef.current) return null;
      
      // 1️⃣ ElevenLabs via edge-tts (primary — premium voice for narration)
      try {
        const edgeResult = await supabase.functions.invoke("edge-tts", {
          body: { text, voice: preferredVoice, forceElevenLabs: true },
        });
        if (!edgeResult.error && edgeResult.data?.audioContent && !edgeResult.data?.error) {
          const provider = edgeResult.data.provider || "unknown";
          if (provider.toLowerCase().includes('elevenlabs') || provider.toLowerCase().includes('eleven')) {
            return { 
              url: `data:audio/mp3;base64,${edgeResult.data.audioContent}`,
              provider
            };
          }
          // ElevenLabs was requested but got fallback — still use it but log
          console.warn(`[TTS] Requested ElevenLabs but got ${provider}, using anyway`);
          return { 
            url: `data:audio/mp3;base64,${edgeResult.data.audioContent}`,
            provider
          };
        }
      } catch (e) { console.warn("[TTS] Edge TTS error:", e); }
      
      if (abortRef.current) return null;
      
      // 2️⃣ Lovable TTS fallback (only if ElevenLabs completely fails)
      try {
        const lovableResult = await supabase.functions.invoke("lovable-tts", {
          body: { text, voice: preferredVoice },
        });
        if (!lovableResult.error && lovableResult.data?.audioContent && !lovableResult.data?.error) {
          return { url: `data:audio/mp3;base64,${lovableResult.data.audioContent}`, provider: "Polly" };
        }
      } catch (e) { console.warn("[TTS] Lovable TTS failed:", e); }
      
      return null;
    };

    // CTA: Edge TTS Neural voice (free, different voice for variety)
    const tryCTATTS = async (text: string): Promise<{ url: string; provider: string } | null> => {
      if (abortRef.current) return null;
      
      // Use Edge TTS directly for CTA (neural voice, not ElevenLabs)
      try {
        const edgeResult = await supabase.functions.invoke("edge-tts", {
          body: { text, voice: "cta_neural", skipElevenLabs: true },
        });
        if (!edgeResult.error && edgeResult.data?.audioContent && !edgeResult.data?.error) {
          return { 
            url: `data:audio/mp3;base64,${edgeResult.data.audioContent}`,
            provider: edgeResult.data.provider || "Edge TTS"
          };
        }
      } catch (e) { console.warn("[TTS] CTA TTS error:", e); }
      
      // Fallback: free TTS
      try {
        const freeResult = await supabase.functions.invoke("free-tts", {
          body: { text, language: "pt-BR" },
        });
        if (!freeResult.error && freeResult.data?.audioContent && !freeResult.data?.error) {
          return { url: `data:audio/mp3;base64,${freeResult.data.audioContent}`, provider: "Google" };
        }
      } catch { /* Silent */ }
      
      return null;
    };
    
    // Background music: ElevenLabs Music (best) → MusicGen (free) → Procedural
    const generateBackgroundMusic = async (mood?: string): Promise<string> => {
      if (abortRef.current) return "";
      
      // 1️⃣ ElevenLabs Music (professional quality)
      try {
        console.log("[Music] 🎵 Trying ElevenLabs Music...");
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        
        const moodPrompts: Record<string, string> = {
          epic: "Cinematic epic orchestral background music for tech news video, dramatic strings and brass, building intensity, modern and powerful",
          dramatic: "Dark dramatic electronic background music for technology news broadcast, tense atmosphere, pulsing synths, suspenseful",
          inspiring: "Uplifting inspiring electronic background music for technology innovation video, positive energy, modern synths, motivational",
          ambient: "Atmospheric ambient electronic background music for tech review video, subtle and modern, clean production",
          technology: "Modern electronic background music for technology news video, professional and engaging, subtle beats, clean synths",
        };
        
        const musicPrompt = moodPrompts[mood || 'technology'] || moodPrompts.technology;
        
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
            const musicUrl = URL.createObjectURL(audioBlob);
            console.log("[Music] ✅ ElevenLabs Music generated!");
            toast.success("🎵 Trilha sonora profissional gerada!");
            return musicUrl;
          }
        }
        console.log("[Music] ElevenLabs Music failed:", response.status);
      } catch (e) {
        console.warn("[Music] ElevenLabs Music error:", e);
      }
      
      if (abortRef.current) return "";
      
      // 2️⃣ MusicGen (HuggingFace - free)
      try {
        console.log("[Music] 🎵 Trying MusicGen...");
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
        console.log("[Music] Loading procedural music...");
        const track = getRandomTrack(mood);
        const musicUrl = await preloadTrack(track);
        if (musicUrl) return musicUrl;
      } catch (e) { console.warn("[Music] Procedural error:", e); }
      
      return "";
    };
    
    try {
      // ═══ PER-SEGMENT TTS: Generate audio for each segment separately ═══
      // This ensures EXACT sync between narration and image transitions
      console.log("[TTS] 🎯 Generating PER-SEGMENT narration for perfect sync...");
      
      const segmentAudioUrls: string[] = [];
      let ttsProvider = "";
      
      for (let i = 0; i < segments.length; i++) {
        if (abortRef.current) break;
        console.log(`[TTS] Segment ${i + 1}/${segments.length}: "${segments[i].text.substring(0, 40)}..."`);
        
        const result = await tryNarrationTTS(segments[i].text);
        if (result) {
          segmentAudioUrls.push(result.url);
          if (!ttsProvider) ttsProvider = result.provider;
          
          // Measure exact duration of this segment's audio
          const duration = await getAudioDuration(result.url);
          // Use audio duration if available, otherwise estimate from text
          const segDuration = duration > 0 ? duration : Math.max(4, segments[i].text.split(/\s+/).length / 2.5);
          segmentDurations.push(segDuration);
          console.log(`[TTS] Segment ${i + 1} duration: ${segDuration.toFixed(1)}s`);
        } else {
          // Fallback: estimate duration from word count
          const estimated = Math.max(4, segments[i].text.split(/\s+/).length / 2.5);
          segmentDurations.push(estimated);
          segmentAudioUrls.push("");
        }
      }
      
      console.log(`[TTS] ✅ Per-segment TTS complete! Provider: ${ttsProvider}`);
      console.log(`[TTS] Segment durations: ${segmentDurations.map(d => d.toFixed(1) + 's').join(', ')}`);
      
      // Concatenate segment audio into single narration (using AudioContext)
      if (segmentAudioUrls.some(url => url)) {
        try {
          const offlineCtx = new AudioContext();
          const buffers: (AudioBuffer | null)[] = [];
          
          for (const url of segmentAudioUrls) {
            if (!url) {
              buffers.push(null);
              continue;
            }
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
              const buf = await offlineCtx.decodeAudioData(arrayBuffer);
              buffers.push(buf);
            } catch (e) {
              console.warn("[TTS] Failed to decode segment audio:", e);
              buffers.push(null);
            }
          }
          
          // Calculate total duration and render concatenated audio
          const totalNarrationDuration = segmentDurations.reduce((a, b) => a + b, 0);
          const sampleRate = buffers.find(b => b)?.sampleRate || 44100;
          const numChannels = buffers.find(b => b)?.numberOfChannels || 1;
          const offline = new OfflineAudioContext(numChannels, Math.ceil(sampleRate * totalNarrationDuration), sampleRate);
          
          let offset = 0;
          for (let i = 0; i < buffers.length; i++) {
            if (buffers[i]) {
              const src = offline.createBufferSource();
              src.buffer = buffers[i]!;
              src.connect(offline.destination);
              src.start(offset);
            }
            offset += segmentDurations[i];
          }
          
          const renderedBuffer = await offline.startRendering();
          
          // Convert to WAV blob
          const wavBlob = audioBufferToWavBlob(renderedBuffer);
          narrationUrl = URL.createObjectURL(wavBlob);
          console.log(`[TTS] 🎵 Concatenated narration: ${totalNarrationDuration.toFixed(1)}s`);
          
          offlineCtx.close().catch(() => {});
        } catch (e) {
          console.warn("[TTS] Concatenation failed, using first segment:", e);
          narrationUrl = segmentAudioUrls.find(url => url) || "";
        }
      }
      
      // Generate CTA narration
      if (narrationUrl) {
        console.log(`[TTS] Generating CTA narration...`);
        const ctaResult = await tryCTATTS(ctaScript);
        ctaNarrationUrl = ctaResult?.url || "";
      }
      
      // Generate background music in parallel with nothing (music is last)
      backgroundMusicUrl = await generateBackgroundMusic();
      console.log("[Music] Background music:", backgroundMusicUrl ? "✅ Generated" : "❌ None");
      
      // Update segment durations based on actual audio measurements
      const MIN_SEGMENT_DURATION = 4;
      
      setState(prev => {
        let currentTime = 0;
        const updatedSegments = prev.segments.map((seg, i) => {
          const segDuration = Math.max(MIN_SEGMENT_DURATION, segmentDurations[i] || MIN_SEGMENT_DURATION);
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
  }, [getAudioDuration, preferredVoice]);

  // Step 4: Generate video from images (WebM - reliable browser encoding)
  const generateVideo = useCallback(async (
    segmentsInput: StorySegment[], 
    narrationUrl: string,
    ctaNarrationUrl: string,
    backgroundMusicUrl: string
  ) => {
    if (abortRef.current) return null;
    
    // Get the latest segments from state (with updated durations from audio)
    const latestState = await new Promise<NarrativeStoryState>(resolve => {
      setState(prev => {
        resolve(prev);
        return { ...prev, step: "video", progress: 82 };
      });
    });
    
    // Use segments from state if they have updated durations
    const segments = latestState.segments.length > 0 ? latestState.segments : segmentsInput;
    
    try {
      // ─── SAFETY: Validate before render ──────────────────
      const MAX_TOTAL = 90;
      const MAX_SEG = 20;
      const MIN_SEG = 3;
      
      // Clamp segment durations
      segments.forEach(seg => {
        seg.duration = Math.max(MIN_SEG, Math.min(seg.duration, MAX_SEG));
      });
      
      let totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
      
      // If still too long, proportionally shrink all segments
      if (totalDuration > MAX_TOTAL) {
        const ratio = MAX_TOTAL / totalDuration;
        segments.forEach(seg => {
          seg.duration = Math.max(MIN_SEG, seg.duration * ratio);
        });
        totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
        console.warn(`[generateVideo] ⚠️ Durations scaled down to fit ${MAX_TOTAL}s cap. New total: ${totalDuration.toFixed(1)}s`);
      }
      
      toast.info(`Renderizando vídeo (${totalDuration.toFixed(1)}s, ${segments.length} cenas)...`);
      console.log("[generateVideo] Starting with", segments.length, "segments, total duration:", totalDuration.toFixed(1));
      console.log("[generateVideo] Segment durations:", segments.map(s => Number(s.duration.toFixed(1))));
      console.log("[generateVideo] Has CTA audio:", !!ctaNarrationUrl);
      
      // Generate WebM video (reliable browser-native encoding)
      const videoBlob = await generateVideoFromSegments({
        width: 720,
        height: 1280,
        fps: 24,
        audioUrl: narrationUrl || undefined,
        ctaAudioUrl: ctaNarrationUrl || undefined,
        backgroundMusicUrl: backgroundMusicUrl || undefined,
        segments: segments.map(seg => ({
          imageUrl: seg.imageUrl,
          duration: seg.duration,
          text: seg.text,
        })),
        onProgress: (progress) => {
          // Map 0-100 progress to 82-95 range
          const mappedProgress = 82 + Math.floor(progress * 0.13);
          setState(prev => ({ ...prev, progress: mappedProgress }));
        },
      });
      
      console.log("[generateVideo] WebM generated, size:", (videoBlob.size / 1024 / 1024).toFixed(2), "MB");
      setState(prev => ({ ...prev, progress: 96 }));
      
      // Upload the video
      toast.info("Enviando vídeo...");
      const videoUrl = await uploadVideoToStorage(videoBlob, supabase, "post-videos");
      
      console.log("[generateVideo] Upload complete:", videoUrl);
      
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

  // Full pipeline - generates new script from topic
  const generateStory = useCallback(async (topic: string) => {
    abortRef.current = false;
    setIsGenerating(true);
    setState(prev => ({ ...prev, step: "idle", progress: 0, error: null, videoUrl: "" }));

    // Step 1: Script
    const segments = await generateScript(topic);
    if (!segments || abortRef.current) {
      setIsGenerating(false);
      return;
    }

    // Step 2: Images (busca da web primeiro, IA como fallback)
    const segmentsWithImages = await generateImages(segments, topic);
    if (!segmentsWithImages || abortRef.current) {
      setIsGenerating(false);
      return;
    }

    // Step 3: Audio (main + CTA)
    const audioResult = await generateAudio(segmentsWithImages);
    if (abortRef.current) {
      setIsGenerating(false);
      return;
    }

    // Step 4: Video
    await generateVideo(
      segmentsWithImages, 
      audioResult?.narrationUrl || "", 
      audioResult?.ctaNarrationUrl || "",
      audioResult?.backgroundMusicUrl || ""
    );
    setIsGenerating(false);
  }, [generateScript, generateImages, generateAudio, generateVideo]);

  // Render from existing script - uses pre-generated segments instead of generating new ones
  const renderFromScript = useCallback(async (
    existingSegments: Array<{ text: string; imagePrompt: string }>, 
    title?: string, 
    articleInfo?: { articleUrl?: string; articleImageUrl?: string },
    preExistingImageUrls?: string[]
  ) => {
    abortRef.current = false;
    setIsGenerating(true);
    setState(prev => ({ ...prev, step: "idle", progress: 0, error: null, videoUrl: "" }));

    console.log('[renderFromScript] Using existing script with', existingSegments.length, 'segments');
    if (preExistingImageUrls?.length) {
      console.log('[renderFromScript] 🖼️ Pre-existing images provided:', preExistingImageUrls.length);
    }
    if (articleInfo?.articleImageUrl) {
      console.log('[renderFromScript] 📰 Article image provided:', articleInfo.articleImageUrl.substring(0, 60));
    }

    // Build segments with timing from existing data
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

    // Step 2: Images — skip if ALL segments already have images from pre-existing data
    const allHaveImages = segments.every(s => !!s.imageUrl);
    let segmentsWithImages: StorySegment[];
    
    if (allHaveImages) {
      console.log('[renderFromScript] ✅ All segments have pre-existing images, skipping image generation');
      toast.success(`📸 ${segments.length} imagens pré-existentes reutilizadas!`);
      setState(prev => ({ ...prev, step: "images", progress: 70 }));
      segmentsWithImages = segments;
    } else {
      const result = await generateImages(segments, title, articleInfo);
      if (!result || abortRef.current) {
        setIsGenerating(false);
        return;
      }
      segmentsWithImages = result;
    }

    // Step 3: Audio (main + CTA)
    const audioResult = await generateAudio(segmentsWithImages);
    if (abortRef.current) {
      setIsGenerating(false);
      return;
    }

    // Step 4: Video
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
