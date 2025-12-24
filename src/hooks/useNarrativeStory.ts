import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateVideoFromSegments, uploadVideoToStorage } from "@/lib/video-encoder";
import { initFFmpeg, convertWebMToMP4 } from "@/lib/video-converter";

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
  videoUrl: string;
  totalDuration: number;
  error: string | null;
}

interface UseNarrativeStoryOptions {
  brandName?: string;
  segmentCount?: number;
  segmentDuration?: number;
}

export function useNarrativeStory(options: UseNarrativeStoryOptions = {}) {
  const { segmentCount = 4, segmentDuration = 5 } = options;
  
  const [state, setState] = useState<NarrativeStoryState>({
    step: "idle",
    progress: 0,
    title: "",
    segments: [],
    narrationUrl: "",
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

  // Step 2: Generate images for each segment (parallel with progress)
  const generateImages = useCallback(async (segments: StorySegment[]) => {
    setState(prev => ({ ...prev, step: "images", progress: 20 }));
    
    const updatedSegments = [...segments];
    const progressPerImage = 50 / segments.length;
    
    // Generate images in parallel batches of 2
    for (let i = 0; i < segments.length; i += 2) {
      if (abortRef.current) return null;
      
      const batch = segments.slice(i, i + 2);
      const results = await Promise.all(
        batch.map(async (segment, batchIndex) => {
          try {
            const { data, error } = await supabase.functions.invoke("generate-image", {
              body: { 
                prompt: `${segment.imagePrompt}. Cinematic style, high quality, 9:16 vertical aspect ratio.`,
                format: "portrait",
                model: "gemini",
              },
            });

            if (error) throw error;
            return { index: i + batchIndex, imageUrl: data?.imageUrl || "" };
          } catch (err) {
            console.error(`Error generating image ${i + batchIndex}:`, err);
            return { index: i + batchIndex, imageUrl: "" };
          }
        })
      );

      results.forEach(({ index, imageUrl }) => {
        updatedSegments[index] = { ...updatedSegments[index], imageUrl };
      });

      setState(prev => ({ 
        ...prev, 
        segments: [...updatedSegments],
        progress: Math.min(20 + (i + batch.length) * progressPerImage, 70),
      }));
    }

    // Filter out segments without images
    const validSegments = updatedSegments.filter(s => s.imageUrl);
    if (validSegments.length === 0) {
      setError("Nenhuma imagem foi gerada");
      return null;
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

    toast.success(`${validSegments.length} imagens cinematográficas criadas!`);
    return validSegments;
  }, [setError]);

  // Step 3: Generate narration audio
  const generateAudio = useCallback(async (segments: StorySegment[]) => {
    if (abortRef.current) return null;
    setState(prev => ({ ...prev, step: "audio", progress: 72 }));
    
    // Combine all segment texts for full narration
    const fullScript = segments.map(s => s.text).join(" ");
    
    try {
      // Try ElevenLabs first (new API key configured)
      console.log("Trying ElevenLabs TTS...");
      const elevenResult = await supabase.functions.invoke("elevenlabs-tts", {
        body: { text: fullScript, language: "pt-BR" },
      });

      // Check if we got valid audio (not an error response)
      if (!elevenResult.error && elevenResult.data?.audioContent) {
        const narrationUrl = `data:audio/mp3;base64,${elevenResult.data.audioContent}`;
        setState(prev => ({ 
          ...prev, 
          narrationUrl, 
          progress: 80,
        }));
        toast.success("Narração gerada com ElevenLabs!");
        return narrationUrl;
      }

      // ElevenLabs failed, try OpenAI as fallback
      console.log("ElevenLabs failed, trying OpenAI TTS...");
      const openaiResult = await supabase.functions.invoke("openai-tts", {
        body: { text: fullScript, voice: "onyx" },
      });

      if (!openaiResult.error && openaiResult.data?.audioContent) {
        const narrationUrl = `data:audio/mp3;base64,${openaiResult.data.audioContent}`;
        setState(prev => ({ 
          ...prev, 
          narrationUrl, 
          progress: 80,
        }));
        toast.success("Narração gerada com OpenAI!");
        return narrationUrl;
      }

      // Both TTS services failed - continue without audio
      console.warn("All TTS services unavailable, continuing without audio");
      setState(prev => ({ 
        ...prev, 
        narrationUrl: "", 
        progress: 80,
      }));
      toast.warning("Narração indisponível, gerando vídeo sem áudio");
      return "";
    } catch (error: any) {
      console.warn("TTS error:", error);
      setState(prev => ({ 
        ...prev, 
        narrationUrl: "", 
        progress: 80,
      }));
      toast.warning("Continuando sem narração");
      return "";
    }
  }, []);

  // Step 4: Generate video from images and audio (with MP4 conversion)
  const generateVideo = useCallback(async (segments: StorySegment[], narrationUrl: string) => {
    if (abortRef.current) return null;
    setState(prev => ({ ...prev, step: "video", progress: 82 }));
    
    try {
      // Initialize FFmpeg for conversion
      toast.info("Carregando conversor de vídeo (~31MB)...");
      await initFFmpeg((msg) => console.log(msg));
      
      toast.info("Renderizando vídeo WebM...");
      setState(prev => ({ ...prev, progress: 84 }));
      
      // Generate video blob from segments (WebM)
      const webmBlob = await generateVideoFromSegments({
        width: 1080,
        height: 1920,
        fps: 24,
        audioUrl: narrationUrl || undefined,
        segments: segments.map(seg => ({
          imageUrl: seg.imageUrl,
          duration: seg.duration,
          text: seg.text,
        })),
        onProgress: (progress) => {
          setState(prev => ({ 
            ...prev, 
            progress: 84 + Math.floor(progress * 0.06), // 84-90%
          }));
        },
      });

      toast.info("Convertendo para MP4 (formato Instagram)...");
      setState(prev => ({ ...prev, progress: 90 }));

      // Convert WebM to MP4
      const mp4Blob = await convertWebMToMP4(webmBlob, (progress) => {
        setState(prev => ({ 
          ...prev, 
          progress: 90 + Math.floor(progress * 0.07), // 90-97%
        }));
      });

      toast.info("Enviando vídeo MP4 para o servidor...");
      setState(prev => ({ ...prev, progress: 97 }));

      // Upload MP4 to Supabase storage
      const videoUrl = await uploadVideoToStorage(mp4Blob, supabase, "post-videos", "mp4");
      
      setState(prev => ({ 
        ...prev, 
        videoUrl,
        progress: 100,
        step: "complete",
      }));
      
      toast.success("Vídeo MP4 pronto para publicar no Instagram!");
      return videoUrl;
    } catch (error: any) {
      console.error("Video generation error:", error);
      
      // Fallback: try without conversion (upload WebM anyway)
      toast.warning("Conversão falhou, tentando upload direto...");
      try {
        const webmBlob = await generateVideoFromSegments({
          width: 1080,
          height: 1920,
          fps: 24,
          audioUrl: narrationUrl || undefined,
          segments: segments.map(seg => ({
            imageUrl: seg.imageUrl,
            duration: seg.duration,
            text: seg.text,
          })),
        });
        
        const videoUrl = await uploadVideoToStorage(webmBlob, supabase, "post-videos", "webm");
        
        setState(prev => ({ 
          ...prev, 
          videoUrl,
          progress: 100,
          step: "complete",
        }));
        
        toast.warning("Vídeo gerado em WebM (pode não funcionar no Instagram)");
        return videoUrl;
      } catch (fallbackError: any) {
        setError(`Erro ao gerar vídeo: ${fallbackError.message}`);
        return null;
      }
    }
  }, [setError]);

  // Full pipeline
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

    // Step 2: Images
    const segmentsWithImages = await generateImages(segments);
    if (!segmentsWithImages || abortRef.current) {
      setIsGenerating(false);
      return;
    }

    // Step 3: Audio
    const narrationUrl = await generateAudio(segmentsWithImages);
    if (abortRef.current) {
      setIsGenerating(false);
      return;
    }

    // Step 4: Video
    await generateVideo(segmentsWithImages, narrationUrl || "");
    setIsGenerating(false);
  }, [generateScript, generateImages, generateAudio, generateVideo]);

  return {
    state,
    isGenerating,
    generateStory,
    reset,
  };
}
