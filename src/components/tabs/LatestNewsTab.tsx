import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { 
  Newspaper, 
  TrendingUp, 
  Sparkles, 
  ExternalLink,
  Copy,
  Zap,
  RefreshCw,
  Loader2,
  Globe,
  Cpu,
  Atom,
  Rocket,
  Brain,
  Image as ImageIcon,
  Calendar,
  Send,
  Save,
  Check,
  X,
  ChevronLeft,
  Wand2,
  Hash
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreatePostData } from '@/hooks/usePosts';
import { useInstagramAccounts } from '@/hooks/useInstagramAccounts';
import { addMinutes, format } from 'date-fns';

interface NewsResult {
  url: string;
  title: string;
  description?: string;
  markdown?: string;
  images?: string[];
}

// Predefined topics for tech/future content
const PREDEFINED_TOPICS = [
  { label: 'Inteligência Artificial', query: 'inteligência artificial últimas notícias', icon: Brain },
  { label: 'Física Quântica', query: 'física quântica descobertas recentes', icon: Atom },
  { label: 'Tecnologia', query: 'tecnologia inovação notícias', icon: Cpu },
  { label: 'Futurismo', query: 'futuro tecnologia previsões', icon: Rocket },
];

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

interface LatestNewsTabProps {
  onPostCreated?: (post: CreatePostData) => Promise<any>;
}

export function LatestNewsTab({ onPostCreated }: LatestNewsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [newsResults, setNewsResults] = useState<NewsResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  
  // Post creation state
  const [selectedNews, setSelectedNews] = useState<NewsResult | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [scheduledFor, setScheduledFor] = useState('');
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  
  const { accounts } = useInstagramAccounts();
  const hasConnectedAccount = accounts.length > 0;

  // Load cached results on mount
  useEffect(() => {
    const cached = sessionStorage.getItem('latest_news_results');
    const cachedQuery = sessionStorage.getItem('latest_news_query');
    if (cached && cachedQuery) {
      setNewsResults(JSON.parse(cached));
      setSearchQuery(cachedQuery);
    }
  }, []);

  const searchNews = async (query?: string) => {
    const searchTerm = query || searchQuery.trim();
    if (!searchTerm) {
      toast.error('Digite um tema para buscar notícias');
      return;
    }

    setLoading(true);
    setSelectedTopic(query || null);
    
    try {
      const { data, error } = await supabase.functions.invoke('firecrawl-search', {
        body: { 
          query: `${searchTerm} notícias últimas`,
          limit: 10,
          lang: 'pt-BR',
          country: 'BR'
        }
      });

      if (error) throw error;

      if (data?.success && data.data) {
        setNewsResults(data.data);
        sessionStorage.setItem('latest_news_results', JSON.stringify(data.data));
        sessionStorage.setItem('latest_news_query', searchTerm);
        toast.success(`${data.data.length} notícias encontradas!`);
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.info('Nenhuma notícia encontrada para este tema');
        setNewsResults([]);
      }
    } catch (error: any) {
      console.error('Error searching news:', error);
      toast.error('Erro ao buscar notícias. Verifique sua API key do Firecrawl.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  // Select news and go to creation mode
  const selectNewsForPost = (news: NewsResult) => {
    setSelectedNews(news);
    setSelectedImage(news.images?.[0] || null);
    setCaption('');
    setHashtags([]);
  };

  // Go back to news list
  const backToNewsList = () => {
    setSelectedNews(null);
    setSelectedImage(null);
    setCaption('');
    setHashtags([]);
    setScheduledFor('');
  };

  // Generate caption for selected news
  const generateCaption = async () => {
    if (!selectedNews) return;

    setIsGeneratingCaption(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: { 
          topic: `${selectedNews.title}. ${selectedNews.description || ''}`, 
          postType: 'noticia',
          customInstructions: 'Esta é uma notícia baseada em fonte real. Escreva em tom jornalístico e informativo. Inclua emojis relevantes e mantenha credibilidade.'
        },
      });

      if (error) throw error;

      setCaption(data.caption);
      setHashtags(data.hashtags);
      toast.success('Legenda gerada!');
    } catch (error: any) {
      console.error("Error generating caption:", error);
      toast.error(error.message || "Erro ao gerar legenda");
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  // Save as draft
  const saveAsDraft = async () => {
    if (!selectedNews || !selectedImage) {
      toast.error('Selecione uma imagem da notícia');
      return;
    }
    if (!caption.trim()) {
      toast.error('Gere ou escreva uma legenda');
      return;
    }

    setIsSaving(true);
    try {
      const postData: CreatePostData = {
        caption: caption.trim(),
        hashtags,
        image_url: selectedImage,
        status: 'draft',
        post_type: 'noticia',
        media_type: 'image',
      };

      if (onPostCreated) {
        await onPostCreated(postData);
        toast.success('Rascunho salvo!');
        backToNewsList();
      } else {
        // Fallback: save directly to Supabase
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Faça login para salvar');
          return;
        }
        
        const { error } = await supabase.from('posts').insert({
          ...postData,
          user_id: user.id,
        });
        
        if (error) throw error;
        toast.success('Rascunho salvo!');
        backToNewsList();
      }
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast.error(error.message || 'Erro ao salvar rascunho');
    } finally {
      setIsSaving(false);
    }
  };

  // Schedule post
  const schedulePost = async () => {
    if (!selectedNews || !selectedImage) {
      toast.error('Selecione uma imagem da notícia');
      return;
    }
    if (!caption.trim()) {
      toast.error('Gere ou escreva uma legenda');
      return;
    }
    if (!scheduledFor) {
      toast.error('Selecione data e hora para agendar');
      return;
    }
    if (!hasConnectedAccount) {
      toast.error('Conecte uma conta Instagram para agendar');
      return;
    }

    setIsSaving(true);
    try {
      const postData: CreatePostData = {
        caption: caption.trim(),
        hashtags,
        image_url: selectedImage,
        status: 'scheduled',
        scheduled_for: localToUTC(scheduledFor),
        post_type: 'noticia',
        media_type: 'image',
      };

      if (onPostCreated) {
        await onPostCreated(postData);
        toast.success('Post agendado!');
        backToNewsList();
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Faça login para agendar');
          return;
        }
        
        const { error } = await supabase.from('posts').insert({
          ...postData,
          user_id: user.id,
        });
        
        if (error) throw error;
        toast.success('Post agendado!');
        backToNewsList();
      }
    } catch (error: any) {
      console.error('Error scheduling post:', error);
      toast.error(error.message || 'Erro ao agendar post');
    } finally {
      setIsSaving(false);
    }
  };

  // Upload external image to Supabase Storage for Instagram compatibility
  const uploadExternalImage = async (imageUrl: string): Promise<string> => {
    toast.info('Preparando imagem para Instagram...');
    
    const { data, error } = await supabase.functions.invoke('upload-external-image', {
      body: { imageUrl }
    });

    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || 'Falha ao processar imagem');
    }

    return data.publicUrl;
  };

  // Publish now
  const publishNow = async () => {
    if (!selectedNews || !selectedImage) {
      toast.error('Selecione uma imagem da notícia');
      return;
    }
    if (!caption.trim()) {
      toast.error('Gere ou escreva uma legenda');
      return;
    }
    if (!hasConnectedAccount) {
      toast.error('Conecte uma conta Instagram para publicar');
      return;
    }

    setIsPublishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Faça login para publicar');
        return;
      }

      // Upload external image to Supabase Storage for Instagram compatibility
      let finalImageUrl = selectedImage;
      
      // Check if it's an external URL (not already on Supabase)
      const isExternalImage = !selectedImage.includes('supabase') && 
                              !selectedImage.includes(import.meta.env.VITE_SUPABASE_URL || '');
      
      if (isExternalImage) {
        try {
          finalImageUrl = await uploadExternalImage(selectedImage);
          toast.success('Imagem processada!');
        } catch (uploadError: any) {
          console.error('Image upload error:', uploadError);
          // Try to proceed with original URL as fallback
          toast.warning('Usando imagem original (pode falhar no Instagram)');
        }
      }

      // Create post
      const { data: post, error: insertError } = await supabase.from('posts').insert({
        caption: caption.trim(),
        hashtags,
        image_url: finalImageUrl,
        status: 'publishing',
        post_type: 'noticia',
        media_type: 'image',
        user_id: user.id,
      }).select().single();

      if (insertError) throw insertError;

      // Publish
      const { data: publishData, error: publishError } = await supabase.functions.invoke('publish-post', {
        body: { postId: post.id }
      });

      if (publishError) throw publishError;
      
      if (publishData?.error) {
        throw new Error(publishData.error);
      }
      
      toast.success('Publicado no Instagram!');
      backToNewsList();
    } catch (error: any) {
      console.error('Error publishing:', error);
      toast.error(error.message || 'Erro ao publicar');
    } finally {
      setIsPublishing(false);
    }
  };

  // If a news is selected, show post creation UI
  if (selectedNews) {
    return (
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={backToNewsList}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">Criar Post de Notícia</h2>
            <p className="text-sm text-muted-foreground">
              Fonte: {getDomainFromUrl(selectedNews.url)}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left: Image selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Imagem da Notícia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Selected image preview */}
              {selectedImage && (
                <div className="relative aspect-square rounded-xl overflow-hidden border-2 border-primary">
                  <img 
                    src={selectedImage} 
                    alt="Imagem selecionada" 
                    className="w-full h-full object-cover"
                    onError={() => {
                      toast.error('Erro ao carregar imagem');
                      setSelectedImage(null);
                    }}
                  />
                  <Badge className="absolute top-2 right-2 bg-primary">
                    <Check className="w-3 h-3 mr-1" />
                    Selecionada
                  </Badge>
                </div>
              )}

              {/* Available images */}
              {selectedNews.images && selectedNews.images.length > 0 ? (
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">
                    Imagens disponíveis ({selectedNews.images.length})
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedNews.images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedImage(img)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          selectedImage === img 
                            ? 'border-primary ring-2 ring-primary/50' 
                            : 'border-transparent hover:border-primary/50'
                        }`}
                      >
                        <img 
                          src={img} 
                          alt={`Opção ${idx + 1}`} 
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma imagem encontrada nesta notícia</p>
                  <p className="text-sm">Insira uma URL de imagem manualmente:</p>
                  <Input 
                    className="mt-2"
                    placeholder="https://exemplo.com/imagem.jpg"
                    onChange={(e) => setSelectedImage(e.target.value)}
                  />
                </div>
              )}

              {/* News info */}
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <h3 className="font-semibold line-clamp-2">{selectedNews.title}</h3>
                {selectedNews.description && (
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {selectedNews.description}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(selectedNews.url, '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Ver notícia original
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Right: Caption and actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Legenda e Publicação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Generate caption button */}
              <Button 
                onClick={generateCaption} 
                disabled={isGeneratingCaption}
                className="w-full"
                variant="outline"
              >
                {isGeneratingCaption ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Gerar Legenda com IA
                  </>
                )}
              </Button>

              {/* Caption */}
              <div className="space-y-2">
                <Label>Legenda</Label>
                <Textarea
                  placeholder="Digite ou gere uma legenda..."
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="min-h-[150px]"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {caption.length}/2200 caracteres
                </p>
              </div>

              {/* Hashtags */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Hashtags
                </Label>
                <div className="flex flex-wrap gap-1">
                  {hashtags.map((tag, idx) => (
                    <Badge 
                      key={idx} 
                      variant="secondary"
                      className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => setHashtags(h => h.filter((_, i) => i !== idx))}
                    >
                      #{tag}
                      <X className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
                  {hashtags.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      Gere a legenda para adicionar hashtags
                    </span>
                  )}
                </div>
              </div>

              {/* Schedule */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Agendar para (opcional)
                </Label>
                <Input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  min={getMinScheduleDatetime()}
                />
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={saveAsDraft}
                  disabled={isSaving || !selectedImage || !caption.trim()}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar Rascunho
                </Button>

                {scheduledFor ? (
                  <Button
                    onClick={schedulePost}
                    disabled={isSaving || !selectedImage || !caption.trim() || !hasConnectedAccount}
                    className="glow-sm"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Calendar className="w-4 h-4 mr-2" />
                    )}
                    Agendar
                  </Button>
                ) : (
                  <Button
                    onClick={publishNow}
                    disabled={isPublishing || !selectedImage || !caption.trim() || !hasConnectedAccount}
                    className="glow-sm"
                  >
                    {isPublishing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Publicar Agora
                  </Button>
                )}
              </div>

              {!hasConnectedAccount && (
                <p className="text-xs text-center text-amber-500">
                  ⚠️ Conecte uma conta Instagram nas configurações para publicar
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // News search view (default)
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
          <Zap className="w-5 h-5 text-primary animate-pulse" />
          <span className="text-sm font-medium text-primary">Powered by Firecrawl</span>
        </div>
        <h2 className="text-3xl font-bold neural-gradient-text">
          Últimas Notícias
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Busque notícias reais e crie posts com imagens da própria fonte.
          Sem precisar gerar imagem com IA!
        </p>
      </div>

      {/* Search */}
      <Card className="border-primary/20 bg-gradient-neural-soft overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Newspaper className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Buscar notícias (ex: ChatGPT, computação quântica, SpaceX...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchNews()}
                className="pl-10 h-12 text-lg bg-background/50 border-primary/20 focus:border-primary"
              />
            </div>
            <Button 
              onClick={() => searchNews()} 
              disabled={loading}
              size="lg"
              className="h-12 px-8 glow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <Globe className="w-5 h-5 mr-2" />
                  Buscar Notícias
                </>
              )}
            </Button>
          </div>

          {/* Quick topic buttons */}
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="text-sm text-muted-foreground">Temas favoritos:</span>
            {PREDEFINED_TOPICS.map((topic) => {
              const Icon = topic.icon;
              const isSelected = selectedTopic === topic.query;
              return (
                <Badge 
                  key={topic.label}
                  variant={isSelected ? "default" : "outline"}
                  className={`cursor-pointer transition-colors ${
                    isSelected 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-primary/10'
                  }`}
                  onClick={() => {
                    setSearchQuery(topic.query);
                    searchNews(topic.query);
                  }}
                >
                  <Icon className="w-3 h-3 mr-1" />
                  {topic.label}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-primary/10 animate-pulse">
              <CardContent className="p-6 space-y-4">
                <div className="h-6 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-32 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* News Results */}
      {!loading && newsResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              {newsResults.length} Notícias Encontradas
            </h3>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => searchNews()}
              className="border-primary/30"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {newsResults.map((news, index) => (
              <Card 
                key={index} 
                className="group border-primary/10 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 overflow-hidden"
              >
                {/* Image preview if available */}
                {news.images && news.images.length > 0 && (
                  <div className="aspect-video w-full overflow-hidden bg-muted">
                    <img 
                      src={news.images[0]} 
                      alt={news.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="text-xs">
                      <Globe className="w-3 h-3 mr-1" />
                      {getDomainFromUrl(news.url)}
                    </Badge>
                    {news.images && news.images.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        <ImageIcon className="w-3 h-3 mr-1" />
                        {news.images.length} imagens
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg mt-2 line-clamp-2">
                    {news.title}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Description */}
                  {news.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {news.description}
                    </p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button 
                      className="flex-1 glow-sm group-hover:glow"
                      onClick={() => selectNewsForPost(news)}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Criar Post
                    </Button>
                    <Button 
                      variant="outline"
                      size="icon"
                      onClick={() => window.open(news.url, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(news.title, 'Título')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && newsResults.length === 0 && (
        <Card className="border-dashed border-primary/20">
          <CardContent className="py-12 text-center">
            <Newspaper className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Busque notícias reais</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Clique em um dos temas favoritos ou digite sua busca para encontrar 
              as últimas notícias com imagens prontas para publicar.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
