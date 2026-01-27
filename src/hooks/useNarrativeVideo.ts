import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface NarrativeContentState {
  step: "idle" | "script" | "image" | "audio" | "complete" | "error";
  progress: number;
  script: string;
  imageUrl: string;
  narrationUrl: string;
  backgroundMusicUrl: string;
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
    backgroundMusicUrl: "",
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
      backgroundMusicUrl: "",
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

  // Step 3a: Generate background music (optional, runs in parallel)
  const generateBackgroundMusic = useCallback(async (): Promise<string> => {
    try {
      console.log("[Music] Generating background music...");
      const { data, error } = await supabase.functions.invoke("elevenlabs-music", {
        body: { 
          prompt: "Ambient tech futuristic background music, subtle synth pads, modern, clean, minimal, 80bpm",
          duration: 15 
        },
      });

      if (error) {
        console.warn("[Music] Edge function error:", error);
        return "";
      }

      // Check for valid audio and no fallback flag
      const audioContent = data?.audioContent;
      const isValidAudio = typeof audioContent === 'string' && audioContent.length > 100;
      const hasFallbackFlag = data?.fallback === true;

      if (isValidAudio && !hasFallbackFlag) {
        console.log("[Music] ✅ Background music generated, size:", audioContent.length, "chars");
        return `data:audio/mp3;base64,${audioContent}`;
      }

      console.log("[Music] No music available (paid plan required or quota exceeded)");
      return "";
    } catch (error) {
      console.warn("[Music] Error generating background music:", error);
      return "";
    }
  }, []);

  // Step 3b: Generate audio narration with multi-provider fallback chain
  const generateAudio = useCallback(async (script: string) => {
    setState(prev => ({ ...prev, step: "audio", progress: 70 }));
    
    // Helper to try TTS providers in order
    const tryTTSProvider = async (provider: string, invokeBody: { text: string; voiceId?: string; voice?: string; language?: string }): Promise<{ url: string; provider: string } | null> => {
      try {
        console.log(`[TTS] Trying ${provider}...`);
        const result = await supabase.functions.invoke(provider, { body: invokeBody });
        
        // Check for valid audio - must have audioContent as non-empty string and no fallback flag
        const audioContent = result.data?.audioContent;
        const isValidAudio = typeof audioContent === 'string' && audioContent.length > 100;
        const hasFallbackFlag = result.data?.fallback === true;
        
        if (!result.error && isValidAudio && !hasFallbackFlag) {
          console.log(`[TTS] ✅ ${provider} success! Audio size: ${audioContent.length} chars`);
          return { url: `data:audio/mp3;base64,${audioContent}`, provider };
        }
        
        console.log(`[TTS] ${provider} failed:`, result.data?.error || result.error || 'Invalid audio');
      } catch (e) {
        console.error(`[TTS] ${provider} error:`, e);
      }
      return null;
    };
    
    try {
      // Generate narration AND background music in parallel
      const [narrationResult, musicUrl] = await Promise.all([
        // TTS fallback chain (sequential within)
        (async () => {
          // 1. Try ElevenLabs (Premium)
          let result = await tryTTSProvider("elevenlabs-tts", { 
            text: script, 
            voiceId: "camila", 
            language: "pt-BR" 
          });
          
          // 2. Fallback to Edge TTS (VoiceRSS)
          if (!result) {
            result = await tryTTSProvider("edge-tts", { 
              text: script, 
              voice: "camila" 
            });
          }
          
          // 3. Fallback to Lovable TTS (Polly)
          if (!result) {
            result = await tryTTSProvider("lovable-tts", { 
              text: script, 
              voice: "camila" 
            });
          }
          
          // 4. Fallback to Free TTS (Google)
          if (!result) {
            result = await tryTTSProvider("free-tts", { 
              text: script, 
              language: "pt-BR" 
            });
          }
          
          return result;
        })(),
        // Background music (parallel)
        generateBackgroundMusic()
      ]);

      setState(prev => ({ ...prev, progress: 90 }));
      
      if (narrationResult) {
        const hasMusic = musicUrl && musicUrl.length > 0;
        toast.success(`🎙️ Narração gerada (${narrationResult.provider})${hasMusic ? ' + 🎵 Trilha sonora' : ''}`);
        setState(prev => ({ 
          ...prev, 
          narrationUrl: narrationResult!.url,
          backgroundMusicUrl: musicUrl,
          progress: 100,
          step: "complete",
        }));
        return { narrationUrl: narrationResult.url, musicUrl };
      }
      
      // All TTS providers failed - complete without audio
      console.warn("[TTS] All providers failed, completing without audio");
      setState(prev => ({ 
        ...prev, 
        narrationUrl: "", 
        backgroundMusicUrl: musicUrl,
        progress: 100,
        step: "complete",
      }));
      toast.warning("Conteúdo criado! (Narração indisponível no momento)");
      return { narrationUrl: "", musicUrl };
    } catch (error: any) {
      console.warn("[TTS] Error in audio generation:", error);
      setState(prev => ({ 
        ...prev, 
        narrationUrl: "", 
        backgroundMusicUrl: "",
        progress: 100,
        step: "complete",
      }));
      toast.warning("Conteúdo criado! (Narração indisponível)");
      return { narrationUrl: "", musicUrl: "" };
    }
  }, [generateBackgroundMusic]);

  // Full pipeline (without video - much cheaper!)
  const generateNarrativeVideo = useCallback(async (
    topic: string, 
    imagePrompt: string,
    customScript?: string
  ) => {
    setIsGenerating(true);
    setState(prev => ({ ...prev, step: "idle", progress: 0, error: null, backgroundMusicUrl: "" }));

    // Step 1: Script
    const script = await generateScript(topic, customScript);
    if (!script) return;

    // Step 2: Image (FREE)
    const imageUrl = await generateImage(imagePrompt);
    if (!imageUrl) return;

    // Step 3: Audio + Music (in parallel)
    await generateAudio(script);

    setIsGenerating(false);
  }, [generateScript, generateImage, generateAudio]);

  return {
    state,
    isGenerating,
    generateNarrativeVideo,
    generateScript,
    generateImage,
    generateAudio,
    generateBackgroundMusic,
    reset,
  };
}
