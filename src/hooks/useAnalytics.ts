import { useMemo } from "react";
import { Post } from "./usePosts";

export interface AnalyticsSummary {
  totalPosts: number;
  publishedPosts: number;
  scheduledPosts: number;
  draftPosts: number;
  totalLikes: number;
  totalComments: number;
  totalSaves: number;
  totalReach: number;
  avgEngagement: number;
  bestPostType: string;
  bestPerformingHashtags: string[];
  performanceByType: Record<string, { count: number; avgEngagement: number }>;
  weeklyTrend: { date: string; posts: number; engagement: number }[];
}

export interface PostWithMetrics extends Post {
  engagementRate: number;
}

const calculateEngagementRate = (post: Post): number => {
  const likes = post.likes_count || 0;
  const comments = post.comments_count || 0;
  const saves = post.saves_count || 0;
  const reach = post.reach || 1;
  return ((likes + comments * 2 + saves * 3) / reach) * 100;
};

export const useAnalytics = (posts: Post[]) => {
  const publishedPosts = useMemo(
    () => posts.filter((p) => p.status === "published" && p.reach),
    [posts]
  );

  const postsWithMetrics: PostWithMetrics[] = useMemo(
    () =>
      publishedPosts.map((post) => ({
        ...post,
        engagementRate: calculateEngagementRate(post),
      })),
    [publishedPosts]
  );

  const summary: AnalyticsSummary = useMemo(() => {
    const totalLikes = publishedPosts.reduce(
      (sum, p) => sum + (p.likes_count || 0),
      0
    );
    const totalComments = publishedPosts.reduce(
      (sum, p) => sum + (p.comments_count || 0),
      0
    );
    const totalSaves = publishedPosts.reduce(
      (sum, p) => sum + (p.saves_count || 0),
      0
    );
    const totalReach = publishedPosts.reduce(
      (sum, p) => sum + (p.reach || 0),
      0
    );

    const avgEngagement =
      postsWithMetrics.length > 0
        ? postsWithMetrics.reduce((sum, p) => sum + p.engagementRate, 0) /
          postsWithMetrics.length
        : 0;

    // Performance by type
    const performanceByType: Record<
      string,
      { count: number; totalEngagement: number; avgEngagement: number }
    > = {};

    postsWithMetrics.forEach((post) => {
      const type = post.post_type || "outros";
      if (!performanceByType[type]) {
        performanceByType[type] = { count: 0, totalEngagement: 0, avgEngagement: 0 };
      }
      performanceByType[type].count++;
      performanceByType[type].totalEngagement += post.engagementRate;
    });

    Object.keys(performanceByType).forEach((type) => {
      performanceByType[type].avgEngagement =
        performanceByType[type].totalEngagement / performanceByType[type].count;
    });

    // Best post type
    const bestPostType =
      Object.entries(performanceByType).sort(
        (a, b) => b[1].avgEngagement - a[1].avgEngagement
      )[0]?.[0] || "N/A";

    // Best hashtags (from top performing posts)
    const topPosts = [...postsWithMetrics]
      .sort((a, b) => b.engagementRate - a.engagementRate)
      .slice(0, 5);

    const hashtagFrequency: Record<string, number> = {};
    topPosts.forEach((post) => {
      (post.hashtags || []).forEach((tag) => {
        hashtagFrequency[tag] = (hashtagFrequency[tag] || 0) + 1;
      });
    });

    const bestPerformingHashtags = Object.entries(hashtagFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);

    // Weekly trend (last 4 weeks)
    const weeklyTrend: { date: string; posts: number; engagement: number }[] = [];
    const now = new Date();

    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - i * 7);

      const weekPosts = postsWithMetrics.filter((p) => {
        const pubDate = new Date(p.published_at || p.created_at || "");
        return pubDate >= weekStart && pubDate < weekEnd;
      });

      weeklyTrend.push({
        date: weekStart.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "short",
        }),
        posts: weekPosts.length,
        engagement:
          weekPosts.length > 0
            ? weekPosts.reduce((sum, p) => sum + p.engagementRate, 0) /
              weekPosts.length
            : 0,
      });
    }

    return {
      totalPosts: posts.length,
      publishedPosts: publishedPosts.length,
      scheduledPosts: posts.filter((p) => p.status === "scheduled").length,
      draftPosts: posts.filter((p) => p.status === "draft").length,
      totalLikes,
      totalComments,
      totalSaves,
      totalReach,
      avgEngagement,
      bestPostType,
      bestPerformingHashtags,
      performanceByType,
      weeklyTrend,
    };
  }, [posts, publishedPosts, postsWithMetrics]);

  const topPosts = useMemo(
    () =>
      [...postsWithMetrics]
        .sort((a, b) => b.engagementRate - a.engagementRate)
        .slice(0, 5),
    [postsWithMetrics]
  );

  const generateInsights = useMemo(() => {
    const insights: {
      type: "success" | "warning" | "info";
      title: string;
      description: string;
      metric?: number;
    }[] = [];

    if (summary.avgEngagement > 5) {
      insights.push({
        type: "success",
        title: "Excelente engajamento!",
        description:
          "Seus posts estão performando acima da média do mercado (3-6%).",
        metric: summary.avgEngagement,
      });
    } else if (summary.avgEngagement > 3) {
      insights.push({
        type: "info",
        title: "Engajamento na média",
        description: "Seus posts estão dentro da média do mercado.",
        metric: summary.avgEngagement,
      });
    } else if (summary.avgEngagement > 0) {
      insights.push({
        type: "warning",
        title: "Engajamento abaixo da média",
        description:
          "Considere experimentar novos tipos de conteúdo e horários.",
        metric: summary.avgEngagement,
      });
    }

    if (summary.bestPostType !== "N/A") {
      insights.push({
        type: "info",
        title: `Posts de "${summary.bestPostType}" performam melhor`,
        description: `Considere criar mais conteúdo desse tipo para maximizar engajamento.`,
      });
    }

    if (summary.bestPerformingHashtags.length > 0) {
      insights.push({
        type: "success",
        title: "Hashtags de sucesso identificadas",
        description: `Use mais: #${summary.bestPerformingHashtags.slice(0, 3).join(", #")}`,
      });
    }

    if (summary.scheduledPosts > 0) {
      insights.push({
        type: "info",
        title: `${summary.scheduledPosts} posts na fila`,
        description: "Você tem conteúdo programado para publicação automática.",
      });
    }

    return insights;
  }, [summary]);

  return {
    summary,
    topPosts,
    postsWithMetrics,
    insights: generateInsights,
  };
};
