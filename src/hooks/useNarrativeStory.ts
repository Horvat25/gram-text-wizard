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
  ctaNarrationUrl: string;
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
    ctaNarrationUrl: "",
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

  // Step 3: Generate narration audio (main + CTA) - ElevenLabs primary, OpenAI fallback
  const generateAudio = useCallback(async (segments: StorySegment[]) => {
    if (abortRef.current) return { narrationUrl: "", ctaNarrationUrl: "" };
    setState(prev => ({ ...prev, step: "audio", progress: 72 }));
    
    // Combine all segment texts for full narration
    const fullScript = segments.map(s => s.text).join(" ");
    
    // CTA script - engaging call to action
    const ctaTexts = [
      "E aí, curtiu? Então segue a gente pra não perder nenhuma novidade sobre tecnologia e inteligência artificial!",
      "Gostou do conteúdo? Segue o Neural Update pra ficar por dentro das últimas notícias de IA e tecnologia!",
      "Quer mais conteúdo assim? Então já segue a gente e ativa o sininho pra não perder nada!",
      "Isso foi só uma amostra! Segue o Neural Update e acompanhe as notícias mais quentes de tecnologia!",
    ];
    const ctaScript = ctaTexts[Math.floor(Math.random() * ctaTexts.length)];
    
    let narrationUrl = "";
    let ctaNarrationUrl = "";
    
    // Helper to try TTS with multiple providers (ElevenLabs → OpenAI)
    const tryGenerateTTS = async (text: string, voice: string = "onyx"): Promise<string | null> => {
      // Try ElevenLabs first (primary TTS provider)
      console.log("Trying ElevenLabs TTS (primary)...");
      try {
        const elevenResult = await supabase.functions.invoke("elevenlabs-tts", {
          body: { text, language: "pt-BR" },
        });
        
        if (!elevenResult.error && elevenResult.data?.audioContent && !elevenResult.data?.error && !elevenResult.data?.fallback) {
          console.log("TTS generated with ElevenLabs");
          return `data:audio/mp3;base64,${elevenResult.data.audioContent}`;
        }
        console.warn("ElevenLabs failed:", elevenResult.data?.error || elevenResult.error);
      } catch (e) {
        console.warn("ElevenLabs exception:", e);
      }
      
      // Try OpenAI as fallback
      console.log("Trying OpenAI TTS (fallback)...");
      try {
        const openaiResult = await supabase.functions.invoke("openai-tts", {
          body: { text, voice },
        });
        
        if (!openaiResult.error && openaiResult.data?.audioContent && !openaiResult.data?.error) {
          console.log("TTS generated with OpenAI");
          return `data:audio/mp3;base64,${openaiResult.data.audioContent}`;
        }
        console.warn("OpenAI TTS failed:", openaiResult.data?.error || openaiResult.error);
      } catch (e) {
        console.warn("OpenAI TTS exception:", e);
      }
      
      return null;
    };
    
    try {
      // Generate main narration
      console.log("Generating main narration...");
      narrationUrl = await tryGenerateTTS(fullScript) || "";

      // Generate CTA narration
      console.log("Generating CTA narration...");
      ctaNarrationUrl = await tryGenerateTTS(ctaScript) || "";

      // Update state with narration URLs and segment timings
      if (narrationUrl) {
        const audioDuration = await getAudioDuration(narrationUrl);
        if (audioDuration > 0) {
          const durationPerSegment = audioDuration / segments.length;
          console.log(`[generateAudio] Audio duration: ${audioDuration}s, per segment: ${durationPerSegment}s`);
          
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
              progress: 80 
            };
          });
        } else {
          setState(prev => ({ ...prev, narrationUrl, ctaNarrationUrl, progress: 80 }));
        }
        
        toast.success("Narrações geradas com sucesso!");
      } else {
        setState(prev => ({ ...prev, narrationUrl: "", ctaNarrationUrl: "", progress: 80 }));
        toast.warning("Narração indisponível, gerando vídeo sem áudio");
      }
      
      return { narrationUrl, ctaNarrationUrl };
    } catch (error: any) {
      console.warn("TTS error:", error);
      setState(prev => ({ ...prev, narrationUrl: "", ctaNarrationUrl: "", progress: 80 }));
      toast.warning("Continuando sem narração");
      return { narrationUrl: "", ctaNarrationUrl: "" };
    }
  }, [getAudioDuration]);

  // Step 4: Generate video from images (WebM - reliable browser encoding)
  const generateVideo = useCallback(async (
    segmentsInput: StorySegment[], 
    narrationUrl: string,
    ctaNarrationUrl: string
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
      audioResult?.ctaNarrationUrl || ""
    );
    setIsGenerating(false);
  }, [generateScript, generateImages, generateAudio, generateVideo]);

  return {
    state,
    isGenerating,
    generateStory,
    reset,
  };
}
