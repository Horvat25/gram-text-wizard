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
    
    // Generate report 1x daily: 21h BRT only
    const aiReportHours = [21];
    const shouldUseAI = aiReportHours.includes(brasiliaHour);
    const shouldGenerateReport = aiReportHours.includes(brasiliaHour);

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

      const totalLikes = published.reduce((s, p) => s + (p.likes_count || 0), 0);
      const totalComments = published.reduce((s, p) => s + (p.comments_count || 0), 0);
      const totalShares = published.reduce((s, p) => s + (p.shares_count || 0), 0);
      const totalSaves = published.reduce((s, p) => s + (p.saves_count || 0), 0);
      const totalReach = published.reduce((s, p) => s + (p.reach || 0), 0);

      // Content type breakdown
      const typeBreakdown = {
        reels: published.filter(p => p.media_type === 'reels' || p.media_type === 'reel' || p.media_type === 'video').length,
        carousels: published.filter(p => p.media_type === 'carousel').length,
        news: published.filter(p => p.post_type === 'noticia' || p.post_type === 'curadoria').length,
        images: published.filter(p => p.media_type === 'image' && p.post_type !== 'noticia' && p.post_type !== 'curadoria' && p.post_type !== 'afiliado').length,
        marketing: published.filter(p => p.post_type === 'afiliado').length,
      };

      // Check affiliate links
      const { data: affiliateLinks } = await supabase
        .from('affiliate_links')
        .select('id, product_name, posts_count, is_active')
        .eq('workspace_id', workspaceId)
        .eq('is_active', true);

      // Posts since last affiliate
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

      // Source rankings — which RSS sources perform best
      const { data: rssItems } = await supabase
        .from('rss_items')
        .select('source_name, used_in_post_id')
        .eq('workspace_id', workspaceId)
        .eq('is_used', true)
        .not('used_in_post_id', 'is', null);

      let sourceRankingText = '';
      if (rssItems && rssItems.length > 0) {
        const postIds = rssItems.map(r => r.used_in_post_id).filter(Boolean) as string[];
        const { data: sourcePosts } = await supabase
          .from('posts')
          .select('id, reach, likes_count, saves_count')
          .in('id', postIds)
          .eq('status', 'published');

        const postMap: Record<string, any> = {};
        (sourcePosts || []).forEach(p => { postMap[p.id] = p; });

        const sourceMap: Record<string, { count: number; reach: number }> = {};
        rssItems.forEach(item => {
          const post = postMap[item.used_in_post_id!];
          if (!post) return;
          if (!sourceMap[item.source_name]) sourceMap[item.source_name] = { count: 0, reach: 0 };
          sourceMap[item.source_name].count++;
          sourceMap[item.source_name].reach += post.reach || 0;
        });

        const ranked = Object.entries(sourceMap)
          .sort((a, b) => b[1].reach - a[1].reach)
          .slice(0, 5);

        if (ranked.length > 0) {
          sourceRankingText = '\n\nRANKING DE FONTES (por alcance):\n' + ranked.map(([name, s], i) => 
            `${i + 1}. ${name}: ${s.count} posts, ${s.reach.toLocaleString()} alcance`
          ).join('\n');
        }
      }

      // ===== WEEKLY EVOLUTION ANALYSIS =====
      let weeklyEvolutionText = '';
      try {
        const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const { data: snapshots } = await supabase
          .from('agent_strategy_snapshots')
          .select('snapshot_date, total_reach, total_likes, total_saves, total_shares, total_comments, followers_count, posts_count, content_distribution_videos, content_distribution_carousels, content_distribution_news, content_distribution_images')
          .eq('workspace_id', workspaceId)
          .gte('snapshot_date', fourWeeksAgo)
          .order('snapshot_date', { ascending: true });

        if (snapshots && snapshots.length >= 7) {
          // Group by week
          const weekMap: Record<string, any[]> = {};
          for (const s of snapshots) {
            const d = new Date(s.snapshot_date);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d);
            monday.setDate(diff);
            const key = monday.toISOString().slice(0, 10);
            if (!weekMap[key]) weekMap[key] = [];
            weekMap[key].push(s);
          }
          
          const weeks = Object.entries(weekMap).sort(([a], [b]) => a.localeCompare(b));
          if (weeks.length >= 2) {
            weeklyEvolutionText = '\n\nEVOLUÇÃO SEMANAL:';
            for (const [weekStart, rows] of weeks) {
              const reach = rows.reduce((s: number, r: any) => s + (r.total_reach || 0), 0);
              const likes = rows.reduce((s: number, r: any) => s + (r.total_likes || 0), 0);
              const saves = rows.reduce((s: number, r: any) => s + (r.total_saves || 0), 0);
              const posts = rows.reduce((s: number, r: any) => s + (r.posts_count || 0), 0);
              const d = new Date(weekStart);
              weeklyEvolutionText += `\n- Semana ${d.getDate()}/${d.getMonth()+1}: ${reach.toLocaleString()} alcance, ${likes} likes, ${saves} saves, ${posts} posts`;
            }
            
            // Calculate trend
            const lastWeek = weeks[weeks.length - 1][1];
            const prevWeek = weeks[weeks.length - 2][1];
            const currReach = lastWeek.reduce((s: number, r: any) => s + (r.total_reach || 0), 0);
            const prevReach = prevWeek.reduce((s: number, r: any) => s + (r.total_reach || 0), 0);
            if (prevReach > 0) {
              const trendPct = Math.round(((currReach - prevReach) / prevReach) * 100);
              weeklyEvolutionText += `\n- Tendência: alcance ${trendPct >= 0 ? '+' : ''}${trendPct}% vs semana anterior`;
            }
          }
        }
      } catch (e) {
        console.log('[Growth Report] Weekly evolution analysis failed (non-critical):', e);
      }

      // Goals
      const goalViews = ctx.goal_weekly_views || 10000;
      const goalFollowers = ctx.goal_weekly_followers || 100;
      const currentViews = totalReach;
      const viewsProgress = Math.min(100, Math.round((currentViews / goalViews) * 100));

      // Strategy config
      const distVideos = ctx.content_distribution_videos || 3;
      const distCarousels = ctx.content_distribution_carousels || 2;
      const distNews = ctx.content_distribution_news || 6;
      const distImages = ctx.content_distribution_images || 3;
      const totalWeeklyGoal = distVideos + distCarousels + distNews + distImages + 1; // +1 marketing

      let recommendedPostsPerDay: number;
      if (viewsProgress >= 100) {
        recommendedPostsPerDay = 2;
      } else if (viewsProgress >= 70) {
        recommendedPostsPerDay = 3;
      } else if (viewsProgress >= 40) {
        recommendedPostsPerDay = 4;
      } else {
        recommendedPostsPerDay = 5;
      }

      let reportContent = '';
      
      // ===== WEB INTELLIGENCE: Search trending topics for report context =====
      let webTrendsText = '';
      const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
      if (shouldUseAI && firecrawlKey) {
        try {
          const niche = ctx.industry_niche || 'tecnologia';
          const [trendsRes, competitorRes] = await Promise.allSettled([
            fetch('https://api.firecrawl.dev/v1/search', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: `trending ${niche} viral Instagram hoje`, limit: 5, lang: 'pt-BR', country: 'BR', tbs: 'qdr:d' })
            }).then(r => r.json()),
            fetch('https://api.firecrawl.dev/v1/search', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: `perfis ${niche} Instagram viral engajamento 2026`, limit: 3, lang: 'pt-BR', country: 'BR', tbs: 'qdr:w' })
            }).then(r => r.json()),
          ]);
          
          const trends = trendsRes.status === 'fulfilled' ? (trendsRes.value?.data || []).slice(0, 5).map((r: any) => r.title).filter(Boolean) : [];
          const competitors = competitorRes.status === 'fulfilled' ? (competitorRes.value?.data || []).slice(0, 3).map((r: any) => r.title).filter(Boolean) : [];
          
          if (trends.length > 0) {
            webTrendsText += `\n\n🌐 TENDÊNCIAS EM TEMPO REAL:\n${trends.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}`;
          }
          if (competitors.length > 0) {
            webTrendsText += `\n\n🔍 CONTEÚDO VIRAL NO NICHO:\n${competitors.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}`;
          }
          console.log(`[Growth Report] Web intelligence: ${trends.length} trends, ${competitors.length} competitor insights`);
        } catch (e) {
          console.log('[Growth Report] Web intelligence failed (non-critical):', e);
        }
      }
      
      if (shouldUseAI && LOVABLE_API_KEY) {
        const reportPrompt = `Você é o social media do perfil de tecnologia. Faça um RELATÓRIO BREVE para o dono do perfil como um humano falaria com seu chefe.

IMPORTANTE: O agente trabalha TODAS as prioridades simultaneamente:
- 📈 Crescimento de seguidores
- 👁️ Alcance máximo  
- 🧠 Autoridade no nicho
- 🔗 Cliques / conversão

DADOS DA SEMANA:
- Posts publicados: ${totalPosts} (meta semanal: ${totalWeeklyGoal})
- Breakdown: ${typeBreakdown.reels} reels, ${typeBreakdown.carousels} carrosséis, ${typeBreakdown.news} notícias, ${typeBreakdown.images} imagens, ${typeBreakdown.marketing} marketing
- Agendados: ${scheduled.length} | Rascunhos: ${drafts.length}
- Curtidas: ${totalLikes} | Comentários: ${totalComments} | Shares: ${totalShares} | Saves: ${totalSaves}
- Alcance total: ${totalReach}
- Meta de views semanal: ${goalViews} (progresso: ${viewsProgress}%)
- Posts/dia recomendado: ${recommendedPostsPerDay}

ESTRATÉGIA CONFIGURADA (posts/semana):
- Reels: ${distVideos} | Carrosséis: ${distCarousels} | Notícias: ${distNews} | Imagens: ${distImages} | Marketing: 1
- Total semanal: ${totalWeeklyGoal} posts

PROGRESSO vs META:
- Reels: ${typeBreakdown.reels}/${distVideos} | Carrosséis: ${typeBreakdown.carousels}/${distCarousels} | Notícias: ${typeBreakdown.news}/${distNews} | Imagens: ${typeBreakdown.images}/${distImages} | Marketing: ${typeBreakdown.marketing}/1

AFILIADOS:
- Links de afiliado ativos: ${affiliateLinks?.length || 0}
- Posts desde último afiliado: ${postsSinceLastAffiliate}
- Precisa postar afiliado? ${postsSinceLastAffiliate >= 4 && (affiliateLinks?.length || 0) > 0 ? 'SIM (já passou 4 posts)' : 'NÃO'}
${sourceRankingText}${webTrendsText}

- Hora atual Brasília: ${brasiliaHour}h

REGRAS:
1. Fale como HUMANO (social media falando pro chefe)
2. Seja BREVE (máx 4-5 parágrafos)
3. Diga o que FEZ e o que VAI FAZER
4. ANALISE A ESTRATÉGIA ATUAL: compare a distribuição configurada com o que realmente foi postado e sugira ajustes se necessário
5. Se algum tipo de conteúdo está abaixo da meta semanal, destaque e diga o que vai priorizar
6. Comente sobre as fontes RSS que mais engajam e sugira priorizar ou diversificar
7. Se precisa postar afiliado, mencione
8. Use emojis moderados
9. Se houver TENDÊNCIAS EM TEMPO REAL, sugira como aproveitar nos próximos posts
10. Se houver CONTEÚDO VIRAL DE CONCORRENTES, analise o que podemos aprender
11. Termine com o plano pras próximas horas`;

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [{ role: 'user', content: reportPrompt }]
          })
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          reportContent = aiData.choices?.[0]?.message?.content || '';
        }
      }

      if (!reportContent) {
        reportContent = `📊 **Checkpoint ${brasiliaHour}h**\n\n📝 ${totalPosts}/${totalWeeklyGoal} posts (${typeBreakdown.reels} reels, ${typeBreakdown.carousels} carrosséis, ${typeBreakdown.news} notícias, ${typeBreakdown.images} imagens, ${typeBreakdown.marketing} marketing)\n📅 ${scheduled.length} agendados\n❤️ ${totalLikes} curtidas | 💬 ${totalComments} comentários | 🔄 ${totalShares} shares | 💾 ${totalSaves} saves\n👁️ Alcance: ${totalReach.toLocaleString()} (${viewsProgress}% da meta)\n📈 Recomendação: ${recommendedPostsPerDay} posts/dia`;
      }

      // Only save report to proactive_messages at 0h, 6h, 12h, 18h BRT
      if (shouldGenerateReport) {
        await supabase
          .from('agent_proactive_messages')
          .insert({
            workspace_id: workspaceId,
            content: reportContent,
            message_type: 'report',
            metadata: {
              total_posts: totalPosts,
              weekly_goal: totalWeeklyGoal,
              type_breakdown: typeBreakdown,
              total_reach: totalReach,
              views_progress: viewsProgress,
              recommended_posts_per_day: recommendedPostsPerDay,
              needs_affiliate: postsSinceLastAffiliate >= 4 && (affiliateLinks?.length || 0) > 0,
              posts_since_affiliate: postsSinceLastAffiliate,
              source_rankings: sourceRankingText,
            }
          });
        console.log(`[Growth Report] Report saved for workspace ${workspaceId} at ${brasiliaHour}h BRT`);
      } else {
        console.log(`[Growth Report] Skipping report save at ${brasiliaHour}h BRT (only at 0h, 6h, 12h, 18h)`);
      }

      await supabase
        .from('agent_context')
        .update({ 
          daily_post_limit: recommendedPostsPerDay,
          current_weekly_views: currentViews,
          updated_at: new Date().toISOString()
        })
        .eq('workspace_id', workspaceId);

      console.log(`[Growth Report] Workspace ${workspaceId}: ${totalPosts}/${totalWeeklyGoal} posts, ${viewsProgress}% progress, recommend ${recommendedPostsPerDay}/day`);
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
