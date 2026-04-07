import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';
import { TrendingUp, Eye, Heart, Bookmark, Share2, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { motion } from 'framer-motion';

interface SnapshotRow {
  snapshot_date: string;
  total_reach: number;
  total_impressions: number;
  total_likes: number;
  total_comments: number;
  total_saves: number;
  total_shares: number;
  followers_count: number;
  avg_engagement: number;
  posts_count: number;
  content_distribution_videos: number;
  content_distribution_carousels: number;
  content_distribution_news: number;
  content_distribution_images: number;
  top_performing_type: string | null;
}

interface WeeklyData {
  week: string;
  weekLabel: string;
  reach: number;
  likes: number;
  saves: number;
  shares: number;
  comments: number;
  followers: number;
  engagement: number;
  posts: number;
  reels: number;
  newsReels: number;
  carousels: number;
  news: number;
  images: number;
  marketingImg: number;
  marketingVideo: number;
}

// Derive content mix from actual posts for a given week range
async function fetchPostsMixByWeek(workspaceId: string, since: Date): Promise<Record<string, { reels: number; newsReels: number; carousels: number; news: number; images: number; marketingImg: number; marketingVideo: number }>> {
  const { data } = await supabase
    .from('posts')
    .select('published_at, media_type, post_type')
    .eq('workspace_id', workspaceId)
    .eq('status', 'published')
    .gte('published_at', since.toISOString())
    .order('published_at', { ascending: true });

  const weekMap: Record<string, { reels: number; newsReels: number; carousels: number; news: number; images: number; marketingImg: number; marketingVideo: number }> = {};

  for (const row of data || []) {
    if (!row.published_at) continue;
    const d = new Date(row.published_at);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const key = monday.toISOString().slice(0, 10);

    if (!weekMap[key]) weekMap[key] = { reels: 0, newsReels: 0, carousels: 0, news: 0, images: 0, marketingImg: 0, marketingVideo: 0 };

    const mt = row.media_type || '';
    const pt = row.post_type || '';

    if (pt.includes('marketing') && (mt === 'video' || mt === 'reels' || mt === 'reel')) {
      weekMap[key].marketingVideo++;
    } else if (pt.includes('marketing')) {
      weekMap[key].marketingImg++;
    } else if ((mt === 'reels' || mt === 'reel' || mt === 'video') && (pt === 'news_video' || pt === 'noticia_video')) {
      weekMap[key].newsReels++;
    } else if (mt === 'reels' || mt === 'reel' || mt === 'video') {
      weekMap[key].reels++;
    } else if (mt === 'carousel' || mt === 'carousel_album') {
      weekMap[key].carousels++;
    } else if (pt === 'news' || pt === 'noticia' || pt === 'notícia') {
      weekMap[key].news++;
    } else {
      weekMap[key].images++;
    }
  }

  return weekMap;
}

function aggregateByWeek(snapshots: SnapshotRow[], postsMix?: Record<string, { reels: number; newsReels: number; carousels: number; news: number; images: number; marketingImg: number; marketingVideo: number }>): WeeklyData[] {
  const weekMap: Record<string, SnapshotRow[]> = {};

  for (const s of snapshots) {
    const d = new Date(s.snapshot_date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const key = monday.toISOString().slice(0, 10);
    if (!weekMap[key]) weekMap[key] = [];
    weekMap[key].push(s);
  }

  return Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, rows]) => {
      const lastRow = rows[rows.length - 1];
      const totalReach = rows.reduce((s, r) => s + (r.total_reach || 0), 0);
      const totalLikes = rows.reduce((s, r) => s + (r.total_likes || 0), 0);
      const totalSaves = rows.reduce((s, r) => s + (r.total_saves || 0), 0);
      const totalShares = rows.reduce((s, r) => s + (r.total_shares || 0), 0);
      const totalComments = rows.reduce((s, r) => s + (r.total_comments || 0), 0);
      const totalPosts = rows.reduce((s, r) => s + (r.posts_count || 0), 0);
      const avgEng = rows.length > 0
        ? rows.reduce((s, r) => s + (r.avg_engagement || 0), 0) / rows.length
        : 0;

      const d = new Date(weekStart);
      const weekLabel = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;

      // Use real posts mix data if available, otherwise fall back to snapshot columns
      const mix = postsMix?.[weekStart];

      return {
        week: weekStart,
        weekLabel,
        reach: totalReach,
        likes: totalLikes,
        saves: totalSaves,
        shares: totalShares,
        comments: totalComments,
        followers: lastRow.followers_count || 0,
        engagement: parseFloat(avgEng.toFixed(2)),
        posts: totalPosts,
        reels: mix?.reels ?? rows.reduce((s, r) => s + (r.content_distribution_videos || 0), 0),
        newsReels: mix?.newsReels ?? 0,
        carousels: mix?.carousels ?? rows.reduce((s, r) => s + (r.content_distribution_carousels || 0), 0),
        news: mix?.news ?? rows.reduce((s, r) => s + (r.content_distribution_news || 0), 0),
        images: mix?.images ?? rows.reduce((s, r) => s + (r.content_distribution_images || 0), 0),
        marketingImg: mix?.marketingImg ?? 0,
        marketingVideo: mix?.marketingVideo ?? 0,
      };
    });
}

// Also build weekly data from posts only (when no snapshots)
async function buildFromPosts(workspaceId: string, since: Date): Promise<WeeklyData[]> {
  const { data } = await supabase
    .from('posts')
    .select('published_at, media_type, post_type, reach, impressions, likes_count, comments_count, saves_count, shares_count')
    .eq('workspace_id', workspaceId)
    .eq('status', 'published')
    .gte('published_at', since.toISOString())
    .order('published_at', { ascending: true });

  if (!data || data.length === 0) return [];

  const weekMap: Record<string, any[]> = {};
  for (const row of data) {
    if (!row.published_at) continue;
    const d = new Date(row.published_at);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const key = monday.toISOString().slice(0, 10);
    if (!weekMap[key]) weekMap[key] = [];
    weekMap[key].push(row);
  }

  return Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, rows]) => {
      const d = new Date(weekStart);
      const weekLabel = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;

      let reels = 0, newsReels = 0, carousels = 0, news = 0, images = 0, marketingImg = 0, marketingVideo = 0;
      for (const row of rows) {
        const mt = row.media_type || '';
        const pt = row.post_type || '';
        if (pt.includes('marketing') && (mt === 'video' || mt === 'reels' || mt === 'reel')) marketingVideo++;
        else if (pt.includes('marketing')) marketingImg++;
        else if ((mt === 'reels' || mt === 'reel' || mt === 'video') && (pt === 'news_video' || pt === 'noticia_video')) newsReels++;
        else if (mt === 'reels' || mt === 'reel' || mt === 'video') reels++;
        else if (mt === 'carousel' || mt === 'carousel_album') carousels++;
        else if (pt === 'news' || pt === 'noticia' || pt === 'notícia') news++;
        else images++;
      }

      return {
        week: weekStart,
        weekLabel,
        reach: rows.reduce((s, r) => s + (r.reach || 0), 0),
        likes: rows.reduce((s, r) => s + (r.likes_count || 0), 0),
        saves: rows.reduce((s, r) => s + (r.saves_count || 0), 0),
        shares: rows.reduce((s, r) => s + (r.shares_count || 0), 0),
        comments: rows.reduce((s, r) => s + (r.comments_count || 0), 0),
        followers: 0,
        engagement: 0,
        posts: rows.length,
        reels, newsReels, carousels, news, images, marketingImg, marketingVideo,
      };
    });
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

export default function WeeklyEvolutionCharts() {
  const { currentWorkspace } = useWorkspace();
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    const load = async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 90);

      // Fetch snapshots and posts mix in parallel
      const [snapshotsRes, postsMix] = await Promise.all([
        supabase
          .from('agent_strategy_snapshots')
          .select('*')
          .eq('workspace_id', currentWorkspace.id)
          .gte('snapshot_date', since.toISOString().slice(0, 10))
          .order('snapshot_date', { ascending: true }),
        fetchPostsMixByWeek(currentWorkspace.id, since),
      ]);

      const snapshots = (snapshotsRes.data as SnapshotRow[]) || [];

      if (snapshots.length > 0) {
        // Use snapshots enriched with real posts mix
        setWeeklyData(aggregateByWeek(snapshots, postsMix));
      } else {
        // No snapshots — build entirely from posts
        const fromPosts = await buildFromPosts(currentWorkspace.id, since);
        setWeeklyData(fromPosts);
      }

      setLoading(false);
    };
    load();
  }, [currentWorkspace?.id]);

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-4 flex items-center justify-center h-40">
          <p className="text-xs text-muted-foreground animate-pulse">Carregando gráficos...</p>
        </CardContent>
      </Card>
    );
  }

  if (weeklyData.length < 2) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="text-center py-6">
              <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                Dados insuficientes para gráficos de evolução. Os gráficos aparecerão após 2+ semanas de posts publicados.
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
      {/* Reach Evolution */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Evolução Semanal — Alcance
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] ${reachTrend.direction === 'up' ? 'text-emerald-500 border-emerald-500/30' : reachTrend.direction === 'down' ? 'text-red-500 border-red-500/30' : 'text-muted-foreground'}`}
              >
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
                <Area
                  type="monotone"
                  dataKey="reach"
                  name="Alcance"
                  stroke="hsl(var(--primary))"
                  fill="url(#reachGrad)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Engagement Metrics */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <Heart className="h-4 w-4 text-red-500" />
                Engajamento Semanal
              </span>
              <div className="flex gap-1.5">
                <Badge
                  variant="outline"
                  className={`text-[10px] ${likesTrend.direction === 'up' ? 'text-red-500 border-red-500/30' : 'text-muted-foreground'}`}
                >
                  ❤️ {likesTrend.direction === 'up' ? '▲' : '▼'}{likesTrend.pct}%
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${savesTrend.direction === 'up' ? 'text-amber-500 border-amber-500/30' : 'text-muted-foreground'}`}
                >
                  💾 {savesTrend.direction === 'up' ? '▲' : '▼'}{savesTrend.pct}%
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-1 pb-2">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={weeklyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="likesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="savesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tickFormatter={formatK} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '10px' }}
                  iconType="circle"
                  iconSize={6}
                />
                <Area type="monotone" dataKey="likes" name="Curtidas" stroke="#ef4444" fill="url(#likesGrad)" strokeWidth={2} dot={{ r: 2 }} />
                <Area type="monotone" dataKey="saves" name="Salvamentos" stroke="#f59e0b" fill="url(#savesGrad)" strokeWidth={2} dot={{ r: 2 }} />
                <Area type="monotone" dataKey="shares" name="Compartilh." stroke="#a855f7" fill="none" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Content Mix per Week — all 7 types */}
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
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '9px' }} iconType="circle" iconSize={6} />
                <Bar dataKey="reels" name="Reels Criativos" fill="#8b5cf6" radius={[2, 2, 0, 0]} stackId="a" />
                <Bar dataKey="newsReels" name="Reels Notícia" fill="#10b981" stackId="a" />
                <Bar dataKey="carousels" name="Carrosséis" fill="#06b6d4" stackId="a" />
                <Bar dataKey="news" name="Notícias Img" fill="#f97316" stackId="a" />
                <Bar dataKey="images" name="Imagens IA" fill="#ec4899" stackId="a" />
                <Bar dataKey="marketingImg" name="Mkt Imagem" fill="#eab308" stackId="a" />
                <Bar dataKey="marketingVideo" name="Mkt Vídeo" fill="#ef4444" radius={[2, 2, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// Export the data fetcher for the agent to use
export async function getWeeklyEvolutionSummary(workspaceId: string): Promise<string> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [snapshotsRes, postsMix] = await Promise.all([
    supabase
      .from('agent_strategy_snapshots')
      .select('*')
      .eq('workspace_id', workspaceId)
      .gte('snapshot_date', since.toISOString().slice(0, 10))
      .order('snapshot_date', { ascending: true }),
    fetchPostsMixByWeek(workspaceId, since),
  ]);

  const snapshots = (snapshotsRes.data as SnapshotRow[]) || [];
  let weekly: WeeklyData[];

  if (snapshots.length > 0) {
    weekly = aggregateByWeek(snapshots, postsMix);
  } else {
    weekly = await buildFromPosts(workspaceId, since);
  }

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
    `- Seguidores: ${curr.followers}`,
  ].join('\n');
}
