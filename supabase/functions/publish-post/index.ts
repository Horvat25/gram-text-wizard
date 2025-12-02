import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { postId } = await req.json();

    if (!postId) {
      throw new Error("postId é obrigatório");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar o post
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (fetchError) {
      throw new Error(`Erro ao buscar post: ${fetchError.message}`);
    }

    if (!post) {
      throw new Error("Post não encontrado");
    }

    // Simular métricas de publicação (por enquanto, sem API real do Instagram)
    const likes_count = Math.floor(Math.random() * 5000 + 500);
    const comments_count = Math.floor(Math.random() * 200 + 20);
    const saves_count = Math.floor(Math.random() * 800 + 100);
    const reach = Math.floor(Math.random() * 15000 + 2000);

    // Atualizar o post para publicado
    const { error: updateError } = await supabase
      .from("posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        likes_count,
        comments_count,
        saves_count,
        reach,
      })
      .eq("id", postId);

    if (updateError) {
      throw new Error(`Erro ao atualizar post: ${updateError.message}`);
    }

    console.log(`Post ${postId} publicado com sucesso`);

    return new Response(
      JSON.stringify({
        success: true,
        postId,
        metrics: {
          likes_count,
          comments_count,
          saves_count,
          reach,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Erro em publish-post:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao publicar post" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
