import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Loader2, DollarSign, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react";

interface CostBreakdown {
  label: string;
  callsPerPost: number;
  model: string;
  costPerCall: number;
  description: string;
}

// Estimated costs per AI call based on Lovable AI pricing
const AI_CALL_COSTS: Record<string, number> = {
  'gemini-2.5-flash-lite': 0.002,    // ~$0.002 per call (text only)
  'gemini-2.5-flash': 0.005,          // ~$0.005 per call (text)
  'gemini-2.5-flash-image': 0.02,     // ~$0.02 per call (image gen)
  'gemini-3-pro-image-preview': 0.08, // ~$0.08 per call (PRO image - EXPENSIVE!)
  'gemini-3.1-flash-image-preview': 0.03, // ~$0.03 per call
};

// What each post type costs in AI calls
const POST_TYPE_COSTS: Record<string, CostBreakdown[]> = {
  'noticia-image': [
    { label: 'Decidir tema', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Agente decide qual notícia postar' },
    { label: 'Validar coerência da imagem', callsPerPost: 1, model: 'gemini-2.5-flash', costPerCall: 0.005, description: 'Verifica se a imagem combina com a headline' },
    { label: 'Gerar headline', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Cria headline curta para overlay' },
    { label: 'Queimar headline na imagem', callsPerPost: 1, model: 'gemini-2.5-flash-image', costPerCall: 0.02, description: 'Aplica texto na imagem (apply-text-overlay)' },
    { label: 'Gerar legenda', callsPerPost: 1, model: 'gemini-2.5-flash', costPerCall: 0.005, description: 'Gera caption com fonte e link' },
    { label: 'Revisar português', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Corrige erros ortográficos' },
  ],
  'educacional-carousel': [
    { label: 'Decidir tema', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Agente decide o tema do carrossel' },
    { label: 'Gerar conteúdo carrossel', callsPerPost: 1, model: 'gemini-2.5-flash', costPerCall: 0.005, description: 'Cria slides com textos e prompts' },
    { label: 'Gerar imagens (3-5 slides)', callsPerPost: 4, model: 'gemini-2.5-flash-image', costPerCall: 0.02, description: 'Gera imagem para cada slide' },
    { label: 'Overlay texto em cada slide', callsPerPost: 4, model: 'gemini-2.5-flash-image', costPerCall: 0.02, description: 'Aplica headline em cada slide' },
    { label: 'Gerar legenda', callsPerPost: 1, model: 'gemini-2.5-flash', costPerCall: 0.005, description: 'Caption do carrossel' },
    { label: 'Revisar português', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Correção ortográfica' },
  ],
  'afiliado-image': [
    { label: 'Decidir tema', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Agente decide qual afiliado promover' },
    { label: 'Gerar legenda marketing', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Caption de vendas' },
    { label: 'Gerar imagem AI', callsPerPost: 1, model: 'gemini-2.5-flash-image', costPerCall: 0.02, description: 'Imagem de marketing sem texto' },
    { label: 'Overlay de headline', callsPerPost: 1, model: 'gemini-2.5-flash-image', costPerCall: 0.02, description: 'Aplica headline na imagem' },
    { label: 'Revisar português', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Correção ortográfica' },
  ],
  'engajamento-image': [
    { label: 'Decidir tema', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Tema de engajamento' },
    { label: 'Gerar legenda', callsPerPost: 1, model: 'gemini-2.5-flash', costPerCall: 0.005, description: 'Caption de engajamento' },
    { label: 'Gerar imagem AI', callsPerPost: 1, model: 'gemini-2.5-flash-image', costPerCall: 0.02, description: 'Imagem de opinião/reflexão' },
    { label: 'Watermark', callsPerPost: 1, model: 'gemini-2.5-flash-image', costPerCall: 0.02, description: 'Marca d\'água Neural Update' },
    { label: 'Revisar português', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Correção ortográfica' },
  ],
  'reels-video': [
    { label: 'Decidir tema', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Tema do reels' },
    { label: 'Gerar roteiro (4 cenas)', callsPerPost: 1, model: 'gemini-2.5-flash', costPerCall: 0.005, description: 'Script com 4 segmentos' },
    { label: 'Buscar imagens (queries)', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Gera queries de busca' },
    { label: 'TTS narração (4 cenas)', callsPerPost: 4, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Texto para fala por cena' },
    { label: 'Revisar português', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Correção do roteiro' },
  ],
  'agent-chat': [
    { label: 'Resposta do agente', callsPerPost: 1, model: 'gemini-2.5-flash', costPerCall: 0.005, description: 'Cada mensagem no chat com o agente' },
  ],
  'agent-report': [
    { label: 'Relatório de crescimento', callsPerPost: 1, model: 'gemini-2.5-flash-lite', costPerCall: 0.002, description: 'Relatório diário automático (2x/dia)' },
  ],
};

function getPostTypeCostKey(postType: string, mediaType: string): string {
  if (postType === 'noticia' && mediaType === 'image') return 'noticia-image';
  if (postType === 'educacional' && mediaType === 'carousel') return 'educacional-carousel';
  if (postType === 'afiliado') return 'afiliado-image';
  if (postType === 'engajamento') return 'engajamento-image';
  if (mediaType === 'reels' || mediaType === 'video') return 'reels-video';
  return 'engajamento-image'; // default
}

function calculatePostCost(breakdowns: CostBreakdown[]): number {
  return breakdowns.reduce((sum, b) => sum + (b.callsPerPost * b.costPerCall), 0);
}

interface PostStats {
  post_type: string;
  media_type: string;
  count: number;
}

export function AICostsTab() {
  const { currentWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [stats30d, setStats30d] = useState<PostStats[]>([]);
  const [stats7d, setStats7d] = useState<PostStats[]>([]);
  const [chatMessages, setChatMessages] = useState(0);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    loadStats();
  }, [currentWorkspace?.id]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [res30, res7, chatRes] = await Promise.all([
        supabase.from('posts').select('post_type, media_type').eq('workspace_id', currentWorkspace!.id).gte('created_at', d30),
        supabase.from('posts').select('post_type, media_type').eq('workspace_id', currentWorkspace!.id).gte('created_at', d7),
        supabase.from('agent_chat_messages').select('id').eq('workspace_id', currentWorkspace!.id).eq('role', 'assistant').gte('created_at', d30),
      ]);

      // Aggregate stats
      const aggregate = (data: any[]): PostStats[] => {
        const map = new Map<string, number>();
        for (const row of data || []) {
          const key = `${row.post_type}|${row.media_type}`;
          map.set(key, (map.get(key) || 0) + 1);
        }
        return Array.from(map.entries()).map(([key, count]) => {
          const [post_type, media_type] = key.split('|');
          return { post_type, media_type, count };
        });
      };

      setStats30d(aggregate(res30.data || []));
      setStats7d(aggregate(res7.data || []));
      setChatMessages(chatRes.data?.length || 0);
    } catch (err) {
      console.error('Error loading AI cost stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalCost = (stats: PostStats[]): number => {
    let total = 0;
    for (const stat of stats) {
      const key = getPostTypeCostKey(stat.post_type, stat.media_type);
      const breakdowns = POST_TYPE_COSTS[key] || POST_TYPE_COSTS['engajamento-image'];
      total += calculatePostCost(breakdowns) * stat.count;
    }
    // Add chat and report costs
    total += chatMessages * 0.005; // agent chat
    total += 60 * 0.002; // ~60 reports/month (2x/day)
    return total;
  };

  const totalCost30d = calculateTotalCost(stats30d);
  const totalCost7d = calculateTotalCost(stats7d);
  const totalPosts30d = stats30d.reduce((s, p) => s + p.count, 0);
  const totalPosts7d = stats7d.reduce((s, p) => s + p.count, 0);

  const postTypeLabels: Record<string, string> = {
    'noticia': '📰 Notícias',
    'educacional': '📚 Carrossel',
    'afiliado': '💰 Marketing',
    'engajamento': '💬 Engajamento',
    'entretenimento': '🎬 Reels',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-destructive" />
              Custo Estimado (30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">${totalCost30d.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{totalPosts30d} posts + {chatMessages} msgs chat</p>
          </CardContent>
        </Card>

        <Card className="border-warning/30 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-yellow-500" />
              Custo Estimado (7 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-500">${totalCost7d.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{totalPosts7d} posts na semana</p>
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Custo Médio por Post
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              ${totalPosts30d > 0 ? (totalCost30d / totalPosts30d).toFixed(3) : '0.000'}
            </p>
            <p className="text-xs text-muted-foreground">Média geral todos os tipos</p>
          </CardContent>
        </Card>
      </div>

      {/* Alert about expensive operations */}
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Operações Mais Caras
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• <strong>Geração de imagem</strong> (gemini-flash-image): ~$0.02/imagem</p>
          <p>• <strong>Carrosséis</strong> são os mais caros: 4 imagens + 4 overlays = ~$0.17/post</p>
          <p>• <strong>Reels</strong>: custo baixo (~$0.02) pois usam TTS e imagens reais</p>
          <p>• <strong>Chat com agente</strong>: ~$0.005/mensagem</p>
          <p>• <strong>Notícias com imagem real</strong>: ~$0.04/post (mais barato pois não gera imagem)</p>
        </CardContent>
      </Card>

      {/* Breakdown by post type */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Detalhamento por Tipo (30 dias)
          </CardTitle>
          <CardDescription>Custo estimado de IA por tipo de conteúdo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats30d
              .sort((a, b) => {
                const keyA = getPostTypeCostKey(a.post_type, a.media_type);
                const keyB = getPostTypeCostKey(b.post_type, b.media_type);
                const costA = calculatePostCost(POST_TYPE_COSTS[keyA] || []) * a.count;
                const costB = calculatePostCost(POST_TYPE_COSTS[keyB] || []) * b.count;
                return costB - costA;
              })
              .map((stat) => {
                const key = getPostTypeCostKey(stat.post_type, stat.media_type);
                const breakdowns = POST_TYPE_COSTS[key] || POST_TYPE_COSTS['engajamento-image'];
                const costPerPost = calculatePostCost(breakdowns);
                const totalCost = costPerPost * stat.count;
                const label = postTypeLabels[stat.post_type] || stat.post_type;

                return (
                  <div key={`${stat.post_type}-${stat.media_type}`} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{label}</span>
                        <Badge variant="secondary">{stat.media_type}</Badge>
                        <Badge variant="outline">{stat.count}x</Badge>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-destructive">${totalCost.toFixed(3)}</p>
                        <p className="text-xs text-muted-foreground">${costPerPost.toFixed(3)}/post</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {breakdowns.map((b, i) => (
                        <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-primary/40" />
                            {b.label} {b.callsPerPost > 1 && `(×${b.callsPerPost})`}
                          </span>
                          <span className="font-mono">
                            ${(b.callsPerPost * b.costPerCall).toFixed(3)} — {b.model}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

            {/* Chat costs */}
            {chatMessages > 0 && (
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">💬 Chat com Agente</span>
                    <Badge variant="outline">{chatMessages} msgs</Badge>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">${(chatMessages * 0.005).toFixed(3)}</p>
                    <p className="text-xs text-muted-foreground">$0.005/msg</p>
                  </div>
                </div>
              </div>
            )}

            {/* Reports costs */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">📊 Relatórios Automáticos</span>
                  <Badge variant="outline">~60/mês</Badge>
                </div>
                <div className="text-right">
                  <p className="font-bold text-muted-foreground">${(60 * 0.002).toFixed(3)}</p>
                  <p className="text-xs text-muted-foreground">$0.002/relatório</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost reference table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tabela de Custos por Modelo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {Object.entries(AI_CALL_COSTS).map(([model, cost]) => (
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