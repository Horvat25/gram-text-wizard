import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Rss, 
  RefreshCw, 
  Image as ImageIcon, 
  ImageOff,
  ExternalLink,
  Sparkles,
  Loader2,
  Trash2,
  Database,
  Clock
} from 'lucide-react';
import { useRssFeeds, RssItem, DEFAULT_FEEDS } from '@/hooks/useRssFeeds';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RssFeedManagerProps {
  onSelectItem?: (item: RssItem) => void;
  showActions?: boolean;
}

export function RssFeedManager({ onSelectItem, showActions = true }: RssFeedManagerProps) {
  const { 
    items, 
    stats, 
    loading, 
    fetchFeeds, 
    loadSavedItems, 
    cleanupOldItems 
  } = useRssFeeds();
  
  const [showOnlyWithImages, setShowOnlyWithImages] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  // Carregar itens salvos ao montar
  useEffect(() => {
    loadSavedItems(showOnlyWithImages, true);
  }, [showOnlyWithImages]);

  // Filtrar por fonte
  const filteredItems = selectedSource 
    ? items.filter(item => item.sourceName === selectedSource)
    : items;

  // Agrupar por fonte para badge counts
  const sourceCounts = items.reduce((acc, item) => {
    acc[item.sourceName] = (acc[item.sourceName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleFetchNew = async () => {
    await fetchFeeds(DEFAULT_FEEDS, 15);
    await loadSavedItems(showOnlyWithImages, true);
  };

  const handleCleanup = async () => {
    await cleanupOldItems(7);
    await loadSavedItems(showOnlyWithImages, true);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Data desconhecida';
    try {
      return format(new Date(dateStr), "dd MMM 'às' HH:mm", { locale: ptBR });
    } catch {
      return 'Data inválida';
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Rss className="h-5 w-5 text-orange-500" />
            Feeds RSS
          </CardTitle>
          
          {showActions && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCleanup}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Limpar
              </Button>
              <Button
                size="sm"
                onClick={handleFetchNew}
                disabled={loading}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Atualizar
              </Button>
            </div>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="secondary" className="text-xs">
              <Database className="h-3 w-3 mr-1" />
              {stats.totalItems} notícias
            </Badge>
            <Badge variant="secondary" className="text-xs text-green-600">
              <ImageIcon className="h-3 w-3 mr-1" />
              {stats.withImages} com imagem
            </Badge>
            <Badge variant="secondary" className="text-xs text-muted-foreground">
              <ImageOff className="h-3 w-3 mr-1" />
              {stats.withoutImages} sem imagem
            </Badge>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="only-images"
              checked={showOnlyWithImages}
              onCheckedChange={(checked) => setShowOnlyWithImages(!!checked)}
            />
            <label htmlFor="only-images" className="text-sm cursor-pointer">
              Apenas com imagem
            </label>
          </div>

          {/* Source filter badges */}
          <div className="flex flex-wrap gap-1">
            <Badge
              variant={selectedSource === null ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setSelectedSource(null)}
            >
              Todos
            </Badge>
            {Object.entries(sourceCounts).map(([source, count]) => (
              <Badge
                key={source}
                variant={selectedSource === source ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => setSelectedSource(source)}
              >
                {source} ({count})
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Buscando notícias...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Rss className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Nenhuma notícia encontrada</p>
            <Button
              variant="link"
              onClick={handleFetchNew}
              className="mt-2"
            >
              Buscar notícias agora
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {filteredItems.map((item, index) => (
                <div
                  key={item.link + index}
                  className="group border rounded-lg p-3 hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => onSelectItem?.(item)}
                >
                  <div className="flex gap-3">
                    {/* Thumbnail */}
                    <div className="flex-shrink-0 w-20 h-20 rounded-md overflow-hidden bg-muted">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageOff className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                        {item.title}
                      </h4>
                      
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {item.description}
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {item.sourceName}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground flex items-center">
                          <Clock className="h-3 w-3 mr-0.5" />
                          {formatDate(item.publishedAt)}
                        </span>
                        {item.hasImage && (
                          <ImageIcon className="h-3 w-3 text-green-500" />
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(item.link, '_blank');
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem?.(item);
                        }}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
