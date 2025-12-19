import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Video, 
  Loader2, 
  Wand2, 
  Play, 
  VolumeX, 
  Volume2,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Music,
  Mic,
  Check,
  AlertCircle,
} from "lucide-react";
import { useNarrativeVideo } from "@/hooks/useNarrativeVideo";
import { useBrandSettings } from "@/hooks/useBrandSettings";

interface NarrativeVideoGeneratorProps {
  topic: string;
  onVideoGenerated: (videoUrl: string, narrationUrl: string, musicUrl: string, script: string) => void;
}

const STEP_LABELS = {
  idle: "Pronto para começar",
  script: "Gerando roteiro...",
  image: "Criando imagem base...",
  video: "Gerando vídeo...",
  audio: "Produzindo narração e música...",
  complete: "Vídeo narrativo pronto!",
  error: "Erro na geração",
};

const NarrativeVideoGenerator = ({ topic, onVideoGenerated }: NarrativeVideoGeneratorProps) => {
  const { settings: brandSettings } = useBrandSettings();
  const [imagePrompt, setImagePrompt] = useState("");
  const [customScript, setCustomScript] = useState("");
  const [useCustomScript, setUseCustomScript] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const {
    state,
    isGenerating,
    generateNarrativeVideo,
    checkVideoStatus,
    completeWithAudio,
    reset,
  } = useNarrativeVideo({
    brandName: brandSettings.brandName || "NeuralUpdate",
    duration: 10,
  });

  // Poll for video status when predictionId exists
  useEffect(() => {
    if (!state.predictionId) return;

    const interval = setInterval(async () => {
      const result = await checkVideoStatus();
      if (result && result !== "processing") {
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [state.predictionId, checkVideoStatus]);

  // Auto-generate audio when video is ready
  useEffect(() => {
    if (state.videoUrl && !state.narrationUrl && state.step === "video") {
      completeWithAudio();
    }
  }, [state.videoUrl, state.narrationUrl, state.step, completeWithAudio]);

  // Notify parent when complete
  useEffect(() => {
    if (state.step === "complete" && state.videoUrl) {
      onVideoGenerated(state.videoUrl, state.narrationUrl, state.musicUrl, state.script);
    }
  }, [state.step, state.videoUrl, state.narrationUrl, state.musicUrl, state.script, onVideoGenerated]);

  const handleGenerate = async () => {
    const prompt = imagePrompt || topic;
    await generateNarrativeVideo(
      topic, 
      prompt, 
      useCustomScript ? customScript : undefined
    );
  };

  const getStepIcon = (step: string) => {
    switch (step) {
      case "script": return <FileText className="h-4 w-4" />;
      case "image": return <ImageIcon className="h-4 w-4" />;
      case "video": return <Video className="h-4 w-4" />;
      case "audio": return <Music className="h-4 w-4" />;
      case "complete": return <Check className="h-4 w-4" />;
      case "error": return <AlertCircle className="h-4 w-4" />;
      default: return <Wand2 className="h-4 w-4" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="h-5 w-5 text-primary" />
          Gerador de Vídeo Narrativo
        </CardTitle>
        <CardDescription className="text-xs">
          Crie Reels com narração, música e legendas automáticas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Image Prompt */}
        <div className="space-y-2">
          <Label className="text-sm">Descrição Visual</Label>
          <Input
            placeholder="Descrição da imagem base (ex: paisagem futurista, interface tech...)"
            value={imagePrompt}
            onChange={(e) => setImagePrompt(e.target.value)}
            disabled={isGenerating}
          />
        </div>

        {/* Custom Script Toggle */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="useCustomScript"
              checked={useCustomScript}
              onChange={(e) => setUseCustomScript(e.target.checked)}
              disabled={isGenerating}
              className="rounded border-border"
            />
            <Label htmlFor="useCustomScript" className="text-sm cursor-pointer">
              Usar roteiro personalizado
            </Label>
          </div>
          
          {useCustomScript && (
            <Textarea
              placeholder="Digite seu roteiro de narração aqui..."
              value={customScript}
              onChange={(e) => setCustomScript(e.target.value)}
              rows={4}
              disabled={isGenerating}
              className="resize-none text-sm"
            />
          )}
        </div>

        {/* Progress Section */}
        {isGenerating && (
          <div className="space-y-3 p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStepIcon(state.step)}
                <span className="text-sm font-medium">{STEP_LABELS[state.step]}</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {state.progress}%
              </Badge>
            </div>
            <Progress value={state.progress} />
            
            {/* Step indicators */}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className={state.progress >= 20 ? "text-primary" : ""}>Roteiro</span>
              <span className={state.progress >= 50 ? "text-primary" : ""}>Imagem</span>
              <span className={state.progress >= 70 ? "text-primary" : ""}>Vídeo</span>
              <span className={state.progress >= 100 ? "text-primary" : ""}>Áudio</span>
            </div>
          </div>
        )}

        {/* Generated Script Preview */}
        {state.script && (
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border">
            <Label className="text-xs flex items-center gap-1">
              <Mic className="h-3 w-3" />
              Roteiro de Narração
            </Label>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {state.script}
            </p>
          </div>
        )}

        {/* Video Preview */}
        {state.videoUrl && (
          <div className="space-y-2">
            <Label className="text-xs">Vídeo Gerado</Label>
            <div className="relative rounded-lg overflow-hidden bg-black aspect-[9/16] max-h-[300px]">
              <video
                src={state.videoUrl}
                controls
                className="w-full h-full object-contain"
                muted={isMuted}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>
          </div>
        )}

        {/* Audio Players */}
        {state.narrationUrl && (
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Mic className="h-3 w-3" />
              Narração
            </Label>
            <audio src={state.narrationUrl} controls className="w-full h-8" />
          </div>
        )}

        {state.musicUrl && (
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Music className="h-3 w-3" />
              Música Ambiente
            </Label>
            <audio src={state.musicUrl} controls className="w-full h-8" />
          </div>
        )}

        {/* Error State */}
        {state.error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{state.error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !topic.trim()}
            className="flex-1"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Gerar Vídeo Narrado
              </>
            )}
          </Button>
          
          {(state.step === "complete" || state.step === "error") && (
            <Button variant="outline" onClick={reset}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Info */}
        <p className="text-xs text-muted-foreground text-center">
          Pipeline econômico: Gemini (imagem) → SVD (vídeo) → ElevenLabs (áudio)
        </p>
      </CardContent>
    </Card>
  );
};

export default NarrativeVideoGenerator;
