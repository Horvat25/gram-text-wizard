import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define available tools for the agent
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_posts",
      description: "Cria post com imagem gerada por IA. Use quando não houver imagem real disponível ou quando o usuário pedir imagem IA. ⚠️ OBRIGATÓRIO incluir image_prompt em PORTUGUÊS descrevendo o visual futurista/tech.",
      parameters: {
        type: "object",
        properties: {
          posts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                caption: { type: "string", description: "Legenda do post em PORTUGUÊS BRASILEIRO sobre tecnologia/inovação" },
                hashtags: { type: "array", items: { type: "string" }, description: "Lista de hashtags em português" },
                post_type: { type: "string", enum: ["engajamento", "educacional", "promocional", "entretenimento"] },
                scheduled_for: { type: "string", description: "Data/hora ISO 8601 em horário Brasília. Se não fornecido, publica agora se auto_post ativo." },
                platforms: { type: "array", items: { type: "string" }, description: "Plataformas: instagram, tiktok" },
                image_prompt: { type: "string", description: "🎨 OBRIGATÓRIO! Descrição visual detalhada em PORTUGUÊS para gerar imagem. Exemplo: 'Cidade futurista com arranha-céus holográficos, tons azul neon, estilo cyberpunk, ultra realista'" }
              },
              required: ["caption", "image_prompt"]
            },
            description: "Lista de posts. CADA UM DEVE ter caption E image_prompt!"
          }
        },
        required: ["posts"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_image_for_post",
      description: "Gera uma imagem AI para um post existente. Use quando o usuário pedir para gerar imagem/visual para um post.",
      parameters: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "ID do post para adicionar a imagem" },
          image_prompt: { type: "string", description: "Descrição detalhada da imagem a gerar" }
        },
        required: ["post_id", "image_prompt"]
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "schedule_post",
      description: "Agenda um post existente para publicação. Use quando o usuário pedir para agendar um post.",
      parameters: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "ID do post a agendar" },
          scheduled_for: { type: "string", description: "Data/hora para publicar (ISO 8601)" }
        },
        required: ["post_id", "scheduled_for"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_performance_data",
      description: "Busca dados de performance dos posts. Use quando o usuário pedir análise, métricas ou relatórios.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Quantos dias de histórico buscar (padrão: 30)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_detailed_analytics",
      description: "Busca estatísticas DETALHADAS e REAIS do banco de dados. Use SEMPRE que o usuário perguntar 'quantos posts', 'quantos vídeos', 'quantas imagens', estatísticas de conteúdo, contagens, ou qualquer pergunta sobre números/dados do aplicativo.",
      parameters: {
        type: "object",
        properties: {
          query_type: { 
            type: "string", 
            enum: ["overview", "by_media_type", "by_status", "by_platform", "by_date_range", "recent_activity"],
            description: "Tipo de consulta: overview (visão geral), by_media_type (por tipo: vídeo/imagem/reel), by_status (por status), by_platform (instagram/tiktok), by_date_range (por período), recent_activity (atividade recente)"
          },
          days: { type: "number", description: "Período em dias para filtrar (padrão: 30)" }
        },
        required: ["query_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_autonomous_agent",
      description: "Executa o agente autônomo para analisar e decidir se deve criar/publicar conteúdo. Use quando o usuário pedir para 'rodar o agente' ou 'executar ciclo'.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_posts",
      description: "Lista posts existentes. Use quando o usuário perguntar sobre posts, rascunhos ou agendados.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "scheduled", "published", "all"], description: "Filtrar por status" },
          limit: { type: "number", description: "Quantidade máxima de posts (padrão: 10)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_post",
      description: "Deleta um post. Use quando o usuário pedir para remover ou excluir um post.",
      parameters: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "ID do post a deletar" }
        },
        required: ["post_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_agent_settings",
      description: "Atualiza configurações do agente. Use quando o usuário quiser mudar preferências.",
      parameters: {
        type: "object",
        properties: {
          auto_post_enabled: { type: "boolean", description: "Ativar/desativar auto-post" },
          daily_post_limit: { type: "number", description: "Limite diário de posts" },
          min_hours_between_posts: { type: "number", description: "Intervalo mínimo entre posts (horas)" },
          brand_voice: { type: "string", description: "Voz/tom da marca" },
          preferred_platforms: { type: "array", items: { type: "string" }, description: "Plataformas preferidas" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_narrated_video",
      description: "🎬 OBRIGATÓRIO para VÍDEO, REELS ou conteúdo NARRADO! Cria vídeo com roteiro viral, múltiplas imagens cinematográficas e narração em áudio. Use SEMPRE que o usuário mencionar: 'vídeo', 'reels', 'reel', 'conteúdo narrado', 'vídeo narrado', 'stories', 'shorts'. Este é o ÚNICO método para criar vídeos!",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Tema do vídeo (DEVE ser sobre tecnologia, inovação, futuro, IA)" },
          caption: { type: "string", description: "Legenda do post para Instagram/TikTok" },
          hashtags: { type: "array", items: { type: "string" }, description: "Hashtags relevantes" },
          scheduled_for: { type: "string", description: "Data/hora para agendar (ISO 8601, horário de Brasília). Se não fornecido, será rascunho." },
          publish_now: { type: "boolean", description: "Se true, publicar assim que o vídeo estiver pronto (em vez de agendar)." },
          platforms: { type: "array", items: { type: "string" }, description: "Plataformas: instagram, tiktok" },
          style: { type: "string", description: "Estilo do vídeo: impactante, educativo, provocativo, inspirador" }
        },
        required: ["topic", "caption"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_carousel",
      description: "Cria um carrossel com múltiplas imagens (2-10 slides). Cada slide terá uma imagem gerada. Use quando o usuário pedir carrossel, slides, ou múltiplas imagens.",
      parameters: {
        type: "object",
        properties: {
          caption: { type: "string", description: "Legenda principal do carrossel" },
          slides: {
            type: "array",
            items: {
              type: "object",
              properties: {
                image_prompt: { type: "string", description: "Descrição da imagem para este slide (estilo futurista, tech)" }
              },
              required: ["image_prompt"]
            },
            description: "Lista de slides (2-10), cada um com image_prompt para gerar a imagem"
          },
          hashtags: { type: "array", items: { type: "string" }, description: "Hashtags relevantes" },
          scheduled_for: { type: "string", description: "Data/hora para agendar (ISO 8601, horário de Brasília). Se não fornecido, será rascunho." },
          platforms: { type: "array", items: { type: "string" }, description: "Plataformas: instagram, tiktok" }
        },
        required: ["caption", "slides"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_news_post",
      description: "📰 MÉTODO PRINCIPAL para posts de IMAGEM! Busca imagem REAL da web (nunca gera com IA). Atua como CURADOR EDITORIAL: seleciona foto real da notícia/fonte, cria headline impactante, legenda em 3 blocos. Use para QUALQUER post que precise de imagem profissional real.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Tema a buscar (ex: 'Sam Altman OpenAI', 'robô humanoide', 'chip Nvidia')" },
          headline_text: { type: "string", description: "Texto curto para overlay na imagem (máx 2 linhas, gera curiosidade, cria tensão)" },
          caption_block1: { type: "string", description: "Bloco 1 da legenda: frase de impacto curta" },
          caption_block2: { type: "string", description: "Bloco 2 da legenda: contexto mínimo (suficiente para entender)" },
          caption_block3: { type: "string", description: "Bloco 3 da legenda: reflexão, consequência ou pergunta implícita" },
          caption_style: { type: "string", enum: ["informativo", "opinativo", "provocativo", "educacional"], description: "Estilo editorial" },
          scheduled_for: { type: "string", description: "Data/hora para agendar (ISO 8601). Se não fornecido, será rascunho." },
          platforms: { type: "array", items: { type: "string" }, description: "Plataformas: instagram, tiktok" }
        },
        required: ["topic"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_curated_post",
      description: "🖼️ Cria post com IMAGEM REAL da internet (fotos, frames, imagens institucionais). Como CURADOR EDITORIAL: busca imagem real, aplica headline, cria legenda em 3 blocos. Use quando NÃO for notícia mas precisar de imagem real (não IA).",
      parameters: {
        type: "object",
        properties: {
          search_query: { type: "string", description: "Busca para encontrar imagem real (ex: 'CEO tech conference', 'robot factory', 'AI chip closeup')" },
          headline_text: { type: "string", description: "Texto curto para overlay na imagem (máx 2 linhas, gera curiosidade)" },
          caption_block1: { type: "string", description: "Bloco 1: frase de impacto curta" },
          caption_block2: { type: "string", description: "Bloco 2: contexto mínimo" },
          caption_block3: { type: "string", description: "Bloco 3: reflexão ou pergunta implícita" },
          hashtags: { type: "array", items: { type: "string" }, description: "Hashtags relevantes" },
          scheduled_for: { type: "string", description: "Data/hora para agendar (ISO 8601)" },
          platforms: { type: "array", items: { type: "string" }, description: "Plataformas: instagram, tiktok" }
        },
        required: ["search_query", "headline_text", "caption_block1"]
      }
    }
  }
];

// Helper function to convert Brasília time to UTC
// The AI sends times as if they are in Brasília (UTC-3), so we need to convert to UTC for storage
function convertBrasiliaToUTC(dateString: string): string {
  if (!dateString) return dateString;
  
  // Parse the date string
  const date = new Date(dateString);
  
  // Check if it's already a valid date
  if (isNaN(date.getTime())) {
    console.error('Invalid date string:', dateString);
    return dateString;
  }
  
  // If the date string doesn't include timezone info (no Z or +/-), 
  // treat it as Brasília time and add 3 hours to convert to UTC
  const hasTimezone = dateString.includes('Z') || /[+-]\d{2}:\d{2}$/.test(dateString);
  
  if (!hasTimezone) {
    // The date is in Brasília time (UTC-3), so we need to add 3 hours to get UTC
    const utcDate = new Date(date.getTime() + (3 * 60 * 60 * 1000));
    return utcDate.toISOString();
  }
  
  return date.toISOString();
}

// Helper to format date for display in Brasília time
function formatBrasiliaTime(isoString: string): string {
  return new Date(isoString).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Tool execution functions
async function executeCreatePosts(supabase: any, userId: string, args: any) {
  const { posts } = args;
  const createdPosts = [];
  
  // Check if user has auto_post_enabled
  const { data: agentContext } = await supabase
    .from('agent_context')
    .select('auto_post_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  
  const autoPostEnabled = agentContext?.auto_post_enabled ?? false;
  console.log('[CREATE_POSTS] Auto post enabled:', autoPostEnabled);
  
  for (const post of posts) {
    // Convert scheduled_for to UTC if provided
    const scheduledForUTC = post.scheduled_for ? convertBrasiliaToUTC(post.scheduled_for) : null;
    
    // Status válidos: draft, scheduled, published, failed
    // Se agendado usa 'scheduled', senão usa 'draft' (depois publicamos se auto_post ativo)
    const status = scheduledForUTC ? 'scheduled' : 'draft';
    
    const postData = {
      user_id: userId,
      caption: post.caption,
      hashtags: post.hashtags || [],
      post_type: post.post_type || 'engajamento',
      platforms: post.platforms || ['instagram'],
      status,
      scheduled_for: scheduledForUTC,
      media_type: 'image'
    };
    
    console.log('Creating post with scheduled_for:', {
      original: post.scheduled_for,
      converted_to_utc: scheduledForUTC,
      will_display_as: scheduledForUTC ? formatBrasiliaTime(scheduledForUTC) : null,
      status,
      auto_publish: autoPostEnabled && !scheduledForUTC
    });
    
    const { data, error } = await supabase
      .from('posts')
      .insert(postData)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating post:', error);
      continue;
    }
    
    // Automatically generate image if prompt provided
    if (post.image_prompt && data?.id) {
      try {
        console.log('Generating image for post:', data.id, 'prompt:', post.image_prompt);
        
        const imageResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({ 
            prompt: post.image_prompt,
            userId,
            postId: data.id
          })
        });
        
        if (imageResponse.ok) {
          const imageResult = await imageResponse.json();
          if (imageResult.imageUrl) {
            await supabase
              .from('posts')
              .update({ image_url: imageResult.imageUrl })
              .eq('id', data.id);
            data.image_url = imageResult.imageUrl;
            
            // If auto_post_enabled and not scheduled, publish immediately after image is ready
            if (autoPostEnabled && !scheduledForUTC && imageResult.imageUrl) {
              console.log('[AUTO_PUBLISH] Publishing post immediately:', data.id);
              
              for (const platform of (post.platforms || ['instagram'])) {
                try {
                  if (platform === 'instagram') {
                    const publishResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/publish-post`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                      },
                      body: JSON.stringify({ postId: data.id })
                    });
                    
                    if (publishResponse.ok) {
                      console.log('[AUTO_PUBLISH] Published to Instagram successfully!');
                      data.status = 'published';
                    } else {
                      console.error('[AUTO_PUBLISH] Failed to publish to Instagram:', await publishResponse.text());
                    }
                  } else if (platform === 'tiktok') {
                    const publishResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/publish-to-tiktok`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                      },
                      body: JSON.stringify({ postId: data.id })
                    });
                    
                    if (publishResponse.ok) {
                      console.log('[AUTO_PUBLISH] Published to TikTok successfully!');
                    } else {
                      console.error('[AUTO_PUBLISH] Failed to publish to TikTok');
                    }
                  }
                } catch (pubError) {
                  console.error(`[AUTO_PUBLISH] Error publishing to ${platform}:`, pubError);
                }
              }
            }
          }
        } else {
          console.error('Image generation failed:', await imageResponse.text());
        }
      } catch (imgError) {
        console.error('Error generating image:', imgError);
      }
    }
    
    createdPosts.push(data);
  }
  
  const withImages = createdPosts.filter(p => p.image_url).length;
  const scheduledPosts = createdPosts.filter(p => p.scheduled_for);
  const publishedPosts = createdPosts.filter(p => p.status === 'published');
  
  // Format scheduled times for display
  const scheduleInfo = scheduledPosts.length > 0 
    ? `\n📅 Agendado(s) para: ${scheduledPosts.map(p => formatBrasiliaTime(p.scheduled_for)).join(', ')}`
    : '';
  
  const publishInfo = publishedPosts.length > 0
    ? `\n🚀 ${publishedPosts.length} post(s) publicado(s) automaticamente!`
    : '';
  
  return {
    success: true,
    message: `✅ ${createdPosts.length} post(s) criado(s)! ${withImages > 0 ? `🎨 ${withImages} imagem(ns) gerada(s)` : '⚠️ Sem imagens (image_prompt não fornecido)'}${publishInfo}${scheduleInfo}`,
    posts: createdPosts.map(p => ({
      id: p.id,
      caption: p.caption.slice(0, 50) + '...',
      status: p.status,
      scheduled_for: p.scheduled_for,
      scheduled_for_brasilia: p.scheduled_for ? formatBrasiliaTime(p.scheduled_for) : null,
      has_image: !!p.image_url,
      published: p.status === 'published'
    }))
  };
}

async function executeGenerateImage(supabase: any, userId: string, args: any) {
  const { post_id, image_prompt } = args;
  
  // Call the generate-image function
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
    },
    body: JSON.stringify({ 
      prompt: image_prompt,
      userId,
      postId: post_id
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, message: `❌ Erro ao gerar imagem: ${errorText}` };
  }
  
  const result = await response.json();
  
  // Update the post with the image URL
  if (result.imageUrl) {
    await supabase
      .from('posts')
      .update({ image_url: result.imageUrl })
      .eq('id', post_id)
      .eq('user_id', userId);
  }
  
  return {
    success: true,
    message: `🎨 Imagem gerada com sucesso!`,
    imageUrl: result.imageUrl
  };
}

async function executeSchedulePost(supabase: any, userId: string, args: any) {
  const { post_id, scheduled_for } = args;
  
  // Convert to UTC for storage
  const scheduledForUTC = convertBrasiliaToUTC(scheduled_for);
  
  console.log('Scheduling post:', {
    post_id,
    original_time: scheduled_for,
    converted_to_utc: scheduledForUTC,
    will_display_as: formatBrasiliaTime(scheduledForUTC)
  });
  
  const { data, error } = await supabase
    .from('posts')
    .update({ 
      status: 'scheduled',
      scheduled_for: scheduledForUTC
    })
    .eq('id', post_id)
    .eq('user_id', userId)
    .select()
    .single();
  
  if (error) {
    return { success: false, message: `❌ Erro ao agendar: ${error.message}` };
  }
  
  return {
    success: true,
    message: `📅 Post agendado para ${formatBrasiliaTime(scheduledForUTC)} (horário de Brasília)`,
    post: data,
    scheduled_for_brasilia: formatBrasiliaTime(scheduledForUTC)
  };
}

async function executeGetPerformance(supabase: any, userId: string, args: any) {
  const days = args.days || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const { data: posts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'published')
    .gte('published_at', since.toISOString())
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Error fetching posts:', error);
    return {
      success: false,
      message: `❌ Erro ao buscar dados: ${error.message}`
    };
  }
  
  if (!posts || posts.length === 0) {
    return {
      success: true,
      message: `📊 Nenhum post publicado nos últimos ${days} dias no banco de dados.`,
      data: { total_posts: 0 }
    };
  }

  // REAL metrics criteria:
  // - Must have instagram_post_id (means it was actually published to Instagram)
  // - Must have reach >= 10 (filters out missing/placeholder values)
  const isRealMetricsPost = (p: any) => {
    const hasIgId = !!p.instagram_post_id;
    const reach = typeof p.reach === 'number' ? p.reach : 0;
    return hasIgId && reach >= 10;
  };

  const postsWithRealMetrics = posts.filter(isRealMetricsPost);
  const ignoredPosts = posts.filter((p: any) => !isRealMetricsPost(p));

  // Calculate totals ONLY from real metrics (never from simulated/placeholder)
  const totalLikes = postsWithRealMetrics.reduce((acc: number, p: any) => acc + (p.likes_count || 0), 0);
  const totalComments = postsWithRealMetrics.reduce((acc: number, p: any) => acc + (p.comments_count || 0), 0);
  const totalSaves = postsWithRealMetrics.reduce((acc: number, p: any) => acc + (p.saves_count || 0), 0);
  const totalReach = postsWithRealMetrics.reduce((acc: number, p: any) => acc + (p.reach || 0), 0);

  const avgEngagement = totalReach > 0
    ? ((totalLikes + totalComments + totalSaves) / totalReach * 100).toFixed(2)
    : '0.00';

  // Find top performing post ONLY among real-metrics posts
  const sortedByEngagement = [...postsWithRealMetrics]
    .filter((p: any) => (p.reach || 0) > 0)
    .sort((a: any, b: any) => {
      const engA = ((a.likes_count || 0) + (a.comments_count || 0) + (a.saves_count || 0)) / (a.reach || 1);
      const engB = ((b.likes_count || 0) + (b.comments_count || 0) + (b.saves_count || 0)) / (b.reach || 1);
      return engB - engA;
    });

  const topPost = sortedByEngagement[0];
  const hasRealMetrics = postsWithRealMetrics.length > 0;

  return {
    success: true,
    message: hasRealMetrics
      ? `📊 Performance REAL dos últimos ${days} dias (${postsWithRealMetrics.length} posts com métricas do Instagram)`
      : `📊 Ainda não há métricas REAIS sincronizadas (ignorado ${ignoredPosts.length} post(s) sem métricas reais)` ,
    data: {
      total_posts_published_in_period: posts.length,
      posts_with_real_metrics: postsWithRealMetrics.length,
      ignored_posts_without_real_metrics: ignoredPosts.length,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_saves: totalSaves,
      total_reach: totalReach,
      avg_engagement: `${avgEngagement}%`,
      metrics_status: hasRealMetrics
        ? '✅ Métricas reais sincronizadas'
        : '⚠️ Sem métricas reais: publique no Instagram e clique em Sincronizar do Instagram',
      top_post: topPost ? {
        id: topPost.id,
        caption: topPost.caption.slice(0, 80) + (topPost.caption.length > 80 ? '...' : ''),
        likes: topPost.likes_count || 0,
        comments: topPost.comments_count || 0,
        saves: topPost.saves_count || 0,
        reach: topPost.reach || 0,
        engagement: (topPost.reach || 0) > 0
          ? (((topPost.likes_count || 0) + (topPost.comments_count || 0) + (topPost.saves_count || 0)) / topPost.reach * 100).toFixed(2) + '%'
          : '0%'
      } : null
    }
  };
}

// NEW: Detailed analytics function that queries REAL data from database
async function executeDetailedAnalytics(supabase: any, userId: string, args: any) {
  const { query_type, days = 30 } = args;
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Fetch ALL posts for this user
  const { data: allPosts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    return { success: false, message: `❌ Erro ao buscar dados: ${error.message}` };
  }

  if (!allPosts || allPosts.length === 0) {
    return {
      success: true,
      message: `📊 Nenhum post encontrado no banco de dados.`,
      data: { total: 0 }
    };
  }

  // Calculate real statistics based on query type
  switch (query_type) {
    case 'overview': {
      const total = allPosts.length;
      const published = allPosts.filter((p: any) => p.status === 'published').length;
      const scheduled = allPosts.filter((p: any) => p.status === 'scheduled').length;
      const drafts = allPosts.filter((p: any) => p.status === 'draft').length;
      const videos = allPosts.filter((p: any) => p.media_type === 'video' || p.video_url).length;
      const images = allPosts.filter((p: any) => p.media_type === 'image' && p.image_url && !p.video_url).length;
      const reels = allPosts.filter((p: any) => p.media_type === 'reel').length;
      const carousels = allPosts.filter((p: any) => p.media_type === 'carousel' || (p.carousel_images && p.carousel_images.length > 0)).length;
      const withMedia = allPosts.filter((p: any) => p.image_url || p.video_url || (p.carousel_images && p.carousel_images.length > 0)).length;
      const withoutMedia = total - withMedia;

      return {
        success: true,
        message: `📊 **VISÃO GERAL REAL DO BANCO DE DADOS**`,
        data: {
          total_posts: total,
          por_status: {
            publicados: published,
            agendados: scheduled,
            rascunhos: drafts
          },
          por_tipo_de_midia: {
            videos: videos,
            imagens: images,
            reels: reels,
            carroseis: carousels
          },
          midia: {
            com_midia: withMedia,
            sem_midia: withoutMedia
          }
        }
      };
    }

    case 'by_media_type': {
      const videos = allPosts.filter((p: any) => p.media_type === 'video' || p.video_url);
      const images = allPosts.filter((p: any) => p.media_type === 'image' && p.image_url && !p.video_url);
      const reels = allPosts.filter((p: any) => p.media_type === 'reel');
      const carousels = allPosts.filter((p: any) => p.media_type === 'carousel' || (p.carousel_images && p.carousel_images.length > 0));

      return {
        success: true,
        message: `🎬 **ANÁLISE POR TIPO DE MÍDIA**`,
        data: {
          videos: {
            total: videos.length,
            publicados: videos.filter((p: any) => p.status === 'published').length,
            agendados: videos.filter((p: any) => p.status === 'scheduled').length
          },
          imagens: {
            total: images.length,
            publicados: images.filter((p: any) => p.status === 'published').length,
            agendados: images.filter((p: any) => p.status === 'scheduled').length
          },
          reels: {
            total: reels.length,
            publicados: reels.filter((p: any) => p.status === 'published').length,
            agendados: reels.filter((p: any) => p.status === 'scheduled').length
          },
          carroseis: {
            total: carousels.length,
            publicados: carousels.filter((p: any) => p.status === 'published').length,
            agendados: carousels.filter((p: any) => p.status === 'scheduled').length
          }
        }
      };
    }

    case 'by_status': {
      const published = allPosts.filter((p: any) => p.status === 'published');
      const scheduled = allPosts.filter((p: any) => p.status === 'scheduled');
      const drafts = allPosts.filter((p: any) => p.status === 'draft');
      const failed = allPosts.filter((p: any) => p.status === 'failed');

      return {
        success: true,
        message: `📋 **ANÁLISE POR STATUS**`,
        data: {
          publicados: {
            total: published.length,
            ultimo: published.length > 0 ? new Date(published[0].published_at || published[0].created_at).toLocaleDateString('pt-BR') : null
          },
          agendados: {
            total: scheduled.length,
            proximos: scheduled.slice(0, 3).map((p: any) => ({
              caption: p.caption.slice(0, 40) + '...',
              data: p.scheduled_for ? new Date(p.scheduled_for).toLocaleString('pt-BR') : 'N/A'
            }))
          },
          rascunhos: {
            total: drafts.length
          },
          falhas: {
            total: failed.length
          }
        }
      };
    }

    case 'by_platform': {
      const instagram = allPosts.filter((p: any) => !p.platforms || p.platforms.includes('instagram'));
      const tiktok = allPosts.filter((p: any) => p.platforms && p.platforms.includes('tiktok'));

      return {
        success: true,
        message: `📱 **ANÁLISE POR PLATAFORMA**`,
        data: {
          instagram: {
            total: instagram.length,
            publicados: instagram.filter((p: any) => p.status === 'published').length,
            com_instagram_post_id: instagram.filter((p: any) => p.instagram_post_id).length
          },
          tiktok: {
            total: tiktok.length,
            publicados: tiktok.filter((p: any) => p.status === 'published').length,
            com_tiktok_post_id: tiktok.filter((p: any) => p.tiktok_post_id).length
          }
        }
      };
    }

    case 'by_date_range': {
      const recentPosts = allPosts.filter((p: any) => new Date(p.created_at) >= since);
      const today = new Date();
      const last7Days = allPosts.filter((p: any) => {
        const created = new Date(p.created_at);
        const diff = (today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 7;
      });
      const last30Days = allPosts.filter((p: any) => {
        const created = new Date(p.created_at);
        const diff = (today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 30;
      });

      return {
        success: true,
        message: `📅 **ANÁLISE TEMPORAL (últimos ${days} dias)**`,
        data: {
          ultimos_7_dias: last7Days.length,
          ultimos_30_dias: last30Days.length,
          periodo_solicitado: {
            dias: days,
            posts: recentPosts.length
          },
          total_historico: allPosts.length
        }
      };
    }

    case 'recent_activity': {
      const sortedPosts = [...allPosts].sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const recent = sortedPosts.slice(0, 5);

      return {
        success: true,
        message: `🕐 **ATIVIDADE RECENTE**`,
        data: {
          ultimos_5_posts: recent.map((p: any) => ({
            id: p.id,
            caption: p.caption.slice(0, 50) + '...',
            tipo: p.media_type || 'image',
            status: p.status,
            criado_em: new Date(p.created_at).toLocaleString('pt-BR'),
            tem_midia: !!(p.image_url || p.video_url)
          }))
        }
      };
    }

    default:
      return { success: false, message: `Tipo de consulta desconhecido: ${query_type}` };
  }
}

async function executeRunAgent(supabase: any, userId: string) {
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-agent-core`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
    },
    body: JSON.stringify({ userId })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, message: `❌ Erro ao executar agente: ${errorText}` };
  }
  
  const result = await response.json();
  
  return {
    success: true,
    message: `🤖 Agente executado!`,
    result: {
      decision: result.decision,
      reason: result.decisionReason,
      hypothesis: result.hypothesis,
      post_created: result.postId ? true : false
    }
  };
}

async function executeListPosts(supabase: any, userId: string, args: any) {
  const status = args.status || 'all';
  const limit = args.limit || 10;
  
  let query = supabase
    .from('posts')
    .select('id, caption, status, scheduled_for, published_at, likes_count, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (status !== 'all') {
    query = query.eq('status', status);
  }
  
  const { data: posts, error } = await query;
  
  if (error) {
    return { success: false, message: `❌ Erro: ${error.message}` };
  }
  
  return {
    success: true,
    message: `📋 ${posts.length} post(s) encontrado(s)`,
    posts: posts.map((p: any) => ({
      id: p.id,
      caption: p.caption.slice(0, 60) + (p.caption.length > 60 ? '...' : ''),
      status: p.status,
      scheduled_for: p.scheduled_for,
      likes: p.likes_count
    }))
  };
}

async function executeDeletePost(supabase: any, userId: string, args: any) {
  const { post_id } = args;
  
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', post_id)
    .eq('user_id', userId);
  
  if (error) {
    return { success: false, message: `❌ Erro ao deletar: ${error.message}` };
  }
  
  return {
    success: true,
    message: `🗑️ Post deletado com sucesso!`
  };
}

async function executeUpdateSettings(supabase: any, userId: string, args: any) {
  // Check if context exists
  const { data: existing } = await supabase
    .from('agent_context')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  
  const updateData: any = {};
  if (args.auto_post_enabled !== undefined) updateData.auto_post_enabled = args.auto_post_enabled;
  if (args.daily_post_limit !== undefined) updateData.daily_post_limit = args.daily_post_limit;
  if (args.min_hours_between_posts !== undefined) updateData.min_hours_between_posts = args.min_hours_between_posts;
  if (args.brand_voice !== undefined) updateData.brand_voice = args.brand_voice;
  if (args.preferred_platforms !== undefined) updateData.preferred_platforms = args.preferred_platforms;
  
  if (existing) {
    const { error } = await supabase
      .from('agent_context')
      .update(updateData)
      .eq('user_id', userId);
    
    if (error) {
      return { success: false, message: `❌ Erro: ${error.message}` };
    }
  } else {
    const { error } = await supabase
      .from('agent_context')
      .insert({ user_id: userId, ...updateData });
    
    if (error) {
      return { success: false, message: `❌ Erro: ${error.message}` };
    }
  }
  
  return {
    success: true,
    message: `⚙️ Configurações atualizadas!`,
    settings: updateData
  };
}

// Execute create_narrated_video - creates a video post with script for frontend processing
async function executeCreateNarratedVideo(supabase: any, userId: string, args: any) {
  const { topic, caption, hashtags, scheduled_for, publish_now, platforms, style } = args;
  
  console.log('Creating narrated video for topic:', topic, '| publish_now:', publish_now);
  
  try {
    // Step 1: Generate the story script using AI
    const scriptResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-story-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        topic,
        segmentCount: 4,
        wordsPerSegment: 12,
        totalDuration: 20,
        style: style || 'impactante e provocativo'
      })
    });
    
    if (!scriptResponse.ok) {
      const errorText = await scriptResponse.text();
      console.error('Script generation failed:', errorText);
      return { success: false, message: `❌ Erro ao gerar roteiro: ${errorText}` };
    }
    
    const script = await scriptResponse.json();
    console.log('Script generated:', script.title, '- Segments:', script.segments?.length);
    
    // Step 2: Generate image for first segment as thumbnail
    let thumbnailUrl = null;
    if (script.segments && script.segments.length > 0) {
      try {
        const imageResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            prompt: `${script.segments[0].imagePrompt}. Cinematic style, high quality, 9:16 vertical aspect ratio for Instagram Reels.`,
            format: 'portrait',
            model: 'gemini'
          })
        });
        
        if (imageResponse.ok) {
          const imageResult = await imageResponse.json();
          thumbnailUrl = imageResult.imageUrl;
          console.log('Thumbnail generated:', thumbnailUrl);
        }
      } catch (imgError) {
        console.error('Thumbnail generation failed:', imgError);
      }
    }
    
    // Step 3: Create the post with video metadata
    const scheduledForUTC = scheduled_for ? convertBrasiliaToUTC(scheduled_for) : null;
    
    const postData = {
      user_id: userId,
      caption: caption || `🎬 ${script.title}\n\n${topic}`,
      hashtags: hashtags || ['#tecnologia', '#inovacao', '#futuro', '#ia', '#reels'],
      post_type: 'entretenimento',
      platforms: platforms || ['instagram', 'tiktok'],
      status: scheduledForUTC ? 'scheduled' : 'draft',
      scheduled_for: scheduledForUTC,
      media_type: 'reels',
      image_url: thumbnailUrl, // Thumbnail for preview
      // Store script data in overlay_metadata for frontend processing
      overlay_metadata: {
        type: 'narrated_video',
        script: script,
        topic: topic,
        style: style,
        needs_processing: true, // Flag for frontend to process
        created_by_agent: true,
        publish_after_render: publish_now === true, // Flag to auto-publish after video is rendered
      }
    };
    
    const { data: post, error } = await supabase
      .from('posts')
      .insert(postData)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating video post:', error);
      return { success: false, message: `❌ Erro ao criar post: ${error.message}` };
    }
    
    // Determine next step message
    let nextStepMessage = '';
    if (publish_now) {
      nextStepMessage = '⚡ **Próximo passo:** Abra a aba "Fila" e clique em "Gerar Vídeo" para renderizar e publicar automaticamente!';
    } else if (scheduledForUTC) {
      nextStepMessage = `📅 Agendado para ${formatBrasiliaTime(scheduledForUTC)}\n⚡ **Próximo passo:** Abra a aba "Fila" e clique em "Gerar Vídeo" para renderizar o Reels antes do horário agendado!`;
    } else {
      nextStepMessage = '📝 Salvo como rascunho\n⚡ **Próximo passo:** Abra a aba "Fila" e clique em "Gerar Vídeo" para renderizar o Reels!';
    }
    
    return {
      success: true,
      message: `🎬 Vídeo narrado criado!\n\n📜 Título: "${script.title}"\n🎞️ ${script.segments?.length || 4} cenas cinematográficas\n${thumbnailUrl ? '🖼️ Thumbnail gerada' : ''}\n\n${nextStepMessage}`,
      post: {
        id: post.id,
        title: script.title,
        segments: script.segments?.length || 4,
        status: post.status,
        has_thumbnail: !!thumbnailUrl,
        needs_rendering: true,
        publish_after_render: publish_now === true,
      },
      // Special action for frontend to handle
      requires_frontend_action: {
        type: 'render_video',
        post_id: post.id,
        auto_publish: publish_now === true,
      }
    };
  } catch (error: any) {
    console.error('Error in executeCreateNarratedVideo:', error);
    return { success: false, message: `❌ Erro: ${error.message}` };
  }
}

// Execute create_carousel - creates a carousel post with multiple images
async function executeCreateCarousel(supabase: any, userId: string, args: any) {
  const { caption, slides, hashtags, scheduled_for, platforms } = args;
  
  if (!slides || slides.length < 2) {
    return { success: false, message: '❌ Carrossel precisa de pelo menos 2 slides!' };
  }
  
  if (slides.length > 10) {
    return { success: false, message: '❌ Carrossel pode ter no máximo 10 slides!' };
  }
  
  console.log('Creating carousel with', slides.length, 'slides');
  
  const carouselImages: string[] = [];
  let generatedCount = 0;
  
  // Generate images for each slide
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    try {
      console.log(`Generating image ${i + 1}/${slides.length}:`, slide.image_prompt);
      
      const imageResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          prompt: `${slide.image_prompt}. High quality, professional, Instagram-ready, square 1:1 aspect ratio.`,
          format: 'square',
          model: 'gemini'
        })
      });
      
      if (imageResponse.ok) {
        const imageResult = await imageResponse.json();
        if (imageResult.imageUrl) {
          carouselImages.push(imageResult.imageUrl);
          generatedCount++;
          console.log(`Image ${i + 1} generated successfully`);
        }
      } else {
        console.error(`Failed to generate image ${i + 1}:`, await imageResponse.text());
      }
    } catch (imgError) {
      console.error(`Error generating image ${i + 1}:`, imgError);
    }
  }
  
  if (carouselImages.length < 2) {
    return { success: false, message: `❌ Não foi possível gerar imagens suficientes. Apenas ${carouselImages.length} de ${slides.length} foram geradas.` };
  }
  
  // Create the carousel post
  const scheduledForUTC = scheduled_for ? convertBrasiliaToUTC(scheduled_for) : null;
  
  const postData = {
    user_id: userId,
    caption,
    hashtags: hashtags || ['#tecnologia', '#inovacao', '#carrossel'],
    post_type: 'educacional',
    platforms: platforms || ['instagram'],
    status: scheduledForUTC ? 'scheduled' : 'draft',
    scheduled_for: scheduledForUTC,
    media_type: 'carousel',
    image_url: carouselImages[0], // First image as main preview
    carousel_images: carouselImages
  };
  
  const { data: post, error } = await supabase
    .from('posts')
    .insert(postData)
    .select()
    .single();
  
  if (error) {
    console.error('Error creating carousel post:', error);
    return { success: false, message: `❌ Erro ao criar carrossel: ${error.message}` };
  }
  
  const scheduleInfo = scheduledForUTC 
    ? `📅 Agendado para ${formatBrasiliaTime(scheduledForUTC)}`
    : '📝 Salvo como rascunho';
  
  return {
    success: true,
    message: `🎠 Carrossel criado com sucesso!\n\n🖼️ ${generatedCount}/${slides.length} imagens geradas\n${scheduleInfo}`,
    post: {
      id: post.id,
      slides_count: carouselImages.length,
      status: post.status,
      scheduled_for_brasilia: scheduledForUTC ? formatBrasiliaTime(scheduledForUTC) : null
    }
  };
}

// Execute create_news_post - fetches real news, uses article image, includes source
// With AI fallback when Firecrawl is unavailable
async function executeCreateNewsPost(supabase: any, userId: string, args: any) {
  const { 
    topic, 
    headline_text,
    caption_block1,
    caption_block2,
    caption_block3,
    caption_style, 
    scheduled_for, 
    platforms 
  } = args;
  
  console.log('[NEWS_POST] Creating news post for topic:', topic);
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  try {
    let selectedArticle: any = null;
    let selectedImage: string | null = null;
    let sourceDomain = 'IA';
    let sourceUrl = '';
    let usedAiFallback = false;
    
    // Try to fetch real news with Firecrawl
    try {
      const searchResponse = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          query: `${topic} notícia recente tecnologia`,
          limit: 10,
          lang: 'pt-BR',
          country: 'BR'
        })
      });
      
      if (searchResponse.ok) {
        const searchResult = await searchResponse.json();
        const newsArticles = searchResult.data || [];
        
        if (newsArticles.length > 0) {
          // Find article with quality images
          const articlesWithImages = newsArticles
            .filter((a: any) => a.images && a.images.length > 0)
            .sort((a: any, b: any) => (b.images?.length || 0) - (a.images?.length || 0));
          
          selectedArticle = articlesWithImages[0] || newsArticles[0];
          
          if (selectedArticle.images?.length > 0) {
            const qualityImages = selectedArticle.images.filter((img: string) => 
              img && !img.includes('icon') && !img.includes('logo') && 
              !img.includes('avatar') && !img.includes('1x1') && !img.includes('favicon')
            );
            selectedImage = qualityImages[0] || selectedArticle.images[0];
          }
          
          sourceUrl = selectedArticle.url || '';
          try {
            sourceDomain = new URL(sourceUrl).hostname.replace('www.', '');
          } catch { sourceDomain = 'fonte externa'; }
          
          console.log('[NEWS_POST] Found real article:', selectedArticle.title);
        }
      }
    } catch (searchError) {
      console.log('[NEWS_POST] Firecrawl unavailable, using AI fallback');
    }
    
    // FALLBACK: If Firecrawl failed, create content with AI
    if (!selectedArticle) {
      console.log('[NEWS_POST] Using AI fallback for topic:', topic);
      usedAiFallback = true;
      
      // Generate image with AI
      const currentYear = new Date().getFullYear();
      const imagePrompt = `Fotografia profissional de alta qualidade relacionada a: ${topic}.
Estilo: jornalístico, editorial, moderno, ${currentYear}.
Iluminação cinematográfica, cores vibrantes, foco definido.
IMPORTANTE: Não adicione texto na imagem. Imagem limpa para overlay posterior.
Proporção quadrada 1:1 para Instagram.`;
      
      const imageResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          prompt: imagePrompt,
          format: 'square',
          model: 'gemini'
        })
      });
      
      if (imageResponse.ok) {
        const imageResult = await imageResponse.json();
        selectedImage = imageResult.imageUrl;
        console.log('[NEWS_POST] AI image generated');
      }
      
      sourceDomain = 'Conteúdo IA';
    }
    
    // Build caption
    let caption = '';
    let hashtags: string[] = [];
    
    if (caption_block1) {
      // 3-block format from agent
      const captionParts = [caption_block1];
      if (caption_block2) captionParts.push(caption_block2);
      if (caption_block3) captionParts.push(caption_block3);
      caption = captionParts.join('\n\n');
      hashtags = ['#tecnologia', '#inovação', '#ia', '#futuro'];
    } else if (selectedArticle) {
      // Generate from article
      caption = `📰 ${selectedArticle.title}\n\n${selectedArticle.description || ''}\n\n📰 Fonte: ${sourceDomain}`;
      hashtags = ['#tecnologia', '#noticias', '#inovacao', '#ia'];
    } else {
      // Fallback caption
      caption = `🚀 ${topic}\n\nConteúdo sobre ${topic} - as últimas novidades do mundo tech.\n\n#tecnologia #inovação`;
      hashtags = ['#tecnologia', '#inovação', '#futuro', '#ia'];
    }
    
    // Use headline text for image overlay
    const headlineForImage = headline_text || (selectedArticle?.title?.slice(0, 80)) || topic.toUpperCase();
    
    // Apply headline overlay to image
    let imageUrl: string | null = null;
    if (selectedImage) {
      console.log('[NEWS_POST] Applying headline overlay...');
      
      const watermarkResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          imageUrl: selectedImage,
          watermarkText: 'Neural Update',
          headlineText: headlineForImage
        })
      });
      
      if (watermarkResponse.ok) {
        const wmResult = await watermarkResponse.json();
        imageUrl = wmResult.publicUrl || wmResult.url || wmResult.imageUrl;
        console.log('[NEWS_POST] Headline overlay applied!');
      } else {
        // Use original image without overlay
        imageUrl = selectedImage;
        console.log('[NEWS_POST] Overlay failed, using original image');
      }
    }
    
    if (!imageUrl) {
      return { success: false, message: `❌ Não consegui gerar imagem para "${topic}". Tente outro tema.` };
    }
    
    // Check auto-publish
    const { data: agentContext } = await supabase
      .from('agent_context')
      .select('auto_post_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    
    const autoPostEnabled = agentContext?.auto_post_enabled ?? false;
    const scheduledForUTC = scheduled_for ? convertBrasiliaToUTC(scheduled_for) : null;
    const status = scheduledForUTC ? 'scheduled' : 'draft';
    
    // Create post
    const { data: post, error } = await supabase.from('posts').insert({
      user_id: userId,
      caption,
      hashtags,
      post_type: 'noticia',
      platforms: platforms || ['instagram'],
      status,
      scheduled_for: scheduledForUTC,
      media_type: 'image',
      image_url: imageUrl,
      ai_model_used: usedAiFallback ? 'gemini-editorial' : 'curated-news'
    }).select().single();
    
    if (error) throw error;
    
    // Auto-publish if enabled
    let publishStatus = '';
    if (autoPostEnabled && !scheduledForUTC && imageUrl) {
      console.log('[NEWS_POST] Auto-publishing...');
      for (const platform of (platforms || ['instagram'])) {
        try {
          if (platform === 'instagram') {
            const pubResponse = await fetch(`${supabaseUrl}/functions/v1/publish-post`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`
              },
              body: JSON.stringify({ postId: post.id })
            });
            if (pubResponse.ok) {
              publishStatus = '✅ Publicado no Instagram!';
            } else {
              publishStatus = '⚠️ Erro ao publicar';
            }
          }
        } catch (pubError) {
          console.error('[NEWS_POST] Publish error:', pubError);
        }
      }
    }
    
    const scheduleInfo = scheduledForUTC 
      ? `📅 Agendado para ${formatBrasiliaTime(scheduledForUTC)}`
      : autoPostEnabled ? publishStatus : '📝 Salvo como rascunho';
    
    const imageSource = usedAiFallback ? '🤖 Imagem IA + Headline' : `🌐 Imagem real: ${sourceDomain}`;
    
    return {
      success: true,
      message: `📰 Post editorial criado!\n\n📌 Headline: "${headlineForImage.slice(0, 50)}..."\n${imageSource}\n${scheduleInfo}`,
      post: {
        id: post.id,
        headline: headlineForImage,
        source: sourceDomain,
        has_image: true,
        status: post.status,
        used_ai_fallback: usedAiFallback
      }
    };
    
  } catch (error: unknown) {
    console.error('Error in executeCreateNewsPost:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, message: `❌ Erro ao criar post: ${errorMessage}` };
  }
}

// Execute create curated post (with real web image, or AI fallback with headline overlay)
async function executeCreateCuratedPost(supabase: any, userId: string, args: any) {
  const { 
    search_query, 
    headline_text, 
    caption_block1, 
    caption_block2 = '', 
    caption_block3 = '',
    hashtags = [],
    scheduled_for,
    platforms = ['instagram']
  } = args;
  
  console.log('[CREATE_CURATED_POST] Creating editorial post for:', search_query);
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    let selectedImage: string | null = null;
    let sourceInfo = 'IA';
    let usedAiFallback = false;
    
    // Try to find real image using Firecrawl
    try {
      const searchResponse = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          query: `${search_query} foto imagem`,
          limit: 10,
          lang: 'pt-BR',
          country: 'BR'
        })
      });
      
      if (searchResponse.ok) {
        const searchResult = await searchResponse.json();
        const articles = searchResult.data || [];
        
        // Find article with quality images
        for (const article of articles) {
          if (article.images?.length > 0) {
            const qualityImages = article.images.filter((img: string) =>
              img && !img.includes('icon') && !img.includes('logo') && 
              !img.includes('avatar') && !img.includes('favicon') &&
              (img.includes('.jpg') || img.includes('.jpeg') || img.includes('.png') || img.includes('.webp'))
            );
            if (qualityImages.length > 0) {
              selectedImage = qualityImages[0];
              try {
                sourceInfo = new URL(article.url).hostname.replace('www.', '');
              } catch { sourceInfo = 'web'; }
              break;
            }
          }
        }
      }
    } catch (searchError) {
      console.log('[CREATE_CURATED_POST] Firecrawl failed, using AI fallback');
    }
    
    // FALLBACK: If no real image found, generate with AI
    if (!selectedImage) {
      console.log('[CREATE_CURATED_POST] No real image found, generating with AI...');
      usedAiFallback = true;
      
      // Generate contextual image based on search query
      const currentYear = new Date().getFullYear();
      const imagePrompt = `Fotografia profissional de alta qualidade relacionada a: ${search_query}. 
Estilo: jornalístico, editorial, moderno, ${currentYear}. 
Iluminação cinematográfica, cores vibrantes, foco definido.
IMPORTANTE: Não adicione texto na imagem. Imagem limpa para overlay posterior.
Proporção quadrada 1:1 para Instagram.`;
      
      const imageResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          prompt: imagePrompt,
          format: 'square',
          model: 'gemini'
        })
      });
      
      if (imageResponse.ok) {
        const imageResult = await imageResponse.json();
        selectedImage = imageResult.imageUrl;
        sourceInfo = 'Gerada por IA';
      }
    }
    
    if (!selectedImage) {
      return {
        success: false,
        message: `❌ Não consegui encontrar ou gerar imagem para "${search_query}". Tente outro tema.`
      };
    }
    
    console.log('[CREATE_CURATED_POST] Image ready:', usedAiFallback ? 'AI generated' : 'Real web image');
    
    // Process image with watermark and headline (Portuguese style @davision.eth)
    let imageUrl: string | null = null;
    const watermarkResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        imageUrl: selectedImage,
        watermarkText: 'Neural Update',
        headlineText: headline_text
      })
    });
    
    if (watermarkResponse.ok) {
      const wmResult = await watermarkResponse.json();
      imageUrl = wmResult.publicUrl || wmResult.url || wmResult.imageUrl;
      console.log('[CREATE_CURATED_POST] Headline overlay applied successfully');
    } else {
      // Fallback: use original image without overlay
      imageUrl = selectedImage;
      console.log('[CREATE_CURATED_POST] Watermark failed, using original image');
    }
    
    if (!imageUrl) {
      return {
        success: false,
        message: `❌ Erro ao processar imagem. Tente novamente.`
      };
    }
    
    // Build caption in 3 blocks format
    const captionParts = [caption_block1];
    if (caption_block2) captionParts.push(caption_block2);
    if (caption_block3) captionParts.push(caption_block3);
    const caption = captionParts.join('\n\n');
    
    // Check auto-publish setting
    const { data: agentContext } = await supabase
      .from('agent_context')
      .select('auto_post_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    
    const autoPostEnabled = agentContext?.auto_post_enabled ?? false;
    const scheduledForUTC = scheduled_for ? convertBrasiliaToUTC(scheduled_for) : null;
    const status = scheduledForUTC ? 'scheduled' : 'draft';
    
    // Create post
    const { data: post, error } = await supabase.from('posts').insert({
      user_id: userId,
      caption,
      hashtags: hashtags.length > 0 ? hashtags : ['#tecnologia', '#inovação', '#futuro', '#ia'],
      post_type: 'engajamento',
      media_type: 'image',
      platforms,
      status,
      scheduled_for: scheduledForUTC,
      image_url: imageUrl,
      ai_model_used: usedAiFallback ? 'gemini-with-overlay' : 'curated-web-image'
    }).select().single();
    
    if (error) throw error;
    
    // Auto-publish if enabled
    let publishStatus = '';
    if (autoPostEnabled && !scheduledForUTC && imageUrl) {
      console.log('[CREATE_CURATED_POST] Auto-publishing...');
      for (const platform of platforms) {
        try {
          if (platform === 'instagram') {
            const pubResponse = await fetch(`${supabaseUrl}/functions/v1/publish-post`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`
              },
              body: JSON.stringify({ postId: post.id })
            });
            if (pubResponse.ok) {
              publishStatus = '✅ Publicado no Instagram!';
            } else {
              publishStatus = '⚠️ Erro ao publicar';
            }
          }
        } catch (pubError) {
          console.error(`[CREATE_CURATED_POST] Error publishing:`, pubError);
          publishStatus = '⚠️ Erro ao publicar';
        }
      }
    }
    
    const scheduleInfo = scheduledForUTC 
      ? `📅 Agendado para ${formatBrasiliaTime(scheduledForUTC)}`
      : autoPostEnabled ? publishStatus : '📝 Salvo como rascunho';
    
    const imageSource = usedAiFallback ? '🤖 Imagem IA + Headline' : `🌐 Imagem real: ${sourceInfo}`;
    
    return {
      success: true,
      message: `🖼️ Post editorial criado!\n\n📌 Headline: "${headline_text}"\n${imageSource}\n${scheduleInfo}`,
      post: {
        id: post.id,
        headline: headline_text,
        source: sourceInfo,
        has_image: true,
        status: post.status,
        used_ai_fallback: usedAiFallback
      }
    };
    
  } catch (error: unknown) {
    console.error('Error in executeCreateCuratedPost:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, message: `❌ Erro ao criar post curado: ${errorMessage}` };
  }
}

// Execute a tool call
async function executeTool(supabase: any, userId: string, toolName: string, args: any) {
  switch (toolName) {
    case 'create_posts':
      return executeCreatePosts(supabase, userId, args);
    case 'generate_image_for_post':
      return executeGenerateImage(supabase, userId, args);
    case 'schedule_post':
      return executeSchedulePost(supabase, userId, args);
    case 'get_performance_data':
      return executeGetPerformance(supabase, userId, args);
    case 'get_detailed_analytics':
      return executeDetailedAnalytics(supabase, userId, args);
    case 'run_autonomous_agent':
      return executeRunAgent(supabase, userId);
    case 'list_posts':
      return executeListPosts(supabase, userId, args);
    case 'delete_post':
      return executeDeletePost(supabase, userId, args);
    case 'update_agent_settings':
      return executeUpdateSettings(supabase, userId, args);
    case 'create_narrated_video':
      return executeCreateNarratedVideo(supabase, userId, args);
    case 'create_carousel':
      return executeCreateCarousel(supabase, userId, args);
    case 'create_news_post':
      return executeCreateNewsPost(supabase, userId, args);
    case 'create_curated_post':
      return executeCreateCuratedPost(supabase, userId, args);
    default:
      return { success: false, message: `Ferramenta desconhecida: ${toolName}` };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userId } = await req.json();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch context
    const { data: context } = await supabase
      .from('agent_context')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: recentPosts } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Build dynamic system prompt based on user config
    const agentName = context?.agent_name || 'Aria';
    const brandVoice = context?.brand_voice || 'Direto e prático. Fala como amigo que já tentou de tudo e finalmente descobriu o que funciona.';
    const personalityTraits = context?.personality_traits?.join(', ') || 'prático, empático, provocador, anti-guru';
    const responseStyle = context?.response_style || 'storytelling';
    const languageFormality = context?.language_formality || 'informal';
    const emojiUsage = context?.emoji_usage || 'minimal';
    const contentFocus = context?.content_focus?.join(', ') || 'crescimento, automação, resultados práticos';
    const targetAudience = context?.target_audience || 'Criadores pequenos (1k-50k seguidores) que querem crescer sem virar escravos de conteúdo';
    const industryNiche = context?.industry_niche || 'IA Prática para Criadores de Conteúdo';
    const avoidTopics = context?.avoid_topics?.length > 0 ? context.avoid_topics.join(', ') : 'política, religião, polêmicas, wallpapers futuristas genéricos, conteúdo abstrato sem ação';
    const hashtagStrategy = context?.hashtag_strategy || 'nicho-focado';
    const postingStyle = context?.posting_style || 'strategic-bursts';
    const customPrompt = context?.system_prompt_template || '';

    const emojiGuide = {
      'none': 'NÃO use emojis nas respostas.',
      'minimal': 'Use 1-2 emojis por mensagem, apenas em pontos-chave para enfatizar.',
      'moderate': 'Use emojis estrategicamente para marcar transições e destacar CTAs. Não decore, comunique.',
      'frequent': 'Use emojis expressivamente para criar energia e personalidade vibrante.'
    };

    const responseStyleGuide = {
      'concise': 'Vá direto ao ponto. Cada palavra deve ter propósito. Corte o fluff.',
      'balanced': 'Equilibre clareza com profundidade. Explique o suficiente, nunca demais.',
      'detailed': 'Forneça análises completas com dados, exemplos e próximos passos acionáveis.',
      'storytelling': 'Transforme insights em narrativas. Abra loops, crie tensão, entregue a revelação. Faça o leitor sentir, não apenas entender.'
    };

    const formalityGuide = {
      'formal': 'Linguagem polida e respeitosa. Autoridade através de precisão.',
      'informal': 'Fale como um amigo expert. Descontraído mas nunca superficial.',
      'casual': 'Super casual, usa gírias e memes. Energia de conversa de bar.',
      'professional': 'Tom de consultor sênior. Acessível mas com peso de especialista.'
    };

    const hashtagGuide = {
      'minimal': 'Use apenas 3-5 hashtags ultra-específicas do nicho.',
      'nicho-focado': 'Use 5-8 hashtags. Priorize categorização sobre descoberta. 70% nicho específico, 30% médio alcance.',
      'mixed': 'Use 8-10 hashtags balanceadas entre nicho, médio e amplo alcance.',
      'aggressive': 'Use 15-20 hashtags maximizando descoberta (cuidado: pode parecer spam).'
    };

    const currentHour = new Date().getHours();
    const currentDay = new Date().getDay(); // 0=Dom, 6=Sáb
    const isOptimalTime = (currentDay >= 2 && currentDay <= 4 && currentHour >= 11 && currentHour <= 18);

    const currentYear = new Date().getFullYear(); // 2026
    
    const systemPrompt = `Você é **${agentName}**, um CURADOR EDITORIAL DE CONTEÚDO sobre tecnologia, IA, ciência e futuro.

## 🎯 MISSÃO CENTRAL: CURADORIA, NÃO GERAÇÃO
**Seu trabalho NÃO é criar imagens com IA.**
Você SELECIONA ou SUGERE imagens REAIS disponíveis na internet:
- Fotos de pessoas reais (CEOs, cientistas, desenvolvedores)
- Empresas conhecidas (Apple, OpenAI, Tesla, Nvidia, Google)
- Robôs, chips, satélites, gráficos, telas, data centers
- Frames de vídeos, imagens institucionais, fotos de notícias

## 📋 PROCESSO EDITORIAL OBRIGATÓRIO
Para CADA post de imagem, siga este processo:

### 1. ESCOLHA UM TEMA
Tema tecnológico REAL, ATUAL ou conceitual de ${currentYear}.

### 2. PENSE NA IMAGEM REAL
"Qual imagem REAL da internet representaria isso de forma IMEDIATA?"
- Pessoa conhecida do setor?
- Produto/dispositivo icônico?
- Evento ou conferência?
- Gráfico ou dado impactante?

### 3. CRIE O TEXTO DA IMAGEM (HEADLINE)
Máximo 2 linhas que:
- Gere CURIOSIDADE
- NÃO explique tudo
- Crie TENSÃO ou quebra de expectativa
- OBRIGUE a pessoa a abrir a legenda

### 4. CRIE A LEGENDA EM 3 BLOCOS
| Bloco | Função |
|-------|--------|
| **Bloco 1** | Frase de impacto curta |
| **Bloco 2** | Contexto mínimo (suficiente para entender) |
| **Bloco 3** | Reflexão, consequência ou pergunta implícita |

## 📰 REGRAS EDITORIAIS
- Linguagem CLARA, DIRETA, quase jornalística
- SEM hype exagerado
- SEM emojis excessivos (máximo 2-3 por post)
- O texto da imagem deve OBRIGAR a pessoa a abrir a legenda
- **Objetivo: PARAR O SCROLL**
- Pense como editor disputando atenção em feed lotado

## 🔧 FERRAMENTAS DISPONÍVEIS

### 📝 Criação de Conteúdo
| Ferramenta | QUANDO USAR |
|------------|-------------|
| \`create_posts\` | 🖼️ Cria post com IMAGEM GERADA por IA. **SEMPRE inclua image_prompt em português!** |
| \`create_news_post\` | 📰 Busca notícia real + foto + headline (se Firecrawl disponível) |
| \`create_curated_post\` | 🖼️ Imagem real curada da web (se Firecrawl disponível) |
| \`create_narrated_video\` | 🎬 VÍDEO, REELS, SHORTS com narração |
| \`create_carousel\` | 🎠 CARROSSEL com múltiplas imagens geradas |
| \`generate_image_for_post\` | Gerar visual AI para post existente |

### ⚠️ REGRA CRÍTICA: image_prompt OBRIGATÓRIO
Ao usar \`create_posts\`, você DEVE incluir \`image_prompt\` em PORTUGUÊS descrevendo a imagem:
- ✅ "Cidade futurista com arranha-céus holográficos, tons azul neon, estilo cyberpunk"
- ✅ "Robô humanoide com olhos luminosos em laboratório high-tech, iluminação dramática"
- ❌ NUNCA deixe image_prompt vazio ou ausente

### 📅 Gerenciamento
| Ferramenta | Quando usar |
|------------|-------------|
| \`schedule_post\` | Agendar post existente |
| \`list_posts\` | Ver posts existentes |
| \`delete_post\` | Remover um post |

### 📊 Analytics
| Ferramenta | Quando usar |
|------------|-------------|
| \`get_detailed_analytics\` | **OBRIGATÓRIO** para perguntas sobre QUANTIDADES |
| \`get_performance_data\` | Analisar métricas de engajamento |

### ⚙️ Sistema
| Ferramenta | Quando usar |
|------------|-------------|
| \`run_autonomous_agent\` | Executar ciclo autônomo completo |
| \`update_agent_settings\` | Mudar configurações |

## 🧬 SUA ESSÊNCIA
**Personalidade:** ${personalityTraits}
**Voz:** ${brandVoice}
**Tom:** ${responseStyleGuide[responseStyle as keyof typeof responseStyleGuide] || responseStyleGuide.storytelling}
**Formalidade:** ${formalityGuide[languageFormality as keyof typeof formalityGuide] || formalityGuide.informal}
**Emojis:** ${emojiGuide[emojiUsage as keyof typeof emojiGuide] || emojiGuide.minimal}

## 🎯 CONTEXTO ESTRATÉGICO
| Aspecto | Configuração |
|---------|-------------|
| Ano atual | **${currentYear}** |
| Nicho | **${industryNiche}** |
| Público | ${targetAudience} |
| Foco | ${contentFocus} |
| Hashtags | ${hashtagGuide[hashtagStrategy as keyof typeof hashtagGuide] || hashtagGuide['nicho-focado']} |
| Ritmo | ${postingStyle} (${context?.daily_post_limit || 1} posts/dia) |
| Evitar | ${avoidTopics} |

## 📊 HIERARQUIA DE MÉTRICAS ${currentYear}
1. 🔄 **SHARES** - Máximo peso
2. 💾 **SAVES** - Alto peso  
3. 💬 **COMMENTS** - Médio peso
4. ❤️ **LIKES** - Baixo peso

**Primeiros 3 segundos decidem TUDO.**

## 💡 EXEMPLOS DE HEADLINES QUE PARAM O SCROLL

### ❌ RUIM (explica demais):
"OpenAI lança nova versão do GPT-5 com mais capacidades"

### ✅ BOM (gera tensão):
"Sam Altman sabia disso há 2 anos. Agora é tarde demais."

### ❌ RUIM (genérico):
"A inteligência artificial está mudando o mundo"

### ✅ BOM (específico + tensão):
"Esse chip custa US$40.000. E você VAI querer um."

## ⏰ REGRAS DE AGENDAMENTO
- **SEMPRE** use formato ISO 8601: \`YYYY-MM-DDTHH:MM:SS\`
- Horário de BRASÍLIA (UTC-3)
- ${isOptimalTime ? '✅ AGORA é horário ótimo!' : '⚠️ Melhores horários: Ter-Qui 11h-18h'}

## 📋 STATUS ATUAL
- Auto-post: ${context?.auto_post_enabled ? '🟢 Ativado' : '🔴 Desativado'}
- Plataformas: ${context?.preferred_platforms?.join(', ') || 'instagram'}
- Posts recentes: ${recentPosts?.length || 0}
- Data/hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (${currentYear})

## ⚠️ DIRETRIZES ABSOLUTAS
1. **EXECUTE** ações - não apenas sugira
2. **CURADORIA** de imagens reais > geração IA
3. **PORTUGUÊS BRASILEIRO** sempre
4. **NUNCA** mencione anos passados (2024, 2025)
5. **TESTE MENTAL**: "Isso para o scroll?"

${customPrompt ? `## 📝 INSTRUÇÕES PERSONALIZADAS\n${customPrompt}` : ''}`;

    // First API call with tools
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        tools: AGENT_TOOLS,
        tool_choice: 'auto'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Limite de requisições atingido. Tente novamente em alguns segundos.' 
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Créditos esgotados.' 
        }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    
    // Check if there are tool calls to execute
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      const toolResults = [];
      const executedActions = [];
      
      for (const toolCall of choice.message.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        
        console.log(`Executing tool: ${toolName}`, toolArgs);
        
        const result = await executeTool(supabase, userId, toolName, toolArgs);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result)
        });
        executedActions.push({
          tool: toolName,
          ...result
        });
      }
      
      // Second API call with tool results to get final response
      const finalResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
            choice.message,
            ...toolResults
          ]
        })
      });
      
      if (!finalResponse.ok) {
        // Return tool results even if final response fails
        return new Response(JSON.stringify({
          content: `Ações executadas:\n${executedActions.map(a => a.message).join('\n')}`,
          actions: executedActions
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      }
      
      const finalData = await finalResponse.json();
      
      return new Response(JSON.stringify({
        content: finalData.choices?.[0]?.message?.content || 'Ações executadas com sucesso!',
        actions: executedActions
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }
    
    // No tool calls, just return the response
    return new Response(JSON.stringify({
      content: choice?.message?.content || 'Erro ao processar resposta'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});

  } catch (error) {
    console.error('agent-chat error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro interno' 
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
});
