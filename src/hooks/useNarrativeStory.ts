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

  // Step 2: Generate images for each segment (with retry and better error handling)
  const generateImages = useCallback(async (segments: StorySegment[]) => {
    setState(prev => ({ ...prev, step: "images", progress: 20 }));
    
    const updatedSegments = [...segments];
    const progressPerImage = 50 / segments.length;
    
    // Generate images in parallel batches of 2 (to avoid rate limits)
    for (let i = 0; i < segments.length; i += 2) {
      if (abortRef.current) return null;
      
      const batch = segments.slice(i, i + 2);
      console.log(`Generating batch ${Math.floor(i/2) + 1}: segments ${i + 1} to ${i + batch.length}`);
      
      const results = await Promise.all(
        batch.map(async (segment, batchIndex) => {
          const segmentIndex = i + batchIndex;
          const maxRetries = 2;
          
          for (let retry = 0; retry <= maxRetries; retry++) {
            try {
              if (retry > 0) {
                console.log(`Retrying image generation for segment ${segmentIndex + 1}, attempt ${retry + 1}`);
                // Wait before retry with exponential backoff
                await new Promise(r => setTimeout(r, 2000 * retry));
              }
              
              const { data, error } = await supabase.functions.invoke("generate-image", {
                body: { 
                  prompt: `${segment.imagePrompt}. Cinematic style, high quality, 9:16 vertical aspect ratio.`,
                  format: "portrait",
                  model: "gemini",
                },
              });

              if (error) {
                console.error(`API error for segment ${segmentIndex + 1}:`, error);
                if (retry === maxRetries) {
                  return { index: segmentIndex, imageUrl: "", error: error.message };
                }
                continue;
              }
              
              if (data?.imageUrl) {
                console.log(`Image generated successfully for segment ${segmentIndex + 1}`);
                return { index: segmentIndex, imageUrl: data.imageUrl };
              } else {
                console.warn(`No imageUrl in response for segment ${segmentIndex + 1}`);
                if (retry === maxRetries) {
                  return { index: segmentIndex, imageUrl: "", error: "Sem imagem na resposta" };
                }
              }
            } catch (err: any) {
              console.error(`Error generating image ${segmentIndex + 1}, attempt ${retry + 1}:`, err);
              if (retry === maxRetries) {
                return { index: segmentIndex, imageUrl: "", error: err.message };
              }
            }
          }
          
          return { index: segmentIndex, imageUrl: "", error: "Falha após múltiplas tentativas" };
        })
      );

      // Update segments with results
      results.forEach(({ index, imageUrl, error }) => {
        updatedSegments[index] = { ...updatedSegments[index], imageUrl };
        if (error) {
          console.warn(`Segment ${index + 1} image generation failed: ${error}`);
        }
      });

      // Update state to show progress
      setState(prev => ({ 
        ...prev, 
        segments: [...updatedSegments],
        progress: Math.min(20 + (i + batch.length) * progressPerImage, 70),
      }));
      
      // Small delay between batches to avoid rate limits
      if (i + 2 < segments.length) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Check how many images we got
    const validSegments = updatedSegments.filter(s => s.imageUrl);
    const failedCount = updatedSegments.length - validSegments.length;
    
    if (validSegments.length === 0) {
      setError("Nenhuma imagem foi gerada. Tente novamente.");
      return null;
    }
    
    // If some images failed but we have at least 2, continue with valid ones
    if (failedCount > 0 && validSegments.length >= 2) {
      toast.warning(`${failedCount} de ${updatedSegments.length} imagens falharam, continuando com ${validSegments.length} cenas`);
    }

    // Recalculate timings for valid segments
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

      // Check if we got valid audio (not an error response - check for .error in data too)
      if (!elevenResult.error && elevenResult.data?.audioContent && !elevenResult.data?.error && !elevenResult.data?.fallback) {
        const narrationUrl = `data:audio/mp3;base64,${elevenResult.data.audioContent}`;
        setState(prev => ({ ...prev, narrationUrl, progress: 80 }));
        toast.success("Narração gerada com ElevenLabs!");
        return narrationUrl;
      }

      // ElevenLabs failed, try OpenAI as fallback
      console.log("ElevenLabs failed or blocked, trying OpenAI TTS...");
      console.log("ElevenLabs response:", elevenResult.data?.error || elevenResult.data?.code || "unknown");
      
      const openaiResult = await supabase.functions.invoke("openai-tts", {
        body: { text: fullScript, voice: "onyx" },
      });

      // Check for valid response (OpenAI may return error in body with 200 status)
      if (!openaiResult.error && openaiResult.data?.audioContent && !openaiResult.data?.error) {
        const narrationUrl = `data:audio/mp3;base64,${openaiResult.data.audioContent}`;
        setState(prev => ({ ...prev, narrationUrl, progress: 80 }));
        toast.success("Narração gerada com OpenAI!");
        return narrationUrl;
      }
      
      console.log("OpenAI TTS also failed:", openaiResult.data?.error || openaiResult.error);

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

  // Step 4: Generate video from images (WebM first, then try MP4 conversion)
  const generateVideo = useCallback(async (segments: StorySegment[], narrationUrl: string) => {
    if (abortRef.current) return null;
    setState(prev => ({ ...prev, step: "video", progress: 82 }));
    
    try {
      // FIRST: Generate WebM video (this always works, no external dependencies)
      toast.info("Renderizando vídeo...");
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
            progress: 84 + Math.floor(progress * 0.08), // 84-92%
          }));
        },
      });
      
      console.log("WebM video generated successfully, size:", webmBlob.size);
      setState(prev => ({ ...prev, progress: 92 }));
      
      // SECOND: Try to convert to MP4 (optional - don't fail if it doesn't work)
      let finalBlob = webmBlob;
      let format: "mp4" | "webm" = "webm";
      
      try {
        toast.info("Tentando converter para MP4...");
        
        // Quick timeout for FFmpeg load - 15 seconds max
        const ffmpegLoadPromise = initFFmpeg((msg) => console.log("[FFmpeg]", msg));
        const quickTimeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("FFmpeg timeout")), 15000);
        });
        
        await Promise.race([ffmpegLoadPromise, quickTimeout]);
        setState(prev => ({ ...prev, progress: 94 }));
        
        // Convert to MP4
        const mp4Blob = await convertWebMToMP4(webmBlob, (progress) => {
          setState(prev => ({ ...prev, progress: 94 + Math.floor(progress * 0.03) }));
        });
        
        finalBlob = mp4Blob;
        format = "mp4";
        console.log("MP4 conversion successful, size:", mp4Blob.size);
      } catch (convError: any) {
        console.log("MP4 conversion skipped:", convError.message);
        // Continue with WebM - not a fatal error
      }
      
      // Upload the video
      toast.info("Enviando vídeo...");
      setState(prev => ({ ...prev, progress: 97 }));
      
      const videoUrl = await uploadVideoToStorage(finalBlob, supabase, "post-videos", format);
      
      setState(prev => ({ 
        ...prev, 
        videoUrl,
        progress: 100,
        step: "complete",
      }));
      
      if (format === "mp4") {
        toast.success("Vídeo MP4 pronto para Instagram!");
      } else {
        toast.success("Vídeo criado! (Formato WebM - converta para MP4 para Instagram)");
      }
      
      return videoUrl;
    } catch (error: any) {
      console.error("Video generation error:", error);
      setError(`Erro ao gerar vídeo: ${error.message}`);
      return null;
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
