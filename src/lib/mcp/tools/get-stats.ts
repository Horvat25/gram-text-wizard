import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export default defineTool({
  name: "get_stats",
  title: "Estatísticas agregadas",
  description:
    "Retorna totais de likes, comentários, alcance e impressões dos posts publicados do usuário nos últimos N dias.",
  inputSchema: {
    days: z.number().int().min(1).max(90).default(30),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const { data, error } = await supabaseForUser(ctx)
      .from("posts")
      .select("likes_count, comments_count, reach, impressions, saves_count, shares_count")
      .eq("status", "published")
      .gte("published_at", since);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const totals = (data ?? []).reduce(
      (acc, p: any) => ({
        posts: acc.posts + 1,
        likes: acc.likes + (p.likes_count ?? 0),
        comments: acc.comments + (p.comments_count ?? 0),
        saves: acc.saves + (p.saves_count ?? 0),
        shares: acc.shares + (p.shares_count ?? 0),
        reach: acc.reach + (p.reach ?? 0),
        impressions: acc.impressions + (p.impressions ?? 0),
      }),
      { posts: 0, likes: 0, comments: 0, saves: 0, shares: 0, reach: 0, impressions: 0 }
    );
    return {
      content: [{ type: "text", text: JSON.stringify({ days, ...totals }) }],
      structuredContent: { days, ...totals },
    };
  },
});
