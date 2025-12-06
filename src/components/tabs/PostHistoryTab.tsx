import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { 
  CheckCircle, 
  ExternalLink, 
  Heart, 
  MessageCircle, 
  Bookmark, 
  Eye,
  Calendar as CalendarIcon,
  Loader2,
  ImageIcon,
  RefreshCw,
  TrendingUp
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isSameDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PublishedPost {
  id: string;
  caption: string;
  hashtags: string[] | null;
  image_url: string | null;
  instagram_post_id: string | null;
  published_at: string | null;
  likes_count: number | null;
  comments_count: number | null;
  saves_count: number | null;
  reach: number | null;
  post_type: string | null;
}

type ViewMode = 'daily' | 'weekly' | 'monthly';

export function PostHistoryTab() {
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');

  const fetchPublishedPosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('Error fetching published posts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPublishedPosts();
  }, []);

  // Dates with published posts (for calendar highlighting)
  const datesWithPosts = useMemo(() => {
    return posts
      .filter((p) => p.published_at)
      .map((p) => parseISO(p.published_at!));
  }, [posts]);

  // Filter posts based on view mode and selected date
  const filteredPosts = useMemo(() => {
    if (!selectedDate) return posts;

    return posts.filter((post) => {
      if (!post.published_at) return false;
      const postDate = parseISO(post.published_at);

      switch (viewMode) {
        case 'daily':
          return isSameDay(postDate, selectedDate);
        case 'weekly':
          const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
          const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 0 });
          return isWithinInterval(postDate, { start: weekStart, end: weekEnd });
        case 'monthly':
          const monthStart = startOfMonth(selectedDate);
          const monthEnd = endOfMonth(selectedDate);
          return isWithinInterval(postDate, { start: monthStart, end: monthEnd });
        default:
          return true;
      }
    });
  }, [posts, selectedDate, viewMode]);

  // Stats for the period
  const periodStats = useMemo(() => {
    const totalLikes = filteredPosts.reduce((sum, p) => sum + (p.likes_count || 0), 0);
    const totalComments = filteredPosts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
    const totalReach = filteredPosts.reduce((sum, p) => sum + (p.reach || 0), 0);
    return { totalLikes, totalComments, totalReach, postCount: filteredPosts.length };
  }, [filteredPosts]);

  const getPeriodLabel = () => {
    switch (viewMode) {
      case 'daily':
        return format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      case 'weekly':
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 0 });
        return `${format(weekStart, "dd MMM", { locale: ptBR })} - ${format(weekEnd, "dd MMM yyyy", { locale: ptBR })}`;
      case 'monthly':
        return format(selectedDate, "MMMM 'de' yyyy", { locale: ptBR });
    }
  };

  const openOnInstagram = (instagramPostId: string) => {
    window.open(`https://www.instagram.com/p/${instagramPostId}/`, '_blank');
  };

  const getPostTypeLabel = (type: string | null) => {
    const types: Record<string, string> = {
      engajamento: 'Engajamento',
      educacional: 'Educacional',
      storytelling: 'Storytelling',
      viral: 'Viral',
      vendas: 'Vendas',
    };
    return types[type || ''] || type || 'Post';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold neural-gradient-text">Histórico de Publicações</h2>
          <p className="text-muted-foreground">
            {posts.length} post{posts.length !== 1 ? 's' : ''} publicado{posts.length !== 1 ? 's' : ''} no Instagram
          </p>
        </div>
        <Button variant="outline" onClick={fetchPublishedPosts} className="border-primary/30 hover:bg-primary/10">
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
        <Button
          variant={viewMode === 'daily' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('daily')}
          className={viewMode === 'daily' ? 'glow-sm' : ''}
        >
          Diário
        </Button>
        <Button
          variant={viewMode === 'weekly' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('weekly')}
          className={viewMode === 'weekly' ? 'glow-sm' : ''}
        >
          Semanal
        </Button>
        <Button
          variant={viewMode === 'monthly' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('monthly')}
          className={viewMode === 'monthly' ? 'glow-sm' : ''}
        >
          Mensal
        </Button>
      </div>

      {/* Main Layout - Calendar takes more space */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Calendar - Larger */}
        <Card className="border-primary/20 bg-gradient-neural-soft">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarIcon className="h-5 w-5 text-primary" />
              Calendário de Publicações
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              locale={ptBR}
              modifiers={{
                hasPost: datesWithPosts,
              }}
              modifiersStyles={{
                hasPost: {
                  backgroundColor: "hsl(var(--primary) / 0.3)",
                  borderRadius: "50%",
                  fontWeight: "bold",
                },
              }}
              className="rounded-xl border-2 border-primary/20 p-4 pointer-events-auto scale-110 origin-top"
            />
          </CardContent>
        </Card>

        {/* Period Stats */}
        <div className="space-y-4">
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="capitalize text-lg">{getPeriodLabel()}</CardTitle>
              <CardDescription>
                Resumo do período selecionado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2 text-primary mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs font-medium">Posts</span>
                  </div>
                  <p className="text-2xl font-bold">{periodStats.postCount}</p>
                </div>
                <div className="p-4 rounded-xl bg-accent/10 border border-accent/20">
                  <div className="flex items-center gap-2 text-accent mb-1">
                    <Heart className="h-4 w-4" />
                    <span className="text-xs font-medium">Curtidas</span>
                  </div>
                  <p className="text-2xl font-bold">{periodStats.totalLikes.toLocaleString()}</p>
                </div>
                <div className="p-4 rounded-xl bg-success/10 border border-success/20">
                  <div className="flex items-center gap-2 text-success mb-1">
                    <MessageCircle className="h-4 w-4" />
                    <span className="text-xs font-medium">Comentários</span>
                  </div>
                  <p className="text-2xl font-bold">{periodStats.totalComments.toLocaleString()}</p>
                </div>
                <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                  <div className="flex items-center gap-2 text-warning mb-1">
                    <Eye className="h-4 w-4" />
                    <span className="text-xs font-medium">Alcance</span>
                  </div>
                  <p className="text-2xl font-bold">{periodStats.totalReach.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Posts Grid */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg">
            Posts do Período
          </CardTitle>
          <CardDescription>
            {filteredPosts.length} post{filteredPosts.length !== 1 ? 's' : ''} encontrado{filteredPosts.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredPosts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarIcon className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg">Nenhum post publicado neste período</p>
              <p className="text-sm mt-1">Selecione outra data no calendário</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPosts.map((post) => (
                <Card key={post.id} className="overflow-hidden hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group">
                  {/* Image */}
                  {post.image_url ? (
                    <div className="aspect-square relative overflow-hidden bg-muted">
                      <img
                        src={post.image_url}
                        alt="Post"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-success text-success-foreground border-0">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Publicado
                        </Badge>
                      </div>
                      {post.post_type && (
                        <div className="absolute top-2 left-2">
                          <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
                            {getPostTypeLabel(post.post_type)}
                          </Badge>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="aspect-square bg-muted flex items-center justify-center">
                      <ImageIcon className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}

                  <CardContent className="p-4 space-y-3">
                    {/* Caption Preview */}
                    <p className="text-sm line-clamp-2">{post.caption}</p>

                    {/* Hashtags */}
                    {post.hashtags && post.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {post.hashtags.slice(0, 3).map((tag, i) => (
                          <span key={i} className="text-xs text-primary font-medium">
                            #{tag}
                          </span>
                        ))}
                        {post.hashtags.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{post.hashtags.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Heart className="w-4 h-4 text-accent" />
                        <span>{post.likes_count || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="w-4 h-4 text-primary" />
                        <span>{post.comments_count || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Bookmark className="w-4 h-4" />
                        <span>{post.saves_count || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        <span>{post.reach || 0}</span>
                      </div>
                    </div>

                    {/* Date & Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarIcon className="w-3 h-3" />
                        {post.published_at && format(new Date(post.published_at), "dd MMM HH:mm", { locale: ptBR })}
                      </div>
                      
                      {post.instagram_post_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openOnInstagram(post.instagram_post_id!)}
                          className="h-7 px-2 text-xs hover:text-primary"
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Ver no IG
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}