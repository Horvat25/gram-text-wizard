import { useState, useRef } from "react";
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
  Wand2,
  Save,
  Calendar,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Instagram,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CreatePostData } from "@/hooks/usePosts";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import InstagramPreview from "@/components/InstagramPreview";
import PostScore from "@/components/PostScore";
import DownloadActions from "@/components/DownloadActions";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

const ContentCreationTab = ({ onPostCreated }: ContentCreationTabProps) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [topic, setTopic] = useState("");
  const [postType, setPostType] = useState("engajamento");
  const [generatedText, setGeneratedText] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  
  const { accounts, loading: loadingAccounts } = useInstagramAccounts();
  const hasConnectedAccount = accounts.length > 0;

  const generateCaption = async () => {
    if (!topic.trim()) {
      toast.error("Por favor, insira um tópico");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: { topic: topic.trim(), postType },
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

  const generateImage = async () => {
    const prompt = imagePrompt.trim() || topic.trim();
    if (!prompt) {
      toast.error("Insira uma descrição para a imagem");
      return;
    }

    setIsGeneratingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: { prompt, format: "square" },
      });

      if (error) throw error;

      setImageUrl(data.imageUrl);
      toast.success("Imagem gerada com sucesso!");
    } catch (error: any) {
      console.error("Error generating image:", error);
      toast.error(error.message || "Erro ao gerar imagem");
    } finally {
      setIsGeneratingImage(false);
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
      await onPostCreated({
        caption: generatedText,
        hashtags,
        status,
        scheduled_for: status === "scheduled" ? scheduledFor : null,
        post_type: postType,
        image_url: imageUrl || null,
      });

      // Reset form
      setTopic("");
      setGeneratedText("");
      setHashtags([]);
      setScheduledFor("");
      setImageUrl("");
      setImagePrompt("");
    } finally {
      setIsSaving(false);
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
            Crie legendas otimizadas e imagens com inteligência artificial
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
                <AlertDescription className="text-amber-700 dark:text-amber-400">
                  Nenhuma conta conectada. Conecte uma conta na aba "Conectar" para publicar automaticamente.
                </AlertDescription>
              </Alert>
            )
          )}
          
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

              {/* Image Generation */}
              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="imagePrompt">Gerar Imagem (Obrigatório para publicar)</Label>
                <Input
                  id="imagePrompt"
                  placeholder="Descrição da imagem..."
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                />
                <Button
                  onClick={generateImage}
                  disabled={isGeneratingImage}
                  variant="outline"
                  className="w-full"
                >
                  {isGeneratingImage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gerando imagem...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Gerar Imagem com IA
                    </>
                  )}
                </Button>
                {!imageUrl && (
                  <p className="text-xs text-amber-600">
                    ⚠️ Uma imagem é necessária para publicar no Instagram
                  </p>
                )}
              </div>

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
          />
        </div>
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