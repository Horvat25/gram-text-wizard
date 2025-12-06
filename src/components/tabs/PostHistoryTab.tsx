import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  ExternalLink, 
  Heart, 
  MessageCircle, 
  Bookmark, 
  Eye,
  Calendar,
  Loader2,
  ImageIcon,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
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

export function PostHistoryTab() {
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [loading, setLoading] = useState(true);

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
      <div className="flex items-center justify-between">
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

      {/* Posts Grid */}
      {posts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Card key={post.id} className="overflow-hidden hover:border-primary/30 transition-colors">
              {/* Image */}
              {post.image_url ? (
                <div className="aspect-square relative overflow-hidden bg-muted">
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
                <div className="aspect-square bg-muted flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground" />
                </div>
              )}

              <CardContent className="p-4 space-y-3">
                {/* Caption Preview */}
                <p className="text-sm line-clamp-3">{post.caption}</p>

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
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
                    <Calendar className="w-3 h-3" />
                    {post.published_at && format(new Date(post.published_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
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
      ) : (
        <Card className="bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma publicação ainda</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Seus posts publicados no Instagram aparecerão aqui. Crie e publique seu primeiro post na aba "Criação".
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
