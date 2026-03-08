import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { 
  Target, TrendingUp, Users, Eye, Brain, Lightbulb,
  Video, Newspaper, Image as ImageIcon, LayoutGrid,
  Zap, Sparkles, Calendar, BarChart3, ArrowUpRight, ArrowDownRight, Minus,
  Trophy, Heart, Bookmark, Share2, RefreshCw, MessageCircle, Loader2,
  Hash,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AgentContext } from '@/hooks/useAgentContext';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
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

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(190, 80%, 50%)',
  'hsl(280, 60%, 55%)',
  'hsl(45, 90%, 55%)',
  'hsl(340, 70%, 55%)',
];

interface StrategySnapshot {
  id: string;
  snapshot_date: string;
  goal_type: string | null;
  content_distribution_videos: number;
  content_distribution_carousels: number;
  content_distribution_news: number;
  content_distribution_images: number;
  total_reach: number;
  total_impressions: number;
  total_likes: number;
  total_comments: number;
  total_saves: number;
  total_shares: number;
  followers_count: number;
  avg_engagement: number;
  posts_count: number;
  strategy_reason: string | null;
  top_performing_type: string | null;
}

interface TopPost {
  id: string;
  caption: string;
  reach: number;
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
  const [period, setPeriod] = useState(30);
  const [snapshots, setSnapshots] = useState<StrategySnapshot[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [loadingTopPosts, setLoadingTopPosts] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { currentWorkspace } = useWorkspace();

  const goalViews = context?.goal_weekly_views || 10000;
  const goalFollowers = context?.goal_weekly_followers || 100;
  const goalEngagement = context?.goal_weekly_engagement || 5;
  const weeklyViews = context?.current_weekly_views || 0;
  const weeklyFollowers = context?.current_weekly_followers || 0;
  const weeklyEngagement = context?.current_weekly_engagement || 0;

  const viewsProgress = Math.min((weeklyViews / goalViews) * 100, 100);
  const followersProgress = Math.min((weeklyFollowers / goalFollowers) * 100, 100);
  const engagementProgress = Math.min((weeklyEngagement / goalEngagement) * 100, 100);

  const totalContent = (context?.content_distribution_videos || 3) + 
    (context?.content_distribution_carousels || 2) + 
    (context?.content_distribution_news || 4) + 
    (context?.content_distribution_images || 5);
  
  const reelsPercent = Math.round(((context?.content_distribution_videos || 3) / totalContent) * 100);
  const carouselPercent = Math.round(((context?.content_distribution_carousels || 2) / totalContent) * 100);
  const newsPercent = Math.round(((context?.content_distribution_news || 4) / totalContent) * 100);
  const imagesPercent = Math.round(((context?.content_distribution_images || 5) / totalContent) * 100);

  // Sync from Instagram
  const handleSync = async () => {
    setSyncing(true);
    try {
      let offset = 0;
      let totalUpdated = 0;
      let totalDeleted = 0;
      let hasMore = true;
      let batch = 0;
      while (hasMore && batch < 10) {
        batch++;
        toast.loading(`Sincronizando... ${offset} posts`, { id: 'sync-ig' });
        const { data, error } = await supabase.functions.invoke('sync-instagram-metrics', {
          body: { offset, batch_size: 30 }
        });
        if (error) throw error;
        totalUpdated += data?.updated || 0;
        totalDeleted += data?.deleted || 0;
        hasMore = data?.has_more || false;
        offset = data?.next_offset || 0;
      }
      toast.dismiss('sync-ig');
      const parts = [];
      if (totalDeleted > 0) parts.push(`${totalDeleted} removidos`);
      if (totalUpdated > 0) parts.push(`${totalUpdated} atualizados`);
      toast.success(parts.length > 0 ? parts.join(', ') : 'Tudo sincronizado!');
      fetchTopPosts();
      fetchSnapshots();
    } catch (e: any) {
      toast.dismiss('sync-ig');
      toast.error(e.message || 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const fetchSnapshots = async () => {
    if (!currentWorkspace?.id) return;
    setLoadingSnapshots(true);
    const since = new Date();
    since.setDate(since.getDate() - period);
    const { data } = await supabase
      .from('agent_strategy_snapshots' as any)
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .gte('snapshot_date', since.toISOString().split('T')[0])
      .order('snapshot_date', { ascending: true });
    setSnapshots((data as any[]) || []);
    setLoadingSnapshots(false);
  };

  const fetchTopPosts = async () => {
    if (!currentWorkspace?.id) return;
    setLoadingTopPosts(true);
    const since = new Date();
    since.setDate(since.getDate() - period);
    const { data } = await supabase
      .from('posts')
      .select('id, caption, reach, likes_count, comments_count, saves_count, shares_count, media_type, image_url, published_at, hashtags, post_type')
      .eq('workspace_id', currentWorkspace.id)
      .eq('status', 'published')
      .not('instagram_post_id', 'is', null)
      .gt('reach', 10)
      .gte('published_at', since.toISOString())
      .order('reach', { ascending: false })
      .limit(15);
    setTopPosts((data as TopPost[]) || []);
    setLoadingTopPosts(false);
  };

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    fetchSnapshots();
    fetchTopPosts();
  }, [currentWorkspace?.id, period]);

  // Derived analytics from topPosts
  const totalLikes = topPosts.reduce((s, p) => s + (p.likes_count || 0), 0);
  const totalComments = topPosts.reduce((s, p) => s + (p.comments_count || 0), 0);
  const totalSaves = topPosts.reduce((s, p) => s + (p.saves_count || 0), 0);
  const totalReach = topPosts.reduce((s, p) => s + (p.reach || 0), 0);
  const totalShares = topPosts.reduce((s, p) => s + (p.shares_count || 0), 0);
  const avgEngRate = totalReach > 0 ? ((totalLikes + totalComments + totalSaves) / totalReach) * 100 : 0;

  // Post type distribution for pie chart
  const typeDistribution = topPosts.reduce<Record<string, number>>((acc, p) => {
    const t = p.media_type === 'reels' || p.media_type === 'reel' ? 'Reels'
      : p.media_type === 'carousel' ? 'Carrossel'
      : p.media_type === 'video' ? 'Vídeo' : 'Imagem';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(typeDistribution).map(([name, value]) => ({ name, value }));

  // Best hashtags
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

  const insights = context?.success_patterns?.slice(0, 3) || [];
  const topTopics = context?.top_topics?.slice(0, 3) || [];

  const chartData = snapshots.map(s => ({
    date: new Date(s.snapshot_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    reach: s.total_reach,
    followers: s.followers_count,
    engagement: Number(s.avg_engagement),
    likes: s.total_likes,
    saves: s.total_saves,
  }));

  const getTrend = (key: 'followers' | 'reach' | 'engagement') => {
    if (snapshots.length < 2) return { direction: 'neutral' as const, value: 0 };
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const diff = key === 'followers' ? last.followers_count - first.followers_count
      : key === 'reach' ? last.total_reach - first.total_reach
      : Number(last.avg_engagement) - Number(first.avg_engagement);
    return { direction: diff > 0 ? 'up' as const : diff < 0 ? 'down' as const : 'neutral' as const, value: Math.abs(diff) };
  };

  const followersTrend = getTrend('followers');
  const reachTrend = getTrend('reach');
  const engagementTrend = getTrend('engagement');

  const TrendIcon = ({ direction }: { direction: 'up' | 'down' | 'neutral' }) => {
    if (direction === 'up') return <ArrowUpRight className="h-3 w-3 text-emerald-500" />;
    if (direction === 'down') return <ArrowDownRight className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  const strategyChanges = snapshots.reduce<Array<{date: string; videos: number; carousels: number; news: number; images: number; reason: string | null; topType: string | null}>>((acc, s, i) => {
    if (i === 0 || 
      s.content_distribution_videos !== snapshots[i-1].content_distribution_videos ||
      s.content_distribution_carousels !== snapshots[i-1].content_distribution_carousels ||
      s.content_distribution_news !== snapshots[i-1].content_distribution_news ||
      s.content_distribution_images !== snapshots[i-1].content_distribution_images
    ) {
      acc.push({
        date: new Date(s.snapshot_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        videos: s.content_distribution_videos,
        carousels: s.content_distribution_carousels,
        news: s.content_distribution_news,
        images: s.content_distribution_images,
        reason: s.strategy_reason,
        topType: s.top_performing_type,
      });
    }
    return acc;
  }, []);

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

      {/* 1. KPI Cards — Real Instagram Metrics */}
      {topPosts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KPICard icon={<Heart className="h-4 w-4 text-red-500" />} label="Curtidas" value={formatNumber(totalLikes)} />
            <KPICard icon={<MessageCircle className="h-4 w-4 text-primary" />} label="Comentários" value={formatNumber(totalComments)} />
            <KPICard icon={<Bookmark className="h-4 w-4 text-amber-500" />} label="Salvamentos" value={formatNumber(totalSaves)} />
            <KPICard icon={<Eye className="h-4 w-4 text-emerald-500" />} label="Alcance" value={formatNumber(totalReach)} sub={`${avgEngRate.toFixed(1)}% eng`} />
          </div>
        </motion.div>
      )}

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

      {/* 3. Weekly Progress */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Progresso Semanal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProgressRow icon={<Eye className="h-3 w-3 text-blue-500" />} label="Alcance" current={weeklyViews} goal={goalViews} progress={viewsProgress} />
            <ProgressRow icon={<Users className="h-3 w-3 text-purple-500" />} label="Seguidores" current={weeklyFollowers} goal={goalFollowers} progress={followersProgress} prefix="+" />
            <ProgressRow icon={<TrendingUp className="h-3 w-3 text-emerald-500" />} label="Engajamento" current={weeklyEngagement} goal={goalEngagement} progress={engagementProgress} suffix="%" decimal />
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

      {/* 5. Post Type Distribution (from Analytics) + Evolution Chart */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              Evolução & Distribuição
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingSnapshots ? (
              <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">Carregando...</div>
            ) : snapshots.length === 0 && topPosts.length === 0 ? (
              <div className="p-4 rounded-lg bg-muted/30 border text-center">
                <Calendar className="h-6 w-6 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">
                  Sem dados ainda. Clique em "Sincronizar" para importar métricas do Instagram.
                </p>
              </div>
            ) : (
              <>
                {/* Trend Cards */}
                <div className="grid grid-cols-3 gap-2">
                  <TrendCard icon={<Users className="h-3 w-3 text-purple-500" />} label="Seguidores" value={snapshots.length > 0 ? snapshots[snapshots.length - 1]?.followers_count?.toLocaleString() || '0' : '—'} trend={followersTrend} TrendIcon={TrendIcon} />
                  <TrendCard icon={<Eye className="h-3 w-3 text-blue-500" />} label="Alcance" value={snapshots.length > 0 ? formatNumber(snapshots[snapshots.length - 1]?.total_reach || 0) : '—'} trend={reachTrend} TrendIcon={TrendIcon} formatValue={(v) => formatNumber(v)} />
                  <TrendCard icon={<TrendingUp className="h-3 w-3 text-emerald-500" />} label="Engage" value={snapshots.length > 0 ? `${Number(snapshots[snapshots.length - 1]?.avg_engagement || 0).toFixed(1)}%` : '—'} trend={engagementTrend} TrendIcon={TrendIcon} suffix="%" />
                </div>

                {/* Charts side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Reach line chart */}
                  {chartData.length > 1 && (
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="reachGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" width={30} />
                          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px' }} />
                          <Area type="monotone" dataKey="reach" stroke="hsl(var(--primary))" fill="url(#reachGrad)" strokeWidth={2} name="Alcance" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Pie chart — post type distribution */}
                  {pieData.length > 0 && (
                    <div className="h-32 flex items-center justify-center gap-3">
                      <div className="h-28 w-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={4} dataKey="value">
                              {pieData.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-col gap-1">
                        {pieData.map((entry, i) => (
                          <div key={entry.name} className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-[10px] text-muted-foreground">{entry.name} ({entry.value})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Strategy evolution timeline */}
                {strategyChanges.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Brain className="h-3 w-3" /> Evolução da Estratégia
                    </h4>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {strategyChanges.map((change, i) => {
                        const total = change.videos + change.carousels + change.news + change.images;
                        return (
                          <div key={i} className="p-2 rounded-lg bg-muted/30 border border-border/30">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-medium text-muted-foreground">{change.date}</span>
                              {change.topType && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                                  🏆 {change.topType === 'video' ? 'Reels' : change.topType === 'carousel' ? 'Carrossel' : change.topType === 'news' ? 'Notícias' : 'Imagens'}
                                </Badge>
                              )}
                            </div>
                            <div className="flex gap-1.5">
                              <MiniBar label="R" value={change.videos} total={total} color="bg-cyan-500" />
                              <MiniBar label="C" value={change.carousels} total={total} color="bg-purple-500" />
                              <MiniBar label="N" value={change.news} total={total} color="bg-amber-500" />
                              <MiniBar label="I" value={change.images} total={total} color="bg-pink-500" />
                            </div>
                            {change.reason && <p className="text-[9px] text-muted-foreground/70 mt-1 line-clamp-1">{change.reason}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* 6. Top Posts Ranking */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Top Posts
              {topPosts.length > 0 && <Badge variant="secondary" className="text-[10px]">{topPosts.length} posts</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingTopPosts ? (
              <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">Carregando...</div>
            ) : topPosts.length === 0 ? (
              <div className="p-3 rounded-lg bg-muted/30 border text-center">
                <p className="text-xs text-muted-foreground">Nenhum post com métricas reais nos últimos {period} dias.</p>
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
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" /> {post.reach.toLocaleString()}</span>
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

      {/* 7. Best Hashtags */}
      {bestHashtags.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
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

      {/* 8. Insights */}
      {(insights.length > 0 || topTopics.length > 0) && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                Insights do Agente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {insights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
                  <Zap className="h-3 w-3 text-yellow-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground/80">{insight}</p>
                </div>
              ))}
              {topTopics.length > 0 && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                  <TrendingUp className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground/80">Tópicos fortes: <strong>{topTopics.join(', ')}</strong></p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Agent self-improvement note */}
      {topPosts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
              O agente usa todos esses dados (KPIs, top posts, hashtags, distribuição) para ajustar a estratégia automaticamente e atingir o objetivo macro mais rápido.
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

function MiniBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] text-muted-foreground">{label}</span>
        <span className="text-[9px] font-mono">{value}</span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TrendCard({ icon, label, value, trend, TrendIcon, formatValue, suffix }: {
  icon: React.ReactNode; label: string; value: string;
  trend: { direction: 'up' | 'down' | 'neutral'; value: number };
  TrendIcon: React.FC<{ direction: 'up' | 'down' | 'neutral' }>;
  formatValue?: (v: number) => string; suffix?: string;
}) {
  const displayDiff = formatValue ? formatValue(trend.value) : (suffix ? `${trend.value.toFixed(1)}${suffix}` : trend.value.toLocaleString());
  return (
    <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
      <div className="flex items-center gap-1 mb-1">{icon}<span className="text-[10px] text-muted-foreground">{label}</span></div>
      <div className="flex items-center gap-1"><span className="text-sm font-bold font-mono">{value}</span><TrendIcon direction={trend.direction} /></div>
      <p className={cn("text-[10px] font-mono", trend.direction === 'up' ? 'text-emerald-500' : trend.direction === 'down' ? 'text-red-500' : 'text-muted-foreground')}>
        {trend.direction === 'up' ? '+' : trend.direction === 'down' ? '-' : ''}{displayDiff}
      </p>
    </div>
  );
}
