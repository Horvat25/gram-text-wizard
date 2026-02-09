import { useState, useEffect } from 'react';
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
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useRssFeeds, RssItem, DEFAULT_FEEDS } from '@/hooks/useRssFeeds';
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
  const [headline, setHeadline] = useState('');
  const [caption, setCaption] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen && user && currentWorkspace) {
      loadSavedItems(true, true);
    }
  }, [isOpen, user, currentWorkspace]);

  const handleRefresh = async () => {
    await fetchFeeds(DEFAULT_FEEDS, 30);
    await loadSavedItems(true, true);
  };

  const handleSelectItem = (item: RssItem) => {
    if (selectedItem?.id === item.id) {
      setSelectedItem(null);
    } else {
      setSelectedItem(item);
      const shortTitle = item.title.length > 60 ? item.title.slice(0, 57) + '...' : item.title;
      setHeadline(shortTitle.toUpperCase());
    }
  };

  const handleCreatePost = async () => {
    if (!selectedItem || !user || !currentWorkspace) return;
    
    setIsCreating(true);
    try {
      const { data: overlayData, error: overlayError } = await supabase.functions.invoke('apply-text-overlay', {
        body: {
          imageUrl: selectedItem.imageUrl,
          headlineText: headline,
          userId: user.id,
          workspaceId: currentWorkspace.id,
          sourceName: selectedItem.sourceName
        }
      });

      if (overlayError) throw overlayError;
      
      const finalImageUrl = overlayData?.processedImageUrl || selectedItem.imageUrl;

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
      await loadSavedItems(true, true);
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Erro ao criar post');
    } finally {
      setIsCreating(false);
    }
  };

  const imagesWithContent = items.filter(item => item.imageUrl);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
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
                  {imagesWithContent.length} imagens disponíveis
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
          
          {/* Content */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : imagesWithContent.length > 0 ? (
            <ScrollArea className="flex-1 p-3">
              <div className="grid grid-cols-2 gap-2">
                {imagesWithContent.map((item, index) => (
                  <ImageCard 
                    key={item.id || index}
                    item={item}
                    onSelect={handleSelectItem}
                    isSelected={selectedItem?.id === item.id}
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
                    onClick={() => setShowCreateDialog(true)}
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Criar Post
            </DialogTitle>
            <DialogDescription>
              Personalize a headline e legenda
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden">
                <img 
                  src={selectedItem.imageUrl!} 
                  alt={selectedItem.title}
                  className="w-full aspect-video object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="bg-primary text-primary-foreground font-bold px-3 py-2 text-sm inline-block max-w-full">
                    {headline || 'SUA HEADLINE AQUI'}
                  </div>
                  <p className="text-muted-foreground text-xs mt-2">
                    Fonte: {selectedItem.sourceName}
                  </p>
                </div>
              </div>
              
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
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Legenda</label>
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
    </AnimatePresence>
  );
}
