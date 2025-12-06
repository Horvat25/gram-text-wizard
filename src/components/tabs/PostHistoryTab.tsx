import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft,
  ChevronRight,
  ExternalLink, 
  Heart, 
  MessageCircle, 
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { 
  format, 
  parseISO, 
  isSameDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  addMonths, 
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  eachDayOfInterval,
  getDay,
  isSameMonth
} from 'date-fns';
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
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [selectedPost, setSelectedPost] = useState<PublishedPost | null>(null);

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

  // Get posts for a specific day
  const getPostsForDay = (date: Date) => {
    return posts.filter((post) => {
      if (!post.published_at) return false;
      return isSameDay(parseISO(post.published_at), date);
    });
  };

  // Calendar days based on view mode
  const calendarDays = useMemo(() => {
    switch (viewMode) {
      case 'daily':
        return [currentDate];
      case 'weekly':
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
        return eachDayOfInterval({ start: weekStart, end: weekEnd });
      case 'monthly':
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const startPadding = getDay(monthStart);
        const calendarStart = subDays(monthStart, startPadding);
        const totalDays = 42; // 6 weeks
        return eachDayOfInterval({ start: calendarStart, end: addDays(calendarStart, totalDays - 1) });
    }
  }, [currentDate, viewMode]);

  // Navigation
  const navigatePrev = () => {
    switch (viewMode) {
      case 'daily':
        setCurrentDate(subDays(currentDate, 1));
        break;
      case 'weekly':
        setCurrentDate(subWeeks(currentDate, 1));
        break;
      case 'monthly':
        setCurrentDate(subMonths(currentDate, 1));
        break;
    }
  };

  const navigateNext = () => {
    switch (viewMode) {
      case 'daily':
        setCurrentDate(addDays(currentDate, 1));
        break;
      case 'weekly':
        setCurrentDate(addWeeks(currentDate, 1));
        break;
      case 'monthly':
        setCurrentDate(addMonths(currentDate, 1));
        break;
    }
  };

  const getTitle = () => {
    switch (viewMode) {
      case 'daily':
        return format(currentDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      case 'weekly':
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
        return `${format(weekStart, "dd MMM", { locale: ptBR })} - ${format(weekEnd, "dd MMM yyyy", { locale: ptBR })}`;
      case 'monthly':
        return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
    }
  };

  const openOnInstagram = (instagramPostId: string) => {
    window.open(`https://www.instagram.com/p/${instagramPostId}/`, '_blank');
  };

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold neural-gradient-text">Histórico de Publicações</h2>
          <p className="text-muted-foreground text-sm">
            {posts.length} post{posts.length !== 1 ? 's' : ''} publicado{posts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPublishedPosts} className="border-primary/30 hover:bg-primary/10">
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* View Mode Toggle + Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <Button
            variant={viewMode === 'daily' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('daily')}
          >
            Diário
          </Button>
          <Button
            variant={viewMode === 'weekly' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('weekly')}
          >
            Semanal
          </Button>
          <Button
            variant={viewMode === 'monthly' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('monthly')}
          >
            Mensal
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navigatePrev} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[200px] text-center capitalize">
            {getTitle()}
          </span>
          <Button variant="outline" size="icon" onClick={navigateNext} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>
            Hoje
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="border-primary/20 bg-gradient-neural-soft overflow-hidden">
        <CardContent className="p-0">
          {/* Week Days Header (for weekly and monthly) */}
          {viewMode !== 'daily' && (
            <div className="grid grid-cols-7 bg-muted/50 border-b border-border">
              {weekDays.map((day) => (
                <div key={day} className="p-3 text-center text-sm font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>
          )}

          {/* Calendar Days */}
          {viewMode === 'daily' ? (
            // Daily View - Single large day
            <div className="min-h-[600px] p-6">
              <DayCell 
                date={currentDate} 
                posts={getPostsForDay(currentDate)} 
                isToday={isSameDay(currentDate, new Date())}
                isCurrentMonth={true}
                viewMode="daily"
                onPostClick={setSelectedPost}
                onInstagramClick={openOnInstagram}
              />
            </div>
          ) : viewMode === 'weekly' ? (
            // Weekly View - 7 columns
            <div className="grid grid-cols-7 min-h-[500px]">
              {calendarDays.map((day) => (
                <div key={day.toISOString()} className="border-r border-b border-border last:border-r-0">
                  <DayCell 
                    date={day} 
                    posts={getPostsForDay(day)} 
                    isToday={isSameDay(day, new Date())}
                    isCurrentMonth={true}
                    viewMode="weekly"
                    onPostClick={setSelectedPost}
                    onInstagramClick={openOnInstagram}
                  />
                </div>
              ))}
            </div>
          ) : (
            // Monthly View - Grid
            <div className="grid grid-cols-7">
              {calendarDays.map((day) => (
                <div key={day.toISOString()} className="border-r border-b border-border last:border-r-0 min-h-[120px]">
                  <DayCell 
                    date={day} 
                    posts={getPostsForDay(day)} 
                    isToday={isSameDay(day, new Date())}
                    isCurrentMonth={isSameMonth(day, currentDate)}
                    viewMode="monthly"
                    onPostClick={setSelectedPost}
                    onInstagramClick={openOnInstagram}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Post Detail */}
      {selectedPost && (
        <Card className="border-primary/30 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex gap-4">
              {selectedPost.image_url && (
                <img 
                  src={selectedPost.image_url} 
                  alt="Post" 
                  className="w-32 h-32 object-cover rounded-lg"
                />
              )}
              <div className="flex-1 space-y-2">
                <div className="flex items-start justify-between">
                  <p className="text-sm line-clamp-3">{selectedPost.caption}</p>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 shrink-0"
                    onClick={() => setSelectedPost(null)}
                  >
                    ×
                  </Button>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Heart className="w-4 h-4 text-accent" />
                    {selectedPost.likes_count || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-4 h-4 text-primary" />
                    {selectedPost.comments_count || 0}
                  </span>
                  {selectedPost.published_at && (
                    <span className="text-xs">
                      {format(parseISO(selectedPost.published_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  )}
                </div>
                {selectedPost.instagram_post_id && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => openOnInstagram(selectedPost.instagram_post_id!)}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Ver no Instagram
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Day Cell Component
interface DayCellProps {
  date: Date;
  posts: PublishedPost[];
  isToday: boolean;
  isCurrentMonth: boolean;
  viewMode: ViewMode;
  onPostClick: (post: PublishedPost) => void;
  onInstagramClick: (id: string) => void;
}

function DayCell({ date, posts, isToday, isCurrentMonth, viewMode, onPostClick, onInstagramClick }: DayCellProps) {
  const dayNumber = format(date, 'd');

  if (viewMode === 'daily') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className={`text-3xl font-bold ${isToday ? 'text-primary' : ''}`}>
            {format(date, 'dd')}
          </span>
          <span className="text-muted-foreground">
            {format(date, "EEEE", { locale: ptBR })}
          </span>
          {posts.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {posts.length} post{posts.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        
        {posts.length === 0 ? (
          <div className="flex items-center justify-center h-[400px] text-muted-foreground">
            Nenhum post publicado neste dia
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <div 
                key={post.id}
                className="group cursor-pointer rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/10"
                onClick={() => onPostClick(post)}
              >
                {post.image_url ? (
                  <div className="aspect-square relative">
                    <img 
                      src={post.image_url} 
                      alt="Post" 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center gap-3 text-white text-sm">
                        <span className="flex items-center gap-1">
                          <Heart className="w-4 h-4" /> {post.likes_count || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-4 h-4" /> {post.comments_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    <span className="text-muted-foreground text-sm">Sem imagem</span>
                  </div>
                )}
                <div className="p-3">
                  <p className="text-sm line-clamp-2">{post.caption}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {post.published_at && format(parseISO(post.published_at), "HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Weekly/Monthly compact view
  return (
    <div className={`h-full p-1 ${!isCurrentMonth ? 'opacity-40' : ''}`}>
      <div className={`text-xs font-medium mb-1 p-1 rounded ${isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
        {dayNumber}
      </div>
      
      <div className={`space-y-1 ${viewMode === 'weekly' ? 'max-h-[400px]' : 'max-h-[80px]'} overflow-y-auto`}>
        {posts.map((post) => (
          <div 
            key={post.id}
            className="cursor-pointer group"
            onClick={() => onPostClick(post)}
          >
            {post.image_url ? (
              <div className={`relative rounded overflow-hidden ${viewMode === 'weekly' ? 'aspect-square' : 'h-[50px]'}`}>
                <img 
                  src={post.image_url} 
                  alt="Post" 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                {viewMode === 'weekly' && (
                  <div className="absolute bottom-1 left-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-2 text-white text-xs">
                      <span className="flex items-center gap-0.5">
                        <Heart className="w-3 h-3" /> {post.likes_count || 0}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className={`bg-muted rounded flex items-center justify-center text-xs text-muted-foreground ${viewMode === 'weekly' ? 'aspect-square' : 'h-[50px]'}`}>
                Post
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}