import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Film, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Play,
  X,
} from "lucide-react";
import { useNarrativeStory, StorySegment } from "@/hooks/useNarrativeStory";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { unlockAudio } from "@/lib/audio-unlock";

interface AgentReelsRendererProps {
  postId: string;
  topic: string;
  script: {
    title: string;
    segments: Array<{ text: string; imagePrompt: string }>;
  };
  onComplete: (videoUrl: string) => void;
  onCancel: () => void;
  autoPublish?: boolean;
  scheduledFor?: string | null;
}

const STEP_LABELS = {
  idle: "Pronto para renderizar",
  script: "Carregando roteiro...",
  images: "Gerando cenas visuais...",
  audio: "Produzindo narração...",
  video: "Renderizando vídeo...",
  complete: "Vídeo pronto!",
  error: "Erro na renderização",
};

export default function AgentReelsRenderer({
  postId,
  topic,
  script,
  onComplete,
  onCancel,
  autoPublish = false,
  scheduledFor,
}: AgentReelsRendererProps) {
  const { settings: brandSettings } = useBrandSettings();
  const [isOpen, setIsOpen] = useState(true);
  const [isStarted, setIsStarted] = useState(false);

  const {
    state,
    isGenerating,
    generateStory,
    renderFromScript,
    reset,
  } = useNarrativeStory({
    brandName: brandSettings.brandName || "NeuralUpdate",
    segmentCount: script.segments.length,
    segmentDuration: 5,
    preferredVoice: "camila",
  });

  // When video is complete, save to database and optionally publish
  useEffect(() => {
    if (state.step === "complete" && state.videoUrl) {
      handleVideoComplete(state.videoUrl);
    }
  }, [state.step, state.videoUrl]);

  const handleVideoComplete = async (videoUrl: string) => {
    try {
      // Update the post with the video URL
      const { error } = await supabase
        .from("posts")
        .update({ 
          video_url: videoUrl,
          overlay_metadata: null, // Clear the needs_processing flag
        })
        .eq("id", postId);

      if (error) throw error;

      toast.success("Vídeo renderizado e salvo!");

      // Auto-publish if requested
      if (autoPublish) {
        toast.info("Publicando automaticamente...");
        const { error: publishError } = await supabase.functions.invoke("publish-post", {
          body: { postId },
        });

        if (publishError) {
          toast.error("Erro ao publicar: " + publishError.message);
        } else {
          toast.success("Reels publicado com sucesso!");
        }
      }

      onComplete(videoUrl);
      setIsOpen(false);
    } catch (err: any) {
      console.error("Error saving video:", err);
      toast.error("Erro ao salvar vídeo: " + err.message);
    }
  };

  const handleStart = async () => {
    // Unlock audio on user interaction
    unlockAudio();
    setIsStarted(true);
    
    // Use the pre-generated script segments instead of generating new ones
    if (script.segments && script.segments.length > 0) {
      console.log('[AgentReelsRenderer] Using existing script:', script.title, 'with', script.segments.length, 'segments');
      await renderFromScript(script.segments, script.title);
    } else {
      // Fallback to generating from topic if no segments
      console.log('[AgentReelsRenderer] No existing segments, generating from topic:', topic);
      await generateStory(topic);
    }
  };

  const handleClose = () => {
    if (isGenerating) {
      reset();
    }
    setIsOpen(false);
    onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" />
            Renderizar Reels Narrado
          </DialogTitle>
          <DialogDescription>
            {script.title || topic}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Script Preview */}
          <div className="p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="text-xs">
                {script.segments.length} cenas
              </Badge>
              {scheduledFor && (
                <Badge variant="outline" className="text-xs">
                  Agendado
                </Badge>
              )}
              {autoPublish && (
                <Badge className="text-xs bg-green-500">
                  Auto-publicar
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-3">
              {script.segments.map(s => s.text).join(" ")}
            </p>
          </div>

          {/* Progress */}
          {isStarted && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  {state.step === "complete" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : state.step === "error" ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {STEP_LABELS[state.step]}
                </span>
                <span className="text-muted-foreground">{state.progress}%</span>
              </div>
              <Progress value={state.progress} />

              {/* Step indicators */}
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className={state.progress >= 15 ? "text-primary font-medium" : ""}>
                  ✍️ Roteiro
                </span>
                <span className={state.progress >= 70 ? "text-primary font-medium" : ""}>
                  🎨 {state.segments.filter(s => s.imageUrl).length}/{script.segments.length} Cenas
                </span>
                <span className={state.progress >= 80 ? "text-primary font-medium" : ""}>
                  🎙️ Áudio
                </span>
                <span className={state.progress >= 100 ? "text-primary font-medium" : ""}>
                  🎬 Vídeo
                </span>
              </div>

              {/* Generated images preview */}
              {state.segments.some(s => s.imageUrl) && (
                <div className="grid grid-cols-4 gap-1">
                  {state.segments.map((seg, i) => (
                    <div 
                      key={i} 
                      className="aspect-[9/16] rounded overflow-hidden bg-muted"
                    >
                      {seg.imageUrl ? (
                        <img 
                          src={seg.imageUrl} 
                          alt={`Cena ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Video preview when complete */}
              {state.step === "complete" && state.videoUrl && (
                <div className="flex justify-center">
                  <div className="aspect-[9/16] w-32 rounded-lg overflow-hidden bg-black">
                    <video
                      src={state.videoUrl}
                      controls
                      className="w-full h-full object-contain"
                      poster={state.segments[0]?.imageUrl}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {state.error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive">{state.error}</p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!isStarted ? (
              <>
                <Button onClick={handleStart} className="flex-1">
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Renderização
                </Button>
                <Button variant="outline" onClick={handleClose}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : state.step === "complete" ? (
              <Button onClick={handleClose} className="flex-1">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Concluído
              </Button>
            ) : state.step === "error" ? (
              <>
                <Button onClick={handleStart} variant="outline" className="flex-1">
                  Tentar Novamente
                </Button>
                <Button variant="ghost" onClick={handleClose}>
                  Cancelar
                </Button>
              </>
            ) : (
              <Button disabled className="flex-1">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
