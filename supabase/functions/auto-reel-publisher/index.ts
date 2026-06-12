import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ✅ Reels reativados por pedido do usuário.
// Mantém os limites abaixo para evitar backlog/custo, mas o cron pode voltar a criar Reels.
const REELS_AUTO_DISABLED = false;
const REELS_PAUSED_UNTIL_UTC = new Date("2000-01-01T00:00:00.000Z");

/**
 * auto-reel-publisher
 *
 * Cron disparado 3x/dia (09h, 14h e 20h Brasília) — cria UM Reel automático:
 *   1. Pega notícia top não usada (Neural Update primeiro)
 *   2. Cria post em status='generating', agendado pra 30min depois
 *   3. Dispara brand-news-video em background (EdgeRuntime.waitUntil)
 *   4. Marca rss_items.used_for_reel = true
 *
 * Limite de segurança: máx 2 Reels (scheduled+published) nas últimas 24h.
 */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log("[AUTO-REEL] 🎬 Disparado:", new Date().toISOString());

    if (REELS_AUTO_DISABLED || new Date() < REELS_PAUSED_UNTIL_UTC) {
      console.log("[AUTO-REEL] ⛔ Criação automática de Reels temporariamente desligada");
      return new Response(JSON.stringify({
        skipped: true,
        reason: "auto_reels_disabled",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Limite: máx 2 Reels nas últimas 24h ──
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recent } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .in("status", ["scheduled", "published", "generating"])
      .in("media_type", ["reels", "reel", "video"])
      .gte("created_at", since);

    if ((recent || 0) >= 2) {
      console.log(`[AUTO-REEL] ⏭️ Limite atingido (${recent}/2 últimas 24h)`);
      return new Response(JSON.stringify({ skipped: true, reason: "daily_limit", recent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Análise: gap mínimo de 6h entre Reels (evita spam mesmo abaixo do limite) ──
    const { data: lastReel } = await supabase
      .from("posts")
      .select("created_at, status")
      .in("media_type", ["reels", "reel", "video"])
      .in("status", ["scheduled", "published", "generating"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastReel?.created_at) {
      const hoursSince = (Date.now() - new Date(lastReel.created_at).getTime()) / 3600000;
      if (hoursSince < 6) {
        console.log(`[AUTO-REEL] ⏭️ Reel recente (${hoursSince.toFixed(1)}h atrás, mínimo 6h)`);
        return new Response(JSON.stringify({ skipped: true, reason: "min_gap", hoursSince }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Pega notícia top: Neural Update first, depois ranqueada por data ──
    const { data: neural } = await supabase
      .from("rss_items")
      .select("*")
      .eq("source_name", "Atualização Neural")
      .eq("used_for_reel", false)
      .eq("has_image", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(1);

    let item = neural?.[0];

    if (!item) {
      const { data: others } = await supabase
        .from("rss_items")
        .select("*")
        .eq("used_for_reel", false)
        .eq("has_image", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(1);
      item = others?.[0];
    }

    if (!item) {
      console.log("[AUTO-REEL] ⚠️ Nenhuma notícia disponível");
      return new Response(JSON.stringify({ skipped: true, reason: "no_news" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[AUTO-REEL] 📰 ${item.source_name}: ${item.title.substring(0, 60)}...`);

    // ── Conta Instagram (workspace + user) ──
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("user_id, workspace_id")
      .limit(1)
      .single();

    if (!account) {
      console.warn("[AUTO-REEL] ❌ Nenhuma conta Instagram conectada");
      return new Response(JSON.stringify({ skipped: true, reason: "no_account" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Agenda pra 30min depois (tempo de renderizar) ──
    const scheduledFor = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { data: post, error: postErr } = await supabase
      .from("posts")
      .insert({
        user_id: account.user_id,
        workspace_id: account.workspace_id,
        platforms: ["instagram"],
        media_type: "reels",
        status: "generating",
        post_type: "noticia",
        scheduled_for: scheduledFor,
        caption: item.title, // será substituída pela generate-caption no pipeline
        hashtags: [],
        overlay_metadata: {
          render_status: "queued",
          pipeline: "auto-reel-publisher",
          source_name: item.source_name,
          source_url: item.link,
          rss_item_id: item.id,
        },
      })
      .select()
      .single();

    if (postErr || !post) {
      console.error("[AUTO-REEL] ❌ Erro criando post:", postErr);
      throw new Error(postErr?.message || "Falha criando post");
    }

    console.log(`[AUTO-REEL] ✅ Post criado: ${post.id}`);

    // Marca a notícia como usada pra Reel ANTES de disparar (evita race)
    await supabase
      .from("rss_items")
      .update({ used_for_reel: true, used_in_post_id: post.id, is_used: true })
      .eq("id", item.id);

    // ── Dispara render em background ──
    const renderTask = (async () => {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/brand-news-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            postId: post.id,
            title: item.title,
            description: item.description || "",
            workspaceId: account.workspace_id,
            userId: account.user_id,
            articleUrl: item.link,
            primaryImageUrl: item.image_url,
          }),
        });

        if (!resp.ok) {
          const err = await resp.text();
          console.error(`[AUTO-REEL] ❌ Render falhou: ${err.substring(0, 300)}`);
          await supabase.from("posts").update({
            status: "draft",
            error_message: `Render falhou: ${err.substring(0, 200)}`,
          }).eq("id", post.id);
          await notify(supabase, account.user_id, account.workspace_id,
            `❌ Reel auto falhou: ${item.title.substring(0, 60)}. Revisa na Fila.`);
        } else {
          const result = await resp.json();
          console.log(`[AUTO-REEL] ✅ Render ok:`, result?.status || "completed");
          if (result?.status === "assets_ready") {
            await notify(supabase, account.user_id, account.workspace_id,
              `🎬 Reel "${item.title.substring(0, 50)}..." precisa de render no navegador. Abre a Fila.`);
          }
        }
      } catch (e: any) {
        console.error("[AUTO-REEL] ❌ Render exception:", e);
        await supabase.from("posts").update({
          status: "draft",
          error_message: `Render exception: ${e.message}`,
        }).eq("id", post.id);
        await notify(supabase, account.user_id, account.workspace_id,
          `❌ Reel falhou (erro técnico): ${item.title.substring(0, 60)}`);
      }
    })();

    // @ts-ignore Deno EdgeRuntime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(renderTask);
    } else {
      // fallback: não bloqueia
      renderTask.catch(() => {});
    }

    return new Response(
      JSON.stringify({
        success: true,
        postId: post.id,
        scheduledFor,
        item: { id: item.id, title: item.title, source: item.source_name },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[AUTO-REEL] ❌", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function notify(supabase: any, userId: string, workspaceId: string, message: string) {
  try {
    await supabase.from("agent_chat_messages").insert({
      user_id: userId,
      workspace_id: workspaceId,
      role: "assistant",
      content: `🔔 ${message}`,
      platform: "instagram",
    });
  } catch (e) {
    console.warn("[AUTO-REEL] notify falhou:", e);
  }
}
