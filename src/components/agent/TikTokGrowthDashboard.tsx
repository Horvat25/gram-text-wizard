import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, Users, Eye, Brain,
  Video, Sparkles, BarChart3,
  Trophy, Heart, Share2, RefreshCw, MessageCircle, Loader2,
  Hash, Play,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';

const PERIOD_OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 60, label: '60d' },
  { value: 90, label: '90d' },
];

interface TikTokPost {
  id: string;
  caption: string;
  reach: number;
  impressions: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  media_type: string | null;
  video_url: string | null;
  published_at: string | null;
  hashtags: string[] | null;
  post_type: string | null;
  tiktok_post_id: string | null;
}

export default function TikTokGrowthDashboard() {
  const [period, setPeriod] = useState(30);
  const [topPosts, setTopPosts] = useState<TikTokPost[]>([]);
  const [allPosts, setAllPosts] = useState<TikTokPost[]>([]);
  const [loading, setLoading] = useState(false);
  const { currentWorkspace } = useWorkspace();

  const periodLabel = `últimos ${period} dias`;

  const fetchTikTokPosts = async () => {
    if (!currentWorkspace?.id) return;
    setLoading(true);

    const since = new Date();
    since.setDate(since.getDate() - period);

    const { data } = await supabase
      .from('posts')
      .select('id, caption, reach, impressions, likes_count, comments_count, shares_count, media_type, video_url, published_at, hashtags, post_type, tiktok_post_id')
      .eq('workspace_id', currentWorkspace.id)
      .eq('status', 'published')
      .not('tiktok_post_id', 'is', null)
      .gte('published_at', since.toISOString())
      .order('published_at', { ascending: false })
      .limit(500);

    const posts = (data as TikTokPost[]) || [];
    setAllPosts(posts);

    const ranked = [...posts]
      .sort((a, b) => {
        const aEng = (a.likes_count || 0) + (a.comments_count || 0) + (a.shares_count || 0);
        const bEng = (b.likes_count || 0) + (b.comments_count || 0) + (b.shares_count || 0);
        return bEng - aEng;
      })
      .slice(0, 15);

    setTopPosts(ranked);
    setLoading(false);
  };

  useEffect(() => {
    if (currentWorkspace?.id) {
      void fetchTikTokPosts();
    }
  }, [currentWorkspace?.id, period]);

  // Derived metrics from TikTok posts
  const totalLikes = allPosts.reduce((s, p) => s + (p.likes_count || 0), 0);
  const totalComments = allPosts.reduce((s, p) => s + (p.comments_count || 0), 0);
  const totalShares = allPosts.reduce((s, p) => s + (p.shares_count || 0), 0);
  const totalViews = allPosts.reduce((s, p) => s + Math.max(p.impressions || 0, p.reach || 0), 0);
  const totalPosts = allPosts.length;
  const avgEngRate = totalViews > 0 ? ((totalLikes + totalComments + totalShares) / totalViews) * 100 : 0;

  const GOALS: Record<number, { views: number; likes: number; shares: number; comments: number }> = {
    7: { views: 5000, likes: 200, shares: 50, comments: 30 },
    30: { views: 20000, likes: 800, shares: 200, comments: 120 },
    60: { views: 50000, likes: 2000, shares: 500, comments: 300 },
    90: { views: 100000, likes: 5000, shares: 1200, comments: 700 },
  };
  const goals = GOALS[period] || GOALS[30];

  const viewsProgress = goals.views > 0 ? Math.min((totalViews / goals.views) * 100, 100) : 0;
  const likesProgress = goals.likes > 0 ? Math.min((totalLikes / goals.likes) * 100, 100) : 0;
  const sharesProgress = goals.shares > 0 ? Math.min((totalShares / goals.shares) * 100, 100) : 0;
  const commentsProgress = goals.comments > 0 ? Math.min((totalComments / goals.comments) * 100, 100) : 0;

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

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-500" />
            <span className="text-sm font-medium">Crescimento TikTok</span>
            <Badge variant="secondary" className="text-[10px]">{totalPosts} vídeos</Badge>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex gap-0.5 flex-1 sm:flex-initial">
              {PERIOD_OPTIONS.map(p => (
                <Button
                  key={p.value}
                  variant={period === p.value ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-7 text-xs px-2.5 flex-1 sm:flex-initial",
                    period === p.value && "bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-0"
                  )}
                  onClick={() => setPeriod(p.value)}
                  disabled={loading}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs shrink-0"
              onClick={fetchTikTokPosts}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Atualizar
            </Button>
          </div>
        </div>
      </motion.div>

      {/* KPIs */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KPICard icon={<Play className="h-4 w-4 text-cyan-500" />} label="Views" value={formatNumber(totalViews)} sub={periodLabel} />
          <KPICard icon={<Heart className="h-4 w-4 text-red-500" />} label="Curtidas" value={formatNumber(totalLikes)} sub={`${avgEngRate.toFixed(1)}% eng`} />
          <KPICard icon={<MessageCircle className="h-4 w-4 text-blue-500" />} label="Comentários" value={formatNumber(totalComments)} />
          <KPICard icon={<Share2 className="h-4 w-4 text-emerald-500" />} label="Compartilh." value={formatNumber(totalShares)} />
        </div>
      </motion.div>

      {/* Progress */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-cyan-500" />
              Progresso — {periodLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProgressRow icon={<Play className="h-3 w-3 text-cyan-500" />} label="Views" current={totalViews} goal={goals.views} progress={viewsProgress} />
            <ProgressRow icon={<Heart className="h-3 w-3 text-red-500" />} label="Curtidas" current={totalLikes} goal={goals.likes} progress={likesProgress} />
            <ProgressRow icon={<Share2 className="h-3 w-3 text-emerald-500" />} label="Compartilhamentos" current={totalShares} goal={goals.shares} progress={sharesProgress} />
            <ProgressRow icon={<MessageCircle className="h-3 w-3 text-blue-500" />} label="Comentários" current={totalComments} goal={goals.comments} progress={commentsProgress} />
          </CardContent>
        </Card>
      </motion.div>

      {/* TikTok Strategy Tips 2026 */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
        <Card className="border-cyan-500/20 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-cyan-500 to-pink-500" />
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-cyan-500" />
              Estratégia TikTok 2026
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <StrategyTip emoji="🎯" title="Hook em 1.5s" desc="Taxa de conclusão é o sinal #1 do algoritmo. Comece com impacto." />
              <StrategyTip emoji="🔄" title="Loop de rewatch" desc="Vídeos que fazem o viewer reassistir ganham boost exponencial." />
              <StrategyTip emoji="💬" title="Provocar debate" desc="Comentários pesam mais que likes. Faça perguntas provocativas." />
              <StrategyTip emoji="📐" title="3-7 segundos/cena" desc="Mantenha cortes rápidos. TikTok premia dinamismo visual." />
              <StrategyTip emoji="🏷️" title="3-5 hashtags" desc="Nicho + trending. Não exagere — o algoritmo lê o conteúdo." />
              <StrategyTip emoji="⏰" title="Poste 1-3x/dia" desc="Consistência > volume. Horários de pico: 12h, 18h, 21h BRT." />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Top Posts */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Top Vídeos — {periodLabel}
              {topPosts.length > 0 && <Badge variant="secondary" className="text-[10px]">{topPosts.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
              </div>
            ) : topPosts.length === 0 ? (
              <div className="p-4 rounded-lg bg-muted/30 border text-center space-y-2">
                <Video className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">
                  Nenhum vídeo publicado no TikTok nos {periodLabel}.
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  Publique vídeos pelo agente e as métricas aparecerão aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {topPosts.map((post, i) => {
                  const engagement = (post.likes_count || 0) + (post.comments_count || 0) + (post.shares_count || 0);
                  const views = Math.max(post.impressions || 0, post.reach || 0);
                  const engRate = views > 0 ? ((engagement / views) * 100).toFixed(1) : '0';
                  return (
                    <div key={post.id} className={cn(
                      "flex items-start gap-2 p-2 rounded-lg border transition-all",
                      i === 0 ? "bg-cyan-500/5 border-cyan-500/20" :
                      i === 1 ? "bg-muted/40 border-border/40" :
                      i === 2 ? "bg-pink-500/5 border-pink-500/10" :
                      "bg-card/50 border-border/30"
                    )}>
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5",
                        i === 0 ? "bg-cyan-500/20 text-cyan-500" :
                        i === 1 ? "bg-muted text-muted-foreground" :
                        i === 2 ? "bg-pink-500/20 text-pink-500" :
                        "bg-muted/50 text-muted-foreground"
                      )}>{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium line-clamp-1">{post.caption}</p>
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Play className="h-2.5 w-2.5" /> {views.toLocaleString()}</span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Heart className="h-2.5 w-2.5" /> {(post.likes_count || 0).toLocaleString()}</span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MessageCircle className="h-2.5 w-2.5" /> {post.comments_count || 0}</span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Share2 className="h-2.5 w-2.5" /> {post.shares_count || 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1">Vídeo</Badge>
                          <span className="text-[9px] text-cyan-500 font-medium">{engRate}% eng</span>
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

      {/* Hashtags */}
      {bestHashtags.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Hash className="h-4 w-4 text-cyan-500" />
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

      {/* Note */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
          <p className="text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3 inline mr-1 text-cyan-500" />
            As métricas do TikTok são baseadas nos posts publicados pela plataforma. Em modo Sandbox, os vídeos vão para rascunhos — publique manualmente no app TikTok.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// Sub-components

function KPICard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-3">
        <div className="flex items-center gap-2.5">
          {icon}
          <div>
            <p className="text-lg font-bold leading-none">{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
            {sub && <p className="text-[9px] text-cyan-500 font-medium">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressRow({ icon, label, current, goal, progress }: {
  icon: React.ReactNode; label: string; current: number; goal: number; progress: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">{icon} {label}</span>
        <span className="font-mono font-bold">
          {current.toLocaleString()} <span className="text-muted-foreground font-normal">/ {goal.toLocaleString()}</span>
        </span>
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}

function StrategyTip({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50">
      <p className="text-xs font-medium">{emoji} {title}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
    </div>
  );
}
