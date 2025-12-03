import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PostMetrics {
  id: string;
  post_type: string;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  reach: number;
  hashtags: string[];
  caption: string;
  published_at: string;
}

interface AnalysisResult {
  bestPostTypes: { type: string; avgEngagement: number }[];
  bestHashtags: string[];
  bestPostingTimes: string[];
  contentPatterns: string[];
  recommendations: string[];
  audienceInsights: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all published posts with metrics
    const { data: posts, error: fetchError } = await supabase
      .from("posts")
      .select("*")
      .eq("status", "published")
      .not("reach", "is", null)
      .order("published_at", { ascending: false })
      .limit(100);

    if (fetchError) {
      throw new Error(`Error fetching posts: ${fetchError.message}`);
    }

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          analysis: {
            bestPostTypes: [],
            bestHashtags: [],
            bestPostingTimes: [],
            contentPatterns: [],
            recommendations: ["Publique mais posts para gerar análises"],
            audienceInsights: "Dados insuficientes para análise",
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate engagement for each post
    const postsWithEngagement = posts.map((post) => {
      const likes = post.likes_count || 0;
      const comments = post.comments_count || 0;
      const saves = post.saves_count || 0;
      const reach = post.reach || 1;
      const engagement = ((likes + comments * 2 + saves * 3) / reach) * 100;
      return { ...post, engagement };
    });

    // Analyze by post type
    const typePerformance: Record<string, { total: number; count: number }> = {};
    postsWithEngagement.forEach((post) => {
      const type = post.post_type || "outros";
      if (!typePerformance[type]) {
        typePerformance[type] = { total: 0, count: 0 };
      }
      typePerformance[type].total += post.engagement;
      typePerformance[type].count++;
    });

    const bestPostTypes = Object.entries(typePerformance)
      .map(([type, data]) => ({
        type,
        avgEngagement: data.total / data.count,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    // Analyze hashtags
    const hashtagPerformance: Record<string, { total: number; count: number }> = {};
    postsWithEngagement.forEach((post) => {
      (post.hashtags || []).forEach((tag: string) => {
        if (!hashtagPerformance[tag]) {
          hashtagPerformance[tag] = { total: 0, count: 0 };
        }
        hashtagPerformance[tag].total += post.engagement;
        hashtagPerformance[tag].count++;
      });
    });

    const bestHashtags = Object.entries(hashtagPerformance)
      .filter(([, data]) => data.count >= 2) // Only hashtags used at least twice
      .map(([tag, data]) => ({
        tag,
        avgEngagement: data.total / data.count,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 15)
      .map((h) => h.tag);

    // Analyze posting times
    const hourPerformance: Record<number, { total: number; count: number }> = {};
    postsWithEngagement.forEach((post) => {
      if (post.published_at) {
        const hour = new Date(post.published_at).getHours();
        if (!hourPerformance[hour]) {
          hourPerformance[hour] = { total: 0, count: 0 };
        }
        hourPerformance[hour].total += post.engagement;
        hourPerformance[hour].count++;
      }
    });

    const bestPostingTimes = Object.entries(hourPerformance)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        avgEngagement: data.total / data.count,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 3)
      .map((h) => `${h.hour}:00`);

    // Generate content patterns
    const contentPatterns: string[] = [];
    const avgEngagement =
      postsWithEngagement.reduce((sum, p) => sum + p.engagement, 0) /
      postsWithEngagement.length;

    const highPerformers = postsWithEngagement.filter(
      (p) => p.engagement > avgEngagement * 1.5
    );

    // Check for emoji usage in high performers
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
    const emojiUsage = highPerformers.filter((p) =>
      emojiRegex.test(p.caption)
    ).length;
    if (emojiUsage > highPerformers.length * 0.6) {
      contentPatterns.push("Posts com emojis performam melhor");
    }

    // Check for question marks (engagement hooks)
    const questionUsage = highPerformers.filter((p) =>
      p.caption.includes("?")
    ).length;
    if (questionUsage > highPerformers.length * 0.5) {
      contentPatterns.push("Perguntas geram mais interação");
    }

    // Check caption length
    const avgLength =
      highPerformers.reduce((sum, p) => sum + p.caption.length, 0) /
      highPerformers.length;
    if (avgLength > 300) {
      contentPatterns.push("Legendas mais longas engajam mais");
    } else if (avgLength < 150) {
      contentPatterns.push("Legendas curtas e diretas funcionam melhor");
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (bestPostTypes.length > 0) {
      recommendations.push(
        `Foque em posts de "${bestPostTypes[0].type}" - maior engajamento médio`
      );
    }

    if (bestHashtags.length >= 5) {
      recommendations.push(
        `Use hashtags de alto desempenho: #${bestHashtags.slice(0, 5).join(", #")}`
      );
    }

    if (bestPostingTimes.length > 0) {
      recommendations.push(
        `Melhores horários para postar: ${bestPostingTimes.join(", ")}`
      );
    }

    if (posts.length < 20) {
      recommendations.push(
        "Continue publicando para dados mais precisos (mínimo 20 posts)"
      );
    }

    // Audience insights
    const totalInteractions =
      postsWithEngagement.reduce(
        (sum, p) =>
          sum +
          (p.likes_count || 0) +
          (p.comments_count || 0) +
          (p.saves_count || 0),
        0
      ) / posts.length;

    let audienceInsights = "";
    if (avgEngagement > 8) {
      audienceInsights =
        "Audiência altamente engajada - responde bem ao seu conteúdo";
    } else if (avgEngagement > 5) {
      audienceInsights =
        "Audiência engajada - acima da média do mercado (3-6%)";
    } else if (avgEngagement > 3) {
      audienceInsights = "Audiência na média - há espaço para otimização";
    } else {
      audienceInsights =
        "Audiência pouco engajada - considere ajustar estratégia de conteúdo";
    }

    const analysis: AnalysisResult = {
      bestPostTypes,
      bestHashtags,
      bestPostingTimes,
      contentPatterns,
      recommendations,
      audienceInsights,
    };

    console.log("AI Agent Analysis completed:", {
      totalPosts: posts.length,
      avgEngagement: avgEngagement.toFixed(2),
      recommendations: recommendations.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        meta: {
          analyzedPosts: posts.length,
          avgEngagement,
          generatedAt: new Date().toISOString(),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in ai-agent-analyze:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro na análise" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
