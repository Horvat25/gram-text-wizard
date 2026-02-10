import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  ImageIcon, 
  RefreshCw, 
  Loader2, 
  ExternalLink,
  Calendar,
  Sparkles,
  Check,
  X,
  Newspaper,
  Clock,
  ArrowRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useRssFeeds, RssItem, DEFAULT_FEEDS } from '@/hooks/useRssFeeds';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ImageCardProps {
  item: RssItem;
  onSelect: (item: RssItem) => void;
  isSelected: boolean;
}

function ImageCard({ item, onSelect, isSelected }: ImageCardProps) {
  const [imageError, setImageError] = useState(false);
  
  if (!item.imageUrl || imageError) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer",
        isSelected 
          ? "border-primary ring-2 ring-primary/30" 
          : "border-border hover:border-primary/50"
      )}
      onClick={() => onSelect(item)}
    >
      {/* Image */}
      <div className="aspect-[4/3] relative">
        <img 
          src={item.imageUrl} 
          alt={item.title}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          onError={() => setImageError(true)}
        />
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        
        {/* Source Badge */}
        <Badge 
          variant="secondary" 
          className="absolute top-2 left-2 text-[10px] bg-black/60 backdrop-blur-sm border-none text-white"
        >
          {item.sourceName}
        </Badge>
        
        {/* Selection Indicator */}
        {isSelected && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <Check className="h-4 w-4 text-white" />
          </div>
        )}
        
        {/* Title Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h3 className="text-white text-sm font-medium line-clamp-2 leading-tight">
            {item.title}
          </h3>
          {item.publishedAt && (
            <p className="text-white/60 text-[10px] mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: ptBR })}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function AgentImageLibrary() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { items, loading, stats, fetchFeeds, loadSavedItems } = useRssFeeds();
  const [selectedItem, setSelectedItem] = useState<RssItem | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [headline, setHeadline] = useState('');
  const [caption, setCaption] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unused'>('unused');

  // Load saved items on mount
  useEffect(() => {
    if (user && currentWorkspace) {
      loadSavedItems(true, filter === 'unused');
    }
  }, [user, currentWorkspace, filter]);

  const handleRefresh = async () => {
    await fetchFeeds(DEFAULT_FEEDS, 20);
    await loadSavedItems(true, filter === 'unused');
  };

  const handleSelectItem = (item: RssItem) => {
    if (selectedItem?.id === item.id) {
      setSelectedItem(null);
    } else {
      setSelectedItem(item);
      // Pre-fill headline with a shortened version of the title
      const shortTitle = item.title.length > 60 ? item.title.slice(0, 57) + '...' : item.title;
      setHeadline(shortTitle.toUpperCase());
    }
  };

  const handleCreatePost = async () => {
    if (!selectedItem || !user || !currentWorkspace) return;
    
    setIsCreating(true);
    try {
      // Call the apply-text-overlay function to process the image
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

      if (overlayError) throw overlayError;
      
      const finalImageUrl = overlayData?.processedImageUrl || selectedItem.imageUrl;

      // Create the post
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
          hashtags: ['#tecnologia', '#inovação', '#notícias', '#tech']
        })
        .select()
        .single();

      if (postError) throw postError;

      // Mark RSS item as used
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
      
      // Refresh the list
      await loadSavedItems(true, filter === 'unused');
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Erro ao criar post');
    } finally {
      setIsCreating(false);
    }
  };

  const imagesWithContent = items.filter(item => item.imageUrl);

  return (
    <Card className="border border-border bg-card h-full flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20">
              <ImageIcon className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Biblioteca de Imagens</CardTitle>
              <CardDescription>Notícias com imagens prontas para virar posts</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={loading}
              className="gap-1"
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </div>
        
              {/* Filter Tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 mt-3">
          {[
            { id: 'unused', label: 'Disponíveis' },
            { id: 'all', label: 'Todas' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as 'all' | 'unused')}
              className={cn(
                "flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                filter === tab.id 
                  ? "bg-card shadow-sm text-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* Stats */}
        {stats && (
          <div className="flex gap-2 mt-2 flex-wrap">
            <Badge variant="secondary" className="text-xs">
              📰 {stats.totalItems} notícias
            </Badge>
            <Badge variant="secondary" className="text-xs">
              🖼️ {stats.withImages} com imagem
            </Badge>
            <Badge variant="secondary" className="text-xs">
              📡 {stats.sources} fontes
            </Badge>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : imagesWithContent.length > 0 ? (
          <ScrollArea className="h-full px-4">
            <div className="grid grid-cols-2 gap-3 pb-4">
              <AnimatePresence>
                {imagesWithContent.map((item, index) => (
                  <ImageCard 
                    key={item.id || index}
                    item={item}
                    onSelect={handleSelectItem}
                    isSelected={selectedItem?.id === item.id}
                  />
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center px-4">
            <div className="p-4 rounded-full mb-4 bg-muted">
              <Newspaper className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">Nenhuma imagem disponível</p>
            <p className="text-sm text-muted-foreground mt-1">
              Clique em "Atualizar" para buscar notícias novas
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4 gap-2"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Buscar Notícias
            </Button>
          </div>
        )}
      </CardContent>
      
      {/* Selected Item Action Bar */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="shrink-0 border-t border-border p-4 bg-gradient-to-r from-primary/5 to-violet-500/5"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedItem.title}</p>
                <p className="text-xs text-muted-foreground">{selectedItem.sourceName}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedItem(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button 
                  size="sm" 
                  className="gap-2 neural-gradient"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Sparkles className="h-4 w-4" />
                  Criar Post
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Create Post Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Criar Post com Imagem
            </DialogTitle>
            <DialogDescription>
              Personalize a headline e legenda antes de criar o post
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              {/* Preview */}
              <div className="relative rounded-xl overflow-hidden">
                <img 
                  src={selectedItem.imageUrl!} 
                  alt={selectedItem.title}
                  className="w-full aspect-video object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                
                {/* Headline Preview */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="bg-primary text-primary-foreground font-bold px-3 py-2 text-sm inline-block max-w-full">
                    {headline || 'SUA HEADLINE AQUI'}
                  </div>
                  <p className="text-muted text-xs mt-2">
                    Fonte: {selectedItem.sourceName}
                  </p>
                </div>
              </div>
              
              {/* Headline Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Headline (texto na imagem)</label>
                <Input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value.toUpperCase())}
                  placeholder="HEADLINE IMPACTANTE AQUI"
                  className="uppercase font-bold"
                  maxLength={80}
                />
                <p className="text-xs text-muted-foreground text-right">{headline.length}/80</p>
              </div>
              
              {/* Caption Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Legenda do post</label>
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={`📰 ${selectedItem.title}\n\n🔗 Fonte: ${selectedItem.sourceName}`}
                  rows={4}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreatePost}
              disabled={isCreating || !headline}
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
    </Card>
  );
}
