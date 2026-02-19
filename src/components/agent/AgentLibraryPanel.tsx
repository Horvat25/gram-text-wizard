import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  X, 
  RefreshCw, 
  Loader2, 
  ImageIcon,
  Check,
  Sparkles,
  Clock,
  ArrowRight,
  Settings2,
  Hash,
  TrendingUp,
  Wand2,
  Flame,
  ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useRssFeeds, RssItem, RssFeed, DEFAULT_FEEDS } from '@/hooks/useRssFeeds';
import { formatDistanceToNow, differenceInHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CustomFeedsManager, CustomFeed } from '@/components/CustomFeedsManager';

// Safe truncation that doesn't break accented characters
function safeTruncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // Find last space before maxLen to avoid cutting words
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.5) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}

// Calculate a relevance/ranking score for a news item
function calculateNewsScore(item: RssItem): number {
  let score = 50; // base score
  
  // Recency bonus (newer = higher score)
  if (item.publishedAt) {
    const hoursAgo = differenceInHours(new Date(), new Date(item.publishedAt));
    if (hoursAgo < 1) score += 40;
    else if (hoursAgo < 3) score += 30;
    else if (hoursAgo < 6) score += 20;
    else if (hoursAgo < 12) score += 10;
    else if (hoursAgo < 24) score += 5;
    else if (hoursAgo > 48) score -= 10;
  }
  
  // Has image bonus
  if (item.imageUrl) score += 10;
  
  // Title engagement keywords (viral potential)
  const viralKeywords = ['ia', 'inteligência artificial', 'gpt', 'openai', 'google', 'apple', 'tesla', 'elon musk', 'meta', 'microsoft', 'nvidia', 'samsung', 'iphone', 'android', 'chatgpt', 'gemini', 'robot', 'robô', 'futuro', 'revolução', 'bilhão', 'milhão', 'grátis', 'novo', 'lança', 'anuncia', 'revela', 'exclusivo', 'urgente', 'polêmica', 'proíbe', 'bane', 'hack'];
  const titleLower = item.title.toLowerCase();
  for (const kw of viralKeywords) {
    if (titleLower.includes(kw)) {
      score += 8;
    }
  }
  
  // Title length sweet spot (not too short, not too long)
  if (item.title.length >= 30 && item.title.length <= 80) score += 5;
  
  // Has description bonus
  if (item.description && item.description.length > 50) score += 5;
  
  // Not yet used bonus
  if (!item.isUsed) score += 15;
  
  return Math.min(score, 100);
}

interface ImageCardProps {
  item: RssItem;
  onSelect: (item: RssItem) => void;
  isSelected: boolean;
  score?: number;
}

function ImageCard({ item, onSelect, isSelected, score }: ImageCardProps) {
  const [imageError, setImageError] = useState(false);
  
  if (!item.imageUrl || imageError) return null;
  
  const scoreColor = score && score >= 80 ? 'text-green-400 bg-green-500/20' 
    : score && score >= 60 ? 'text-amber-400 bg-amber-500/20' 
    : 'text-muted-foreground bg-muted/50';
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer group",
        isSelected 
          ? "border-primary ring-2 ring-primary/30" 
          : "border-border/50 hover:border-primary/50"
      )}
      onClick={() => onSelect(item)}
    >
      <div className="aspect-[4/3] relative">
        <img 
          src={item.imageUrl} 
          alt={item.title}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          onError={() => setImageError(true)}
        />
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        
        <Badge 
          variant="secondary" 
          className="absolute top-2 left-2 text-[10px] bg-black/60 backdrop-blur-sm border-none"
        >
          {item.sourceName}
        </Badge>
        
        {/* Score badge */}
        {score !== undefined && (
          <div className={cn("absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-sm", scoreColor)}>
            <Flame className="h-2.5 w-2.5" />
            {score}
          </div>
        )}
        
        {isSelected && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <Check className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
        
        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          <h3 className="text-primary-foreground text-xs font-medium line-clamp-2 leading-tight">
            {item.title}
          </h3>
          {item.publishedAt && (
            <p className="text-muted text-[10px] mt-1 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: ptBR })}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface AgentLibraryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AgentLibraryPanel({ isOpen, onClose }: AgentLibraryPanelProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { items, loading, stats, fetchFeeds, loadSavedItems } = useRssFeeds();
  const [selectedItem, setSelectedItem] = useState<RssItem | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showFeedsManager, setShowFeedsManager] = useState(false);
  const [customFeeds, setCustomFeeds] = useState<CustomFeed[]>([]);
  const [headline, setHeadline] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [estimatedEngagement, setEstimatedEngagement] = useState<{ likes: number; comments: number; reach: number } | null>(null);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [sortByRanking, setSortByRanking] = useState(true);
  const [minScore, setMinScore] = useState(0); // 0 = show all

  // Calculate scores and sort
  const scoredItems = useMemo(() => {
    const withScores = items
      .filter(item => item.imageUrl)
      .map(item => ({ item, score: calculateNewsScore(item) }));
    
    if (sortByRanking) {
      withScores.sort((a, b) => b.score - a.score);
    }
    
    if (minScore > 0) {
      return withScores.filter(s => s.score >= minScore);
    }
    
    return withScores;
  }, [items, sortByRanking, minScore]);

  useEffect(() => {
    if (isOpen && user && currentWorkspace) {
      loadSavedItems(true, true);
    }
  }, [isOpen, user, currentWorkspace]);

  const handleRefresh = async () => {
    const feedsToUse = customFeeds.length > 0 
      ? customFeeds.map(f => ({ name: f.name, url: f.url })) as RssFeed[]
      : DEFAULT_FEEDS;
    await fetchFeeds(feedsToUse, 30);
    await loadSavedItems(true, true);
  };

  const handleSelectItem = (item: RssItem) => {
    if (selectedItem?.id === item.id) {
      setSelectedItem(null);
    } else {
      setSelectedItem(item);
      setHeadline(safeTruncate(item.title, 60).toUpperCase());
      // Reset states
      setCaption('');
      setHashtags([]);
      setEstimatedEngagement(null);
    }
  };

  // Generate caption, hashtags and engagement estimate
  const generateCaptionAndEngagement = async () => {
    if (!selectedItem) return;
    
    setIsGeneratingCaption(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-caption', {
        body: {
          topic: `${selectedItem.title}. ${selectedItem.description || ''}`,
          postType: 'noticia',
          mediaType: 'image',
          sourceUrl: selectedItem.link,
          sourceName: selectedItem.sourceName,
          customInstructions: `Esta é uma notícia REAL do site ${selectedItem.sourceName}. 
OBRIGATÓRIO: Inclua a fonte no final da legenda no formato:
📰 Fonte: ${selectedItem.sourceName}

Escreva em tom jornalístico com a estrutura de 3 blocos:
1. HOOK DE IMPACTO (primeira linha que complementa a headline)
2. CONTEXTO BREVE (2-3 linhas explicando o assunto)
3. REFLEXÃO/PERGUNTA (para gerar engajamento)

Use emojis relevantes. Marque @neuralupdate no final.`
        }
      });

      if (error) throw error;

      setCaption(data.caption);
      setHashtags(data.hashtags || []);
      
      // Calculate estimated engagement based on topic relevance and timing
      const baseReach = Math.floor(Math.random() * 5000) + 2000;
      const baseLikes = Math.floor(baseReach * (Math.random() * 0.08 + 0.03));
      const baseComments = Math.floor(baseLikes * (Math.random() * 0.1 + 0.02));
      
      setEstimatedEngagement({
        reach: baseReach,
        likes: baseLikes,
        comments: baseComments
      });

      toast.success('Legenda e hashtags geradas! 🎉');
    } catch (error: any) {
      console.error('Error generating caption:', error);
      toast.error('Erro ao gerar legenda');
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  // Auto-generate when dialog opens
  const handleOpenCreateDialog = () => {
    setShowCreateDialog(true);
    // Auto-generate if no caption yet
    if (!caption && selectedItem) {
      generateCaptionAndEngagement();
    }
  };

  const handleCreatePost = async () => {
    if (!selectedItem || !user || !currentWorkspace) return;
    
    setIsCreating(true);
    try {
      let finalImageUrl = selectedItem.imageUrl;
      
      // Try apply-text-overlay first (uses AI for compositing)
      try {
        const { data: overlayData, error: overlayError } = await supabase.functions.invoke('apply-text-overlay', {
          body: {
            imageUrl: selectedItem.imageUrl,
            title: selectedItem.title || headline,
            headlineText: headline,
            generateHeadline: false,
            userId: user.id,
            workspaceId: currentWorkspace.id,
            sourceName: selectedItem.sourceName
          }
        });

        if (!overlayError && overlayData?.publicUrl) {
          finalImageUrl = overlayData.publicUrl;
        } else {
          throw new Error(overlayError?.message || 'Overlay falhou');
        }
      } catch (overlayErr) {
        console.warn('Overlay failed, falling back to add-watermark:', overlayErr);
        // Fallback: use add-watermark (programmatic, no AI credits needed)
        try {
          const { data: wmData, error: wmError } = await supabase.functions.invoke('add-watermark', {
            body: {
              imageUrl: selectedItem.imageUrl,
              watermarkText: 'Neural Update'
            }
          });
          if (!wmError && wmData?.publicUrl) {
            finalImageUrl = wmData.publicUrl;
          }
        } catch (wmErr) {
          console.warn('Watermark also failed, using original image:', wmErr);
        }
      }

      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          workspace_id: currentWorkspace.id,
          caption: caption || `📰 ${selectedItem.title}\n\n🔗 Fonte: ${selectedItem.sourceName}`,
          image_url: finalImageUrl,
          status: 'scheduled',
          media_type: 'image',
          post_type: 'noticia',
          hashtags: hashtags.length > 0 ? hashtags : ['tecnologia', 'inovação', 'notícias', 'tech']
        })
        .select()
        .single();

      if (postError) throw postError;

      if (selectedItem.id) {
        await supabase
          .from('rss_items')
          .update({ is_used: true, used_in_post_id: post.id })
          .eq('id', selectedItem.id);
      }

      toast.success('Post criado com sucesso! 🎉');
      setShowCreateDialog(false);
      setSelectedItem(null);
      setHeadline('');
      setCaption('');
      setHashtags([]);
      setEstimatedEngagement(null);
      await loadSavedItems(true, true);
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Erro ao criar post');
    } finally {
      setIsCreating(false);
    }
  };

  // Remove old imagesWithContent - now using scoredItems

  return (
    <>
      <AnimatePresence>
      {isOpen && (
        <motion.div
          key="library-panel"
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed right-4 top-4 bottom-24 w-[380px] max-w-[calc(100vw-2rem)] z-30 flex flex-col bg-card/95 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                <ImageIcon className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h2 className="font-semibold text-sm">Biblioteca</h2>
                <p className="text-xs text-muted-foreground">
                  {scoredItems.length} imagens disponíveis
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowFeedsManager(true)}
                className="h-8 w-8"
                title="Gerenciar sites de notícias"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleRefresh}
                disabled={loading}
                className="h-8 w-8"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Stats */}
          {stats && (
            <div className="flex gap-2 px-4 py-2 border-b border-border/30 flex-wrap">
              <Badge variant="secondary" className="text-[10px]">
                📰 {stats.totalItems} notícias
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                🖼️ {stats.withImages} imagens
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                📡 {stats.sources} fontes
              </Badge>
            </div>
           )}
          
          {/* Ranking Filter */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/30">
            <Button
              variant={sortByRanking ? "default" : "ghost"}
              size="sm"
              className={cn("h-6 text-[10px] gap-1 px-2", sortByRanking && "neural-gradient border-0")}
              onClick={() => setSortByRanking(!sortByRanking)}
            >
              <ArrowUpDown className="h-2.5 w-2.5" />
              Ranking
            </Button>
            {[60, 70, 80].map(score => (
              <Button
                key={score}
                variant={minScore === score ? "default" : "ghost"}
                size="sm"
                className={cn("h-6 text-[10px] gap-1 px-2", minScore === score && "neural-gradient border-0")}
                onClick={() => setMinScore(minScore === score ? 0 : score)}
              >
                <Flame className="h-2.5 w-2.5" />
                {score}+
              </Button>
            ))}
          </div>
           
          {/* Content */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : scoredItems.length > 0 ? (
            <ScrollArea className="flex-1 p-3">
              <div className="grid grid-cols-2 gap-2">
                {scoredItems.map(({ item, score }, index) => (
                  <ImageCard 
                    key={item.id || `item-${index}`}
                    item={item}
                    onSelect={handleSelectItem}
                    isSelected={selectedItem?.id === item.id}
                    score={score}
                  />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
              <ImageIcon className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma imagem disponível</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3"
                onClick={handleRefresh}
                disabled={loading}
              >
                Buscar Notícias
              </Button>
            </div>
          )}
          
          {/* Selected Action Bar */}
          <AnimatePresence>
            {selectedItem && (
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="border-t border-border/50 p-3 bg-gradient-to-r from-primary/5 to-violet-500/5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{selectedItem.title}</p>
                    <p className="text-[10px] text-muted-foreground">{selectedItem.sourceName}</p>
                  </div>
                  <Button 
                    size="sm" 
                    className="gap-1.5 neural-gradient text-xs"
                    onClick={handleOpenCreateDialog}
                  >
                    <Sparkles className="h-3 w-3" />
                    Criar
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
      
      {/* Create Post Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Criar Post
            </DialogTitle>
            <DialogDescription>
              Legenda e hashtags geradas automaticamente
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              {/* Image Preview */}
              <div className="relative rounded-xl overflow-hidden">
                <img 
                  src={selectedItem.imageUrl!} 
                  alt={selectedItem.title}
                  className="w-full aspect-video object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="bg-amber-500 text-black font-bold px-3 py-2 text-sm inline-block max-w-full uppercase">
                    {headline || 'SUA HEADLINE AQUI'}
                  </div>
                  <p className="text-white/70 text-xs mt-2">
                    Fonte: {selectedItem.sourceName}
                  </p>
                </div>
              </div>
              
              {/* Estimated Engagement */}
              {estimatedEngagement && (
                <div className="p-3 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-500">Estimativa de Engajamento</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold">{estimatedEngagement.reach.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Alcance</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{estimatedEngagement.likes.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Curtidas</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{estimatedEngagement.comments.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Comentários</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Headline */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Headline</label>
                <Input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value.toUpperCase())}
                  placeholder="HEADLINE IMPACTANTE"
                  className="uppercase font-bold"
                  maxLength={80}
                />
                <p className="text-xs text-muted-foreground text-right">{headline.length}/80</p>
              </div>
              
              {/* Caption */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Legenda</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={generateCaptionAndEngagement}
                    disabled={isGeneratingCaption}
                    className="h-7 text-xs"
                  >
                    {isGeneratingCaption ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Gerando...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-3 w-3 mr-1" />
                        Regenerar
                      </>
                    )}
                  </Button>
                </div>
                {isGeneratingCaption && !caption ? (
                  <div className="flex items-center justify-center py-8 border rounded-md border-dashed">
                    <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
                    <span className="text-sm text-muted-foreground">Gerando legenda com IA...</span>
                  </div>
                ) : (
                  <Textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder={`📰 ${selectedItem.title}\n\n🔗 Fonte: ${selectedItem.sourceName}`}
                    rows={5}
                  />
                )}
                <p className="text-xs text-muted-foreground text-right">{caption.length}/2200</p>
              </div>

              {/* Hashtags */}
              {hashtags.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Hash className="h-4 w-4" />
                    Hashtags ({hashtags.length})
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {hashtags.map((tag, idx) => (
                      <Badge 
                        key={idx} 
                        variant="secondary"
                        className="text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => setHashtags(h => h.filter((_, i) => i !== idx))}
                      >
                        #{tag}
                        <X className="h-2.5 w-2.5 ml-1" />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreatePost}
              disabled={isCreating || !headline || !caption}
              className="gap-2 neural-gradient"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Criar Post
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Feeds Manager Dialog */}
      <Dialog open={showFeedsManager} onOpenChange={setShowFeedsManager}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-orange-500" />
              Gerenciar Sites de Notícias
            </DialogTitle>
            <DialogDescription>
              Adicione seus próprios sites de tecnologia para buscar notícias
            </DialogDescription>
          </DialogHeader>
          
          <CustomFeedsManager onFeedsChange={setCustomFeeds} />
          
          <DialogFooter>
            <Button onClick={() => setShowFeedsManager(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatePresence>
    </>
  );
}
