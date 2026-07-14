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
  name: "schedule_post",
  title: "Agendar post existente",
  description:
    "Atualiza um post em rascunho para status 'scheduled' em um horário ISO 8601 (UTC).",
  inputSchema: {
    post_id: z.string().uuid().describe("ID do post (rascunho)."),
    scheduled_for: z
      .string()
      .describe("Data/hora ISO 8601 em UTC, ex.: 2026-07-15T20:00:00Z."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ post_id, scheduled_for }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const when = new Date(scheduled_for);
    if (Number.isNaN(when.getTime())) {
      return { content: [{ type: "text", text: "scheduled_for inválido" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("posts")
      .update({ status: "scheduled", scheduled_for: when.toISOString() })
      .eq("id", post_id)
      .select("id, status, scheduled_for");
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data?.[0] ?? {}) }],
      structuredContent: { post: data?.[0] ?? null },
    };
  },
});
