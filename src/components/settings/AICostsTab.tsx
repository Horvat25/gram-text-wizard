import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Loader2, DollarSign, TrendingUp, AlertTriangle, BarChart3, TrendingDown } from "lucide-react";

// Estimated costs per AI model call (USD)
const MODEL_COSTS: Record<string, number> = {
  'gemini-2.5-flash-lite': 0.002,
  'gemini-2.5-flash': 0.005,
  'gemini-2.5-flash-image': 0.02,
  'gemini-3-pro-image-preview': 0.08,
  'gemini-3-flash-preview': 0.01,
};

interface CostItem {
  label: string;
  calls: number;
  model: string;
  costPerCall: number;
}

// AI calls per post type (what the agent does for each)
const CALLS_PER_POST: Record<string, CostItem[]> = {
  'noticia|image': [
    { label: 'Decidir tema', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
    { label: 'Validar coerência', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
    { label: 'Gerar headline', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
    { label: 'Overlay na imagem', calls: 1, model: 'gemini-2.5-flash-image', costPerCall: 0.02 },
    { label: 'Gerar legenda', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
    { label: 'Revisar português', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
  ],
  'educacional|carousel': [
    { label: 'Decidir tema', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
    { label: 'Gerar conteúdo slides', calls: 1, model: 'gemini-2.5-flash', costPerCall: 0.005 },
    { label: 'Gerar imagens (3 slides)', calls: 3, model: 'gemini-2.5-flash-image', costPerCall: 0.02 },
    { label: 'Overlay em cada slide', calls: 3, model: 'gemini-2.5-flash-image', costPerCall: 0.02 },
    { label: 'Gerar legenda', calls: 1, model: 'gemini-2.5-flash', costPerCall: 0.005 },
    { label: 'Revisar português', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
  ],
  'noticia|carousel': [
    { label: 'Decidir tema', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
    { label: 'Gerar conteúdo slides', calls: 1, model: 'gemini-2.5-flash', costPerCall: 0.005 },
    { label: 'Gerar imagens (3 slides)', calls: 3, model: 'gemini-2.5-flash-image', costPerCall: 0.02 },
    { label: 'Overlay em cada slide', calls: 3, model: 'gemini-2.5-flash-image', costPerCall: 0.02 },
    { label: 'Gerar legenda', calls: 1, model: 'gemini-2.5-flash', costPerCall: 0.005 },
    { label: 'Revisar português', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
  ],
  'afiliado|image': [
    { label: 'Decidir tema', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
    { label: 'Gerar legenda marketing', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
    { label: 'Gerar imagem AI', calls: 1, model: 'gemini-2.5-flash-image', costPerCall: 0.02 },
    { label: 'Overlay headline', calls: 1, model: 'gemini-2.5-flash-image', costPerCall: 0.02 },
    { label: 'Revisar português', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
  ],
  'engajamento|image': [
    { label: 'Decidir tema', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
    { label: 'Gerar legenda', calls: 1, model: 'gemini-2.5-flash', costPerCall: 0.005 },
    { label: 'Gerar imagem AI', calls: 1, model: 'gemini-2.5-flash-image', costPerCall: 0.02 },
    { label: 'Watermark', calls: 1, model: 'gemini-2.5-flash-image', costPerCall: 0.02 },
    { label: 'Revisar português', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
  ],
  'entretenimento|reels': [
    { label: 'Decidir tema', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
    { label: 'Gerar roteiro', calls: 1, model: 'gemini-2.5-flash', costPerCall: 0.005 },
    { label: 'Queries de imagem', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
    { label: 'Revisar português', calls: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002 },
  ],
};

function getPostKey(postType: string, mediaType: string): string {
  const key = `${postType}|${mediaType}`;
  if (CALLS_PER_POST[key]) return key;
  if (mediaType === 'reels' || mediaType === 'video') return 'entretenimento|reels';
  if (mediaType === 'carousel') return 'educacional|carousel';
  return 'engajamento|image';
}

function calcPostCost(items: CostItem[]): number {
  return items.reduce((s, i) => s + i.calls * i.costPerCall, 0);
}

interface PostStat {
  post_type: string;
  media_type: string;
  count: number;
}

export function AICostsTab() {
  const { currentWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [stats30d, setStats30d] = useState<PostStat[]>([]);
  const [stats7d, setStats7d] = useState<PostStat[]>([]);
  const [chatMsgs, setChatMsgs] = useState(0);
  const [reports, setReports] = useState(0);

  useEffect(() => {
    if (!currentWorkspace?.id) return;

    const load = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
        const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();

        const [r30, r7, rChat, rReports] = await Promise.all([
          supabase.from('posts').select('post_type, media_type').eq('workspace_id', currentWorkspace!.id).gte('created_at', d30),
          supabase.from('posts').select('post_type, media_type').eq('workspace_id', currentWorkspace!.id).gte('created_at', d7),
          supabase.from('agent_chat_messages').select('id').eq('workspace_id', currentWorkspace!.id).eq('role', 'assistant').gte('created_at', d30),
          supabase.from('agent_execution_reports').select('id').eq('workspace_id', currentWorkspace!.id).gte('created_at', d30),
        ]);

        const agg = (data: any[]): PostStat[] => {
          const m = new Map<string, number>();
          for (const r of data || []) {
            const k = `${r.post_type}|${r.media_type}`;
            m.set(k, (m.get(k) || 0) + 1);
          }
          return Array.from(m.entries()).map(([k, count]) => {
            const [post_type, media_type] = k.split('|');
            return { post_type, media_type, count };
          });
        };

        setStats30d(agg(r30.data || []));
        setStats7d(agg(r7.data || []));
        setChatMsgs(rChat.data?.length || 0);
        setReports(rReports.data?.length || 0);
      } catch (e) {
        console.error('Error loading costs:', e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentWorkspace?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Calculate costs
  const postsCost30d = stats30d.reduce((total, s) => {
    const key = getPostKey(s.post_type, s.media_type);
    const items = CALLS_PER_POST[key] || CALLS_PER_POST['engajamento|image'];
    return total + calcPostCost(items) * s.count;
  }, 0);

  const postsCost7d = stats7d.reduce((total, s) => {
    const key = getPostKey(s.post_type, s.media_type);
    const items = CALLS_PER_POST[key] || CALLS_PER_POST['engajamento|image'];
    return total + calcPostCost(items) * s.count;
  }, 0);

  const chatCost = chatMsgs * 0.002; // gemini-2.5-flash-lite after optimization
  const reportsCost = reports * 0.002;
  const totalCost30d = postsCost30d + chatCost + reportsCost;
  const totalCost7d = postsCost7d + (chatCost / 4.3) + (reportsCost / 4.3); // weekly estimate
  const totalPosts30d = stats30d.reduce((s, p) => s + p.count, 0);

  const typeLabels: Record<string, string> = {
    'noticia': '📰 Notícias',
    'educacional': '📚 Carrossel Educacional',
    'afiliado': '💰 Marketing/Afiliado',
    'engajamento': '💬 Engajamento',
    'entretenimento': '🎬 Reels',
  };

  // Sort by cost descending
  const sortedStats = [...stats30d].sort((a, b) => {
    const keyA = getPostKey(a.post_type, a.media_type);
    const keyB = getPostKey(b.post_type, b.media_type);
    return (calcPostCost(CALLS_PER_POST[keyB] || []) * b.count) - (calcPostCost(CALLS_PER_POST[keyA] || []) * a.count);
  });

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-destructive" />
              Custo Total (30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">${totalCost30d.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{totalPosts30d} posts + {chatMsgs} msgs + {reports} relatórios</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Custo Semanal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">${totalCost7d.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Estimativa últimos 7 dias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-emerald-500" />
              Projeção Otimizada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-500">${(totalCost30d * 0.35).toFixed(2)}/mês</p>
            <p className="text-xs text-muted-foreground">Após otimizações aplicadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Top costs alert */}
      <Card className="border-amber-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Maiores Gastos Identificados
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span>💬 Chat com Agente ({chatMsgs} msgs)</span>
            <span className="font-bold text-destructive">${chatCost.toFixed(2)} ({totalCost30d > 0 ? ((chatCost/totalCost30d)*100).toFixed(0) : 0}%)</span>
          </div>
          {sortedStats.slice(0, 3).map((s) => {
            const key = getPostKey(s.post_type, s.media_type);
            const items = CALLS_PER_POST[key] || [];
            const cost = calcPostCost(items) * s.count;
            return (
              <div key={`${s.post_type}-${s.media_type}`} className="flex justify-between items-center py-1 border-b border-border/50">
                <span>{typeLabels[s.post_type] || s.post_type} ({s.count}x)</span>
                <span className="font-bold text-destructive">${cost.toFixed(2)} ({totalCost30d > 0 ? ((cost/totalCost30d)*100).toFixed(0) : 0}%)</span>
              </div>
            );
          })}
          <div className="flex justify-between items-center py-1">
            <span>📊 Relatórios Automáticos ({reports}x)</span>
            <span className="font-mono text-muted-foreground">${reportsCost.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown by type */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Detalhamento por Post (30 dias)
          </CardTitle>
          <CardDescription>Cada chamada de IA discriminada com modelo e custo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sortedStats.map((stat) => {
            const key = getPostKey(stat.post_type, stat.media_type);
            const items = CALLS_PER_POST[key] || CALLS_PER_POST['engajamento|image'];
            const perPost = calcPostCost(items);
            const total = perPost * stat.count;

            return (
              <div key={`${stat.post_type}-${stat.media_type}`} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{typeLabels[stat.post_type] || stat.post_type}</span>
                    <Badge variant="secondary">{stat.media_type}</Badge>
                    <Badge variant="outline">{stat.count}×</Badge>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">${total.toFixed(3)}</p>
                    <p className="text-xs text-muted-foreground">${perPost.toFixed(3)}/post</p>
                  </div>
                </div>
                <div className="space-y-1">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                        {item.label} {item.calls > 1 && `(×${item.calls})`}
                      </span>
                      <span className="font-mono">
                        ${(item.calls * item.costPerCall).toFixed(4)} · {item.model.replace('google/', '')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Model reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Referência de Custos por Modelo</CardTitle>
          <CardDescription>Custo estimado por chamada individual</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {Object.entries(MODEL_COSTS)
              .sort(([,a], [,b]) => b - a)
              .map(([model, cost]) => (
              <div key={model} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                <span className="font-mono text-xs">{model}</span>
                <Badge variant={cost >= 0.05 ? 'destructive' : cost >= 0.01 ? 'default' : 'secondary'}>
                  ${cost.toFixed(3)}/chamada
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}