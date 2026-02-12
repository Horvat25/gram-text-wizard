import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateVideoFromSegments, uploadVideoToStorage } from "@/lib/video-encoder";
import { initFFmpeg, convertWebMToMP4 } from "@/lib/video-converter";
import { estimateSpeechDuration } from "@/lib/browser-tts";
import { getRandomTrack, preloadTrack } from "@/lib/background-music";

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
  // Default to tech_male (Antonio Neural) for professional technology content
  const { segmentCount = 4, segmentDuration = 5, preferredVoice = "tech_male" } = options;
  
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
  const generateImages = useCallback(async (segments: StorySegment[], topic?: string) => {
    setState(prev => ({ ...prev, step: "images", progress: 20 }));
    
    const updatedSegments = [...segments];
    
    console.log('[IMAGES] 🌐 Buscando imagens (Pexels > Unsplash > Firecrawl > AI)...');
    
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

  // Step 3: Generate narration audio - 100% FREE pipeline: Edge TTS (Microsoft Neural) → Lovable TTS → Free TTS
  const generateAudio = useCallback(async (segments: StorySegment[]) => {
    if (abortRef.current) return { narrationUrl: "", ctaNarrationUrl: "", backgroundMusicUrl: "", fullScript: "" };
    setState(prev => ({ ...prev, step: "audio", progress: 72 }));
    
    // Combine all segment texts for full narration
    const fullScript = segments.map(s => s.text).join(" ");
    
    // CTA script
    const ctaTexts = [
      "E aí, curtiu? Então segue a gente pra não perder nenhuma novidade!",
      "Gostou do conteúdo? Segue pra ficar por dentro das últimas notícias!",
      "Quer mais conteúdo assim? Então já segue a gente!",
    ];
    const ctaScript = ctaTexts[Math.floor(Math.random() * ctaTexts.length)];
    
    let narrationUrl = "";
    let ctaNarrationUrl = "";
    let backgroundMusicUrl = "";
    
    // Helper to try TTS providers: Edge TTS (Microsoft Neural) → Lovable TTS → Free TTS
    // 100% FREE and high-quality neural voices!
    // REORDERED: Bark FIRST for testing, then Edge TTS, then others
    const tryCloudTTS = async (text: string): Promise<{ url: string; provider: string } | null> => {
      // 🎯 Try Bark TTS FIRST (Hugging Face - neural voices, testing priority)
      try {
        console.log(`[TTS] 🎯 Trying Bark TTS FIRST (Hugging Face) with voice: ${preferredVoice}...`);
        const barkResult = await supabase.functions.invoke("huggingface-bark-tts", {
          body: { text, voice: preferredVoice, language: "pt-BR" },
        });
        
        const audioContent = barkResult.data?.audioContent;
        const isValidAudio = typeof audioContent === 'string' && audioContent.length > 100;
        const hasFallbackFlag = barkResult.data?.fallback === true;
        
        if (!barkResult.error && isValidAudio && !hasFallbackFlag) {
          const format = barkResult.data?.format || "wav";
          console.log(`[TTS] ✅ Bark TTS success! Audio size: ${audioContent.length} chars`);
          toast.success(`🎙️ Narração neural gerada (Bark/Suno)`);
          return { 
            url: `data:audio/${format};base64,${audioContent}`,
            provider: "Bark"
          };
        }
        console.log("[TTS] ⚠️ Bark failed:", barkResult.data?.error || "model loading or rate-limited");
      } catch (e) {
        console.error("[TTS] ❌ Bark TTS error:", e);
      }
      
      // 🔄 Fallback 1: Edge TTS (Microsoft Azure Neural Voices - also FREE!)
      try {
        console.log(`[TTS] Trying Edge TTS (Microsoft Neural) with voice: ${preferredVoice}...`);
        const edgeResult = await supabase.functions.invoke("edge-tts", {
          body: { text, voice: preferredVoice },
        });
        
        console.log("[TTS] Edge TTS response:", JSON.stringify({
          hasError: !!edgeResult.error,
          hasData: !!edgeResult.data,
          hasAudioContent: !!edgeResult.data?.audioContent,
          provider: edgeResult.data?.provider,
          errorMsg: edgeResult.data?.error || edgeResult.error?.message,
        }));
        
        if (!edgeResult.error && edgeResult.data?.audioContent && !edgeResult.data?.error) {
          const provider = edgeResult.data.provider || "Microsoft Neural";
          console.log(`[TTS] ✅ Edge TTS success! Provider: ${provider}`);
          toast.success(`🎙️ Narração neural gerada (${provider})`);
          return { 
            url: `data:audio/mp3;base64,${edgeResult.data.audioContent}`,
            provider
          };
        }
        console.log("[TTS] ⚠️ Edge TTS failed:", edgeResult.data?.error || edgeResult.error);
      } catch (e) {
        console.error("[TTS] ❌ Edge TTS error:", e);
      }
      
      // 🔄 Fallback 2: Lovable TTS (StreamElements/Polly - also high quality)
      try {
        console.log(`[TTS] Trying Lovable TTS (Polly) with voice: ${preferredVoice}...`);
        const lovableResult = await supabase.functions.invoke("lovable-tts", {
          body: { text, voice: preferredVoice },
        });
        
        if (!lovableResult.error && lovableResult.data?.audioContent && !lovableResult.data?.error) {
          console.log(`[TTS] ✅ Lovable TTS success! Voice: ${lovableResult.data.pollyVoice || preferredVoice}`);
          toast.success(`🎙️ Narração gerada (voz: ${lovableResult.data.pollyVoice || 'Camila'})`);
          return { 
            url: `data:audio/mp3;base64,${lovableResult.data.audioContent}`,
            provider: "Polly"
          };
        }
        console.log("[TTS] ⚠️ Lovable TTS failed:", lovableResult.data?.error || lovableResult.error);
      } catch (e) {
        console.log("[TTS] Lovable TTS error:", e);
      }
      
      // 🆓 Last resort: Free TTS (Google Translate - robotic but always works)
      try {
        console.log("[TTS] Trying Free TTS (Google Translate)...");
        const freeResult = await supabase.functions.invoke("free-tts", {
          body: { text, language: "pt-BR" },
        });
        
        if (!freeResult.error && freeResult.data?.audioContent && !freeResult.data?.error) {
          console.log("[TTS] ✅ Free TTS (Google) success!");
          toast.warning("🎙️ Narração gerada (Google TTS - qualidade básica)");
          return { 
            url: `data:audio/mp3;base64,${freeResult.data.audioContent}`,
            provider: "Google"
          };
        }
      } catch {
        // Silent fail
      }
      
      return null;
    };
    
    // Generate background music - try MusicGen (HuggingFace) first, then fallback to royalty-free tracks
    const generateBackgroundMusic = async (mood?: string): Promise<string> => {
      // 🎵 Try MusicGen first (Hugging Face - FREE AI-generated music)
      try {
        console.log("[Music] 🎵 Trying MusicGen (Hugging Face)...");
        const musicResult = await supabase.functions.invoke("huggingface-musicgen", {
          body: { mood: mood || "technology", duration: 15 },
        });
        
        const audioContent = musicResult.data?.audioContent;
        const isValidAudio = typeof audioContent === 'string' && audioContent.length > 100;
        const hasFallbackFlag = musicResult.data?.fallback === true;
        
        if (!musicResult.error && isValidAudio && !hasFallbackFlag) {
          const format = musicResult.data?.format || "wav";
          console.log("[Music] ✅ MusicGen success! Generated AI music");
          toast.success(`🎵 Trilha AI gerada (MusicGen)`);
          return `data:audio/${format};base64,${audioContent}`;
        }
        
        console.log("[Music] MusicGen failed or loading:", musicResult.data?.error || "Using fallback");
      } catch (e) {
        console.warn("[Music] MusicGen error:", e);
      }
      
      // 🎵 Fallback to royalty-free tracks from library
      try {
        console.log("[Music] Loading royalty-free background music...");
        const track = getRandomTrack();
        console.log("[Music] Selected track:", track.name, "-", track.mood);
        
        const musicUrl = await preloadTrack(track);
        console.log("[Music] ✅ Background music ready:", track.name);
        toast.success(`🎵 Trilha: ${track.name}`);
        return musicUrl;
      } catch (e) {
        console.warn("[Music] Error loading background music:", e);
        return "";
      }
    };
    
    try {
      // Generate narration
      console.log("[TTS] Starting narration generation...");
      const narrationResult = await tryCloudTTS(fullScript);
      narrationUrl = narrationResult?.url || "";
      
      // Generate CTA narration
      if (narrationUrl) {
        console.log(`[TTS] Main narration generated with provider: ${narrationResult?.provider}`);
        
        const ctaResult = await tryCloudTTS(ctaScript);
        ctaNarrationUrl = ctaResult?.url || "";
      }
      
      // Generate background music (in parallel with duration detection) - uses royalty-free tracks
      const [audioDuration, musicUrl] = await Promise.all([
        narrationUrl ? getAudioDuration(narrationUrl) : Promise.resolve(0),
        generateBackgroundMusic(),
      ]);
      
      backgroundMusicUrl = musicUrl;
      console.log("[TTS] Audio duration detected:", audioDuration, "seconds");
      console.log("[Music] Background music URL:", backgroundMusicUrl ? "Generated" : "None");
      
      if (audioDuration > 0) {
        const durationPerSegment = audioDuration / segments.length;
        
        setState(prev => {
          let currentTime = 0;
          const updatedSegments = prev.segments.map(seg => {
            const updated = { ...seg, duration: durationPerSegment, startTime: currentTime };
            currentTime += durationPerSegment;
            return updated;
          });
          return { 
            ...prev, 
            segments: updatedSegments,
            totalDuration: audioDuration,
            narrationUrl, 
            ctaNarrationUrl,
            backgroundMusicUrl,
            progress: 80 
          };
        });
        
        return { narrationUrl, ctaNarrationUrl, backgroundMusicUrl, fullScript };
      }
      
      if (!narrationUrl) {
        // Cloud TTS unavailable - warn user
        console.warn("[TTS] All TTS providers failed! Video will be generated without audio.");
        toast.warning("⚠️ Narração não disponível - vídeo será gerado sem áudio", {
          description: "Verifique os logs do console para detalhes"
        });
      }
      
      // Estimate duration based on text length
      const estimatedDuration = estimateSpeechDuration(fullScript);
      const durationPerSegment = estimatedDuration / segments.length;
      
      setState(prev => {
        let currentTime = 0;
        const updatedSegments = prev.segments.map(seg => {
          const updated = { ...seg, duration: durationPerSegment, startTime: currentTime };
          currentTime += durationPerSegment;
          return updated;
        });
        return { 
          ...prev, 
          segments: updatedSegments,
          totalDuration: estimatedDuration,
          narrationUrl: narrationUrl || "", 
          ctaNarrationUrl: ctaNarrationUrl || "",
          backgroundMusicUrl,
          progress: 80 
        };
      });
      
      // Return script for reference
      return { narrationUrl: narrationUrl || "", ctaNarrationUrl: ctaNarrationUrl || "", backgroundMusicUrl, fullScript };
    } catch (error: any) {
      console.warn("TTS error:", error);
      setState(prev => ({ ...prev, progress: 80 }));
      return { narrationUrl: "", ctaNarrationUrl: "", backgroundMusicUrl: "", fullScript };
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
      const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
      toast.info(`Renderizando vídeo (${totalDuration.toFixed(1)}s)...`);
      console.log("[generateVideo] Starting with", segments.length, "segments, total duration:", totalDuration);
      console.log("[generateVideo] Segment durations:", segments.map(s => s.duration));
      console.log("[generateVideo] Has CTA audio:", !!ctaNarrationUrl);
      
      // Generate WebM video (reliable browser-native encoding)
      const videoBlob = await generateVideoFromSegments({
        width: 1080,
        height: 1920,
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
  const renderFromScript = useCallback(async (existingSegments: Array<{ text: string; imagePrompt: string }>, title?: string) => {
    abortRef.current = false;
    setIsGenerating(true);
    setState(prev => ({ ...prev, step: "idle", progress: 0, error: null, videoUrl: "" }));

    console.log('[renderFromScript] Using existing script with', existingSegments.length, 'segments');

    // Build segments with timing from existing data
    let currentTime = 0;
    const segments: StorySegment[] = existingSegments.map((seg, index) => {
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
      step: "script",
      title: title || "Reels",
      segments,
      totalDuration: currentTime,
      progress: 15,
    }));
    
    toast.success(`Usando roteiro existente: ${segments.length} cenas`);

    // Step 2: Images (busca da web primeiro, IA como fallback)
    const segmentsWithImages = await generateImages(segments, title);
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
  }, [segmentDuration, generateImages, generateAudio, generateVideo]);

  return {
    state,
    isGenerating,
    generateStory,
    renderFromScript,
    reset,
  };
}
