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

  // Step 3b: Generate audio - ÚNICA TENTATIVA (sem fallback)
  const generateAudio = useCallback(async (script: string) => {
    setState(prev => ({ ...prev, step: "audio", progress: 70 }));
    
    try {
      // Gerar narração E trilha sonora em paralelo
      const [ttsResult, musicUrl] = await Promise.all([
        // TTS - ElevenLabs via edge-tts (qualidade premium)
        (async () => {
          console.log("[TTS] 🎙️ Iniciando narração ElevenLabs...");
          
          try {
            const result = await supabase.functions.invoke("edge-tts", { 
              body: { 
                text: script, 
                voice: "camila"
              } 
            });
            
            if (result.data?.audioContent) {
              const format = result.data.format || "mp3";
              console.log(`[TTS] ✅ Sucesso! Provider: ${result.data.provider}, Size: ${(result.data.audioContent.length / 1024).toFixed(1)}KB`);
              return { 
                url: `data:audio/${format};base64,${result.data.audioContent}`, 
                status: "success",
                model: result.data.provider 
              };
            }
            
            console.log("[TTS] ❌ Sem áudio retornado");
            return { url: "", status: "failed", model: null };
            
          } catch (e: any) {
            console.error("[TTS] ❌ Erro:", e.message);
            return { url: "", status: "failed", model: null };
          }
        })(),
        // Trilha sonora (paralelo)
        generateBackgroundMusic()
      ]);

      setState(prev => ({ ...prev, progress: 90 }));
      
      const hasVoice = ttsResult.status === "success" && ttsResult.url;
      const hasMusic = musicUrl && musicUrl.length > 0;
      
      if (hasVoice) {
        toast.success(`🎙️ Narração gerada${hasMusic ? ' + 🎵 Trilha' : ''}`);
      } else {
        console.log("[TTS] → Seguir sem voz (apenas trilha)");
        toast.info(`🎵 Vídeo com trilha sonora${hasMusic ? '' : ' (sem áudio)'}`);
      }
      
      setState(prev => ({ 
        ...prev, 
        narrationUrl: ttsResult.url,
        backgroundMusicUrl: musicUrl,
        progress: 100,
        step: "complete",
      }));
      
      return { narrationUrl: ttsResult.url, musicUrl };
      
    } catch (error: any) {
      console.warn("[TTS] Erro geral:", error);
      
      // Mesmo com erro, tenta trilha sonora
      const musicUrl = await generateBackgroundMusic().catch(() => "");
      
      setState(prev => ({ 
        ...prev, 
        narrationUrl: "", 
        backgroundMusicUrl: musicUrl,
        progress: 100,
        step: "complete",
      }));
      
      toast.info("🎵 Vídeo apenas com trilha sonora");
      return { narrationUrl: "", musicUrl };
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
