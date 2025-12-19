import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface NarrativeVideoState {
  step: "idle" | "script" | "image" | "video" | "audio" | "complete" | "error";
  progress: number;
  script: string;
  imageUrl: string;
  videoUrl: string;
  narrationUrl: string;
  musicUrl: string;
  error: string | null;
  predictionId: string | null;
}

interface UseNarrativeVideoOptions {
  brandName?: string;
  duration?: number;
}

export function useNarrativeVideo(options: UseNarrativeVideoOptions = {}) {
  const { brandName = "NeuralUpdate", duration = 10 } = options;

  const [state, setState] = useState<NarrativeVideoState>({
    step: "idle",
    progress: 0,
    script: "",
    imageUrl: "",
    videoUrl: "",
    narrationUrl: "",
    musicUrl: "",
    error: null,
    predictionId: null,
  });

  const [isGenerating, setIsGenerating] = useState(false);

  const reset = useCallback(() => {
    setState({
      step: "idle",
      progress: 0,
      script: "",
      imageUrl: "",
      videoUrl: "",
      narrationUrl: "",
      musicUrl: "",
      error: null,
      predictionId: null,
    });
    setIsGenerating(false);
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, step: "error", error }));
    setIsGenerating(false);
    toast.error(error);
  }, []);

  // Step 1: Generate script
  const generateScript = useCallback(async (topic: string, customScript?: string) => {
    if (customScript) {
      setState(prev => ({ ...prev, script: customScript, step: "script", progress: 20 }));
      return customScript;
    }

    setState(prev => ({ ...prev, step: "script", progress: 5 }));
    
    try {
      const { data, error } = await supabase.functions.invoke("generate-script", {
        body: { topic, duration, style: "profissional e moderno" },
      });

      if (error) throw error;
      if (!data?.script) throw new Error("Nenhum roteiro gerado");

      setState(prev => ({ ...prev, script: data.script, progress: 20 }));
      toast.success(`Roteiro gerado: ${data.wordCount} palavras (~${data.estimatedDuration}s)`);
      return data.script;
    } catch (error: any) {
      setError(error.message || "Erro ao gerar roteiro");
      return null;
    }
  }, [duration, setError]);

  // Step 2: Generate image
  const generateImage = useCallback(async (prompt: string) => {
    setState(prev => ({ ...prev, step: "image", progress: 30 }));
    
    try {
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: { 
          prompt: `${prompt}. Resolução 9:16 vertical para Instagram Reels. Marca d'água sutil "${brandName}" no canto inferior direito.`,
          format: "portrait",
          model: "gemini", // Economic model
          brandName,
        },
      });

      if (error) throw error;
      if (!data?.imageUrl) throw new Error("Nenhuma imagem gerada");

      setState(prev => ({ ...prev, imageUrl: data.imageUrl, progress: 50 }));
      toast.success("Imagem base gerada!");
      return data.imageUrl;
    } catch (error: any) {
      setError(error.message || "Erro ao gerar imagem");
      return null;
    }
  }, [brandName, setError]);

  // Step 3: Generate video from image
  const generateVideo = useCallback(async (imageUrl: string, prompt: string) => {
    setState(prev => ({ ...prev, step: "video", progress: 55 }));
    
    try {
      const { data, error } = await supabase.functions.invoke("generate-narrative-video", {
        body: { imageUrl, prompt, duration },
      });

      if (error) throw error;
      if (!data?.predictionId) throw new Error("Falha ao iniciar geração de vídeo");

      setState(prev => ({ ...prev, predictionId: data.predictionId }));
      toast.info("Vídeo em geração... Isso pode levar 1-3 minutos.");
      return data.predictionId;
    } catch (error: any) {
      setError(error.message || "Erro ao gerar vídeo");
      return null;
    }
  }, [duration, setError]);

  // Poll video status
  const checkVideoStatus = useCallback(async () => {
    if (!state.predictionId) return null;

    try {
      const { data, error } = await supabase.functions.invoke("generate-narrative-video", {
        body: { predictionId: state.predictionId },
      });

      if (error) throw error;

      if (data.status === "succeeded") {
        const videoUrl = data.storedVideoUrl || (Array.isArray(data.output) ? data.output[0] : data.output);
        setState(prev => ({ 
          ...prev, 
          videoUrl, 
          predictionId: null, 
          progress: 70,
        }));
        toast.success("Vídeo gerado com sucesso!");
        return videoUrl;
      } else if (data.status === "failed") {
        setError("Falha na geração do vídeo");
        return null;
      } else {
        // Still processing
        setState(prev => ({ ...prev, progress: Math.min(prev.progress + 5, 68) }));
        return "processing";
      }
    } catch (error: any) {
      console.error("Error checking video status:", error);
      return null;
    }
  }, [state.predictionId, setError]);

  // Step 4: Generate audio (narration + music)
  const generateAudio = useCallback(async (script: string) => {
    setState(prev => ({ ...prev, step: "audio", progress: 75 }));
    
    try {
      // Generate narration and music in parallel
      const [narrationResult, musicResult] = await Promise.all([
        supabase.functions.invoke("elevenlabs-tts", {
          body: { text: script, language: "pt-BR" },
        }),
        supabase.functions.invoke("elevenlabs-music", {
          body: { 
            prompt: "Ambient tech futuristic background music, subtle synth, modern, clean, 70bpm",
            duration: Math.ceil(script.length / 15) + 3, // narration duration + buffer
          },
        }),
      ]);

      if (narrationResult.error) throw narrationResult.error;
      if (musicResult.error) throw musicResult.error;

      const narrationUrl = `data:audio/mp3;base64,${narrationResult.data.audioContent}`;
      const musicUrl = `data:audio/mp3;base64,${musicResult.data.audioContent}`;

      setState(prev => ({ 
        ...prev, 
        narrationUrl, 
        musicUrl, 
        progress: 95,
        step: "complete",
      }));
      
      toast.success("Áudio gerado com sucesso!");
      return { narrationUrl, musicUrl };
    } catch (error: any) {
      setError(error.message || "Erro ao gerar áudio");
      return null;
    }
  }, [setError]);

  // Full pipeline
  const generateNarrativeVideo = useCallback(async (
    topic: string, 
    imagePrompt: string,
    customScript?: string
  ) => {
    setIsGenerating(true);
    setState(prev => ({ ...prev, step: "idle", progress: 0, error: null }));

    // Step 1: Script
    const script = await generateScript(topic, customScript);
    if (!script) return;

    // Step 2: Image
    const imageUrl = await generateImage(imagePrompt);
    if (!imageUrl) return;

    // Step 3: Video (async - will poll)
    const predictionId = await generateVideo(imageUrl, imagePrompt);
    if (!predictionId) return;

    // Note: Video generation is async, will need to poll
    // Audio generation happens after video is ready
  }, [generateScript, generateImage, generateVideo]);

  // Complete the pipeline after video is ready
  const completeWithAudio = useCallback(async () => {
    if (!state.script || !state.videoUrl) return;
    
    const audio = await generateAudio(state.script);
    if (audio) {
      setState(prev => ({ ...prev, step: "complete", progress: 100 }));
      setIsGenerating(false);
    }
  }, [state.script, state.videoUrl, generateAudio]);

  return {
    state,
    isGenerating,
    generateNarrativeVideo,
    generateScript,
    generateImage,
    generateVideo,
    generateAudio,
    checkVideoStatus,
    completeWithAudio,
    reset,
  };
}
