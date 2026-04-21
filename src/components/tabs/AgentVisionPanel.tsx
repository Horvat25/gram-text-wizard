import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, CheckCircle2, AlertCircle, Ban, TrendingUp, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { cn } from '@/lib/utils';

/**
 * Painel "Visão do Agente"
 *
 * Mostra ao usuário EXATAMENTE o que o ai-agent-core enxerga ao decidir o
 * próximo post: meta semanal por tipo (do agent_context) cruzada com o
 * progresso real desta semana (Brasília, Mon-Sun) calculado a partir de posts.
 * Espelha a lógica de getCompletionStats / weeklyProgress do edge function
 * para que o usuário valide a sincronia entre Teste / Crescimento / Agente.
 */

interface TypeRow {
  key: string;
  label: string;
  goal: number;
  done: number;
  failed: number;
  autoEnabled: boolean;
  note?: string;
}

export default function AgentVisionPanel() {
  const { currentWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TypeRow[]>([]);
  const [hasAffiliates, setHasAffiliates] = useState(false);
  const [autoPostEnabled, setAutoPostEnabled] = useState(false);
  const [weekRange, setWeekRange] = useState<string>('');
  const [topTypes, setTopTypes] = useState<{ type: string; avg: number }[]>([]);

  const [reloadKey, setReloadKey] = useState(0);

  // Listen to global sync events from Crescimento tab
  useEffect(() => {
    const handler = () => setReloadKey((k) => k + 1);
    window.addEventListener('horvat:metrics-synced', handler);
    return () => window.removeEventListener('horvat:metrics-synced', handler);
  }, []);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    let active = true;

    const load = async () => {
      setLoading(true);

      // 1. Brasília "now" + week boundaries (Mon-Sun) — same logic as agent
      const nowBrasilia = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }),
      );
      const day = nowBrasilia.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const weekStart = new Date(nowBrasilia);
      weekStart.setDate(nowBrasilia.getDate() + mondayOffset);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const fmt = (d: Date) =>
        `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
          .toString()
          .padStart(2, '0')}`;

      // 2. Fetch agent_context (goals + flags)
      const { data: ctx } = await supabase
        .from('agent_context')
        .select(
          'content_distribution_videos, content_distribution_carousels, content_distribution_news, content_distribution_news_video, content_distribution_images, content_distribution_marketing, auto_post_enabled',
        )
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();

      // 3. Fetch this week's posts
      const { data: weekPosts } = await supabase
        .from('posts')
        .select('media_type, post_type, status, likes_count, comments_count, saves_count, shares_count, reach')
        .eq('workspace_id', currentWorkspace.id)
        .gte('created_at', weekStart.toISOString());

      // 4. Active affiliates?
      const { data: affs } = await supabase
        .from('affiliate_links')
        .select('id')
        .eq('workspace_id', currentWorkspace.id)
        .eq('is_active', true)
        .limit(1);

      // 5. Top performing types (last 30 days, by avg engagement)
      const thirtyDaysAgo = new Date(nowBrasilia);
      thirtyDaysAgo.setDate(nowBrasilia.getDate() - 30);
      const { data: monthPosts } = await supabase
        .from('posts')
        .select('media_type, post_type, likes_count, comments_count, saves_count, shares_count')
        .eq('workspace_id', currentWorkspace.id)
        .eq('status', 'published')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (!active) return;

      // ----- mirror of getCompletionStats / weeklyProgress -----
      const isReels = (p: any) => p.media_type === 'reels' || p.media_type === 'video';
      const publishable = (weekPosts || []).filter(
        (p: any) => !(isReels(p) && p.status === 'draft') && p.status !== 'failed',
      );
      const failedAll = (weekPosts || []).filter((p: any) => p.status === 'failed');

      const countDone = (filter: (p: any) => boolean) => publishable.filter(filter).length;
      const countFailed = (filter: (p: any) => boolean) => failedAll.filter(filter).length;

      const goalImages = ctx?.content_distribution_images ?? 7;
      const goalNews = ctx?.content_distribution_news ?? 8;
      const goalCarousels = ctx?.content_distribution_carousels ?? 3;
      const goalVideos = ctx?.content_distribution_videos ?? 3;
      const goalNewsVideos = ctx?.content_distribution_news_video ?? 2;
      const goalMarketing = ctx?.content_distribution_marketing ?? 2;

      const buildRows: TypeRow[] = [
        {
          key: 'image',
          label: 'Imagem IA',
          goal: goalImages,
          done: countDone(
            (p) => p.media_type === 'image' && p.post_type !== 'noticia' && p.post_type !== 'afiliado',
          ),
          failed: countFailed(
            (p) => p.media_type === 'image' && p.post_type !== 'noticia' && p.post_type !== 'afiliado',
          ),
          autoEnabled: true,
        },
        {
          key: 'news',
          label: 'Notícia',
          goal: goalNews,
          done: countDone(
            (p) =>
              p.post_type === 'noticia' &&
              p.media_type !== 'carousel' &&
              !isReels(p),
          ),
          failed: countFailed(
            (p) =>
              p.post_type === 'noticia' &&
              p.media_type !== 'carousel' &&
              !isReels(p),
          ),
          autoEnabled: true,
        },
        {
          key: 'carousel',
          label: 'Carrossel',
          goal: goalCarousels,
          done: countDone((p) => p.media_type === 'carousel'),
          failed: countFailed((p) => p.media_type === 'carousel'),
          autoEnabled: true,
        },
        {
          key: 'video',
          label: 'Reels Criativo',
          goal: goalVideos,
          done: countDone((p) => isReels(p) && p.post_type !== 'noticia' && p.post_type !== 'afiliado'),
          failed: countFailed((p) => isReels(p) && p.post_type !== 'noticia' && p.post_type !== 'afiliado'),
          autoEnabled: false,
          note: 'Desligado do auto — só manual',
        },
        {
          key: 'news_video',
          label: 'Reels Notícia',
          goal: goalNewsVideos,
          done: countDone((p) => isReels(p) && p.post_type === 'noticia'),
          failed: countFailed((p) => isReels(p) && p.post_type === 'noticia'),
          autoEnabled: false,
          note: 'Desligado do auto — só manual',
        },
        {
          key: 'marketing',
          label: 'Marketing',
          goal: goalMarketing,
          done: countDone((p) => p.post_type === 'afiliado'),
          failed: countFailed((p) => p.post_type === 'afiliado'),
          autoEnabled: (affs?.length || 0) > 0,
          note: (affs?.length || 0) === 0 ? 'Sem links ativos' : undefined,
        },
      ];

      // top performing types (avg engagement) over 30d
      const engagementOf = (p: any) =>
        (p.likes_count || 0) + (p.comments_count || 0) * 2 + (p.saves_count || 0) * 3 + (p.shares_count || 0) * 4;
      const grouped: Record<string, number[]> = {};
      (monthPosts || []).forEach((p: any) => {
        const k = `${p.media_type}:${p.post_type}`;
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push(engagementOf(p));
      });
      const labelMap: Record<string, string> = {
        'image:noticia': 'Notícia',
        'image:engajamento': 'Imagem IA',
        'carousel:educacional': 'Carrossel',
        'reels:entretenimento': 'Reels Criativo',
        'reels:noticia': 'Reels Notícia',
        'reels:video_curated': 'Reels Curado',
        'image:afiliado': 'Marketing Imagem',
        'reels:afiliado': 'Marketing Vídeo',
      };
      const top = Object.entries(grouped)
        .map(([k, arr]) => ({
          type: labelMap[k] || k,
          avg: arr.reduce((a, b) => a + b, 0) / arr.length,
        }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 3);

      setRows(buildRows);
      setHasAffiliates((affs?.length || 0) > 0);
      setAutoPostEnabled(!!ctx?.auto_post_enabled);
      setWeekRange(`${fmt(weekStart)} – ${fmt(new Date(weekEnd.getTime() - 1))}`);
      setTopTypes(top);
      setLoading(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [currentWorkspace?.id]);

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-4 text-xs text-muted-foreground">Carregando visão do agente…</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-primary" />
            Visão do Agente
            <Badge variant="secondary" className="text-[10px]">Semana {weekRange}</Badge>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge
              variant={autoPostEnabled ? 'default' : 'outline'}
              className="text-[10px]"
            >
              Auto-post {autoPostEnabled ? 'ON' : 'OFF'}
            </Badge>
            <Badge
              variant={hasAffiliates ? 'default' : 'outline'}
              className="text-[10px]"
            >
              Afiliados {hasAffiliates ? 'ON' : 'OFF'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          O que o agente vê agora ao decidir o próximo post — meta da aba Teste × o que já foi feito esta semana (Brasília, segunda a domingo).
        </p>

        <div className="space-y-1.5">
          {rows.map((r) => {
            const pct = r.goal > 0 ? Math.min(100, Math.round((r.done / r.goal) * 100)) : 0;
            const remaining = Math.max(0, r.goal - r.done);
            return (
              <div
                key={r.key}
                className="rounded-md border border-border/50 bg-muted/20 p-2"
              >
                <div className="flex items-center gap-2">
                  {r.autoEnabled ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <Ban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-xs font-medium flex-1 truncate">{r.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {r.done}/{r.goal}
                  </span>
                  <span className="text-[10px] font-mono w-9 text-right">
                    {pct}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      pct >= 100
                        ? 'bg-emerald-500'
                        : pct >= 50
                        ? 'bg-amber-500'
                        : 'bg-rose-500',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  {r.autoEnabled ? (
                    <span>Faltam <strong className="text-foreground">{remaining}</strong> esta semana</span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {r.note || 'Indisponível para auto'}
                    </span>
                  )}
                  {r.failed > 0 && (
                    <Badge variant="destructive" className="text-[9px] py-0 px-1 h-3.5">
                      {r.failed} falha{r.failed > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {topTypes.length > 0 && (
          <div className="rounded-md border border-border/50 bg-muted/30 p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[11px] font-semibold">Top performance (30d)</span>
            </div>
            <div className="space-y-1">
              {topTypes.map((t, i) => (
                <div key={t.type} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    #{i + 1} {t.type}
                  </span>
                  <span className="font-mono">{t.avg.toFixed(1)} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 flex items-start gap-2">
          <Target className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Como o agente decide:</strong> escolhe o tipo com menor % de conclusão entre os habilitados (auto-rotação). Reels só geram via "Gerar" manual nesta aba. Marketing só entra quando há link afiliado ativo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
