import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Lightbulb, 
  TrendingUp, 
  Sparkles, 
  Clock, 
  Hash, 
  Image as ImageIcon,
  Copy,
  Zap,
  RefreshCw,
  Loader2,
  Target,
  Flame,
  MessageSquare,
  BookOpen,
  ShoppingBag,
  Users
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface Suggestion {
  id: string;
  title: string;
  topic: string;
  postType: string;
  captionIdea: string;
  imagePrompt: string;
  hashtags: string[];
  whyItWorks: string;
  bestTime: string;
  trendScore: number;
}

const postTypeIcons: Record<string, React.ReactNode> = {
  engajamento: <Users className="w-4 h-4" />,
  educacional: <BookOpen className="w-4 h-4" />,
  storytelling: <MessageSquare className="w-4 h-4" />,
  viral: <Flame className="w-4 h-4" />,
  vendas: <ShoppingBag className="w-4 h-4" />,
};

const postTypeLabels: Record<string, string> = {
  engajamento: 'Engajamento',
  educacional: 'Educacional',
  storytelling: 'Storytelling',
  viral: 'Viral',
  vendas: 'Vendas',
};

const postTypeColors: Record<string, string> = {
  engajamento: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  educacional: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  storytelling: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  viral: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  vendas: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
};

export function SuggestionsTab() {
  const [niche, setNiche] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setSearchParams] = useSearchParams();

  const fetchSuggestions = async () => {
    if (!niche.trim()) {
      toast.error('Digite um nicho ou tema para buscar sugestões');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-suggestions', {
        body: { niche: niche.trim() }
      });

      if (error) throw error;

      if (data?.suggestions) {
        setSuggestions(data.suggestions);
        toast.success(`${data.suggestions.length} sugestões geradas!`);
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (error: any) {
      console.error('Error fetching suggestions:', error);
      toast.error('Erro ao gerar sugestões. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const useSuggestion = (suggestion: Suggestion) => {
    // Store suggestion in sessionStorage for the creation tab
    sessionStorage.setItem('suggestionData', JSON.stringify({
      postType: suggestion.postType,
      topic: suggestion.topic,
      captionIdea: suggestion.captionIdea,
      imagePrompt: suggestion.imagePrompt,
      hashtags: suggestion.hashtags
    }));
    
    // Navigate to create tab
    setSearchParams({ tab: 'create' });
    toast.success('Sugestão aplicada! Personalize e gere seu post.');
  };

  const getTrendScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-orange-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
          <Zap className="w-5 h-5 text-primary animate-pulse" />
          <span className="text-sm font-medium text-primary">Powered by AI</span>
        </div>
        <h2 className="text-3xl font-bold neural-gradient-text">
          Sugestões Inteligentes
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Descubra tendências, notícias e temas virais do momento. 
          Nossa IA analisa o que está em alta e gera ideias de posts otimizadas para engajamento.
        </p>
      </div>

      {/* Search */}
      <Card className="border-primary/20 bg-gradient-neural-soft overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Lightbulb className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Digite seu nicho (ex: tecnologia, fitness, gastronomia, moda...)"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchSuggestions()}
                className="pl-10 h-12 text-lg bg-background/50 border-primary/20 focus:border-primary"
              />
            </div>
            <Button 
              onClick={fetchSuggestions} 
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
                  <Sparkles className="w-5 h-5 mr-2" />
                  Gerar Sugestões
                </>
              )}
            </Button>
          </div>

          {/* Quick suggestions */}
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="text-sm text-muted-foreground">Populares:</span>
            {['Tecnologia', 'Fitness', 'Marketing Digital', 'Gastronomia', 'Finanças'].map((item) => (
              <Badge 
                key={item}
                variant="outline" 
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => {
                  setNiche(item);
                }}
              >
                {item}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="border-primary/10 animate-pulse">
              <CardContent className="p-6 space-y-4">
                <div className="h-6 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-20 bg-muted rounded" />
                <div className="flex gap-2">
                  <div className="h-6 bg-muted rounded w-16" />
                  <div className="h-6 bg-muted rounded w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Suggestions Grid */}
      {!loading && suggestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              {suggestions.length} Sugestões Encontradas
            </h3>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchSuggestions}
              className="border-primary/30"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((suggestion) => (
              <Card 
                key={suggestion.id} 
                className="group border-primary/10 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 overflow-hidden"
              >
                {/* Trend Score Bar */}
                <div className="h-1 bg-muted">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                    style={{ width: `${suggestion.trendScore}%` }}
                  />
                </div>

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge className={`${postTypeColors[suggestion.postType] || 'bg-primary/20'} border`}>
                      {postTypeIcons[suggestion.postType]}
                      <span className="ml-1">{postTypeLabels[suggestion.postType] || suggestion.postType}</span>
                    </Badge>
                    <div className={`flex items-center gap-1 text-sm font-bold ${getTrendScoreColor(suggestion.trendScore)}`}>
                      <Target className="w-4 h-4" />
                      {suggestion.trendScore}%
                    </div>
                  </div>
                  <CardTitle className="text-lg mt-2 line-clamp-2">
                    {suggestion.title}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {suggestion.topic}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Caption Idea */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Ideia de Legenda
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(suggestion.captionIdea, 'Legenda')}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-sm line-clamp-3 bg-muted/50 p-3 rounded-lg">
                      {suggestion.captionIdea}
                    </p>
                  </div>

                  {/* Image Prompt */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        Prompt de Imagem
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(suggestion.imagePrompt, 'Prompt')}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/30 p-2 rounded italic">
                      {suggestion.imagePrompt}
                    </p>
                  </div>

                  {/* Hashtags */}
                  <div className="flex flex-wrap gap-1">
                    {suggestion.hashtags?.slice(0, 4).map((tag, i) => (
                      <span 
                        key={i} 
                        className="text-xs text-primary cursor-pointer hover:underline"
                        onClick={() => copyToClipboard(`#${tag}`, 'Hashtag')}
                      >
                        #{tag}
                      </span>
                    ))}
                    {suggestion.hashtags?.length > 4 && (
                      <span className="text-xs text-muted-foreground">
                        +{suggestion.hashtags.length - 4}
                      </span>
                    )}
                  </div>

                  {/* Why it works */}
                  <div className="p-2 rounded-lg bg-success/5 border border-success/20">
                    <p className="text-xs text-success">
                      💡 {suggestion.whyItWorks}
                    </p>
                  </div>

                  {/* Best Time */}
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Melhor horário: <strong className="text-foreground">{suggestion.bestTime}</strong>
                    </span>
                  </div>

                  {/* Action Button */}
                  <Button 
                    className="w-full glow-sm group-hover:glow"
                    onClick={() => useSuggestion(suggestion)}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Usar Esta Ideia
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && suggestions.length === 0 && (
        <Card className="border-dashed border-2 border-primary/20">
          <CardContent className="py-16 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Lightbulb className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Descubra Ideias Incríveis</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Digite seu nicho ou área de atuação acima e nossa IA vai buscar 
              as tendências mais quentes e gerar sugestões personalizadas de posts.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Badge variant="outline" className="py-1">🔥 Tendências do momento</Badge>
              <Badge variant="outline" className="py-1">📊 Posts otimizados</Badge>
              <Badge variant="outline" className="py-1">🎯 Alta conversão</Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}