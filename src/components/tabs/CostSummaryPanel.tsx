import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { DollarSign, Loader2, TrendingUp, Target } from 'lucide-react';
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

// Maps agent_context distribution fields to our content types
const STRATEGY_MAP: { field: string; type: string }[] = [
  { field: 'content_distribution_images', type: 'image' },
  { field: 'content_distribution_carousels', type: 'carousel' },
  { field: 'content_distribution_news', type: 'news' },
  { field: 'content_distribution_videos', type: 'video' },
  { field: 'content_distribution_news_video', type: 'news_video' },
  { field: 'content_distribution_marketing', type: 'marketing_image' },
];

interface TypeStat {
  type: string;
  count: number;
  totalCost: number;
  weeklyTarget: number;
}

// Key for storing tracking start date in workspace settings
const TRACKING_KEY = 'cost_tracking_started_at';

export default function CostSummaryPanel() {
  const { currentWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TypeStat[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [totalPosts, setTotalPosts] = useState(0);
  const [projectedWeeklyCost, setProjectedWeeklyCost] = useState(0);
  const [trackingSince, setTrackingSince] = useState<string | null>(null);

  useEffect(() => {
    if (!currentWorkspace?.id) return;

    const load = async () => {
      setLoading(true);
      try {
        // Get or set tracking start date
        const settings = (currentWorkspace.settings as Record<string, any>) || {};
        let startDate = settings[TRACKING_KEY] as string | undefined;

        if (!startDate) {
          // First time - set tracking start to now
          startDate = new Date().toISOString();
          const newSettings = { ...settings, [TRACKING_KEY]: startDate };
          await supabase
            .from('workspaces')
            .update({ settings: newSettings })
            .eq('id', currentWorkspace.id);
        }

        setTrackingSince(startDate);

        // Fetch posts since tracking started + agent strategy in parallel
        const [postsRes, contextRes] = await Promise.all([
          supabase
            .from('posts')
            .select('post_type, media_type, cost_estimate, status')
            .eq('workspace_id', currentWorkspace.id)
            .gte('created_at', startDate),
          supabase
            .from('agent_context')
            .select('content_distribution_images, content_distribution_carousels, content_distribution_news, content_distribution_videos, content_distribution_news_video, content_distribution_marketing')
            .eq('workspace_id', currentWorkspace.id)
            .maybeSingle(),
        ]);

        // Build strategy weekly targets
        const ctx = contextRes.data || {} as any;
        const weeklyTargets = new Map<string, number>();
        for (const { field, type } of STRATEGY_MAP) {
          const val = (ctx as any)?.[field] || 0;
          weeklyTargets.set(type, val);
        }

        // Calculate projected weekly cost from strategy
        let projected = 0;
        for (const [type, qty] of weeklyTargets) {
          projected += qty * (COST_PER_TYPE[type]?.costPerPost || 0);
        }
        setProjectedWeeklyCost(projected);

        // Aggregate actual posts
        const map = new Map<string, { count: number; cost: number }>();
        for (const p of postsRes.data || []) {
          const contentType = mapPostToContentType(p.post_type, p.media_type);
          const entry = map.get(contentType) || { count: 0, cost: 0 };
          entry.count += 1;
          entry.cost += (p.cost_estimate || COST_PER_TYPE[contentType]?.costPerPost || 0);
          map.set(contentType, entry);
        }

        // Merge with strategy types to show all
        const allTypes = new Set([...map.keys(), ...weeklyTargets.keys()]);
        const result: TypeStat[] = [];
        let total = 0;
        let count = 0;

        for (const type of allTypes) {
          const actual = map.get(type) || { count: 0, cost: 0 };
          result.push({
            type,
            count: actual.count,
            totalCost: actual.cost,
            weeklyTarget: weeklyTargets.get(type) || 0,
          });
          total += actual.cost;
          count += actual.count;
        }

        result.sort((a, b) => b.totalCost - a.totalCost || b.weeklyTarget - a.weeklyTarget);

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

  const daysSince = trackingSince
    ? Math.max(1, Math.ceil((Date.now() - new Date(trackingSince).getTime()) / 86400000))
    : 1;

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between bg-primary/5 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            <div>
              <span className="text-xs font-semibold">Custo IA</span>
              <span className="ml-1.5 text-[9px] text-muted-foreground">
                {daysSince}d rastreando
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-primary">${totalCost.toFixed(2)}</span>
            <Badge variant="secondary" className="text-[10px]">
              {totalPosts} posts
            </Badge>
          </div>
        </div>

        {/* Strategy projection */}
        {projectedWeeklyCost > 0 && (
          <div className="flex items-center justify-between border-b border-border/50 bg-accent/30 px-3 py-1.5">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Target className="h-3 w-3" />
              Projeção semanal (estratégia)
            </span>
            <span className="text-[11px] font-bold font-mono text-accent-foreground">
              ~${projectedWeeklyCost.toFixed(2)}/sem
            </span>
          </div>
        )}

        {/* Per-type breakdown */}
        {stats.length > 0 ? (
          <div className="divide-y divide-border/50">
            {stats.map(({ type, count, totalCost: cost, weeklyTarget }) => {
              const info = COST_PER_TYPE[type];
              const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;

              return (
                <div key={type} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-sm">{info?.emoji || '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium truncate block">
                      {info?.label || type}
                    </span>
                    {weeklyTarget > 0 && (
                      <span className="text-[9px] text-muted-foreground">
                        meta: {weeklyTarget}/sem
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[9px] h-4 px-1">
                    {count}×
                  </Badge>
                  <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        pct > 40 ? 'bg-destructive' : pct > 20 ? 'bg-primary' : 'bg-chart-4'
                      )}
                      style={{ width: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
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
            <p className="text-[11px] text-muted-foreground">Nenhum post desde o início do rastreamento</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Média por post
          </span>
          <span className="font-mono font-medium">
            {totalPosts > 0 ? `$${(totalCost / totalPosts).toFixed(3)}` : '—'}
          </span>
        </div>
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
