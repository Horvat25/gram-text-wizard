import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wand2, Save, Calendar, Image as ImageIcon, Loader2, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addPost } from "@/lib/local-storage";
import { generateContextualPrompt, learnFromMetrics } from "@/lib/agent-context";

interface PostGeneratorProps {
  onPostCreated: () => void;
  onCaptionGenerated?: (caption: string, hashtags: string[], imageUrl?: string) => void;
}

const POST_TYPES = [
  { value: "engajamento", label: "Engajamento", description: "Máxima interação" },
  { value: "educacional", label: "Educacional", description: "Valor e conhecimento" },
  { value: "storytelling", label: "Storytelling", description: "Conexão emocional" },
  { value: "viral", label: "Viral", description: "Máximo alcance" },
  { value: "vendas", label: "Vendas", description: "Conversão e ação" },
];

const PostGenerator = ({ onPostCreated, onCaptionGenerated }: PostGeneratorProps) => {
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
      
      if (onCaptionGenerated) {
        onCaptionGenerated(data.caption, data.hashtags);
      }
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
      
      if (onCaptionGenerated) {
        onCaptionGenerated(generatedText, hashtags, data.imageUrl);
      }
    } catch (error: any) {
      console.error("Error generating image:", error);
      toast.error(error.message || "Erro ao gerar imagem");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const savePost = (status: "draft" | "scheduled") => {
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
      addPost({
        caption: generatedText,
        hashtags,
        status,
        scheduled_for: status === "scheduled" ? scheduledFor : null,
        published_at: null,
        post_type: postType,
        image_url: imageUrl || null,
      });

      toast.success(
        status === "draft" ? "Rascunho salvo!" : "Post agendado com sucesso!"
      );
      
      // Reset form
      setTopic("");
      setGeneratedText("");
      setHashtags([]);
      setScheduledFor("");
      setImageUrl("");
      setImagePrompt("");
      
      onPostCreated();
    } catch (error: any) {
      console.error("Error saving post:", error);
      toast.error("Erro ao salvar post");
    } finally {
      setIsSaving(false);
    }
  };

  const applyAgentContext = () => {
    if (!topic.trim()) {
      toast.error("Insira um tópico primeiro");
      return;
    }
    
    const contextualPrompt = generateContextualPrompt(topic, postType);
    setTopic(contextualPrompt);
    toast.success("Contexto do agente aplicado!");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gerador de Posts IA</CardTitle>
        <CardDescription>
          Crie legendas otimizadas e imagens com inteligência artificial
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
                    <span className="text-xs text-muted-foreground">{type.description}</span>
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

        <div className="flex gap-2">
          <Button
            onClick={applyAgentContext}
            disabled={!topic.trim()}
            variant="outline"
            className="flex-1"
          >
            <Brain className="mr-2 h-4 w-4" />
            Aplicar Contexto
          </Button>
          <Button
            onClick={generateCaption}
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
                Gerar Legenda
              </>
            )}
          </Button>
        </div>

        {generatedText && (
          <>
            <div className="space-y-2">
              <Label htmlFor="caption">Legenda Gerada</Label>
              <Textarea
                id="caption"
                value={generatedText}
                onChange={(e) => setGeneratedText(e.target.value)}
                rows={8}
                className="resize-none font-sm"
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

            {/* Image Generation Section */}
            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="imagePrompt">Gerar Imagem (Opcional)</Label>
              <Input
                id="imagePrompt"
                placeholder="Descrição da imagem... (deixe vazio para usar o tópico)"
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

              {imageUrl && (
                <div className="relative aspect-square w-full max-w-xs mx-auto rounded-lg overflow-hidden border">
                  <img src={imageUrl} alt="Generated" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="schedule">Agendar para (opcional)</Label>
              <Input
                id="schedule"
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => savePost("draft")}
                disabled={isSaving}
                variant="outline"
                className="flex-1"
              >
                <Save className="mr-2 h-4 w-4" />
                Salvar Rascunho
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
  );
};

export default PostGenerator;