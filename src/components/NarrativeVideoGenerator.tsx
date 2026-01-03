import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  Wand2, 
  RefreshCw,
  FileText,
  ImageIcon,
  Music,
  Check,
  AlertCircle,
  Film,
  Sparkles,
} from "lucide-react";
import { useNarrativeStory } from "@/hooks/useNarrativeStory";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import CinematicPlayer from "./CinematicPlayer";

interface NarrativeVideoGeneratorProps {
  topic: string;
  onVideoGenerated: (videoUrl: string, imageUrl: string, narrationUrl: string, script: string) => void;
}

const STEP_LABELS = {
  idle: "Pronto para criar",
  script: "Escrevendo roteiro cinematográfico...",
  images: "Gerando cenas visuais...",
  audio: "Produzindo narração...",
  video: "Renderizando vídeo...",
  complete: "Vídeo cinematográfico pronto!",
  error: "Erro na produção",
};

const STEP_DESCRIPTIONS = {
  idle: "Clique para iniciar",
  script: "Criando narrativa com começo, meio e fim",
  images: "Renderizando imagens de alta qualidade",
  audio: "Sincronizando narração profissional",
  video: "Combinando cenas, áudio e transições",
  complete: "Seu vídeo está pronto para publicar no Instagram",
  error: "Tente novamente",
};

const NarrativeVideoGenerator = ({ topic, onVideoGenerated }: NarrativeVideoGeneratorProps) => {
  const { settings: brandSettings } = useBrandSettings();
  const [customTopic, setCustomTopic] = useState(topic);

  const {
    state,
    isGenerating,
    generateStory,
    reset,
  } = useNarrativeStory({
    brandName: brandSettings.brandName || "NeuralUpdate",
    segmentCount: 4,
    segmentDuration: 5,
  });

  // Sync topic prop
  useEffect(() => {
    if (topic && topic !== customTopic) {
      setCustomTopic(topic);
    }
  }, [topic]);

  // Notify parent when video is complete
  useEffect(() => {
    if (state.step === "complete" && state.videoUrl) {
      const fullScript = state.segments.map(s => s.text).join(" ");
      const firstImageUrl = state.segments[0]?.imageUrl || "";
      onVideoGenerated(state.videoUrl, firstImageUrl, state.narrationUrl, fullScript);
    }
  }, [state.step, state.videoUrl, state.segments, state.narrationUrl, onVideoGenerated]);

  const handleGenerate = async () => {
    if (!customTopic.trim()) return;
    await generateStory(customTopic);
  };

  const getStepIcon = (step: string) => {
    switch (step) {
      case "script": return <FileText className="h-4 w-4" />;
      case "images": return <ImageIcon className="h-4 w-4" />;
      case "audio": return <Music className="h-4 w-4" />;
      case "video": return <Film className="h-4 w-4" />;
      case "complete": return <Check className="h-4 w-4" />;
      case "error": return <AlertCircle className="h-4 w-4" />;
      default: return <Film className="h-4 w-4" />;
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10">
        <CardTitle className="flex items-center gap-2 text-base">
          <Film className="h-5 w-5 text-primary" />
          Gerador de Story Cinematográfico
          <Badge variant="secondary" className="text-[10px] ml-auto">PRO</Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Múltiplas cenas, transições suaves, legendas sincronizadas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Topic Input */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Tema do Story</Label>
          <Textarea
            placeholder="Ex: Como a inteligência artificial está transformando o mercado de trabalho..."
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            disabled={isGenerating}
            rows={2}
            className="resize-none text-sm"
          />
        </div>

        {/* Progress Section - Detailed Steps */}
        {isGenerating && (
          <div className="space-y-4 p-4 rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 border">
            {/* Current Step Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/15 animate-pulse">
                  {getStepIcon(state.step)}
                </div>
                <div>
                  <span className="text-sm font-semibold block">{STEP_LABELS[state.step]}</span>
                  <span className="text-xs text-muted-foreground">{STEP_DESCRIPTIONS[state.step]}</span>
                </div>
              </div>
              <Badge variant="outline" className="text-sm font-mono px-3 py-1">
                {state.progress}%
              </Badge>
            </div>
            
            <Progress value={state.progress} className="h-2.5" />
            
            {/* Detailed Step Timeline */}
            <div className="grid grid-cols-4 gap-2 pt-2">
              {/* Script Step */}
              <div className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                state.step === "script" 
                  ? "bg-primary/10 border border-primary/30" 
                  : state.progress >= 15 
                    ? "bg-green-500/10 border border-green-500/30" 
                    : "bg-muted/50"
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  state.step === "script" 
                    ? "bg-primary text-primary-foreground animate-pulse" 
                    : state.progress >= 15 
                      ? "bg-green-500 text-white" 
                      : "bg-muted-foreground/20"
                }`}>
                  {state.progress >= 15 ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </div>
                <span className="text-[10px] font-medium text-center">Roteiro</span>
                {state.step === "script" && (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                )}
              </div>

              {/* Images Step */}
              <div className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                state.step === "images" 
                  ? "bg-primary/10 border border-primary/30" 
                  : state.progress >= 70 
                    ? "bg-green-500/10 border border-green-500/30" 
                    : "bg-muted/50"
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  state.step === "images" 
                    ? "bg-primary text-primary-foreground animate-pulse" 
                    : state.progress >= 70 
                      ? "bg-green-500 text-white" 
                      : "bg-muted-foreground/20"
                }`}>
                  {state.progress >= 70 ? <Check className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                </div>
                <span className="text-[10px] font-medium text-center">
                  {state.segments.length > 0 
                    ? `${state.segments.filter(s => s.imageUrl).length}/${state.segments.length} Cenas`
                    : "Imagens"
                  }
                </span>
                {state.step === "images" && (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                )}
              </div>

              {/* Audio Step */}
              <div className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                state.step === "audio" 
                  ? "bg-primary/10 border border-primary/30" 
                  : state.progress >= 80 
                    ? "bg-green-500/10 border border-green-500/30" 
                    : "bg-muted/50"
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  state.step === "audio" 
                    ? "bg-primary text-primary-foreground animate-pulse" 
                    : state.progress >= 80 
                      ? "bg-green-500 text-white" 
                      : "bg-muted-foreground/20"
                }`}>
                  {state.progress >= 80 ? <Check className="h-4 w-4" /> : <Music className="h-4 w-4" />}
                </div>
                <span className="text-[10px] font-medium text-center">Narração</span>
                {state.step === "audio" && (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                )}
              </div>

              {/* Video Step */}
              <div className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                state.step === "video" 
                  ? "bg-primary/10 border border-primary/30" 
                  : state.progress >= 100 
                    ? "bg-green-500/10 border border-green-500/30" 
                    : "bg-muted/50"
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  state.step === "video" 
                    ? "bg-primary text-primary-foreground animate-pulse" 
                    : state.progress >= 100 
                      ? "bg-green-500 text-white" 
                      : "bg-muted-foreground/20"
                }`}>
                  {state.progress >= 100 ? <Check className="h-4 w-4" /> : <Film className="h-4 w-4" />}
                </div>
                <span className="text-[10px] font-medium text-center">Vídeo</span>
                {state.step === "video" && (
                  <div className="flex flex-col items-center">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span className="text-[9px] text-muted-foreground mt-0.5">
                      {state.progress >= 82 ? `${Math.round((state.progress - 82) / 0.13)}%` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Video rendering info */}
            {state.step === "video" && (
              <div className="text-xs text-muted-foreground text-center p-2 bg-muted/30 rounded-lg">
                ⏱️ Renderização em tempo real (~{state.totalDuration || 20}s de vídeo)
              </div>
            )}
          </div>
        )}

        {/* Preview generated images during generation */}
        {state.segments.length > 0 && state.segments.some(s => s.imageUrl) && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-3 w-3" />
              Cenas criadas:
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {state.segments.map((seg, i) => (
                <div 
                  key={seg.id} 
                  className="aspect-[9/16] rounded-lg overflow-hidden bg-muted relative group"
                >
                  {seg.imageUrl ? (
                    <>
                      <img 
                        src={seg.imageUrl} 
                        alt={`Cena ${i + 1}`}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="absolute bottom-2 left-2 right-2 text-[8px] text-white line-clamp-3">
                          {seg.text}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-[9px] text-muted-foreground">Gerando...</span>
                    </div>
                  )}
                  <div className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                    {i + 1}
                  </div>
                  {seg.imageUrl && (
                    <div className="absolute top-1 right-1 bg-green-500 text-white p-0.5 rounded">
                      <Check className="h-2.5 w-2.5" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Video Preview when complete */}
        {state.step === "complete" && state.videoUrl && (
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Seu Vídeo Cinematográfico
            </Label>
            <div className="flex justify-center">
              <div className="aspect-[9/16] w-full max-w-[200px] max-h-[320px] rounded-lg overflow-hidden bg-black">
                <video
                  src={state.videoUrl}
                  controls
                  className="w-full h-full object-contain"
                  poster={state.segments[0]?.imageUrl}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Vídeo pronto para publicar como Reels no Instagram
            </p>
          </div>
        )}

        {/* Fallback: Cinematic Player if no video but has segments */}
        {state.step === "complete" && !state.videoUrl && state.segments.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Preview do Story
            </Label>
            <div className="flex justify-center">
              <CinematicPlayer
                segments={state.segments}
                narrationUrl={state.narrationUrl}
                title={state.title}
                totalDuration={state.totalDuration}
                onComplete={() => console.log("Story complete")}
              />
            </div>
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
            disabled={isGenerating || !customTopic.trim()}
            className="flex-1"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Produzindo...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Criar Story Cinematográfico
              </>
            )}
          </Button>
          
          {(state.step === "complete" || state.step === "error") && (
            <Button variant="outline" onClick={reset} size="lg">
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Cost Info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground p-2 rounded-lg bg-muted/30">
          <span>🎬 4 cenas com transições</span>
          <span className="text-green-600 dark:text-green-400 font-medium">
            ~R$0,10 por story
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default NarrativeVideoGenerator;
