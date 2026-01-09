import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Newspaper, 
  TrendingUp, 
  Sparkles, 
  Clock, 
  ExternalLink,
  Copy,
  Zap,
  RefreshCw,
  Loader2,
  Globe,
  Cpu,
  Atom,
  Rocket,
  Brain
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

interface NewsResult {
  url: string;
  title: string;
  description?: string;
  markdown?: string;
}

// Predefined topics for tech/future content
const PREDEFINED_TOPICS = [
  { label: 'Inteligência Artificial', query: 'inteligência artificial últimas notícias', icon: Brain },
  { label: 'Física Quântica', query: 'física quântica descobertas recentes', icon: Atom },
  { label: 'Tecnologia', query: 'tecnologia inovação notícias', icon: Cpu },
  { label: 'Futurismo', query: 'futuro tecnologia previsões', icon: Rocket },
];

export function LatestNewsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [newsResults, setNewsResults] = useState<NewsResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [, setSearchParams] = useSearchParams();

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

      if (data?.success && data.results) {
        setNewsResults(data.results);
        sessionStorage.setItem('latest_news_results', JSON.stringify(data.results));
        sessionStorage.setItem('latest_news_query', searchTerm);
        toast.success(`${data.results.length} notícias encontradas!`);
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

  const useNewsAsPost = (news: NewsResult) => {
    // Store news data for the creation tab
    sessionStorage.setItem('suggestionData', JSON.stringify({
      postType: 'noticia',
      topic: news.title,
      captionIdea: news.description || news.title,
      imagePrompt: `Ilustração moderna e futurista sobre: ${news.title}`,
      hashtags: ['notícia', 'atualidades', 'tecnologia', 'futuro', 'inovação']
    }));
    
    // Navigate to create tab
    setSearchParams({ tab: 'create' });
    toast.success('Notícia aplicada! Crie seu post.');
  };

  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

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
          Busque notícias reais sobre IA, física quântica, tecnologia e assuntos futuristas.
          Use as notícias como base para criar posts informativos e relevantes.
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
                <div className="h-16 bg-muted rounded" />
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
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="text-xs">
                      <Globe className="w-3 h-3 mr-1" />
                      {getDomainFromUrl(news.url)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => window.open(news.url, '_blank')}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>
                  <CardTitle className="text-lg mt-2 line-clamp-2">
                    {news.title}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Description */}
                  {news.description && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Resumo
                        </span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(news.description || '', 'Resumo')}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-sm line-clamp-3 bg-muted/50 p-3 rounded-lg">
                        {news.description}
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button 
                      className="flex-1 glow-sm group-hover:glow"
                      onClick={() => useNewsAsPost(news)}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Criar Post
                    </Button>
                    <Button 
                      variant="outline"
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
              as últimas notícias sobre tecnologia, IA e ciência.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
