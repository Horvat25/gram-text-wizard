import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper: resize image for Instagram compatibility
async function resizeForInstagram(supabaseUrl: string, supabaseKey: string, imageUrl: string, mediaType: string): Promise<string> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/resize-image-for-instagram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ imageUrl, mediaType }),
    });
    const data = await response.json();
    if (data.url && !data.skipped) {
      console.log(`[resize] ✅ Resized: ${mediaType} → ${data.url.substring(0, 60)}...`);
      return data.url;
    }
    if (data.skipped) {
      console.log(`[resize] ⏭️ Skipped (${data.reason})`);
    }
    return imageUrl;
  } catch (e) {
    console.warn('[resize] Failed, using original:', e);
    return imageUrl;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const nowIso = now.toISOString();
    
    console.log("🕐 Verificando posts agendados...");
    console.log(`⏰ Hora atual UTC: ${nowIso}`);
    console.log(`⏰ Hora atual Brasília: ${new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().replace('Z', ' BRT')}`);

    // Only fetch Instagram posts (exclude TikTok-only posts)
    const { data: scheduledPosts, error: fetchError } = await supabase
      .from("posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_for", nowIso)
      .contains("platforms", ["instagram"]);

    if (fetchError) {
      console.error("Erro ao buscar posts agendados:", fetchError);
      throw new Error(`Erro ao buscar posts: ${fetchError.message}`);
    }

    if (!scheduledPosts || scheduledPosts.length === 0) {
      console.log("📭 Nenhum post agendado para publicar agora");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum post agendado para publicar", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📬 Encontrados ${scheduledPosts.length} posts para publicar`);

    const results = [];

    for (const post of scheduledPosts) {
      console.log(`📝 Disparando publicação centralizada para post ${post.id}: ${post.caption?.substring(0, 50)}...`);

      try {
        const publishResponse = await fetch(`${supabaseUrl}/functions/v1/publish-post`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ postId: post.id }),
        });

        const publishText = await publishResponse.text();
        let publishData: any = null;
        try {
          publishData = publishText ? JSON.parse(publishText) : null;
        } catch (_) {
          publishData = { raw: publishText };
        }

        if (!publishResponse.ok || publishData?.error) {
          const message = publishData?.error || publishData?.message || publishText || `Falha HTTP ${publishResponse.status}`;
          console.error(`❌ publish-post falhou para ${post.id}:`, message);
          results.push({ postId: post.id, success: false, error: message });
          continue;
        }

        results.push({
          postId: post.id,
          success: true,
          instagramPostId: publishData?.instagramPostId,
          message: publishData?.message || "Publicado com sucesso",
        });
        console.log(`🎉 Post ${post.id} publicado via publish-post!`);
      } catch (postError: any) {
        console.error(`❌ Erro ao chamar publish-post para ${post.id}:`, postError);
        await supabase
          .from("posts")
          .update({ status: "failed", error_message: (postError?.message || "Erro ao publicar").substring(0, 500) })
          .eq("id", post.id);
        results.push({ postId: post.id, success: false, error: postError?.message || "Erro ao publicar" });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    console.log(`📊 Resumo: ${successCount} sucesso, ${failCount} falhas`);

    return new Response(
      JSON.stringify({ success: true, processed: scheduledPosts.length, successCount, failCount, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro em scheduled-publisher:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao processar posts agendados" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
