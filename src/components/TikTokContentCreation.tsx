import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
  Calendar,
  BarChart3,
  Clock,
  Play,
  Trash2,
  Instagram,
  Zap,
  Timer,
} from "lucide-react";
import { useNarrativeStory } from "@/hooks/useNarrativeStory";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useTikTokAccounts } from "@/hooks/useTikTokAccounts";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import { usePosts } from "@/hooks/usePosts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { unlockAudio } from "@/lib/audio-unlock";

const TikTokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

const STEP_LABELS: Record<string, string> = {
  idle: "Pronto para criar",
  script: "Escrevendo roteiro...",
  images: "Gerando cenas visuais...",
  audio: "Produzindo narração...",
  video: "Renderizando vídeo...",
  complete: "Vídeo pronto!",
  error: "Erro na produção",
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  idle: "Clique para iniciar",
  script: "Criando narrativa envolvente",
  images: "Renderizando imagens de alta qualidade",
  audio: "Sincronizando narração profissional",
  video: "Combinando cenas, áudio e transições",
  complete: "Seu vídeo está pronto para o TikTok",
  error: "Tente novamente",
};

// Brasília timezone offset (UTC-3)
const BRASILIA_OFFSET_HOURS = 3;

const localToUTC = (localDatetime: string): string => {
  if (!localDatetime) return "";
  const [datePart, timePart] = localDatetime.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours + BRASILIA_OFFSET_HOURS, minutes));
  return utcDate.toISOString();
};

const getMinScheduleDatetime = (): string => {
  const now = new Date();
  const minDate = addMinutes(now, 5);
  return format(minDate, "yyyy-MM-dd'T'HH:mm");
};

// Duration presets for video generation
const DURATION_PRESETS = [
  { label: "~15s", description: "Rápido", segments: 3, duration: 5, icon: Zap },
  { label: "~30s", description: "Ideal", segments: 4, duration: 7, icon: Timer },
  { label: "~60s", description: "Deep", segments: 6, duration: 10, icon: Film },
  { label: "~90s", description: "Story", segments: 8, duration: 11, icon: FileText },
];

const TikTokContentCreation = () => {
  const { settings: brandSettings } = useBrandSettings();
  const { accounts: tiktokAccounts } = useTikTokAccounts();
  const { accounts: instagramAccounts } = useInstagramAccounts();
  const { posts, createPost, publishPost, deletePost, reschedulePost } = usePosts();
  const [activeTab, setActiveTab] = useState("create");
  const [topic, setTopic] = useState("");
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState("");
  const [generatedScript, setGeneratedScript] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  
  // Duration selection
  const [selectedDuration, setSelectedDuration] = useState(1); // Index of DURATION_PRESETS (default: ~30s)
  const currentPreset = DURATION_PRESETS[selectedDuration];
  
   // TikTok only - no cross-platform publishing
  const [publishToTikTok] = useState(true);

  const hasTikTokAccount = tiktokAccounts.length > 0;
  const hasInstagramAccount = instagramAccounts.length > 0;
  const hasConnectedAccount = hasTikTokAccount || hasInstagramAccount;

  // Filter posts for TikTok only - must have tiktok_post_id or be explicitly for tiktok platform
  const tiktokPosts = posts.filter(p => 
    p.platforms?.includes('tiktok') || p.tiktok_post_id
  );
  const scheduledPosts = tiktokPosts.filter(p => p.status === 'scheduled');
  // Only show posts that were actually published to TikTok (have tiktok_post_id)
  const publishedPosts = tiktokPosts.filter(p => p.status === 'published' && p.tiktok_post_id);

  const {
    state,
    isGenerating,
    generateStory,
    reset,
  } = useNarrativeStory({
    brandName: brandSettings.brandName || "NeuralUpdate",
    segmentCount: currentPreset.segments,
    segmentDuration: currentPreset.duration,
  });

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("Por favor, insira um tema");
      return;
    }
    
    // 🔊 CRITICAL: Unlock audio BEFORE any await - this is synchronous!
    unlockAudio();
    console.log('[TikTokContentCreation] Audio unlocked on user click');
    
    await generateStory(topic);
  };

  const handleVideoComplete = useCallback(() => {
    if (state.step === "complete" && state.videoUrl) {
      setGeneratedVideoUrl(state.videoUrl);
      setGeneratedScript(state.segments.map(s => s.text).join(" "));
    }
  }, [state.step, state.videoUrl, state.segments]);

  if (state.step === "complete" && state.videoUrl && !generatedVideoUrl) {
    handleVideoComplete();
  }

  const handleReset = () => {
    reset();
    setGeneratedVideoUrl("");
    setGeneratedScript("");
    setScheduledFor("");
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

  // Always TikTok only
  const getSelectedPlatforms = (): string[] => ['tiktok'];

  const savePost = async (status: "draft" | "scheduled") => {
    if (!generatedVideoUrl) {
      toast.error("Nenhum vídeo para salvar");
      return;
    }

    if (status === "scheduled" && !scheduledFor) {
      toast.error("Selecione uma data para agendamento");
      return;
    }

    setIsSaving(true);
    try {
      await createPost({
        caption: generatedScript,
        hashtags: [],
        video_url: generatedVideoUrl,
        media_type: "reels",
        status,
        scheduled_for: status === "scheduled" ? localToUTC(scheduledFor) : undefined,
        platforms: getSelectedPlatforms(),
        post_type: "storytelling",
      });

      toast.success(status === "scheduled" ? "Agendado!" : "Rascunho salvo!");
      handleReset();
    } catch (error: any) {
      console.error("Error saving:", error);
      toast.error(error.message || "Erro ao salvar");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishNow = async (postId: string) => {
    setIsPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("publish-to-tiktok", {
        body: { postId },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success("Vídeo publicado no TikTok!");
    } catch (error: any) {
      console.error("Error publishing:", error);
      toast.error(error.message || "Erro ao publicar");
    } finally {
      setIsPublishing(false);
    }
  };

  const publishDirectly = async () => {
    if (!generatedVideoUrl) {
      toast.error("Nenhum vídeo para publicar");
      return;
    }

    const platforms = getSelectedPlatforms();
    
    // Validate TikTok account
    if (!hasTikTokAccount) {
      toast.error("Conecte uma conta TikTok nas configurações");
      return;
    }

    setIsSaving(true);
    try {
      // First save the post
      const post = await createPost({
        caption: generatedScript,
        hashtags: [],
        video_url: generatedVideoUrl,
        media_type: "reels",
        status: "draft",
        platforms,
        post_type: "storytelling",
      });

      if (!post?.id) throw new Error("Falha ao criar post");

      const publishPromises: Promise<any>[] = [];
      
      // Publish to TikTok
      if (publishToTikTok && hasTikTokAccount) {
        publishPromises.push(
          supabase.functions.invoke("publish-to-tiktok", {
            body: { postId: post.id },
          }).then(({ data, error }) => {
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return { platform: 'tiktok', success: true };
          }).catch(err => ({ platform: 'tiktok', success: false, error: err.message }))
        );
      }
      

      const results = await Promise.all(publishPromises);
      
      const successes = results.filter(r => r.success);
      const failures = results.filter(r => !r.success);
      
      if (successes.length > 0) {
        const platformNames = successes.map(r => r.platform === 'tiktok' ? 'TikTok' : 'Instagram').join(' e ');
        toast.success(`Publicado no ${platformNames}!`);
      }
      
      if (failures.length > 0) {
        const failedPlatforms = failures.map(r => r.platform === 'tiktok' ? 'TikTok' : 'Instagram').join(' e ');
        toast.error(`Falha ao publicar no ${failedPlatforms}`);
      }
      
      if (successes.length > 0) {
        handleReset();
      }
    } catch (error: any) {
      console.error("Error publishing:", error);
      toast.error(error.message || "Erro ao publicar");
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate simple analytics
  const totalViews = publishedPosts.reduce((acc, p) => acc + (p.reach || 0), 0);
  const totalLikes = publishedPosts.reduce((acc, p) => acc + (p.likes_count || 0), 0);
  const totalComments = publishedPosts.reduce((acc, p) => acc + (p.comments_count || 0), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-black/5 via-[#25F4EE]/10 to-[#FE2C55]/10">
          <TabsTrigger value="create" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#25F4EE]/20 data-[state=active]:to-[#FE2C55]/20">
            <Sparkles className="h-4 w-4" />
            <span>Criar</span>
          </TabsTrigger>
          <TabsTrigger value="queue" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#25F4EE]/20 data-[state=active]:to-[#FE2C55]/20">
            <Calendar className="h-4 w-4" />
            <span>Fila</span>
            {scheduledPosts.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                {scheduledPosts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#25F4EE]/20 data-[state=active]:to-[#FE2C55]/20">
            <BarChart3 className="h-4 w-4" />
            <span>Analytics</span>
          </TabsTrigger>
        </TabsList>

        {/* Create Tab */}
        <TabsContent value="create" className="mt-4">
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

              {/* Duration Selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  Duração do Vídeo
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {DURATION_PRESETS.map((preset, index) => {
                    const Icon = preset.icon;
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setSelectedDuration(index)}
                        disabled={isGenerating}
                        className={`p-3 rounded-lg border-2 transition-all text-center ${
                          selectedDuration === index
                            ? 'border-[#25F4EE] bg-[#25F4EE]/10'
                            : 'border-border hover:border-[#25F4EE]/50'
                        } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Icon className={`h-4 w-4 mx-auto mb-1 ${selectedDuration === index ? 'text-[#25F4EE]' : 'text-muted-foreground'}`} />
                        <p className={`text-sm font-bold ${selectedDuration === index ? 'text-[#25F4EE]' : ''}`}>
                          {preset.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{preset.description}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground text-center">
                  {currentPreset.segments} cenas × {currentPreset.duration}s cada
                </p>
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
                  
                  <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span className={state.progress >= 15 ? "text-[#25F4EE] font-medium" : ""}>✍️ Roteiro</span>
                    <span className={state.progress >= 70 ? "text-[#25F4EE] font-medium" : ""}>
                      🎨 {state.segments.filter(s => s.imageUrl).length}/{state.segments.length} Cenas
                    </span>
                    <span className={state.progress >= 80 ? "text-[#FE2C55] font-medium" : ""}>🎙️ Áudio</span>
                    <span className={state.progress >= 100 ? "text-[#FE2C55] font-medium" : ""}>🎬 Vídeo</span>
                  </div>
                </div>
              )}

              {/* Preview images during generation */}
              {isGenerating && state.segments.some(s => s.imageUrl) && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Cenas geradas:</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {state.segments.map((seg, i) => (
                      <div key={seg.id} className="aspect-[9/16] rounded-lg overflow-hidden bg-muted relative">
                        {seg.imageUrl ? (
                          <img src={seg.imageUrl} alt={`Cena ${i + 1}`} className="w-full h-full object-cover" />
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
                    <div className="aspect-[9/16] w-full max-w-[200px] rounded-2xl overflow-hidden bg-black shadow-xl shadow-[#25F4EE]/20 ring-2 ring-[#25F4EE]/30">
                      <video
                        src={state.videoUrl}
                        controls
                        className="w-full h-full object-contain"
                        poster={state.segments[0]?.imageUrl}
                      />
                    </div>
                  </div>
                  
                  {/* Platform Selection */}
                  <div className="p-3 rounded-lg border border-[#25F4EE]/20 bg-gradient-to-r from-black/5 to-[#25F4EE]/5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <TikTokIcon className="h-4 w-4" />
                      Publicar no TikTok
                      {hasTikTokAccount && <Check className="h-3 w-3 text-green-500" />}
                    </Label>
                    {!hasTikTokAccount && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Conecte sua conta TikTok nas configurações
                      </p>
                    )}
                  </div>
                  
                  {/* Schedule Input */}
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Agendar para (opcional)
                    </Label>
                    <Input
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                      min={getMinScheduleDatetime()}
                      className="text-sm border-[#25F4EE]/30"
                    />
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => savePost("draft")}
                      variant="outline"
                      disabled={isSaving}
                      className="border-[#25F4EE]/30"
                    >
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Rascunho
                    </Button>
                    {scheduledFor ? (
                      <Button
                        onClick={() => savePost("scheduled")}
                        className="bg-gradient-to-r from-[#25F4EE] to-[#FE2C55] hover:opacity-90"
                        disabled={isSaving}
                      >
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calendar className="mr-2 h-4 w-4" />}
                        Agendar
                      </Button>
                    ) : (
                      <Button
                        onClick={publishDirectly}
                        className="bg-gradient-to-r from-[#25F4EE] to-[#FE2C55] hover:opacity-90"
                        disabled={isSaving || !hasTikTokAccount}
                      >
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Publicar no TikTok
                      </Button>
                    )}
                  </div>
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
                <span>🎬 {currentPreset.segments} cenas com transições</span>
                <span className="text-[#25F4EE] font-medium">~R${(currentPreset.segments * 0.025).toFixed(2)} por vídeo</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Queue Tab */}
        <TabsContent value="queue" className="mt-4">
          <Card className="border-2 border-[#25F4EE]/20">
            <CardHeader className="pb-3 bg-gradient-to-r from-black/5 via-[#25F4EE]/10 to-[#FE2C55]/10">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-5 w-5" />
                Fila de Publicação
              </CardTitle>
              <CardDescription className="text-xs">
                {scheduledPosts.length} vídeo(s) agendado(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {scheduledPosts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum vídeo agendado</p>
                  <p className="text-xs mt-1">Crie um vídeo e agende para publicação</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {scheduledPosts.map((post) => (
                    <div 
                      key={post.id} 
                      className="flex items-center gap-3 p-3 rounded-lg border border-[#25F4EE]/20 bg-gradient-to-r from-black/5 to-[#25F4EE]/5"
                    >
                      {post.video_url && (
                        <div className="w-16 h-28 rounded-lg overflow-hidden bg-black flex-shrink-0">
                          <video src={post.video_url} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-2">{post.caption}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3 text-[#25F4EE]" />
                          <span className="text-xs text-muted-foreground">
                            {post.scheduled_for && format(new Date(post.scheduled_for), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handlePublishNow(post.id)}
                          disabled={isPublishing}
                          className="h-8 w-8 p-0"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => deletePost(post.id)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-4">
          <Card className="border-2 border-[#25F4EE]/20">
            <CardHeader className="pb-3 bg-gradient-to-r from-black/5 via-[#25F4EE]/10 to-[#FE2C55]/10">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5" />
                Analytics TikTok
              </CardTitle>
              <CardDescription className="text-xs">
                {publishedPosts.length} vídeo(s) publicado(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {publishedPosts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum vídeo publicado ainda</p>
                  <p className="text-xs mt-1">Publique seu primeiro vídeo para ver as métricas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-gradient-to-br from-[#25F4EE]/10 to-transparent border border-[#25F4EE]/20 text-center">
                      <p className="text-2xl font-bold text-[#25F4EE]">{totalViews.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Visualizações</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gradient-to-br from-[#FE2C55]/10 to-transparent border border-[#FE2C55]/20 text-center">
                      <p className="text-2xl font-bold text-[#FE2C55]">{totalLikes.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Curtidas</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gradient-to-br from-white/10 to-transparent border border-border text-center">
                      <p className="text-2xl font-bold">{totalComments.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Comentários</p>
                    </div>
                  </div>

                  {/* Recent Posts */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Vídeos Recentes</Label>
                    {publishedPosts.slice(0, 5).map((post) => (
                      <div 
                        key={post.id} 
                        className="flex items-center gap-3 p-2 rounded-lg border border-border/50"
                      >
                        {post.video_url && (
                          <div className="w-10 h-16 rounded overflow-hidden bg-black flex-shrink-0">
                            <video src={post.video_url} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs line-clamp-1">{post.caption}</p>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                            <span>👁 {post.reach || 0}</span>
                            <span>❤️ {post.likes_count || 0}</span>
                            <span>💬 {post.comments_count || 0}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TikTokContentCreation;
