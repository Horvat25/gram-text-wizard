import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateVideoFromSegments, uploadVideoToStorage } from "@/lib/video-encoder";
import { initFFmpeg, convertWebMToMP4 } from "@/lib/video-converter";
import { estimateSpeechDuration } from "@/lib/browser-tts";
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
  preferredVoice?: string;
}

export function useNarrativeStory(options: UseNarrativeStoryOptions = {}) {
  const { segmentCount = 4, segmentDuration = 5, preferredVoice = "camila" } = options;
  
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

  // Step 3: Generate narration audio - try cloud APIs first, fallback to browser TTS
  const generateAudio = useCallback(async (segments: StorySegment[]) => {
    if (abortRef.current) return { narrationUrl: "", ctaNarrationUrl: "", fullScript: "" };
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
    
    // Helper to try TTS providers: Lovable TTS (Polly) → Edge TTS → Free TTS (Google)
    const tryCloudTTS = async (text: string): Promise<{ url: string; provider: string } | null> => {
      // 🎯 Try Lovable TTS first (StreamElements/Amazon Polly - FREE and GOOD QUALITY!)
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
        console.log("[TTS] Lovable TTS failed:", lovableResult.data?.error || lovableResult.error);
      } catch (e) {
        console.log("[TTS] Lovable TTS error:", e);
      }
      
      // 🔄 Fallback to Edge TTS (Microsoft neural voices)
      try {
        console.log(`[TTS] Trying Edge TTS with voice: ${preferredVoice}...`);
        const edgeResult = await supabase.functions.invoke("edge-tts", {
          body: { text, voice: preferredVoice },
        });
        
        if (!edgeResult.error && edgeResult.data?.audioContent && !edgeResult.data?.error) {
          console.log("[TTS] ✅ Edge TTS success!");
          toast.success("🎙️ Narração gerada (Microsoft Edge)");
          return { 
            url: `data:audio/mp3;base64,${edgeResult.data.audioContent}`,
            provider: "Edge"
          };
        }
      } catch {
        // Silent fail
      }
      
      // 🆓 Try Free TTS (Google Translate) as last resort
      try {
        console.log("[TTS] Trying Free TTS (Google Translate)...");
        const freeResult = await supabase.functions.invoke("free-tts", {
          body: { text, language: "pt-BR" },
        });
        
        if (!freeResult.error && freeResult.data?.audioContent && !freeResult.data?.error) {
          console.log("[TTS] ✅ Free TTS (Google) success!");
          toast.success("🎙️ Narração gerada (Google TTS)");
          return { 
            url: `data:audio/mp3;base64,${freeResult.data.audioContent}`,
            provider: "Google"
          };
        }
      } catch {
        // Silent fail
      }
      
      // Try paid APIs if user has credits configured (probably will fail but worth trying)
      try {
        const openaiResult = await supabase.functions.invoke("openai-tts", {
          body: { text, voice: "onyx" },
        });
        
        if (!openaiResult.error && openaiResult.data?.audioContent && !openaiResult.data?.error) {
          console.log("[TTS] ✅ OpenAI TTS success!");
          return { url: `data:audio/mp3;base64,${openaiResult.data.audioContent}`, provider: "OpenAI" };
        }
      } catch {
        // Silent fail
      }
      
      try {
        const elevenResult = await supabase.functions.invoke("elevenlabs-tts", {
          body: { text, language: "pt-BR" },
        });
        
        if (!elevenResult.error && elevenResult.data?.audioContent && !elevenResult.data?.error && !elevenResult.data?.fallback) {
          console.log("[TTS] ✅ ElevenLabs TTS success!");
          return { url: `data:audio/mp3;base64,${elevenResult.data.audioContent}`, provider: "ElevenLabs" };
        }
      } catch {
        // Silent fail
      }
      
      return null;
    };
    
    try {
      // Generate narration
      console.log("[TTS] Starting narration generation...");
      const narrationResult = await tryCloudTTS(fullScript);
      narrationUrl = narrationResult?.url || "";
      
      if (narrationUrl) {
        console.log(`[TTS] Main narration generated with provider: ${narrationResult?.provider}`);
        
        const ctaResult = await tryCloudTTS(ctaScript);
        ctaNarrationUrl = ctaResult?.url || "";
        
        const audioDuration = await getAudioDuration(narrationUrl);
        console.log("[TTS] Audio duration detected:", audioDuration, "seconds");
        
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
              progress: 80 
            };
          });
        }
        
        return { narrationUrl, ctaNarrationUrl, fullScript };
      }
      
      // Cloud TTS unavailable - warn user
      console.warn("[TTS] All TTS providers failed! Video will be generated without audio.");
      toast.warning("⚠️ Narração não disponível - vídeo será gerado sem áudio", {
        description: "Verifique os logs do console para detalhes"
      });
      
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
          narrationUrl: "", 
          ctaNarrationUrl: "",
          progress: 80 
        };
      });
      
      // Return script for reference even without audio
      return { narrationUrl: "", ctaNarrationUrl: "", fullScript };
    } catch (error: any) {
      console.warn("TTS error:", error);
      setState(prev => ({ ...prev, progress: 80 }));
      return { narrationUrl: "", ctaNarrationUrl: "", fullScript };
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
