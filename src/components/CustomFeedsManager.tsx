import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Trash2, 
  Rss, 
  Globe, 
  Loader2,
  Check,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';

export interface CustomFeed {
  name: string;
  url: string;
}

// Feeds padrão do sistema
export const DEFAULT_TECH_FEEDS: CustomFeed[] = [
  { name: 'Olhar Digital', url: 'https://olhardigital.com.br/feed/' },
  { name: 'TecMundo', url: 'https://rss.tecmundo.com.br/feed' },
  { name: 'Canaltech', url: 'https://canaltech.com.br/rss/' },
  { name: 'Tecnoblog', url: 'https://tecnoblog.net/feed/' },
  { name: 'Gizmodo Brasil', url: 'https://gizmodo.uol.com.br/feed/' },
];

interface CustomFeedsManagerProps {
  onFeedsChange?: (feeds: CustomFeed[]) => void;
}

export function CustomFeedsManager({ onFeedsChange }: CustomFeedsManagerProps) {
  const { currentWorkspace } = useWorkspace();
  const [customFeeds, setCustomFeeds] = useState<CustomFeed[]>([]);
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Carregar feeds customizados do workspace
  useEffect(() => {
    if (currentWorkspace?.id) {
      loadCustomFeeds();
    }
  }, [currentWorkspace?.id]);

  const loadCustomFeeds = async () => {
    if (!currentWorkspace?.id) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('workspaces')
        .select('settings')
        .eq('id', currentWorkspace.id)
        .single();

      if (error) throw error;

      const settings = data?.settings as any || {};
      const feeds = settings?.custom_rss_feeds || [];
      setCustomFeeds(feeds);
      onFeedsChange?.(feeds.length > 0 ? feeds : DEFAULT_TECH_FEEDS);
    } catch (error) {
      console.error('Error loading custom feeds:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCustomFeeds = async (feeds: CustomFeed[]) => {
    if (!currentWorkspace?.id) {
      toast.error('Selecione um workspace');
      return;
    }

    setIsSaving(true);
    try {
      // Buscar settings atuais
      const { data: current } = await supabase
        .from('workspaces')
        .select('settings')
        .eq('id', currentWorkspace.id)
        .single();

      const currentSettings = (current?.settings as any) || {};
      
      const { error } = await supabase
        .from('workspaces')
        .update({ 
          settings: { 
            ...currentSettings, 
            custom_rss_feeds: feeds 
          } 
        })
        .eq('id', currentWorkspace.id);

      if (error) throw error;

      setCustomFeeds(feeds);
      onFeedsChange?.(feeds.length > 0 ? feeds : DEFAULT_TECH_FEEDS);
      toast.success('Feeds salvos!');
    } catch (error: any) {
      console.error('Error saving custom feeds:', error);
      toast.error('Erro ao salvar feeds');
    } finally {
      setIsSaving(false);
    }
  };

  const addFeed = async () => {
    if (!newFeedName.trim() || !newFeedUrl.trim()) {
      toast.error('Preencha nome e URL do feed');
      return;
    }

    // Validar URL básica
    if (!newFeedUrl.includes('http')) {
      toast.error('URL inválida. Use formato: https://site.com/feed/');
      return;
    }

    // Verificar duplicatas
    if (customFeeds.some(f => f.url === newFeedUrl)) {
      toast.error('Este feed já foi adicionado');
      return;
    }

    const newFeed: CustomFeed = {
      name: newFeedName.trim(),
      url: newFeedUrl.trim()
    };

    const updatedFeeds = [...customFeeds, newFeed];
    await saveCustomFeeds(updatedFeeds);
    
    setNewFeedName('');
    setNewFeedUrl('');
  };

  const removeFeed = async (url: string) => {
    const updatedFeeds = customFeeds.filter(f => f.url !== url);
    await saveCustomFeeds(updatedFeeds);
  };

  const resetToDefaults = async () => {
    await saveCustomFeeds([]);
    toast.info('Usando feeds padrão do sistema');
  };

  // Feeds ativos (customizados ou padrão)
  const activeFeeds = customFeeds.length > 0 ? customFeeds : DEFAULT_TECH_FEEDS;
  const isUsingDefaults = customFeeds.length === 0;

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-orange-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-5 w-5 text-orange-500" />
          Sites de Notícias
        </CardTitle>
        <CardDescription>
          Adicione sites de tecnologia para buscar notícias automaticamente
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Adicionar novo feed */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2">
          <div>
            <Label htmlFor="feed-name" className="text-xs text-muted-foreground">Nome</Label>
            <Input
              id="feed-name"
              placeholder="Ex: TechCrunch"
              value={newFeedName}
              onChange={(e) => setNewFeedName(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <Label htmlFor="feed-url" className="text-xs text-muted-foreground">URL do Feed RSS</Label>
            <Input
              id="feed-url"
              placeholder="https://site.com/feed/ ou /rss"
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex items-end">
            <Button 
              onClick={addFeed} 
              disabled={isSaving || !newFeedName || !newFeedUrl}
              size="sm"
              className="bg-orange-500 hover:bg-orange-600"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Lista de feeds ativos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Rss className="h-3 w-3" />
              Feeds Ativos ({activeFeeds.length})
              {isUsingDefaults && (
                <Badge variant="secondary" className="text-[10px] ml-1">padrão</Badge>
              )}
            </Label>
            
            {!isUsingDefaults && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={resetToDefaults}
                className="text-xs h-6 text-muted-foreground"
              >
                Restaurar padrões
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {activeFeeds.map((feed) => (
              <Badge 
                key={feed.url} 
                variant={isUsingDefaults ? "secondary" : "default"}
                className="flex items-center gap-1.5 py-1 px-2"
              >
                <Check className="h-3 w-3" />
                {feed.name}
                {!isUsingDefaults && (
                  <button
                    onClick={() => removeFeed(feed.url)}
                    className="ml-1 hover:text-destructive transition-colors"
                    disabled={isSaving}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        </div>

        {/* Dica */}
        <div className="flex items-start gap-2 p-2 bg-muted/50 rounded-md">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Dica: Para encontrar o feed RSS de um site, adicione <code className="bg-background px-1 rounded">/feed</code> ou <code className="bg-background px-1 rounded">/rss</code> ao final da URL.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
