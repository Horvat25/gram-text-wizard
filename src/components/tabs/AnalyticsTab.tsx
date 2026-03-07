import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Heart,
  MessageCircle,
  Bookmark,
  Eye,
  BarChart3,
  PieChart,
  Target,
  Zap,
  Users,
  Calendar,
  RefreshCw,
  Loader2,
  Lightbulb,
  Video,
  Image as ImageIcon,
  Hash,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from "recharts";
import { Post } from "@/hooks/usePosts";
import { useAnalytics } from "@/hooks/useAnalytics";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AnalyticsTabProps {
  posts: Post[];
  onRefresh?: () => void;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
];

const AnalyticsTab = ({ posts, onRefresh }: AnalyticsTabProps) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const { summary, topPosts, insights, postsWithMetrics, postsWithRealMetrics, nextPostRecommendation } = useAnalytics(posts);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Pie chart data for post types
  const postTypeData = useMemo(() => {
    return Object.entries(summary.performanceByType).map(([name, data]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: data.count,
      engagement: data.avgEngagement,
    }));
  }, [summary.performanceByType]);

  const handleSyncMetrics = async () => {
    setIsSyncing(true);
    let totalUpdated = 0;
    let totalDeleted = 0;
    let totalErrors: string[] = [];
    
    try {
      let offset = 0;
      const batchSize = 30;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke("sync-instagram-metrics", {
          body: { offset, batch_size: batchSize }
        });
        
        if (error) throw error;
        
        totalUpdated += data.updated || 0;
        totalDeleted += data.deleted || 0;
        if (data.errors) totalErrors = [...totalErrors, ...data.errors];
        
        hasMore = data.has_more === true;
        offset = data.next_offset || 0;
        
        if (hasMore) {
          toast.info(`Sincronizando... ${totalUpdated} posts processados`);
        }
      }
      
      let message = "";
      if (totalDeleted > 0) {
        message += `${totalDeleted} posts removidos. `;
      }
      if (totalUpdated > 0) {
        message += `${totalUpdated} posts sincronizados!`;
        toast.success(message || `${totalUpdated} posts sincronizados!`);
        onRefresh?.();
      } else if (totalDeleted > 0) {
        toast.success(message);
        onRefresh?.();
      } else if (totalErrors.length) {
        toast.warning(`Sincronização parcial: ${totalErrors.length} erros`);
      } else {
        toast.info("Nenhum post para sincronizar");
      }
    } catch (error: any) {
      console.error("Sync error:", error);
      if (totalUpdated > 0) {
        toast.warning(`Parcial: ${totalUpdated} sincronizados, mas houve erro`);
        onRefresh?.();
      } else {
        toast.error(error.message || "Erro ao sincronizar métricas");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  if (summary.publishedPosts === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analytics Completo</CardTitle>
          <CardDescription>Métricas e insights dos seus posts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-16 text-muted-foreground">
            <BarChart3 className="h-16 w-16 mx-auto mb-6 opacity-20" />
            <p className="text-xl mb-2">Nenhuma métrica ainda</p>
            <p className="text-sm max-w-md mx-auto mb-6">
              Publique posts no Instagram para ver análises detalhadas de
              performance, insights e recomendações personalizadas.
            </p>
            <Button 
              onClick={handleSyncMetrics} 
              disabled={isSyncing}
              className="bg-gradient-instagram text-white"
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Sincronizar do Instagram
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Sync Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold neural-gradient-text">Analytics</h2>
          <p className="text-muted-foreground">
            Métricas reais dos seus posts no Instagram
          </p>
          {postsWithRealMetrics > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Baseado em {postsWithRealMetrics} posts com métricas reais
            </p>
          )}
        </div>
        <Button 
          onClick={handleSyncMetrics} 
          disabled={isSyncing}
          className="bg-gradient-instagram text-white hover:opacity-90"
        >
          {isSyncing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Sincronizar do Instagram
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Posts</p>
                <p className="text-3xl font-bold">{summary.totalPosts}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {summary.publishedPosts} publicados
                </p>
              </div>
              <div className="p-3 rounded-full bg-primary/10">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-destructive/5 to-destructive/10 border-destructive/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Engajamento</p>
                <p className="text-3xl font-bold">
                  {summary.avgEngagement.toFixed(1)}%
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {summary.avgEngagement > 5 ? (
                    <TrendingUp className="h-3 w-3 text-success" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {summary.avgEngagement > 5 ? "Acima" : "Abaixo"} da média
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-full bg-destructive/10">
                <Target className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success/5 to-success/10 border-success/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alcance Total</p>
                <p className="text-3xl font-bold">
                  {formatNumber(summary.totalReach)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  pessoas alcançadas
                </p>
              </div>
              <div className="p-3 rounded-full bg-success/10">
                <Users className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-warning/5 to-warning/10 border-warning/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Melhor Tipo</p>
                <p className="text-2xl font-bold capitalize truncate">
                  {summary.bestPostType}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  maior engajamento
                </p>
              </div>
              <div className="p-3 rounded-full bg-warning/10">
                <Zap className="h-6 w-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 🎯 Next Post Recommendation - AI Powered */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Recomendação para Próximo Post
            <Badge 
              variant="outline" 
              className={
                nextPostRecommendation.confidence === "high" 
                  ? "bg-success/10 text-success border-success/30" 
                  : nextPostRecommendation.confidence === "medium"
                  ? "bg-warning/10 text-warning border-warning/30"
                  : "bg-muted text-muted-foreground"
              }
            >
              {nextPostRecommendation.confidence === "high" ? "Alta confiança" : 
               nextPostRecommendation.confidence === "medium" ? "Média confiança" : "Baixa confiança"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Baseado na análise dos seus {postsWithRealMetrics} posts com métricas reais
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Recommended Post Type */}
            <div className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-full bg-primary/10">
                  <Target className="h-4 w-4 text-primary" />
                </div>
                <span className="font-medium text-sm">Tipo de Post</span>
              </div>
              <p className="text-xl font-bold capitalize text-primary mb-1">
                {nextPostRecommendation.postType}
              </p>
              <p className="text-xs text-muted-foreground">
                {nextPostRecommendation.postTypeReason}
              </p>
            </div>

            {/* Recommended Media Type */}
            <div className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-full bg-accent/10">
                  {nextPostRecommendation.mediaType === "reels" ? (
                    <Video className="h-4 w-4 text-accent-foreground" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-accent-foreground" />
                  )}
                </div>
                <span className="font-medium text-sm">Formato</span>
              </div>
              <p className="text-xl font-bold capitalize mb-1">
                {nextPostRecommendation.mediaType === "reels" ? "Reels" : 
                 nextPostRecommendation.mediaType === "image" ? "Imagem" :
                 nextPostRecommendation.mediaType === "carousel" ? "Carrossel" : 
                 nextPostRecommendation.mediaType}
              </p>
              <p className="text-xs text-muted-foreground">
                {nextPostRecommendation.mediaTypeReason}
              </p>
            </div>

            {/* Suggested Hashtags */}
            <div className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-full bg-success/10">
                  <Hash className="h-4 w-4 text-success" />
                </div>
                <span className="font-medium text-sm">Hashtags</span>
              </div>
              {nextPostRecommendation.suggestedHashtags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {nextPostRecommendation.suggestedHashtags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      #{tag}
                    </Badge>
                  ))}
                  {nextPostRecommendation.suggestedHashtags.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{nextPostRecommendation.suggestedHashtags.length - 3}
                    </Badge>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Publique mais posts para sugestões
                </p>
              )}
            </div>

            {/* Suggested Topics */}
            <div className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-full bg-warning/10">
                  <Lightbulb className="h-4 w-4 text-warning" />
                </div>
                <span className="font-medium text-sm">Temas</span>
              </div>
              {nextPostRecommendation.suggestedTopics.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {nextPostRecommendation.suggestedTopics.slice(0, 3).map((topic) => (
                    <Badge key={topic} variant="outline" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Baseado nos seus melhores posts
                </p>
              )}
            </div>
          </div>

          {/* CTA to create post */}
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              💡 Use essas recomendações ao criar seu próximo post para maximizar engajamento
            </p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                // Navigate to create tab with recommendation data
                const url = new URL(window.location.href);
                url.searchParams.set('tab', 'create');
                window.history.pushState({}, '', url.toString());
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            >
              Criar Post
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Heart className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-xl font-bold">{formatNumber(summary.totalLikes)}</p>
                <p className="text-xs text-muted-foreground">Curtidas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xl font-bold">
                  {formatNumber(summary.totalComments)}
                </p>
                <p className="text-xs text-muted-foreground">Comentários</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Bookmark className="h-5 w-5 text-warning" />
              <div>
                <p className="text-xl font-bold">{formatNumber(summary.totalSaves)}</p>
                <p className="text-xs text-muted-foreground">Salvamentos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Eye className="h-5 w-5 text-success" />
              <div>
                <p className="text-xl font-bold">{formatNumber(summary.totalReach)}</p>
                <p className="text-xs text-muted-foreground">Alcance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Tendência Semanal
            </CardTitle>
            <CardDescription>Engajamento das últimas 4 semanas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="engagement"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))" }}
                    name="Engajamento %"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Post Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              Distribuição por Tipo
            </CardTitle>
            <CardDescription>Posts por categoria</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={postTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {postTypeData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-4">
              {postTypeData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {entry.name} ({entry.value})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insights & Top Posts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* AI Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-warning" />
              Insights do Agente IA
            </CardTitle>
            <CardDescription>Análises e recomendações automáticas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.map((insight, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card/50"
              >
                <div className="mt-0.5">
                  {insight.type === "success" && (
                    <div className="h-2 w-2 rounded-full bg-success" />
                  )}
                  {insight.type === "warning" && (
                    <div className="h-2 w-2 rounded-full bg-warning" />
                  )}
                  {insight.type === "info" && (
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <p className="font-medium text-sm">{insight.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {insight.description}
                  </p>
                </div>
                {insight.metric !== undefined && (
                  <Badge variant="secondary">{insight.metric.toFixed(1)}%</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Posts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Top Posts
            </CardTitle>
            <CardDescription>Melhor performance por engajamento</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topPosts.slice(0, 5).map((post, index) => (
                <div
                  key={post.id}
                  className="flex items-start gap-4 p-3 rounded-lg border bg-card/50 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-instagram text-primary-foreground flex items-center justify-center font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm font-medium line-clamp-2">
                      {post.caption}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        {formatNumber(post.likes_count || 0)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        {formatNumber(post.comments_count || 0)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bookmark className="h-3 w-3" />
                        {formatNumber(post.saves_count || 0)}
                      </span>
                    </div>
                  </div>
                  <Badge className="flex-shrink-0 bg-success/10 text-success border-success/20">
                    {post.engagementRate.toFixed(1)}%
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Best Hashtags */}
      {summary.bestPerformingHashtags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Hashtags de Alto Desempenho</CardTitle>
            <CardDescription>
              Baseado nos posts com maior engajamento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {summary.bestPerformingHashtags.map((tag, index) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-sm py-1 px-3"
                  style={{
                    opacity: 1 - index * 0.08,
                  }}
                >
                  #{tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AnalyticsTab;
