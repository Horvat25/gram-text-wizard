import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface NarrativeContentState {
  step: "idle" | "script" | "image" | "audio" | "complete" | "error";
  progress: number;
  script: string;
  imageUrl: string;
  narrationUrl: string;
  error: string | null;
}

interface UseNarrativeContentOptions {
  brandName?: string;
  duration?: number;
}

export function useNarrativeVideo(options: UseNarrativeContentOptions = {}) {
  const { brandName = "NeuralUpdate", duration = 10 } = options;

  const [state, setState] = useState<NarrativeContentState>({
    step: "idle",
    progress: 0,
    script: "",
    imageUrl: "",
    narrationUrl: "",
    error: null,
  });

  const [isGenerating, setIsGenerating] = useState(false);

  const reset = useCallback(() => {
    setState({
      step: "idle",
      progress: 0,
      script: "",
      imageUrl: "",
      narrationUrl: "",
      error: null,
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
      setState(prev => ({ ...prev, script: customScript, step: "script", progress: 25 }));
      return customScript;
    }

    setState(prev => ({ ...prev, step: "script", progress: 10 }));
    
    try {
      const { data, error } = await supabase.functions.invoke("generate-script", {
        body: { topic, duration, style: "profissional e moderno" },
      });

      if (error) throw error;
      if (!data?.script) throw new Error("Nenhum roteiro gerado");

      setState(prev => ({ ...prev, script: data.script, progress: 25 }));
      toast.success(`Roteiro gerado: ${data.wordCount} palavras`);
      return data.script;
    } catch (error: any) {
      setError(error.message || "Erro ao gerar roteiro");
      return null;
    }
  }, [duration, setError]);

  // Step 2: Generate image (FREE with Lovable AI/Gemini)
  const generateImage = useCallback(async (prompt: string) => {
    setState(prev => ({ ...prev, step: "image", progress: 40 }));
    
    try {
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: { 
          prompt: `${prompt}. Resolução 9:16 vertical para Instagram Reels. Imagem impactante e profissional.`,
          format: "portrait",
          model: "gemini",
          brandName,
        },
      });

      if (error) throw error;
      if (!data?.imageUrl) throw new Error("Nenhuma imagem gerada");

      setState(prev => ({ ...prev, imageUrl: data.imageUrl, progress: 60 }));
      toast.success("Imagem gerada com sucesso!");
      return data.imageUrl;
    } catch (error: any) {
      setError(error.message || "Erro ao gerar imagem");
      return null;
    }
  }, [brandName, setError]);

  // Step 3: Generate audio narration (try ElevenLabs first, then OpenAI as fallback)
  const generateAudio = useCallback(async (script: string) => {
    setState(prev => ({ ...prev, step: "audio", progress: 80 }));
    
    try {
      // Try ElevenLabs first (already configured)
      let narrationResult = await supabase.functions.invoke("elevenlabs-tts", {
        body: { text: script, language: "pt-BR" },
      });

      // If ElevenLabs fails, try OpenAI
      if (narrationResult.error) {
        console.log("ElevenLabs failed, trying OpenAI TTS...");
        narrationResult = await supabase.functions.invoke("openai-tts", {
          body: { text: script, voice: "onyx" },
        });
      }

      if (narrationResult.error) {
        // If both fail, complete without audio
        console.warn("TTS failed, completing without audio:", narrationResult.error);
        setState(prev => ({ 
          ...prev, 
          narrationUrl: "", 
          progress: 100,
          step: "complete",
        }));
        toast.warning("Conteúdo criado! (Narração indisponível no momento)");
        return "";
      }

      const narrationUrl = `data:audio/mp3;base64,${narrationResult.data.audioContent}`;

      setState(prev => ({ 
        ...prev, 
        narrationUrl, 
        progress: 100,
        step: "complete",
      }));
      
      toast.success("Conteúdo completo com narração!");
      return narrationUrl;
    } catch (error: any) {
      // Complete without audio on error
      console.warn("TTS error, completing without audio:", error);
      setState(prev => ({ 
        ...prev, 
        narrationUrl: "", 
        progress: 100,
        step: "complete",
      }));
      toast.warning("Conteúdo criado! (Narração indisponível)");
      return "";
    }
  }, []);

  // Full pipeline (without video - much cheaper!)
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

    // Step 2: Image (FREE)
    const imageUrl = await generateImage(imagePrompt);
    if (!imageUrl) return;

    // Step 3: Audio (~$0.01)
    const narrationUrl = await generateAudio(script);
    if (!narrationUrl) return;

    setIsGenerating(false);
  }, [generateScript, generateImage, generateAudio]);

  return {
    state,
    isGenerating,
    generateNarrativeVideo,
    generateScript,
    generateImage,
    generateAudio,
    reset,
  };
}
