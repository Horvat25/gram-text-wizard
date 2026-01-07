import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  Send,
  Save,
} from "lucide-react";
import { useNarrativeStory } from "@/hooks/useNarrativeStory";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useTikTokAccounts } from "@/hooks/useTikTokAccounts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TikTokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

const STEP_LABELS = {
  idle: "Pronto para criar",
  script: "Escrevendo roteiro...",
  images: "Gerando cenas visuais...",
  audio: "Produzindo narração...",
  video: "Renderizando vídeo...",
  complete: "Vídeo pronto!",
  error: "Erro na produção",
};

const STEP_DESCRIPTIONS = {
  idle: "Clique para iniciar",
  script: "Criando narrativa envolvente",
  images: "Renderizando imagens de alta qualidade",
  audio: "Sincronizando narração profissional",
  video: "Combinando cenas, áudio e transições",
  complete: "Seu vídeo está pronto para o TikTok",
  error: "Tente novamente",
};

const TikTokContentCreation = () => {
  const { settings: brandSettings } = useBrandSettings();
  const { accounts } = useTikTokAccounts();
  const [topic, setTopic] = useState("");
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState("");
  const [generatedScript, setGeneratedScript] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const hasConnectedAccount = accounts.length > 0;

  const {
    state,
    isGenerating,
    generateStory,
    reset,
  } = useNarrativeStory({
    brandName: brandSettings.brandName || "NeuralUpdate",
    segmentCount: 4,
    segmentDuration: 4, // Slightly shorter for TikTok
  });

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("Por favor, insira um tema");
      return;
    }
    await generateStory(topic);
  };

  // Update state when video is complete
  const handleVideoComplete = useCallback(() => {
    if (state.step === "complete" && state.videoUrl) {
      setGeneratedVideoUrl(state.videoUrl);
      setGeneratedScript(state.segments.map(s => s.text).join(" "));
    }
  }, [state.step, state.videoUrl, state.segments]);

  // Watch for completion
  if (state.step === "complete" && state.videoUrl && !generatedVideoUrl) {
    handleVideoComplete();
  }

  const handleReset = () => {
    reset();
    setGeneratedVideoUrl("");
    setGeneratedScript("");
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

  const saveAsDraft = async () => {
    if (!generatedVideoUrl) {
      toast.error("Nenhum vídeo para salvar");
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase.from("posts").insert({
        user_id: user.id,
        caption: generatedScript,
        video_url: generatedVideoUrl,
        media_type: "reels",
        status: "draft",
        platforms: ["tiktok"],
        post_type: "storytelling",
      });

      if (error) throw error;
      toast.success("Rascunho salvo!");
    } catch (error: any) {
      console.error("Error saving draft:", error);
      toast.error(error.message || "Erro ao salvar rascunho");
    } finally {
      setIsSaving(false);
    }
  };

  const publishToTikTok = async () => {
    if (!hasConnectedAccount) {
      toast.error("Conecte uma conta TikTok nas configurações");
      return;
    }

    if (!generatedVideoUrl) {
      toast.error("Nenhum vídeo para publicar");
      return;
    }

    setIsPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("publish-to-tiktok", {
        body: {
          videoUrl: generatedVideoUrl,
          caption: generatedScript,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success("Vídeo publicado no TikTok!");
    } catch (error: any) {
      console.error("Error publishing to TikTok:", error);
      toast.error(error.message || "Erro ao publicar no TikTok");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="overflow-hidden border-2 border-[#25F4EE]/20">
        <CardHeader className="pb-3 bg-gradient-to-r from-black/5 via-[#25F4EE]/10 to-[#FE2C55]/10">
          <CardTitle className="flex items-center gap-2 text-base">
            <TikTokIcon className="h-5 w-5" />
            Criar Vídeo para TikTok
            <Badge variant="secondary" className="text-[10px] ml-auto bg-gradient-to-r from-[#25F4EE] to-[#FE2C55] text-white border-0">
              REELS
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Vídeos narrados com múltiplas cenas, otimizados para viralizar
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4 pt-4">
          {/* Topic Input */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tema do Vídeo</Label>
            <Textarea
              placeholder="Ex: 5 fatos surpreendentes sobre o cérebro humano..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isGenerating}
              rows={3}
              className="resize-none text-sm border-[#25F4EE]/30 focus:border-[#25F4EE]"
            />
          </div>

          {/* Progress Section */}
          {isGenerating && (
            <div className="space-y-3 p-4 rounded-xl bg-gradient-to-br from-black/5 via-[#25F4EE]/5 to-[#FE2C55]/5 border border-[#25F4EE]/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#25F4EE]/20">
                    {getStepIcon(state.step)}
                  </div>
                  <div>
                    <span className="text-sm font-medium block">{STEP_LABELS[state.step]}</span>
                    <span className="text-xs text-muted-foreground">{STEP_DESCRIPTIONS[state.step]}</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs font-mono border-[#25F4EE]/50">
                  {state.progress}%
                </Badge>
              </div>
              <Progress value={state.progress} className="h-2 bg-black/10" />
              
              {/* Step indicators */}
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span className={state.progress >= 15 ? "text-[#25F4EE] font-medium" : ""}>
                  ✍️ Roteiro
                </span>
                <span className={state.progress >= 70 ? "text-[#25F4EE] font-medium" : ""}>
                  🎨 {state.segments.filter(s => s.imageUrl).length}/{state.segments.length} Cenas
                </span>
                <span className={state.progress >= 80 ? "text-[#FE2C55] font-medium" : ""}>
                  🎙️ Áudio
                </span>
                <span className={state.progress >= 100 ? "text-[#FE2C55] font-medium" : ""}>
                  🎬 Vídeo
                </span>
              </div>
            </div>
          )}

          {/* Preview generated images during generation */}
          {isGenerating && state.segments.some(s => s.imageUrl) && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Cenas geradas:</Label>
              <div className="grid grid-cols-4 gap-2">
                {state.segments.map((seg, i) => (
                  <div 
                    key={seg.id} 
                    className="aspect-[9/16] rounded-lg overflow-hidden bg-muted relative"
                  >
                    {seg.imageUrl ? (
                      <img 
                        src={seg.imageUrl} 
                        alt={`Cena ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Video Preview when complete */}
          {state.step === "complete" && state.videoUrl && (
            <div className="space-y-3">
              <Label className="text-xs flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-[#25F4EE]" />
                Seu Vídeo TikTok
              </Label>
              <div className="flex justify-center">
                <div className="aspect-[9/16] w-full max-w-[220px] rounded-2xl overflow-hidden bg-black shadow-xl shadow-[#25F4EE]/20 ring-2 ring-[#25F4EE]/30">
                  <video
                    src={state.videoUrl}
                    controls
                    className="w-full h-full object-contain"
                    poster={state.segments[0]?.imageUrl}
                  />
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={saveAsDraft}
                  variant="outline"
                  className="flex-1"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar Rascunho
                </Button>
                <Button
                  onClick={publishToTikTok}
                  className="flex-1 bg-gradient-to-r from-[#25F4EE] to-[#FE2C55] hover:opacity-90"
                  disabled={isPublishing || !hasConnectedAccount}
                >
                  {isPublishing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Publicar
                </Button>
              </div>
              
              {!hasConnectedAccount && (
                <p className="text-xs text-center text-muted-foreground">
                  Conecte sua conta TikTok nas configurações para publicar
                </p>
              )}
            </div>
          )}

          {/* Error State */}
          {state.error && (
            <div className="p-3 rounded-lg bg-[#FE2C55]/10 border border-[#FE2C55]/20">
              <p className="text-sm text-[#FE2C55]">{state.error}</p>
            </div>
          )}

          {/* Generate Button */}
          {state.step !== "complete" && (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !topic.trim()}
              className="w-full bg-gradient-to-r from-[#25F4EE] to-[#FE2C55] hover:opacity-90 text-white"
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
                  Criar Vídeo TikTok
                </>
              )}
            </Button>
          )}

          {/* Reset Button */}
          {(state.step === "complete" || state.step === "error") && (
            <Button 
              variant="outline" 
              onClick={handleReset} 
              className="w-full border-[#25F4EE]/30 hover:bg-[#25F4EE]/10"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Criar Novo Vídeo
            </Button>
          )}

          {/* Cost Info */}
          <div className="flex items-center justify-between text-xs text-muted-foreground p-2 rounded-lg bg-gradient-to-r from-black/5 to-[#25F4EE]/5">
            <span>🎬 4 cenas com transições</span>
            <span className="text-[#25F4EE] font-medium">
              ~R$0,10 por vídeo
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TikTokContentCreation;
