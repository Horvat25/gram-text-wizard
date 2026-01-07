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
  performanceByMediaType: Record<string, { count: number; avgEngagement: number }>;
  weeklyTrend: { date: string; posts: number; engagement: number }[];
  avgLikesPerPost: number;
  avgCommentsPerPost: number;
  avgSavesPerPost: number;
  avgReachPerPost: number;
}

export interface NextPostRecommendation {
  postType: string;
  postTypeReason: string;
  mediaType: string;
  mediaTypeReason: string;
  suggestedHashtags: string[];
  suggestedTopics: string[];
  confidence: "high" | "medium" | "low";
}

export interface PostWithMetrics extends Post {
  engagementRate: number;
}

// Calculate engagement rate only for posts with real metrics (reach > 10)
const calculateEngagementRate = (post: Post): number => {
  const likes = post.likes_count || 0;
  const comments = post.comments_count || 0;
  const saves = post.saves_count || 0;
  const reach = post.reach || 0;
  
  // If reach is too low (likely simulated), use interactions as base
  if (reach < 10) {
    const totalInteractions = likes + comments + saves;
    if (totalInteractions === 0) return 0;
    // Estimate reach based on typical 3-5% engagement
    const estimatedReach = Math.max(totalInteractions * 25, 1);
    return ((likes + comments * 2 + saves * 3) / estimatedReach) * 100;
  }
  
  return ((likes + comments * 2 + saves * 3) / reach) * 100;
};

// Check if post has real metrics (not just placeholder values)
const hasRealMetrics = (post: Post): boolean => {
  const likes = post.likes_count || 0;
  const comments = post.comments_count || 0;
  const saves = post.saves_count || 0;
  const reach = post.reach || 0;
  
  // Consider real if has instagram_post_id and some metrics, or reach > 10
  if (post.instagram_post_id && (likes > 0 || comments > 0 || saves > 0)) {
    return true;
  }
  
  return reach > 10 || likes > 10 || (likes + comments + saves) > 5;
};

export const useAnalytics = (posts: Post[]) => {
  const publishedPosts = useMemo(
    () => posts.filter((p) => p.status === "published"),
    [posts]
  );

  // Filter for posts with real metrics for accurate calculations
  const postsWithRealMetrics = useMemo(
    () => publishedPosts.filter(hasRealMetrics),
    [publishedPosts]
  );

  const postsWithMetrics: PostWithMetrics[] = useMemo(
    () =>
      publishedPosts.map((post) => ({
        ...post,
        engagementRate: calculateEngagementRate(post),
      })),
    [publishedPosts]
  );

  // Use only posts with real metrics for summary calculations
  const realMetricsPosts: PostWithMetrics[] = useMemo(
    () =>
      postsWithRealMetrics.map((post) => ({
        ...post,
        engagementRate: calculateEngagementRate(post),
      })),
    [postsWithRealMetrics]
  );

  const summary: AnalyticsSummary = useMemo(() => {
    // Use real metrics posts for accurate totals
    const totalLikes = postsWithRealMetrics.reduce(
      (sum, p) => sum + (p.likes_count || 0),
      0
    );
    const totalComments = postsWithRealMetrics.reduce(
      (sum, p) => sum + (p.comments_count || 0),
      0
    );
    const totalSaves = postsWithRealMetrics.reduce(
      (sum, p) => sum + (p.saves_count || 0),
      0
    );
    const totalReach = postsWithRealMetrics.reduce(
      (sum, p) => sum + (p.reach || 0),
      0
    );

    // Calculate averages per post
    const postCount = postsWithRealMetrics.length || 1;
    const avgLikesPerPost = totalLikes / postCount;
    const avgCommentsPerPost = totalComments / postCount;
    const avgSavesPerPost = totalSaves / postCount;
    const avgReachPerPost = totalReach / postCount;

    // Real engagement calculation
    const avgEngagement =
      totalReach > 0
        ? ((totalLikes + totalComments * 2 + totalSaves * 3) / totalReach) * 100
        : realMetricsPosts.length > 0
        ? realMetricsPosts.reduce((sum, p) => sum + p.engagementRate, 0) /
          realMetricsPosts.length
        : 0;

    // Performance by type (use all published posts for categorization)
    const performanceByType: Record<
      string,
      { count: number; totalEngagement: number; avgEngagement: number }
    > = {};

    // Performance by media type (image, reels, carousel, video)
    const performanceByMediaType: Record<
      string,
      { count: number; totalEngagement: number; avgEngagement: number }
    > = {};

    realMetricsPosts.forEach((post) => {
      const type = post.post_type || "outros";
      if (!performanceByType[type]) {
        performanceByType[type] = { count: 0, totalEngagement: 0, avgEngagement: 0 };
      }
      performanceByType[type].count++;
      performanceByType[type].totalEngagement += post.engagementRate;

      // Track media type performance
      const mediaType = post.media_type || "image";
      if (!performanceByMediaType[mediaType]) {
        performanceByMediaType[mediaType] = { count: 0, totalEngagement: 0, avgEngagement: 0 };
      }
      performanceByMediaType[mediaType].count++;
      performanceByMediaType[mediaType].totalEngagement += post.engagementRate;
    });

    Object.keys(performanceByType).forEach((type) => {
      performanceByType[type].avgEngagement =
        performanceByType[type].count > 0
          ? performanceByType[type].totalEngagement / performanceByType[type].count
          : 0;
    });

    Object.keys(performanceByMediaType).forEach((type) => {
      performanceByMediaType[type].avgEngagement =
        performanceByMediaType[type].count > 0
          ? performanceByMediaType[type].totalEngagement / performanceByMediaType[type].count
          : 0;
    });

    // Best post type
    const bestPostType =
      Object.entries(performanceByType).sort(
        (a, b) => b[1].avgEngagement - a[1].avgEngagement
      )[0]?.[0] || "N/A";

    // Best hashtags (from top performing posts)
    const topPosts = [...realMetricsPosts]
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

      const weekPosts = realMetricsPosts.filter((p) => {
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
      performanceByMediaType,
      weeklyTrend,
      avgLikesPerPost,
      avgCommentsPerPost,
      avgSavesPerPost,
      avgReachPerPost,
    };
  }, [posts, publishedPosts, postsWithRealMetrics, realMetricsPosts]);

  const topPosts = useMemo(
    () =>
      [...postsWithMetrics]
        .filter((p) => hasRealMetrics(p))
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

    // Only generate insights if we have real metrics
    if (postsWithRealMetrics.length === 0) {
      insights.push({
        type: "info",
        title: "Aguardando dados reais",
        description:
          "Sincronize com o Instagram para ver insights baseados em métricas reais.",
      });
      return insights;
    }

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

    // Add performance insights
    if (summary.avgLikesPerPost > 0) {
      insights.push({
        type: "info",
        title: `Média de ${Math.round(summary.avgLikesPerPost)} curtidas por post`,
        description: `Com ${Math.round(summary.avgCommentsPerPost)} comentários e ${Math.round(summary.avgSavesPerPost)} salvamentos em média.`,
      });
    }

    if (summary.bestPostType !== "N/A" && summary.bestPostType !== "outros") {
      insights.push({
        type: "success",
        title: `Posts "${summary.bestPostType}" performam melhor`,
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

    // Warn about posts without real metrics
    const postsWithoutMetrics = publishedPosts.length - postsWithRealMetrics.length;
    if (postsWithoutMetrics > 0) {
      insights.push({
        type: "warning",
        title: `${postsWithoutMetrics} posts sem métricas reais`,
        description: "Clique em 'Sincronizar do Instagram' para atualizar dados.",
      });
    }

    return insights;
  }, [summary, postsWithRealMetrics.length, publishedPosts.length]);

  // Generate next post recommendation based on analytics
  const nextPostRecommendation: NextPostRecommendation = useMemo(() => {
    const hasData = publishedPosts.length > 0;
    
    // Find best performing post type
    const sortedTypes = Object.entries(summary.performanceByType)
      .filter(([_, data]) => data.count > 0)
      .sort((a, b) => b[1].avgEngagement - a[1].avgEngagement);
    
    const bestType = sortedTypes[0]?.[0] || "engajamento";
    const typeEngagement = sortedTypes[0]?.[1]?.avgEngagement || 0;
    
    // Find best performing media type
    const sortedMediaTypes = Object.entries(summary.performanceByMediaType)
      .filter(([_, data]) => data.count > 0)
      .sort((a, b) => b[1].avgEngagement - a[1].avgEngagement);
    
    const bestMediaType = sortedMediaTypes[0]?.[0] || "reels";
    const mediaEngagement = sortedMediaTypes[0]?.[1]?.avgEngagement || 0;

    // Extract topics from best performing posts
    const topPostsCaptions = topPosts.slice(0, 3).map(p => p.caption);
    const commonWords = extractTopicKeywords(topPostsCaptions);

    // Determine confidence level
    let confidence: "high" | "medium" | "low" = "low";
    if (postsWithRealMetrics.length >= 10) {
      confidence = "high";
    } else if (postsWithRealMetrics.length >= 3) {
      confidence = "medium";
    }

    return {
      postType: bestType,
      postTypeReason: hasData && typeEngagement > 0
        ? `Posts "${bestType}" têm ${typeEngagement.toFixed(1)}% de engajamento médio`
        : "Recomendação baseada em boas práticas de mercado",
      mediaType: bestMediaType,
      mediaTypeReason: hasData && mediaEngagement > 0
        ? `Formato "${bestMediaType}" performa melhor com ${mediaEngagement.toFixed(1)}% engajamento`
        : "Reels têm maior alcance orgânico no Instagram atualmente",
      suggestedHashtags: summary.bestPerformingHashtags.slice(0, 5),
      suggestedTopics: commonWords.slice(0, 5),
      confidence,
    };
  }, [summary, topPosts, publishedPosts.length, postsWithRealMetrics.length]);

  return {
    summary,
    topPosts,
    postsWithMetrics,
    insights: generateInsights,
    postsWithRealMetrics: postsWithRealMetrics.length,
    nextPostRecommendation,
  };
};

// Helper to extract common topic keywords from captions
function extractTopicKeywords(captions: string[]): string[] {
  const stopWords = new Set([
    "a", "o", "e", "de", "da", "do", "que", "é", "em", "para", "com", "um", "uma",
    "os", "as", "no", "na", "por", "se", "mais", "como", "já", "ou", "seu", "sua",
    "ao", "dos", "das", "não", "isso", "esse", "essa", "ser", "vai", "são", "está",
    "você", "sua", "seu", "nos", "nas", "pelos", "pelas", "entre", "sobre", "também"
  ]);
  
  const wordCount: Record<string, number> = {};
  
  captions.forEach(caption => {
    const words = caption
      .toLowerCase()
      .replace(/[^\w\sáàâãéèêíïóôõöúüçñ]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));
    
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
  });
  
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
}