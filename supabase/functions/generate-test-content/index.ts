import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * GENERATE TEST CONTENT
 * 
 * Thin wrapper that forces the ai-agent-core to create exactly ONE post
 * of a specific content type, bypassing scheduling / distribution logic.
 * Returns the created post for immediate preview.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { workspace_id, content_type, topic } = await req.json();

    if (!workspace_id || !content_type) {
      return new Response(
        JSON.stringify({ error: "workspace_id e content_type são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const validTypes = ["image", "carousel", "news", "video", "news_video", "marketing_image", "marketing_video"];
    if (!validTypes.includes(content_type)) {
      return new Response(
        JSON.stringify({ error: `Tipo inválido. Use: ${validTypes.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[test-content] Generating test ${content_type} for workspace ${workspace_id}`);

    // Call ai-agent-core with forced type override
    const agentRes = await fetch(`${supabaseUrl}/functions/v1/ai-agent-core`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        workspaceId: workspace_id,
        userId: user.id,
        trigger: "test",
        forceContentType: content_type,
        forceTopic: topic || undefined,
        skipScheduleCheck: true,
        skipLimitCheck: true,
      }),
    });

    if (!agentRes.ok) {
      const errData = await agentRes.json().catch(() => ({}));
      console.error("[test-content] Agent failed:", errData);
      return new Response(
        JSON.stringify({ error: errData?.error || "Falha ao gerar conteúdo de teste" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const agentData = await agentRes.json();
    console.log(`[test-content] Agent response:`, JSON.stringify(agentData).substring(0, 200));

    // Fetch the created post
    const postId = agentData?.postId || agentData?.post?.id;
    let post = agentData?.post || null;

    if (postId && !post) {
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();
      post = data;
    }

    // If agent didn't return a post ID, try to find the latest draft
    if (!post) {
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user.id)
        .in("status", ["draft", "scheduled", "failed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      post = data;
    }

    return new Response(
      JSON.stringify({
        success: true,
        content_type,
        post,
        agent_response: {
          decision: agentData?.decision,
          reason: agentData?.reason,
          summary: agentData?.summary,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[test-content] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
