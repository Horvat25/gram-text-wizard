import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Wand2,
  Save,
  Calendar,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Instagram,
  AlertCircle,
  ChevronDown,
  Video,
  Type,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CreatePostData } from "@/hooks/usePosts";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import InstagramPreview from "@/components/InstagramPreview";
import PostScore from "@/components/PostScore";
import DownloadActions from "@/components/DownloadActions";
import ModelSelector, { MediaType, AIModel } from "@/components/ModelSelector";
import TextOverlayEditor, { OverlayMetadata } from "@/components/TextOverlayEditor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const POST_TYPES = [
  { value: "engajamento", label: "Engajamento", description: "Máxima interação" },
  { value: "educacional", label: "Educacional", description: "Valor e conhecimento" },
  { value: "storytelling", label: "Storytelling", description: "Conexão emocional" },
  { value: "viral", label: "Viral", description: "Máximo alcance" },
  { value: "vendas", label: "Vendas", description: "Conversão e ação" },
];

interface ContentCreationTabProps {
  onPostCreated: (post: CreatePostData) => Promise<any>;
}

const AI_SETTINGS_KEY = 'ai_generation_settings';

const getAISettings = () => {
  try {
    const saved = localStorage.getItem(AI_SETTINGS_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

const DEFAULT_OVERLAY: OverlayMetadata = {
  text: "",
  x: 50,
  y: 50,
  font: "Inter",
  size: 32,
  color: "#ffffff",
  opacity: 100,
};

const ContentCreationTab = ({ onPostCreated }: ContentCreationTabProps) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [topic, setTopic] = useState("");
  const [postType, setPostType] = useState("engajamento");
  const [generatedText, setGeneratedText] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [advancedPromptOpen, setAdvancedPromptOpen] = useState(false);
  const [advancedPrompt, setAdvancedPrompt] = useState("");
  
  // New state for model selection
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [selectedModel, setSelectedModel] = useState<AIModel>("dalle3");
  
  // Video generation state
  const [videoPredictionId, setVideoPredictionId] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [isCheckingVideo, setIsCheckingVideo] = useState(false);
  
  // Overlay state
  const [showOverlayEditor, setShowOverlayEditor] = useState(false);
  const [overlay, setOverlay] = useState<OverlayMetadata>(DEFAULT_OVERLAY);
  
  const { accounts, loading: loadingAccounts } = useInstagramAccounts();
  const hasConnectedAccount = accounts.length > 0;

  // Load suggestion data from sessionStorage on mount
  useEffect(() => {
    const suggestionData = sessionStorage.getItem('suggestionData');
    if (suggestionData) {
      try {
        const data = JSON.parse(suggestionData);
        if (data.topic) setTopic(data.topic);
        if (data.postType) setPostType(data.postType);
        if (data.captionIdea) setGeneratedText(data.captionIdea);
        if (data.imagePrompt) setImagePrompt(data.imagePrompt);
        if (data.hashtags) setHashtags(data.hashtags);
        
        sessionStorage.removeItem('suggestionData');
        toast.success('Sugestão carregada! Personalize e gere seu post.');
      } catch (e) {
        console.error('Error loading suggestion data:', e);
      }
    }
  }, []);

  // Poll for video status
  useEffect(() => {
    if (!videoPredictionId || isCheckingVideo) return;

    const checkVideoStatus = async () => {
      setIsCheckingVideo(true);
      try {
        const { data, error } = await supabase.functions.invoke("generate-video", {
          body: { predictionId: videoPredictionId },
        });

        if (error) throw error;

        if (data.status === "succeeded") {
          setVideoUrl(data.storedVideoUrl || data.output);
          setVideoPredictionId(null);
          setVideoProgress(100);
          setIsGeneratingMedia(false);
          toast.success("Vídeo gerado com sucesso!");
        } else if (data.status === "failed") {
          setVideoPredictionId(null);
          setIsGeneratingMedia(false);
          toast.error("Falha na geração do vídeo");
        } else {
          // Still processing
          setVideoProgress((prev) => Math.min(prev + 10, 90));
        }
      } catch (error) {
        console.error("Error checking video status:", error);
      } finally {
        setIsCheckingVideo(false);
      }
    };

    const interval = setInterval(checkVideoStatus, 5000);
    return () => clearInterval(interval);
  }, [videoPredictionId, isCheckingVideo]);

  const buildCustomInstructions = () => {
    const settings = getAISettings();
    if (!settings) return '';

    const parts: string[] = [];
    
    if (settings.brandName) {
      parts.push(`Nome da marca: ${settings.brandName}`);
    }
    if (settings.targetAudience) {
      parts.push(`Público-alvo: ${settings.targetAudience}`);
    }
    if (settings.brandVoice) {
      parts.push(`Tom de voz: ${settings.brandVoice}`);
    }
    if (!settings.useEmojis) {
      parts.push('NÃO use emojis na legenda');
    } else if (settings.emojiAmount) {
      const amounts: Record<string, string> = {
        poucos: 'Use poucos emojis (1-2 no máximo)',
        moderado: 'Use emojis com moderação (3-5)',
        muitos: 'Use bastante emojis (6+)',
      };
      parts.push(amounts[settings.emojiAmount] || '');
    }
    if (settings.preferredHashtagCount) {
      parts.push(`Use aproximadamente ${settings.preferredHashtagCount} hashtags`);
    }
    if (settings.captionInstructions) {
      parts.push(`Instruções adicionais: ${settings.captionInstructions}`);
    }

    return parts.filter(Boolean).join('\n');
  };

  const generateCaption = async () => {
    if (!topic.trim()) {
      toast.error("Por favor, insira um tópico");
      return;
    }

    setIsGenerating(true);
    try {
      const customInstructions = buildCustomInstructions();
      
      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: { topic: topic.trim(), postType, customInstructions },
      });

      if (error) throw error;

      setGeneratedText(data.caption);
      setHashtags(data.hashtags);
      toast.success(`Legenda gerada! (${data.characterCount} caracteres)`);
    } catch (error: any) {
      console.error("Error generating caption:", error);
      toast.error(error.message || "Erro ao gerar legenda");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateMedia = async () => {
    const basePrompt = imagePrompt.trim() || topic.trim();
    if (!basePrompt) {
      toast.error("Insira uma descrição para a mídia");
      return;
    }

    const fullPrompt = advancedPrompt ? `${basePrompt}. ${advancedPrompt}` : basePrompt;
    
    setIsGeneratingMedia(true);
    setVideoProgress(0);

    try {
      if (mediaType === "image") {
        // Image generation
        const settings = getAISettings();
        const customStyle = settings?.imageStyles?.length > 0 
          ? settings.imageStyles.join('. ') 
          : null;

        const { data, error } = await supabase.functions.invoke("generate-image", {
          body: { 
            prompt: fullPrompt, 
            format: "square", 
            customStyle,
            model: selectedModel,
          },
        });

        if (error) throw error;

        setImageUrl(data.imageUrl);
        
        // Show overlay editor if model doesn't support text
        if (!data.supportsText && overlay.text) {
          setShowOverlayEditor(true);
          toast.info("Este modelo não suporta texto. Use o editor de overlay.");
        } else {
          toast.success(`Imagem gerada com ${data.modelUsed}!`);
        }
        
        setIsGeneratingMedia(false);
      } else {
        // Video generation
        const duration = mediaType === "reels" ? 5 : 10;
        const aspectRatio = mediaType === "reels" ? "9:16" : "16:9";

        const { data, error } = await supabase.functions.invoke("generate-video", {
          body: { 
            prompt: fullPrompt,
            duration,
            aspectRatio,
          },
        });

        if (error) throw error;

        setVideoPredictionId(data.predictionId);
        toast.info("Vídeo em geração. Você será notificado quando pronto.");
      }
    } catch (error: any) {
      console.error("Error generating media:", error);
      toast.error(error.message || "Erro ao gerar mídia");
      setIsGeneratingMedia(false);
    }
  };

  const savePost = async (status: "draft" | "scheduled") => {
    if (!generatedText.trim()) {
      toast.error("Nenhum texto para salvar");
      return;
    }

    if (status === "scheduled" && !scheduledFor) {
      toast.error("Selecione uma data para agendamento");
      return;
    }

    setIsSaving(true);
    try {
      const postData: any = {
        caption: generatedText,
        hashtags,
        status,
        scheduled_for: status === "scheduled" ? scheduledFor : null,
        post_type: postType,
        image_url: imageUrl || null,
        media_type: mediaType,
        ai_model_used: selectedModel,
        video_url: videoUrl || null,
        overlay_metadata: showOverlayEditor && overlay.text ? overlay : null,
      };

      await onPostCreated(postData);

      // Reset form
      setTopic("");
      setGeneratedText("");
      setHashtags([]);
      setScheduledFor("");
      setImageUrl("");
      setVideoUrl("");
      setImagePrompt("");
      setAdvancedPrompt("");
      setOverlay(DEFAULT_OVERLAY);
      setShowOverlayEditor(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMediaTypeChange = (type: MediaType) => {
    setMediaType(type);
    // Reset media URLs when changing type
    if (type !== "image") {
      setImageUrl("");
    } else {
      setVideoUrl("");
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Generator */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerador de Posts IA
          </CardTitle>
          <CardDescription>
            Crie legendas otimizadas e mídia com inteligência artificial
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connected Account Info */}
          {!loadingAccounts && (
            hasConnectedAccount ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <Instagram className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-400">
                  Publicando em: <strong>@{accounts[0].username || 'Conta conectada'}</strong>
                </span>
              </div>
            ) : (
              <Alert className="border-amber-500/30 bg-amber-500/5">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-400 text-sm">
                  <strong>Conta não conectada.</strong> Conecte na aba Instagram em Configurações.
                </AlertDescription>
              </Alert>
            )
          )}

          {/* Model Selector */}
          <ModelSelector
            mediaType={mediaType}
            selectedModel={selectedModel}
            onMediaTypeChange={handleMediaTypeChange}
            onModelChange={setSelectedModel}
          />
          
          <div className="space-y-2">
            <Label htmlFor="postType">Tipo de Post</Label>
            <Select value={postType} onValueChange={setPostType}>
              <SelectTrigger id="postType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POST_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span className="font-semibold">{type.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {type.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="topic">Tópico ou Tema</Label>
            <Input
              id="topic"
              placeholder="Ex: Dicas de produtividade, receita saudável, motivação..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <Button
            onClick={generateCaption}
            disabled={isGenerating || !topic.trim()}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Gerar Legenda com IA
              </>
            )}
          </Button>

          {generatedText && (
            <>
              <div className="space-y-2">
                <Label htmlFor="caption">Legenda Gerada</Label>
                <Textarea
                  id="caption"
                  value={generatedText}
                  onChange={(e) => setGeneratedText(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  {generatedText.length} caracteres
                </p>
              </div>

              {hashtags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {hashtags.map((tag, index) => (
                    <span
                      key={index}
                      className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Media Generation */}
              <div className="space-y-3 pt-2 border-t">
                <Label htmlFor="imagePrompt">
                  {mediaType === "image" ? "Prompt da Imagem" : "Prompt do Vídeo"}
                </Label>
                <Input
                  id="imagePrompt"
                  placeholder={`Descrição para ${mediaType === "image" ? "a imagem" : "o vídeo"}...`}
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                />

                {/* Advanced Prompt */}
                <Collapsible open={advancedPromptOpen} onOpenChange={setAdvancedPromptOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between">
                      <span className="text-xs">Prompt Avançado</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${advancedPromptOpen ? "rotate-180" : ""}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <Textarea
                      placeholder="Instruções adicionais (estilo, cores, composição...)"
                      value={advancedPrompt}
                      onChange={(e) => setAdvancedPrompt(e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                    />
                  </CollapsibleContent>
                </Collapsible>

                {/* Generate Button */}
                <Button
                  onClick={generateMedia}
                  disabled={isGeneratingMedia}
                  variant="outline"
                  className="w-full"
                >
                  {isGeneratingMedia ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {mediaType === "image" ? "Gerando imagem..." : "Gerando vídeo..."}
                    </>
                  ) : (
                    <>
                      {mediaType === "image" ? (
                        <ImageIcon className="mr-2 h-4 w-4" />
                      ) : (
                        <Video className="mr-2 h-4 w-4" />
                      )}
                      Gerar {mediaType === "image" ? "Imagem" : "Vídeo"} com IA
                    </>
                  )}
                </Button>

                {/* Video Progress */}
                {videoPredictionId && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Gerando vídeo...</span>
                      <span className="text-primary">{videoProgress}%</span>
                    </div>
                    <Progress value={videoProgress} />
                    <p className="text-xs text-muted-foreground">
                      A geração pode levar 1-5 minutos
                    </p>
                  </div>
                )}

                {/* Model Badge */}
                {selectedModel === "dalle3" && (
                  <Badge variant="secondary" className="text-xs">
                    Usando OpenAI DALL-E 3 (pode consumir créditos)
                  </Badge>
                )}
                {selectedModel === "runway" && (
                  <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600">
                    Usando Runway via Replicate (geração em background)
                  </Badge>
                )}

                {!imageUrl && !videoUrl && mediaType === "image" && (
                  <p className="text-xs text-amber-600">
                    ⚠️ Uma imagem é necessária para publicar no Instagram
                  </p>
                )}
              </div>

              {/* Text Overlay Editor */}
              {imageUrl && !showOverlayEditor && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOverlayEditor(true)}
                  className="w-full"
                >
                  <Type className="mr-2 h-4 w-4" />
                  Adicionar Texto na Imagem
                </Button>
              )}

              {showOverlayEditor && (
                <TextOverlayEditor
                  overlay={overlay}
                  onChange={setOverlay}
                  onRemove={() => {
                    setShowOverlayEditor(false);
                    setOverlay(DEFAULT_OVERLAY);
                  }}
                  imageUrl={imageUrl}
                />
              )}

              {/* Schedule */}
              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="schedule">Agendar para (opcional)</Label>
                <Input
                  id="schedule"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => savePost("draft")}
                  disabled={isSaving}
                  variant="outline"
                  className="flex-1"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Rascunho
                </Button>
                <Button
                  onClick={() => savePost("scheduled")}
                  disabled={isSaving || !scheduledFor}
                  className="flex-1"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Agendar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Preview & Score */}
      <div className="space-y-6">
        <div ref={previewRef}>
          <InstagramPreview
            caption={generatedText}
            hashtags={hashtags}
            imageUrl={imageUrl}
            username={accounts[0]?.username}
            avatarUrl={accounts[0]?.profile_picture_url || undefined}
          />
        </div>

        {/* Video Preview */}
        {videoUrl && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Video className="h-4 w-4" />
                Vídeo Gerado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <video
                src={videoUrl}
                controls
                className="w-full rounded-lg"
                style={{ maxHeight: "400px" }}
              />
            </CardContent>
          </Card>
        )}

        {generatedText && (
          <>
            <DownloadActions
              caption={generatedText}
              hashtags={hashtags}
              imageUrl={imageUrl}
              previewRef={previewRef}
            />
            <PostScore caption={generatedText} hashtags={hashtags} />
          </>
        )}
      </div>
    </div>
  );
};

export default ContentCreationTab;
