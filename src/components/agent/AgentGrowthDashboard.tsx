import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { 
  Target, TrendingUp, Users, Eye, Brain,
  Video, Newspaper, Image as ImageIcon, LayoutGrid,
  Sparkles, BarChart3, ArrowUpRight, ArrowDownRight, Minus,
  Trophy, Heart, Bookmark, Share2, RefreshCw, MessageCircle, Loader2,
  Hash, Globe,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AgentContext } from '@/hooks/useAgentContext';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';

interface AgentGrowthDashboardProps {
  context: AgentContext | null;
  onUpdate?: (updates: Partial<AgentContext>) => Promise<void>;
}

const GOAL_OPTIONS = [
  { value: 'growth', label: 'Seguidores', icon: Users, color: 'text-purple-500' },
  { value: 'reach', label: 'Alcance', icon: Eye, color: 'text-blue-500' },
  { value: 'authority', label: 'Autoridade', icon: Brain, color: 'text-amber-500' },
  { value: 'conversion', label: 'Conversão', icon: TrendingUp, color: 'text-emerald-500' },
];

const PERIOD_OPTIONS = [
  { value: 30, label: '30d' },
  { value: 60, label: '60d' },
  { value: 90, label: '90d' },
];

interface TopPost {
  id: string;
  caption: string;
  reach: number;
  impressions: number;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  shares_count: number;
  media_type: string | null;
  image_url: string | null;
  published_at: string | null;
  hashtags: string[] | null;
  post_type: string | null;
}

export default function AgentGrowthDashboard({ context, onUpdate }: AgentGrowthDashboardProps) {
  const [isAutoStrategy, setIsAutoStrategy] = useState(true);
  const [period, setPeriod] = useState(90);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [loadingTopPosts, setLoadingTopPosts] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { currentWorkspace } = useWorkspace();

  const periodLabel = `últimos ${period} dias`;

  // Sync from Instagram — single call, no loop
  const handleSync = async () => {
    setSyncing(true);
    toast.loading('Sincronizando métricas do Instagram...', { id: 'sync-ig' });
    try {
      const { data, error } = await supabase.functions.invoke('sync-instagram-metrics', {
        body: { offset: 0, batch_size: 50 }
      });
      if (error) throw error;
      
      const totalUpdated = data?.updated || 0;
      const totalDeleted = data?.deleted || 0;
      const hasMore = data?.has_more;
      
      // If there are more, do one more batch silently
      if (hasMore) {
        const { data: d2 } = await supabase.functions.invoke('sync-instagram-metrics', {
          body: { offset: data?.next_offset || 50, batch_size: 50 }
        });
        const u2 = d2?.updated || 0;
        const d2del = d2?.deleted || 0;
        toast.dismiss('sync-ig');
        toast.success(`${totalUpdated + u2} atualizados${totalDeleted + d2del > 0 ? `, ${totalDeleted + d2del} removidos` : ''}`);
      } else {
        toast.dismiss('sync-ig');
        const parts = [];
        if (totalUpdated > 0) parts.push(`${totalUpdated} atualizados`);
        if (totalDeleted > 0) parts.push(`${totalDeleted} removidos`);
        toast.success(parts.length > 0 ? parts.join(', ') : 'Tudo sincronizado!');
      }
      fetchTopPosts();
    } catch (e: any) {
      toast.dismiss('sync-ig');
      toast.error(e.message || 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const fetchTopPosts = async () => {
    if (!currentWorkspace?.id) return;
    setLoadingTopPosts(true);
    const since = new Date();
    since.setDate(since.getDate() - period);
    const { data } = await supabase
      .from('posts')
      .select('id, caption, reach, impressions, likes_count, comments_count, saves_count, shares_count, media_type, image_url, published_at, hashtags, post_type')
      .eq('workspace_id', currentWorkspace.id)
      .eq('status', 'published')
      .not('instagram_post_id', 'is', null)
      .gte('published_at', since.toISOString())
      .order('reach', { ascending: false })
      .limit(20);
    setTopPosts((data as TopPost[]) || []);
    setLoadingTopPosts(false);
  };

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    fetchTopPosts();
  }, [currentWorkspace?.id, period]);

  // Derived analytics from topPosts
  const totalLikes = topPosts.reduce((s, p) => s + (p.likes_count || 0), 0);
  const totalComments = topPosts.reduce((s, p) => s + (p.comments_count || 0), 0);
  const totalSaves = topPosts.reduce((s, p) => s + (p.saves_count || 0), 0);
  const totalReach = topPosts.reduce((s, p) => s + (p.reach || 0), 0);
  // impressions = per-post views from Instagram (plays for reels, impressions for posts)
  // Only use impressions when available, otherwise show reach as fallback
  const totalImpressions = topPosts.reduce((s, p) => s + (p.impressions || 0), 0);
  const totalViews = totalImpressions > totalReach ? totalImpressions : totalReach;
  const avgEngRate = totalReach > 0 ? ((totalLikes + totalComments + totalSaves) / totalReach) * 100 : 0;

  // Period-based goals (scaled from monthly base)
  const GOALS: Record<number, { views: number; likes: number; saves: number; comments: number }> = {
    30: { views: 10000, likes: 500, saves: 200, comments: 100 },
    60: { views: 25000, likes: 1200, saves: 500, comments: 250 },
    90: { views: 50000, likes: 2500, saves: 1000, comments: 500 },
  };
  const goals = GOALS[period] || GOALS[90];

  const viewsProgress = goals.views > 0 ? Math.min((totalViews / goals.views) * 100, 100) : 0;
  const likesProgress = goals.likes > 0 ? Math.min((totalLikes / goals.likes) * 100, 100) : 0;
  const savesProgress = goals.saves > 0 ? Math.min((totalSaves / goals.saves) * 100, 100) : 0;
  const commentsProgress = goals.comments > 0 ? Math.min((totalComments / goals.comments) * 100, 100) : 0;

  // Content strategy
  const totalContent = (context?.content_distribution_videos || 3) + 
    (context?.content_distribution_carousels || 2) + 
    (context?.content_distribution_news || 4) + 
    (context?.content_distribution_images || 5);
  
  const reelsPercent = Math.round(((context?.content_distribution_videos || 3) / totalContent) * 100);
  const carouselPercent = Math.round(((context?.content_distribution_carousels || 2) / totalContent) * 100);
  const newsPercent = Math.round(((context?.content_distribution_news || 4) / totalContent) * 100);
  const imagesPercent = Math.round(((context?.content_distribution_images || 5) / totalContent) * 100);

  // Best hashtags from top posts
  const hashtagMap: Record<string, number> = {};
  topPosts.forEach(p => {
    (p.hashtags || []).forEach(h => {
      hashtagMap[h] = (hashtagMap[h] || 0) + 1;
    });
  });
  const bestHashtags = Object.entries(hashtagMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);

  const getStrategyReason = () => {
    if (context?.success_patterns && context.success_patterns.length > 0) return context.success_patterns[0];
    if (reelsPercent >= 40) return 'Reels estão gerando maior alcance orgânico no momento.';
    if (newsPercent >= 40) return 'Conteúdo informativo está gerando mais salvamentos.';
    return 'Distribuição balanceada para maximizar diferentes métricas.';
  };

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div className="space-y-4 pb-4">
      {/* 0. Sync Bar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Crescimento & Analytics</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {PERIOD_OPTIONS.map(p => (
                <Button
                  key={p.value}
                  variant={period === p.value ? "default" : "ghost"}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[10px]"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Sincronizar
            </Button>
          </div>
        </div>
      </motion.div>

      {/* 1. KPI Cards */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <KPICard icon={<Eye className="h-4 w-4 text-blue-500" />} label="Visualizações" value={formatNumber(totalViews)} sub={periodLabel} />
          <KPICard icon={<Users className="h-4 w-4 text-emerald-500" />} label="Alcance" value={formatNumber(totalReach)} sub={`${avgEngRate.toFixed(1)}% eng`} />
          <KPICard icon={<Heart className="h-4 w-4 text-red-500" />} label="Curtidas" value={formatNumber(totalLikes)} />
          <KPICard icon={<Bookmark className="h-4 w-4 text-amber-500" />} label="Salvamentos" value={formatNumber(totalSaves)} />
          <KPICard icon={<Share2 className="h-4 w-4 text-purple-500" />} label="Compartilh." value={formatNumber(topPosts.reduce((s, p) => s + (p.shares_count || 0), 0))} />
        </div>
      </motion.div>

      {/* 2. All priorities active */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <Card className="border-primary/20 overflow-hidden">
          <div className="h-1 w-full neural-gradient" />
          <CardContent className="p-3 space-y-2">
            <div className="grid grid-cols-4 gap-1.5">
              {GOAL_OPTIONS.map((goal) => (
                <div key={goal.value} className="flex items-center gap-1.5 p-2 rounded-lg border border-primary/30 bg-primary/5 text-[10px]">
                  <goal.icon className={cn("h-3 w-3 shrink-0", goal.color)} />
                  <span className="font-medium truncate">{goal.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 3. Progress — dynamic per period */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Progresso — {periodLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProgressRow icon={<Eye className="h-3 w-3 text-blue-500" />} label="Alcance (Visualizações)" current={totalViews} goal={goals.views} progress={viewsProgress} />
            <ProgressRow icon={<Heart className="h-3 w-3 text-red-500" />} label="Curtidas" current={totalLikes} goal={goals.likes} progress={likesProgress} />
            <ProgressRow icon={<Bookmark className="h-3 w-3 text-amber-500" />} label="Salvamentos" current={totalSaves} goal={goals.saves} progress={savesProgress} />
            <ProgressRow icon={<MessageCircle className="h-3 w-3 text-primary" />} label="Comentários" current={totalComments} goal={goals.comments} progress={commentsProgress} />
          </CardContent>
        </Card>
      </motion.div>

      {/* 4. Strategy */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-4 w-4 text-amber-500" />
                Estratégia Atual
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{isAutoStrategy ? 'Auto' : 'Manual'}</span>
                <Switch checked={isAutoStrategy} onCheckedChange={setIsAutoStrategy} className="scale-75" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <StrategyBar icon={Video} label="Reels" percent={reelsPercent} color="bg-cyan-500" count={context?.content_distribution_videos || 3} />
              <StrategyBar icon={LayoutGrid} label="Carrossel" percent={carouselPercent} color="bg-purple-500" count={context?.content_distribution_carousels || 2} />
              <StrategyBar icon={Newspaper} label="Notícias" percent={newsPercent} color="bg-amber-500" count={context?.content_distribution_news || 4} />
              <StrategyBar icon={ImageIcon} label="Imagens" percent={imagesPercent} color="bg-pink-500" count={context?.content_distribution_images || 5} />
            </div>
            <div className="p-2.5 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
                {getStrategyReason()}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 5. Top Posts Ranking */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Top Posts — {periodLabel}
              {topPosts.length > 0 && <Badge variant="secondary" className="text-[10px]">{topPosts.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingTopPosts ? (
              <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">Carregando...</div>
            ) : topPosts.length === 0 ? (
              <div className="p-3 rounded-lg bg-muted/30 border text-center">
                <p className="text-xs text-muted-foreground">Nenhum post publicado no Instagram nos {periodLabel}. Clique em "Sincronizar" para importar.</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {topPosts.map((post, i) => {
                  const engagement = (post.likes_count || 0) + (post.comments_count || 0) + (post.saves_count || 0) + (post.shares_count || 0);
                  const engRate = post.reach > 0 ? ((engagement / post.reach) * 100).toFixed(1) : '0';
                  const mediaLabel = post.media_type === 'reels' || post.media_type === 'reel' ? 'Reel' 
                    : post.media_type === 'carousel' ? 'Carrossel' 
                    : post.media_type === 'video' ? 'Vídeo' : 'Imagem';
                  return (
                    <div key={post.id} className={cn(
                      "flex items-start gap-2 p-2 rounded-lg border transition-all",
                      i === 0 ? "bg-yellow-500/5 border-yellow-500/20" :
                      i === 1 ? "bg-muted/40 border-border/40" :
                      i === 2 ? "bg-orange-500/5 border-orange-500/10" :
                      "bg-card/50 border-border/30"
                    )}>
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5",
                        i === 0 ? "bg-yellow-500/20 text-yellow-500" :
                        i === 1 ? "bg-muted text-muted-foreground" :
                        i === 2 ? "bg-orange-500/20 text-orange-500" :
                        "bg-muted/50 text-muted-foreground"
                      )}>{i + 1}</div>
                      {post.image_url && <img src={post.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium line-clamp-1">{post.caption}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" /> {((post.impressions || post.reach || 0)).toLocaleString()} views</span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Heart className="h-2.5 w-2.5" /> {(post.likes_count || 0).toLocaleString()}</span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Bookmark className="h-2.5 w-2.5" /> {post.saves_count || 0}</span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Share2 className="h-2.5 w-2.5" /> {post.shares_count || 0}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1">{mediaLabel}</Badge>
                          <span className="text-[9px] text-emerald-500 font-medium">{engRate}% eng</span>
                          {post.published_at && <span className="text-[9px] text-muted-foreground/60">{new Date(post.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* 6. Best Hashtags */}
      {bestHashtags.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Hash className="h-4 w-4 text-primary" />
                Hashtags de Alto Desempenho
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {bestHashtags.map((tag, i) => (
                  <Badge key={tag} variant="secondary" className="text-xs" style={{ opacity: 1 - i * 0.07 }}>
                    #{tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Agent note */}
      {topPosts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
              O agente prioriza os dados de 90 dias para estratégia macro e considera os últimos 30 dias para ajustes táticos rápidos.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Sub-components ──

function KPICard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-3">
        <div className="flex items-center gap-2.5">
          {icon}
          <div>
            <p className="text-lg font-bold leading-none">{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
            {sub && <p className="text-[9px] text-emerald-500 font-medium">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressRow({ icon, label, current, goal, progress, prefix, suffix, decimal }: {
  icon: React.ReactNode; label: string; current: number; goal: number; progress: number; prefix?: string; suffix?: string; decimal?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">{icon} {label}</span>
        <span className="font-mono font-bold">
          {prefix}{decimal ? current.toFixed(1) : current.toLocaleString()}{suffix} <span className="text-muted-foreground font-normal">/ {prefix}{decimal ? goal.toFixed(1) : goal.toLocaleString()}{suffix}</span>
        </span>
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}

function StrategyBar({ icon: Icon, label, percent, color, count }: {
  icon: any; label: string; percent: number; color: string; count: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs font-mono w-10 text-right text-muted-foreground">{percent}%</span>
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">{count}/sem</Badge>
    </div>
  );
}
