import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all workspaces with agent context
    const { data: contexts, error: ctxErr } = await supabase
      .from('agent_context')
      .select('*, workspaces!agent_context_workspace_id_fkey(name)')
      .eq('auto_post_enabled', true);

    if (ctxErr) throw ctxErr;
    if (!contexts || contexts.length === 0) {
      return new Response(JSON.stringify({ message: 'No active agents' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const now = new Date();
    const brasiliaHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
    
    // Only generate AI reports at 6h, 12h, 18h, 0h (4x/day)
    // Other hours: save data-only report without AI call
    const aiReportHours = [0, 6, 12, 18];
    const shouldUseAI = aiReportHours.includes(brasiliaHour);

    for (const ctx of contexts) {
      const workspaceId = ctx.workspace_id;
      if (!workspaceId) continue;

      // Get posts from last 7 days
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentPosts } = await supabase
        .from('posts')
        .select('id, status, post_type, media_type, likes_count, comments_count, shares_count, saves_count, reach, impressions, published_at, created_at')
        .eq('workspace_id', workspaceId)
        .gte('created_at', weekAgo);

      const published = recentPosts?.filter(p => p.status === 'published') || [];
      const scheduled = recentPosts?.filter(p => p.status === 'scheduled') || [];
      const drafts = recentPosts?.filter(p => p.status === 'draft') || [];
      const totalPosts = published.length;

      // Calculate engagement
      const totalLikes = published.reduce((s, p) => s + (p.likes_count || 0), 0);
      const totalComments = published.reduce((s, p) => s + (p.comments_count || 0), 0);
      const totalShares = published.reduce((s, p) => s + (p.shares_count || 0), 0);
      const totalSaves = published.reduce((s, p) => s + (p.saves_count || 0), 0);
      const totalReach = published.reduce((s, p) => s + (p.reach || 0), 0);

      // Check affiliate links
      const { data: affiliateLinks } = await supabase
        .from('affiliate_links')
        .select('id, product_name, posts_count, is_active')
        .eq('workspace_id', workspaceId)
        .eq('is_active', true);

      // Check how many posts since last affiliate post
      const { data: lastAffiliatePost } = await supabase
        .from('posts')
        .select('id, created_at')
        .eq('workspace_id', workspaceId)
        .eq('post_type', 'afiliado')
        .order('created_at', { ascending: false })
        .limit(1);

      let postsSinceLastAffiliate = totalPosts;
      if (lastAffiliatePost && lastAffiliatePost.length > 0) {
        const afterAffiliate = published.filter(p => 
          new Date(p.published_at || p.created_at) > new Date(lastAffiliatePost[0].created_at)
        );
        postsSinceLastAffiliate = afterAffiliate.length;
      }

      // Goals progress
      const goalViews = ctx.goal_weekly_views || 10000;
      const goalFollowers = ctx.goal_weekly_followers || 100;
      const goalEngagement = ctx.goal_weekly_engagement || 5;
      const currentViews = totalReach;
      const viewsProgress = Math.min(100, Math.round((currentViews / goalViews) * 100));

      // Determine optimal posts/day based on goal progress
      let recommendedPostsPerDay: number;
      if (viewsProgress >= 100) {
        recommendedPostsPerDay = 1; // Maintenance
      } else if (viewsProgress >= 70) {
        recommendedPostsPerDay = 2;
      } else if (viewsProgress >= 40) {
        recommendedPostsPerDay = 3;
      } else {
        recommendedPostsPerDay = 4; // Aggressive
      }

      // Build report using AI
      if (!LOVABLE_API_KEY) {
        console.error('No LOVABLE_API_KEY');
        continue;
      }

      const reportPrompt = `Você é o social media do perfil de tecnologia. Faça um RELATÓRIO BREVE para o dono do perfil como um humano falaria com seu chefe.

IMPORTANTE: O agente trabalha TODAS as prioridades simultaneamente:
- 📈 Crescimento de seguidores
- 👁️ Alcance máximo  
- 🧠 Autoridade no nicho
- 🔗 Cliques / conversão

DADOS DA SEMANA:
- Posts publicados: ${totalPosts}
- Agendados: ${scheduled.length}
- Rascunhos: ${drafts.length}
- Curtidas: ${totalLikes} | Comentários: ${totalComments} | Shares: ${totalShares} | Saves: ${totalSaves}
- Alcance total: ${totalReach}
- Meta de views semanal: ${goalViews} (progresso: ${viewsProgress}%)
- Meta de seguidores: ${goalFollowers}
- Posts/dia recomendado: ${recommendedPostsPerDay}
- Links de afiliado ativos: ${affiliateLinks?.length || 0}
- Posts desde último afiliado: ${postsSinceLastAffiliate}
- Precisa postar afiliado? ${postsSinceLastAffiliate >= 4 && (affiliateLinks?.length || 0) > 0 ? 'SIM (já passou 4 posts)' : 'NÃO'}
- Hora atual Brasília: ${brasiliaHour}h

REGRAS:
1. Fale como HUMANO (social media falando pro chefe)
2. Seja BREVE (máx 3-4 parágrafos)
3. Diga o que FEZ e o que VAI FAZER
4. Explique como cada ação contribui para as 4 prioridades
5. Se precisa postar afiliado, mencione
6. Use emojis moderados
7. Termine com o plano pras próximas horas`;

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { role: 'user', content: reportPrompt }
          ]
        })
      });

      let reportContent = '';
      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        reportContent = aiData.choices?.[0]?.message?.content || '';
      }

      if (!reportContent) {
        reportContent = `📊 **Relatório da Semana**\n\nPublicamos ${totalPosts} posts com ${totalReach} de alcance. Progresso da meta: ${viewsProgress}%. Recomendo ${recommendedPostsPerDay} posts/dia.`;
      }

      // Save proactive message
      await supabase
        .from('agent_proactive_messages')
        .insert({
          workspace_id: workspaceId,
          content: reportContent,
          message_type: 'report',
          metadata: {
            total_posts: totalPosts,
            total_reach: totalReach,
            views_progress: viewsProgress,
            recommended_posts_per_day: recommendedPostsPerDay,
            needs_affiliate: postsSinceLastAffiliate >= 4 && (affiliateLinks?.length || 0) > 0,
            posts_since_affiliate: postsSinceLastAffiliate
          }
        });

      // Update agent context with recommended posts/day
      await supabase
        .from('agent_context')
        .update({ 
          daily_post_limit: recommendedPostsPerDay,
          current_weekly_views: currentViews,
          updated_at: new Date().toISOString()
        })
        .eq('workspace_id', workspaceId);

      console.log(`[Growth Report] Workspace ${workspaceId}: ${totalPosts} posts, ${viewsProgress}% progress, recommend ${recommendedPostsPerDay}/day`);
    }

    return new Response(JSON.stringify({ success: true, processed: contexts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('agent-growth-report error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
