import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { TrendingUp, Heart, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';

interface WeeklyEvolutionChartsProps {
  workspaceId?: string | null;
  period?: number;
}

interface PostRow {
  published_at: string | null;
  reach: number | null;
  impressions: number | null;
  likes_count: number | null;
  comments_count: number | null;
  saves_count: number | null;
  shares_count: number | null;
  media_type: string | null;
  post_type: string | null;
}

interface WeeklyData {
  week: string;
  weekLabel: string;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  posts: number;
  reels: number;
  newsReels: number;
  carousels: number;
  news: number;
  images: number;
  marketingImg: number;
  marketingVideo: number;
}

function getWeekStart(dateString: string) {
  const d = new Date(dateString);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function classifyPost(post: PostRow) {
  const mediaType = (post.media_type || '').toLowerCase();
  const postType = (post.post_type || '').toLowerCase();

  if (postType === 'afiliado' || postType.includes('marketing') || postType === 'vendas') {
    return mediaType === 'video' || mediaType === 'reel' || mediaType === 'reels'
      ? 'marketingVideo'
      : 'marketingImg';
  }

  if (postType === 'video_curated') return 'newsReels';

  if ((mediaType === 'video' || mediaType === 'reel' || mediaType === 'reels') && (postType === 'noticia' || postType === 'notícia' || postType === 'news')) {
    return 'newsReels';
  }

  if (mediaType === 'video' || mediaType === 'reel' || mediaType === 'reels') {
    return 'reels';
  }

  if (mediaType === 'carousel' || mediaType === 'carousel_album') {
    return 'carousels';
  }

  if (postType === 'noticia' || postType === 'notícia' || postType === 'news') {
    return 'news';
  }

  return 'images';
}

function aggregateByWeek(posts: PostRow[]): WeeklyData[] {
  const weekMap: Record<string, WeeklyData> = {};

  for (const post of posts) {
    if (!post.published_at) continue;
    const week = getWeekStart(post.published_at);
    if (!weekMap[week]) {
      const d = new Date(week);
      weekMap[week] = {
        week,
        weekLabel: `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`,
        reach: 0,
        impressions: 0,
        likes: 0,
        comments: 0,
        saves: 0,
        shares: 0,
        posts: 0,
        reels: 0,
        newsReels: 0,
        carousels: 0,
        news: 0,
        images: 0,
        marketingImg: 0,
        marketingVideo: 0,
      };
    }

    const item = weekMap[week];
    item.reach += post.reach || 0;
    item.impressions += post.impressions || 0;
    item.likes += post.likes_count || 0;
    item.comments += post.comments_count || 0;
    item.saves += post.saves_count || 0;
    item.shares += post.shares_count || 0;
    item.posts += 1;
    item[classifyPost(post)] += 1;
  }

  return Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week));
}

function formatK(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function getTrend(data: WeeklyData[], key: keyof WeeklyData): { direction: 'up' | 'down' | 'flat'; pct: number } {
  if (data.length < 2) return { direction: 'flat', pct: 0 };
  const prev = data[data.length - 2][key] as number;
  const curr = data[data.length - 1][key] as number;
  if (prev === 0) return { direction: curr > 0 ? 'up' : 'flat', pct: 0 };
  const pct = Math.round(((curr - prev) / prev) * 100);
  return { direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat', pct: Math.abs(pct) };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-2 shadow-lg text-xs">
      <p className="font-medium text-foreground mb-1">Semana de {label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} className="flex items-center gap-1.5" style={{ color: entry.color }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="font-mono font-bold">{formatK(entry.value)}</span>
        </p>
      ))}
    </div>
  );
};

export default function WeeklyEvolutionCharts({ workspaceId, period = 90 }: WeeklyEvolutionChartsProps) {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - period);

      const { data } = await supabase
        .from('posts')
        .select('published_at, reach, impressions, likes_count, comments_count, saves_count, shares_count, media_type, post_type')
        .eq('workspace_id', workspaceId)
        .eq('status', 'published')
        .not('instagram_post_id', 'is', null)
        .gte('published_at', since.toISOString())
        .order('published_at', { ascending: true });

      setPosts((data as PostRow[]) || []);
      setLoading(false);
    };

    load();
  }, [workspaceId, period]);

  const weeklyData = useMemo(() => aggregateByWeek(posts), [posts]);

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-4 flex items-center justify-center h-40">
          <p className="text-xs text-muted-foreground animate-pulse">Carregando gráficos...</p>
        </CardContent>
      </Card>
    );
  }

  if (weeklyData.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="text-center py-6">
              <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                Nenhum post publicado do Instagram encontrado nos últimos {period} dias.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const reachTrend = getTrend(weeklyData, 'reach');
  const likesTrend = getTrend(weeklyData, 'likes');
  const savesTrend = getTrend(weeklyData, 'saves');

  return (
    <div className="space-y-3">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-primary" />
                Evolução Semanal — Alcance ({period}d)
              </span>
              <Badge variant="outline" className="text-[10px]">
                {reachTrend.direction === 'up' ? '▲' : reachTrend.direction === 'down' ? '▼' : '—'} {reachTrend.pct}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-1 pb-2">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={weeklyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="reachGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tickFormatter={formatK} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="reach" name="Alcance" stroke="hsl(var(--primary))" fill="url(#reachGrad)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--primary))' }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <Heart className="h-4 w-4 text-primary" />
                Engajamento Semanal ({period}d)
              </span>
              <div className="flex gap-1.5">
                <Badge variant="outline" className="text-[10px]">❤️ {likesTrend.direction === 'up' ? '▲' : likesTrend.direction === 'down' ? '▼' : '—'}{likesTrend.pct}%</Badge>
                <Badge variant="outline" className="text-[10px]">💾 {savesTrend.direction === 'up' ? '▲' : savesTrend.direction === 'down' ? '▼' : '—'}{savesTrend.pct}%</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-1 pb-2">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={weeklyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tickFormatter={formatK} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '10px' }} iconType="circle" iconSize={6} />
                <Area type="monotone" dataKey="likes" name="Curtidas" stroke="hsl(var(--destructive))" fillOpacity={0} strokeWidth={2} dot={{ r: 2 }} />
                <Area type="monotone" dataKey="saves" name="Salvamentos" stroke="hsl(var(--accent-foreground))" fillOpacity={0} strokeWidth={2} dot={{ r: 2 }} />
                <Area type="monotone" dataKey="shares" name="Compartilh." stroke="hsl(var(--muted-foreground))" fillOpacity={0} strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <BarChart3 className="h-4 w-4 text-primary" />
              Mix de Conteúdo Semanal
              <Badge variant="secondary" className="text-[10px]">7 tipos</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-1 pb-2">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={weeklyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '9px' }} iconType="circle" iconSize={6} />
                <Bar dataKey="reels" name="Reels Criativos" fill="#8b5cf6" stackId="a" />
                <Bar dataKey="newsReels" name="Reels Notícia" fill="#10b981" stackId="a" />
                <Bar dataKey="carousels" name="Carrosséis" fill="#06b6d4" stackId="a" />
                <Bar dataKey="news" name="Notícias Img" fill="#f97316" stackId="a" />
                <Bar dataKey="images" name="Imagens IA" fill="#ec4899" stackId="a" />
                <Bar dataKey="marketingImg" name="Mkt Imagem" fill="#eab308" stackId="a" />
                <Bar dataKey="marketingVideo" name="Mkt Vídeo" fill="#ef4444" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export async function getWeeklyEvolutionSummary(workspaceId: string, period = 30): Promise<string> {
  const since = new Date();
  since.setDate(since.getDate() - period);

  const { data } = await supabase
    .from('posts')
    .select('published_at, reach, impressions, likes_count, comments_count, saves_count, shares_count, media_type, post_type')
    .eq('workspace_id', workspaceId)
    .eq('status', 'published')
    .not('instagram_post_id', 'is', null)
    .gte('published_at', since.toISOString())
    .order('published_at', { ascending: true });

  const weekly = aggregateByWeek((data as PostRow[]) || []);
  if (weekly.length < 2) return 'Dados insuficientes para análise de evolução semanal.';

  const curr = weekly[weekly.length - 1];
  const prev = weekly[weekly.length - 2];
  const delta = (c: number, p: number) => {
    if (p === 0) return c > 0 ? '+∞' : '0%';
    const pct = Math.round(((c - p) / p) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}%`;
  };

  return [
    `EVOLUÇÃO SEMANAL (${curr.weekLabel} vs ${prev.weekLabel}):`,
    `- Alcance: ${formatK(curr.reach)} (${delta(curr.reach, prev.reach)})`,
    `- Curtidas: ${formatK(curr.likes)} (${delta(curr.likes, prev.likes)})`,
    `- Salvamentos: ${formatK(curr.saves)} (${delta(curr.saves, prev.saves)})`,
    `- Compartilhamentos: ${formatK(curr.shares)} (${delta(curr.shares, prev.shares)})`,
    `- Posts: ${curr.posts} (${delta(curr.posts, prev.posts)})`,
    `- Mix: ${curr.reels} reels criativos, ${curr.newsReels} reels notícia, ${curr.carousels} carrosséis, ${curr.news} notícias img, ${curr.images} imagens IA, ${curr.marketingImg} mkt img, ${curr.marketingVideo} mkt vídeo`,
  ].join('\n');
}
