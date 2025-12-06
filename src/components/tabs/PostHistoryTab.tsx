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
  CalendarDays
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
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Histórico de Publicações</h2>
          <p className="text-muted-foreground">
            {posts.length} post{posts.length !== 1 ? 's' : ''} publicado{posts.length !== 1 ? 's' : ''} no Instagram
          </p>
        </div>
        <Button variant="outline" onClick={fetchPublishedPosts}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2">
        <Button
          variant={viewMode === 'daily' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('daily')}
        >
          Diário
        </Button>
        <Button
          variant={viewMode === 'weekly' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('weekly')}
        >
          Semanal
        </Button>
        <Button
          variant={viewMode === 'monthly' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('monthly')}
        >
          Mensal
        </Button>
      </div>

      {/* Calendar and Posts */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Calendário
            </CardTitle>
            <CardDescription>
              Selecione uma data para filtrar
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                  backgroundColor: "hsl(var(--primary) / 0.2)",
                  borderRadius: "50%",
                },
              }}
              className="rounded-md border pointer-events-auto"
            />
          </CardContent>
        </Card>

        {/* Posts for period */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="capitalize">{getPeriodLabel()}</CardTitle>
              <CardDescription>
                {filteredPosts.length} post{filteredPosts.length !== 1 ? 's' : ''} neste período
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredPosts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum post publicado neste período</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredPosts.map((post) => (
                    <Card key={post.id} className="overflow-hidden hover:border-primary/30 transition-colors">
                      {/* Image */}
                      {post.image_url ? (
                        <div className="aspect-video relative overflow-hidden bg-muted">
                          <img
                            src={post.image_url}
                            alt="Post"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 right-2">
                            <Badge className="bg-green-500/90 text-white border-0">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Publicado
                            </Badge>
                          </div>
                          {post.post_type && (
                            <div className="absolute top-2 left-2">
                              <Badge variant="secondary" className="bg-black/50 text-white border-0">
                                {getPostTypeLabel(post.post_type)}
                              </Badge>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="aspect-video bg-muted flex items-center justify-center">
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
                              <span key={i} className="text-xs text-primary">
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
                            <Heart className="w-4 h-4" />
                            <span>{post.likes_count || 0}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MessageCircle className="w-4 h-4" />
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
                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarIcon className="w-3 h-3" />
                            {post.published_at && format(new Date(post.published_at), "dd MMM HH:mm", { locale: ptBR })}
                          </div>
                          
                          {post.instagram_post_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openOnInstagram(post.instagram_post_id!)}
                              className="h-7 px-2 text-xs"
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
      </div>
    </div>
  );
}