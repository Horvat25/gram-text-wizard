import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getRandomTrack, preloadTrack } from "@/lib/background-music";

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

  // Step 3a: Generate background music using royalty-free tracks
  const generateBackgroundMusic = useCallback(async (): Promise<string> => {
    try {
      console.log("[Music] Loading royalty-free background music...");
      
      // Get a random ambient/tech track from our library
      const track = getRandomTrack();
      console.log("[Music] Selected track:", track.name, "-", track.mood);
      
      // Preload the track as data URL for reliable playback
      const musicUrl = await preloadTrack(track);
      
      console.log("[Music] ✅ Background music ready:", track.name);
      return musicUrl;
    } catch (error) {
      console.warn("[Music] Error loading background music:", error);
      // Music is optional - video continues without it
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
      // 100% FREE pipeline: Bark → Edge TTS → Lovable TTS → Free TTS
      const [narrationResult, musicUrl] = await Promise.all([
        (async () => {
          // 1. Try Bark TTS first (Hugging Face - FREE neural voice)
          console.log("[TTS] 🎙️ Tentando Bark TTS (Hugging Face)...");
          let result = await tryTTSProvider("huggingface-bark-tts", { 
            text: script, 
            voice: "camila", 
            language: "pt-BR" 
          });
          
          // 2. Fallback para Edge TTS (VoiceRSS - FREE)
          if (!result) {
            console.log("[TTS] Bark indisponível, tentando Edge TTS...");
            result = await tryTTSProvider("edge-tts", { 
              text: script, 
              voice: "camila" 
            });
          }
          
          // 3. Fallback para Lovable TTS (Polly - FREE)
          if (!result) {
            console.log("[TTS] Edge TTS indisponível, tentando Lovable TTS...");
            result = await tryTTSProvider("lovable-tts", { 
              text: script, 
              voice: "camila" 
            });
          }
          
          // 4. Último recurso: Free TTS (Google - FREE)
          if (!result) {
            console.warn("[TTS] ⚠️ Todos os provedores falharam, usando Google TTS como último recurso");
            result = await tryTTSProvider("free-tts", { 
              text: script, 
              language: "pt-BR" 
            });
          }
          
          return result;
        })(),
        // Background music (parallel) - uses MusicGen or royalty-free tracks
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
