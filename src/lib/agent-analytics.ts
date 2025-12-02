// Agent Analytics - Intelligent analysis of post performance

import { Post, PostMetrics, loadPosts, loadAllMetrics } from "./local-storage";

export interface AnalyticsInsight {
  type: "success" | "warning" | "info";
  title: string;
  description: string;
  metric?: number;
}

// Calculate engagement rate
export const calculateEngagementRate = (metrics: PostMetrics): number => {
  if (metrics.reach === 0) return 0;
  return ((metrics.likes_count + metrics.comments_count + metrics.saves_count) / metrics.reach) * 100;
};

// Find top performing posts
export const findTopPerformingPosts = (limit = 5): Array<{ post: Post; metrics: PostMetrics }> => {
  const posts = loadPosts();
  const metrics = loadAllMetrics();
  
  const postsWithMetrics = posts
    .map((post) => ({
      post,
      metrics: metrics.find((m) => m.post_id === post.id),
    }))
    .filter((item) => item.metrics !== undefined) as Array<{ post: Post; metrics: PostMetrics }>;

  return postsWithMetrics
    .sort((a, b) => b.metrics.engagement_rate - a.metrics.engagement_rate)
    .slice(0, limit);
};

// Find top performing topics
export const findTopPerformingTopics = (): string[] => {
  const topPosts = findTopPerformingPosts(10);
  const topics = topPosts.map((item) => item.post.post_type);
  
  // Count frequency
  const counts: Record<string, number> = {};
  topics.forEach((topic) => {
    counts[topic] = (counts[topic] || 0) + 1;
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic);
};

// Suggest best hashtags based on performance
export const suggestBestHashtags = (): string[] => {
  const topPosts = findTopPerformingPosts(10);
  const allHashtags: Record<string, number> = {};

  topPosts.forEach(({ post, metrics }) => {
    post.hashtags.forEach((tag) => {
      if (!allHashtags[tag]) {
        allHashtags[tag] = 0;
      }
      allHashtags[tag] += metrics.engagement_rate;
    });
  });

  return Object.entries(allHashtags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag]) => tag);
};

// Analyze audience sentiment based on comments/saves ratio
export const analyzeAudienceSentiment = (): string => {
  const allMetrics = loadAllMetrics();
  if (allMetrics.length === 0) return "Sem dados suficientes";

  const avgCommentsToSaves = allMetrics.reduce((sum, m) => {
    if (m.saves_count === 0) return sum;
    return sum + (m.comments_count / m.saves_count);
  }, 0) / allMetrics.length;

  if (avgCommentsToSaves > 0.5) return "Audiência altamente engajada (muitos comentários)";
  if (avgCommentsToSaves > 0.2) return "Audiência engajada moderadamente";
  return "Audiência prefere salvar conteúdo (consumidores silenciosos)";
};

// Get overall performance summary
export const getPerformanceSummary = (): {
  totalPosts: number;
  avgEngagement: number;
  totalReach: number;
  bestPostType: string;
} => {
  const posts = loadPosts();
  const metrics = loadAllMetrics();

  if (metrics.length === 0) {
    return {
      totalPosts: posts.length,
      avgEngagement: 0,
      totalReach: 0,
      bestPostType: "engajamento",
    };
  }

  const avgEngagement = metrics.reduce((sum, m) => sum + m.engagement_rate, 0) / metrics.length;
  const totalReach = metrics.reduce((sum, m) => sum + m.reach, 0);
  const bestPostType = findTopPerformingTopics()[0] || "engajamento";

  return {
    totalPosts: posts.length,
    avgEngagement,
    totalReach,
    bestPostType,
  };
};

// Generate insights based on data
export const generateInsights = (): AnalyticsInsight[] => {
  const insights: AnalyticsInsight[] = [];
  const summary = getPerformanceSummary();
  const topHashtags = suggestBestHashtags();
  const sentiment = analyzeAudienceSentiment();

  // Engagement insight
  if (summary.avgEngagement > 5) {
    insights.push({
      type: "success",
      title: "Excelente engajamento!",
      description: `Seus posts têm ${summary.avgEngagement.toFixed(1)}% de engajamento médio.`,
      metric: summary.avgEngagement,
    });
  } else if (summary.avgEngagement > 0) {
    insights.push({
      type: "warning",
      title: "Engajamento abaixo da média",
      description: "Tente usar CTAs mais fortes e perguntas diretas.",
      metric: summary.avgEngagement,
    });
  }

  // Best post type
  if (summary.bestPostType) {
    insights.push({
      type: "info",
      title: `Tipo "${summary.bestPostType}" performa melhor`,
      description: "Considere criar mais posts desse tipo.",
    });
  }

  // Hashtag recommendation
  if (topHashtags.length >= 5) {
    insights.push({
      type: "success",
      title: "Hashtags de alto desempenho identificadas",
      description: `Use: #${topHashtags.slice(0, 3).join(", #")}`,
    });
  }

  // Audience sentiment
  insights.push({
    type: "info",
    title: "Perfil da audiência",
    description: sentiment,
  });

  return insights;
};

// Predict best posting time (simple heuristic)
export const predictBestPostTime = (): string[] => {
  // Based on Instagram general best practices
  return ["10:00", "14:00", "19:00"];
};
