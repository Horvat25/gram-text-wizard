import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Heart, MessageCircle, Bookmark, Eye } from "lucide-react";
import { findTopPerformingPosts, getPerformanceSummary, generateInsights } from "@/lib/agent-analytics";

const MetricsDashboard = () => {
  const topPosts = findTopPerformingPosts(3);
  const summary = getPerformanceSummary();
  const insights = generateInsights();

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (topPosts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dashboard de Performance</CardTitle>
          <CardDescription>Métricas e insights dos seus posts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg mb-2">Nenhuma métrica ainda</p>
            <p className="text-sm">
              Adicione métricas aos seus posts no histórico para ver análises detalhadas
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Posts</p>
                <p className="text-2xl font-bold">{summary.totalPosts}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Engajamento</p>
                <p className="text-2xl font-bold">{summary.avgEngagement.toFixed(1)}%</p>
              </div>
              <Heart className="h-8 w-8 text-destructive opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alcance</p>
                <p className="text-2xl font-bold">{formatNumber(summary.totalReach)}</p>
              </div>
              <Eye className="h-8 w-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Melhor tipo</p>
                <p className="text-lg font-bold truncate">{summary.bestPostType}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-success opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Insights do Agente</CardTitle>
            <CardDescription>Análises e recomendações baseadas em performance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.map((insight, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card"
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
                  <p className="text-sm text-muted-foreground">{insight.description}</p>
                </div>
                {insight.metric !== undefined && (
                  <Badge variant="secondary">{insight.metric.toFixed(1)}%</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Top Posts */}
      <Card>
        <CardHeader>
          <CardTitle>Top Posts</CardTitle>
          <CardDescription>Seus posts com melhor performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topPosts.map(({ post, metrics }, index) => (
              <div
                key={post.id}
                className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-sm font-medium line-clamp-2">{post.caption}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {formatNumber(metrics.likes_count)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {formatNumber(metrics.comments_count)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Bookmark className="h-3 w-3" />
                      {formatNumber(metrics.saves_count)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {formatNumber(metrics.reach)}
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="flex-shrink-0">
                  {metrics.engagement_rate.toFixed(1)}%
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MetricsDashboard;
