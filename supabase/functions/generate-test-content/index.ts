import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * GENERATE TEST CONTENT — Fire-and-forget version
 * 
 * Creates a placeholder draft post immediately, then triggers ai-agent-core
 * in the background. The client polls the post by ID until it's ready.
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

    const { workspace_id, content_type, feedback } = await req.json();

    if (!workspace_id || !content_type) {
      return new Response(
        JSON.stringify({ error: "workspace_id e content_type são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const validTypes = ["image", "carousel", "news", "video", "news_video", "marketing_image", "marketing_video", "video_curated"];
    if (!validTypes.includes(content_type)) {
      return new Response(
        JSON.stringify({ error: `Tipo inválido. Use: ${validTypes.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create a placeholder draft so client can poll it
    const mediaTypeMap: Record<string, string> = {
      image: 'image', carousel: 'carousel', news: 'image',
      video: 'video', news_video: 'video',
      marketing_image: 'image', marketing_video: 'video',
    };
    const postTypeMap: Record<string, string> = {
      image: 'reflexão', carousel: 'educacional', news: 'noticia',
      video: 'criativo', news_video: 'noticia',
      marketing_image: 'afiliado', marketing_video: 'afiliado',
    };

    const { data: placeholder, error: insertErr } = await supabase
      .from("posts")
      .insert({
        workspace_id,
        user_id: user.id,
        caption: '⏳ Gerando conteúdo...',
        status: 'generating',
        media_type: mediaTypeMap[content_type] || 'image',
        post_type: postTypeMap[content_type] || 'engajamento',
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    console.log(`[test-content] Placeholder ${placeholder.id} created, firing agent in background`);

    // Background task — wrapped in EdgeRuntime.waitUntil so it survives
    // the response being returned. Without this, the runtime can kill the
    // outbound fetch as soon as we return, leaving posts stuck in 'generating'.
    const agentUrl = `${supabaseUrl}/functions/v1/ai-agent-core`;
    const backgroundTask = fetch(agentUrl, {
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
        skipScheduleCheck: true,
        skipLimitCheck: true,
        placeholderPostId: placeholder.id,
        feedback: feedback || undefined,
      }),
    }).then(async (res) => {
      // The agent now handles the placeholder merge internally (via placeholderPostId).
      // We only need to mark as failed if the HTTP call itself failed AND the placeholder
      // is still in 'generating' state (meaning the agent didn't process it).
      if (!res.ok) {
        const errText = await res.text().catch(() => 'unknown error');
        console.error(`[test-content] Background agent HTTP failed: ${errText.substring(0, 200)}`);
        // Wait a bit — the agent may still be processing despite gateway error
        await new Promise(r => setTimeout(r, 3000));
        const { data: cur } = await supabase
          .from('posts').select('status').eq('id', placeholder.id).single();
        if (cur?.status === 'generating') {
          await supabase.from("posts").update({
            status: 'failed',
            error_message: `Falha ao gerar (HTTP ${res.status}): ${errText.substring(0, 150)}`,
          }).eq("id", placeholder.id);
        }
        return;
      }
      console.log(`[test-content] Agent fetch returned OK for placeholder ${placeholder.id}`);
    }).catch(async (err) => {
      console.error(`[test-content] Background fetch error:`, err?.message || err);
      // Same logic — only mark failed if placeholder is still generating
      await new Promise(r => setTimeout(r, 3000));
      const { data: cur } = await supabase
        .from('posts').select('status').eq('id', placeholder.id).single();
      if (cur?.status === 'generating') {
        await supabase.from("posts").update({
          status: 'failed',
          error_message: `Erro de conexão: ${err?.message || 'unknown'}`,
        }).eq("id", placeholder.id);
      }
    });

    // CRITICAL: keep runtime alive until the agent finishes,
    // so the placeholder gets updated even after we respond.
    // @ts-ignore - EdgeRuntime is available on Supabase Edge Runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundTask);
    }

    // Safety net: if no terminal status after 4min, mark as failed so
    // the UI doesn't spin forever.
    const watchdog = (async () => {
      await new Promise((r) => setTimeout(r, 4 * 60 * 1000));
      const { data: cur } = await supabase
        .from("posts").select("status").eq("id", placeholder.id).single();
      if (cur?.status === "generating") {
        await supabase.from("posts").update({
          status: "failed",
          error_message: "Timeout: geração demorou mais de 4 minutos",
        }).eq("id", placeholder.id);
        console.error(`[test-content] Watchdog killed stuck post ${placeholder.id}`);
      }
    })();
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(watchdog);
    }

    // Return immediately with the placeholder
    return new Response(
      JSON.stringify({
        success: true,
        content_type,
        post: placeholder,
        polling: true,
        agent_response: { decision: 'GENERATING', reason: 'Gerando em segundo plano...' },
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
