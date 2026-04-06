import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { DollarSign, Loader2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// Estimated cost per content type (based on AI calls made)
const COST_PER_TYPE: Record<string, { label: string; costPerPost: number; emoji: string }> = {
  image: { label: 'Imagem', costPerPost: 0.049, emoji: '🖼️' },
  carousel: { label: 'Carrossel', costPerPost: 0.172, emoji: '📚' },
  news: { label: 'Notícia', costPerPost: 0.030, emoji: '📰' },
  video: { label: 'Reels Criativo', costPerPost: 0.011, emoji: '🎬' },
  news_video: { label: 'Reels Notícia', costPerPost: 0.011, emoji: '📺' },
  marketing_image: { label: 'Marketing Img', costPerPost: 0.046, emoji: '📢' },
  marketing_video: { label: 'Marketing Vídeo', costPerPost: 0.011, emoji: '🎯' },
};

interface TypeStat {
  type: string;
  count: number;
  totalCost: number;
}

export default function CostSummaryPanel() {
  const { currentWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TypeStat[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [totalPosts, setTotalPosts] = useState(0);

  useEffect(() => {
    if (!currentWorkspace?.id) return;

    const load = async () => {
      setLoading(true);
      try {
        // Get all posts with cost_estimate for this workspace
        const { data: posts } = await supabase
          .from('posts')
          .select('post_type, media_type, cost_estimate, status')
          .eq('workspace_id', currentWorkspace.id);

        if (!posts) return;

        // Aggregate by mapped content type
        const map = new Map<string, { count: number; cost: number }>();

        for (const p of posts) {
          const contentType = mapPostToContentType(p.post_type, p.media_type);
          const entry = map.get(contentType) || { count: 0, cost: 0 };
          entry.count += 1;
          // Use actual cost_estimate from DB, fallback to estimated
          entry.cost += (p.cost_estimate || COST_PER_TYPE[contentType]?.costPerPost || 0);
          map.set(contentType, entry);
        }

        const result: TypeStat[] = [];
        let total = 0;
        let count = 0;

        for (const [type, { count: c, cost }] of map) {
          result.push({ type, count: c, totalCost: cost });
          total += cost;
          count += c;
        }

        // Sort by cost descending
        result.sort((a, b) => b.totalCost - a.totalCost);

        setStats(result);
        setTotalCost(total);
        setTotalPosts(count);
      } catch (e) {
        console.error('Error loading cost summary:', e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentWorkspace?.id]);

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardContent className="p-0">
        {/* Header with total */}
        <div className="flex items-center justify-between bg-primary/5 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold">Custo IA Acumulado</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-primary">${totalCost.toFixed(2)}</span>
            <Badge variant="secondary" className="text-[10px]">
              {totalPosts} posts
            </Badge>
          </div>
        </div>

        {/* Per-type breakdown */}
        {stats.length > 0 ? (
          <div className="divide-y divide-border/50">
            {stats.map(({ type, count, totalCost: cost }) => {
              const info = COST_PER_TYPE[type];
              const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;

              return (
                <div key={type} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-sm">{info?.emoji || '📄'}</span>
                  <span className="flex-1 text-[11px] font-medium truncate">
                    {info?.label || type}
                  </span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1">
                    {count}×
                  </Badge>
                  {/* Cost bar */}
                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        pct > 40 ? 'bg-destructive' : pct > 20 ? 'bg-primary' : 'bg-emerald-500'
                      )}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-[10px] font-mono text-muted-foreground">
                    ${cost.toFixed(3)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-4 text-center">
            <p className="text-[11px] text-muted-foreground">Nenhum post criado ainda</p>
          </div>
        )}

        {/* Average */}
        {totalPosts > 0 && (
          <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Média por post
            </span>
            <span className="font-mono font-medium">${(totalCost / totalPosts).toFixed(3)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function mapPostToContentType(postType: string | null, mediaType: string | null): string {
  if (postType === 'afiliado' && mediaType === 'reels') return 'marketing_video';
  if (postType === 'afiliado') return 'marketing_image';
  if (postType === 'noticia' && (mediaType === 'reels' || mediaType === 'video')) return 'news_video';
  if (postType === 'noticia') return 'news';
  if (mediaType === 'carousel') return 'carousel';
  if (mediaType === 'reels' || mediaType === 'video') return 'video';
  return 'image';
}
