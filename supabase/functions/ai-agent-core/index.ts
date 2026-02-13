import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Content distribution types
type ContentType = 'video' | 'carousel' | 'news' | 'image';

interface ContentDistribution {
  videos: number;
  carousels: number;
  news: number;
  images: number;
}

interface ContentPlan {
  theme: string;
  format: 'noticia' | 'educacional' | 'engajamento' | 'storytelling' | 'viral' | 'vendas';
  mediaType: 'image' | 'carousel' | 'video' | 'reels';
  cta: string;
  tone: string;
  objective: 'alcance' | 'engajamento' | 'conversao';
  platforms: ('instagram' | 'tiktok')[];
  scheduledFor?: string;
  contentType?: ContentType; // Which slot this fills
}

interface AgentDecision {
  decision: 'POST' | 'NO_POST' | 'WAIT';
  reason: string;
  contentPlan?: ContentPlan;
  hypothesis?: string;
  expectedEngagement?: number;
}

interface AgentState {
  avgEngagement: number;
  lastPostHours: number;
  postsToday: number;
  postsThisWeek: number;
  bestPerformingTypes: string[];
  saturatedTopics: string[];
  context: any;
  recentPosts: any[];
  // Content distribution tracking
  weeklyGoals: ContentDistribution;
  weeklyProgress: ContentDistribution;
  nextContentType: ContentType | null;
}

// Calculate engagement rate
function calculateEngagement(post: any): number {
  const total = (post.likes_count || 0) + (post.comments_count || 0) + (post.saves_count || 0);
  const reach = post.reach || 1;
  return (total / reach) * 100;
}

// Send conversational chat message to user
async function sendChatMessage(supabase: any, userId: string, message: string): Promise<void> {
  try {
    await supabase.from('agent_chat_messages').insert({
      user_id: userId,
      role: 'assistant',
      content: message,
      actions: null
    });
    console.log('[AGENT] Chat message sent:', message.substring(0, 50) + '...');
  } catch (error) {
    console.error('[AGENT] Failed to send chat message:', error);
  }
}

// Generate conversational status update
function getConversationalUpdate(
  agentName: string, 
  action: 'analyzing' | 'deciding' | 'creating' | 'created' | 'waiting' | 'completed' | 'error' | 'insights',
  details?: any
): string {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  
  const messages: Record<string, string[]> = {
    analyzing: [
      `🔍 Dando uma olhada no cenário... vamos ver como andam as coisas por aqui.`,
      `📊 Analisando as métricas e tendências do momento...`,
      `🧠 Hora de entender o que está funcionando melhor!`
    ],
    deciding: [
      `🤔 Hmm, deixa eu pensar no melhor tipo de conteúdo pra agora...`,
      `💭 Avaliando qual formato vai funcionar melhor nesse horário...`,
      `⚡ Decidindo a estratégia: ${details?.nextType || 'conteúdo'} parece promissor!`
    ],
    creating: [
      `✍️ Mãos à obra! Criando um ${details?.type || 'conteúdo'} sobre "${details?.theme || 'tendências'}"...`,
      `🎨 Produzindo conteúdo fresquinho sobre ${details?.theme || 'tecnologia'}...`,
      `🚀 Gerando ${details?.type || 'post'} - vai ficar bom!`
    ],
    created: [
      details?.needsRender 
        ? `🎬 Roteiro do Reels "${details?.theme || 'tendências'}" criado! Vá na aba "Fila" para renderizar o vídeo antes de publicar.`
        : `✅ Pronto! Criei um ${details?.type || 'post'} sobre "${details?.theme || 'tendências'}". ${details?.status === 'published' ? 'Publicado! 🚀' : details?.status === 'scheduled' ? 'Agendado! ⏰' : 'Salvo como rascunho.'}`,
      details?.needsRender
        ? `📝 Script do vídeo sobre "${details?.theme || 'tech'}" está pronto! O vídeo precisa ser renderizado na aba "Fila" antes de publicar.`
        : `🎉 Feito! Novo ${details?.type || 'conteúdo'} criado. ${details?.status === 'published' ? 'Já foi publicado!' : details?.status === 'scheduled' ? 'Agendado!' : 'Está nos rascunhos.'}`
    ],
    waiting: [
      `⏳ Ainda não é hora de postar. ${details?.reason || 'Vou aguardar o momento ideal.'}`,
      `🕐 Esperando um pouco... ${details?.reason || 'O timing é importante!'}`,
      `😊 Tudo tranquilo por enquanto. ${details?.reason || 'Próxima análise em breve!'}`
    ],
    insights: [
      `📈 **Análise de Performance:**\n${details?.insights || 'Coletando dados...'}`,
      `🎯 **Insights do Período:**\n${details?.insights || 'Analisando métricas...'}`,
      `💡 **Descobertas:**\n${details?.insights || 'Processando informações...'}`
    ],
    completed: [
      `${greeting}! 📈 Resumo: já temos ${details?.weeklyProgress || 0} posts esta semana (meta: ${details?.weeklyGoals || 0}). Engajamento médio: ${details?.avgEngagement || '0'}%.`,
      `Ciclo completo! 📊 Progresso semanal: ${details?.weeklyProgress || 0}/${details?.weeklyGoals || 0} posts. Tudo rodando bem!`
    ],
    error: [
      `⚠️ Ops, tive um probleminha: ${details?.error || 'erro desconhecido'}. Vou tentar de novo no próximo ciclo!`,
      `😅 Algo deu errado: ${details?.error || 'falha temporária'}. Não se preocupe, vou resolver!`
    ]
  };
  
  const variants = messages[action] || messages.completed;
  return variants[Math.floor(Math.random() * variants.length)];
}

// ETAPA 1: LEITURA DO MUNDO
async function analyzeCurrentState(supabase: any, userId: string, workspaceId: string): Promise<AgentState> {
  console.log('[AGENT] Etapa 1: Analisando estado atual...');
  console.log('[AGENT] workspaceId:', workspaceId, 'userId:', userId);
  
  const now = new Date();
  const hours72Ago = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  
  // Get today start in Brasilia timezone (UTC-3)
  const brasiliaOffset = -3 * 60 * 60 * 1000;
  const todayBrasilia = new Date(now.getTime() + brasiliaOffset);
  todayBrasilia.setHours(0, 0, 0, 0);
  const todayStartUTC = new Date(todayBrasilia.getTime() - brasiliaOffset);
  
  // Get start of current week (Sunday) in Brasilia
  const weekStart = new Date(todayBrasilia);
  weekStart.setDate(todayBrasilia.getDate() - todayBrasilia.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekStartUTC = new Date(weekStart.getTime() - brasiliaOffset);
  
  // Busca posts das últimas 72h (publicados para métricas) - USAR WORKSPACE_ID
  const { data: posts72h, error: postsError } = await supabase
    .from('posts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'published')
    .gte('published_at', hours72Ago.toISOString())
    .order('published_at', { ascending: false });
  
  if (postsError) {
    console.error('[AGENT] Erro ao buscar posts:', postsError);
  }
  
  const recentPosts = posts72h || [];
  
  // Contar TODOS os posts criados HOJE (draft, scheduled, published) para limite diário
  const { data: todayPosts } = await supabase
    .from('posts')
    .select('id, status')
    .eq('workspace_id', workspaceId)
    .gte('created_at', todayStartUTC.toISOString());
  
  const postsCreatedToday = (todayPosts || []).length;
  console.log(`[AGENT] Posts criados HOJE: ${postsCreatedToday} (draft+scheduled+published)`);
  
  // Busca posts desta semana para tracking de distribuição
  const { data: weekPosts } = await supabase
    .from('posts')
    .select('media_type, post_type, status')
    .eq('workspace_id', workspaceId)
    .in('status', ['published', 'scheduled', 'draft'])
    .gte('created_at', weekStartUTC.toISOString());
  
  const postsThisWeek = weekPosts || [];
  
  // Carrega contexto do agente - USAR WORKSPACE_ID
  const { data: context, error: contextError } = await supabase
    .from('agent_context')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  
  if (contextError) {
    console.error('[AGENT] Erro ao buscar contexto:', contextError);
  }
  
  // Se não existe contexto, cria um com workspace_id
  if (!context) {
    console.log('[AGENT] Criando contexto inicial para workspace:', workspaceId);
    await supabase
      .from('agent_context')
      .insert({ user_id: userId, workspace_id: workspaceId })
      .select()
      .single();
    
    return analyzeCurrentState(supabase, userId, workspaceId);
  }
  
  // Calcular métricas
  const engagements = recentPosts.map(calculateEngagement);
  const avgEngagement = engagements.length > 0 
    ? engagements.reduce((a: number, b: number) => a + b, 0) / engagements.length 
    : 0;
  
  // Horas desde último post (considerar criado, não só publicado)
  const { data: lastCreatedPost } = await supabase
    .from('posts')
    .select('created_at')
    .eq('workspace_id', context.workspace_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  const lastPostTime = lastCreatedPost ? new Date(lastCreatedPost.created_at) : null;
  const lastPostHours = lastPostTime 
    ? (now.getTime() - lastPostTime.getTime()) / (1000 * 60 * 60) 
    : 999;
  
  // Posts hoje - usar o valor já calculado (postsCreatedToday) que conta TODOS os posts criados hoje
  const postsToday = postsCreatedToday;
  
  // Formatos vencedores (top 3 por engajamento)
  const postsByType = recentPosts.reduce((acc: any, post: any) => {
    const type = post.post_type || 'engajamento';
    if (!acc[type]) acc[type] = [];
    acc[type].push(calculateEngagement(post));
    return acc;
  }, {});
  
  const avgByType = Object.entries(postsByType).map(([type, engagements]: [string, any]) => ({
    type,
    avg: engagements.reduce((a: number, b: number) => a + b, 0) / engagements.length
  })).sort((a, b) => b.avg - a.avg);
  
  const bestPerformingTypes = avgByType.slice(0, 3).map(t => t.type);
  
  // Temas saturados (posts das últimas 24h)
  const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentThemes = recentPosts
    .filter((p: any) => new Date(p.published_at) >= hours24Ago)
    .map((p: any) => p.post_type)
    .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
  
  // ===== CONTENT DISTRIBUTION TRACKING =====
  // Weekly goals from context settings
  const weeklyGoals: ContentDistribution = {
    videos: context.content_distribution_videos || 3,
    carousels: context.content_distribution_carousels || 2,
    news: context.content_distribution_news || 4,
    images: context.content_distribution_images || 5
  };
  
  // Count progress this week by media type
  const weeklyProgress: ContentDistribution = {
    videos: postsThisWeek.filter((p: any) => p.media_type === 'reels' || p.media_type === 'video').length,
    carousels: postsThisWeek.filter((p: any) => p.media_type === 'carousel').length,
    news: postsThisWeek.filter((p: any) => p.post_type === 'noticia').length,
    images: postsThisWeek.filter((p: any) => p.media_type === 'image' && p.post_type !== 'noticia').length
  };
  
  // Determine next content type based on COMPLETION PERCENTAGE (lower = higher priority)
  // This ensures diversity: a type with 0/2 (0%) gets priority over 13/14 (93%)
  const getCompletionStats = (type: ContentType): { remaining: number; percentage: number; goal: number } => {
    const keyMap = { video: 'videos', carousel: 'carousels', news: 'news', image: 'images' } as const;
    const key = keyMap[type];
    const goal = weeklyGoals[key] || 1;
    const progress = weeklyProgress[key] || 0;
    const remaining = Math.max(0, goal - progress);
    const percentage = goal > 0 ? (progress / goal) * 100 : 100;
    return { remaining, percentage, goal };
  };
  
  const typeStats = [
    { type: 'video' as ContentType, ...getCompletionStats('video'), priority: 4 },
    { type: 'carousel' as ContentType, ...getCompletionStats('carousel'), priority: 3 },
    { type: 'news' as ContentType, ...getCompletionStats('news'), priority: 2 },
    { type: 'image' as ContentType, ...getCompletionStats('image'), priority: 1 }
  ].filter(t => t.remaining > 0);
  
  // Sort by completion percentage (ascending - lower % first for diversity)
  // Then by priority (descending) as tiebreaker
  const remainingByType = typeStats.sort((a, b) => {
    // Primary sort: completion percentage ascending (0% before 50% before 100%)
    if (a.percentage !== b.percentage) return a.percentage - b.percentage;
    // Secondary sort: priority descending (video before carousel before news before image)
    return b.priority - a.priority;
  });
  
  console.log('[AGENT] Content distribution analysis:', remainingByType.map(t => 
    `${t.type}: ${Math.round(t.percentage)}% (${t.goal - t.remaining}/${t.goal})`
  ).join(', '));
  
  const nextContentType = remainingByType.length > 0 ? remainingByType[0].type : null;
  
  console.log('[AGENT] Estado analisado:', {
    avgEngagement: avgEngagement.toFixed(2) + '%',
    lastPostHours: Math.round(lastPostHours) + 'h',
    postsToday,
    postsThisWeek: postsThisWeek.length,
    bestPerformingTypes,
    saturatedTopics: recentThemes,
    weeklyGoals,
    weeklyProgress,
    nextContentType
  });
  
  return {
    avgEngagement,
    lastPostHours,
    postsToday,
    postsThisWeek: postsThisWeek.length,
    bestPerformingTypes,
    saturatedTopics: recentThemes,
    context,
    recentPosts,
    weeklyGoals,
    weeklyProgress,
    nextContentType
  };
}

// ETAPA 2: DECISÃO ESTRATÉGICA
async function makeStrategicDecision(state: AgentState, lovableApiKey: string): Promise<AgentDecision> {
  console.log('[AGENT] Etapa 2: Tomando decisão estratégica...');
  
  const dailyLimit = state.context?.daily_post_limit || 5;
  const minHoursBetween = state.context?.min_hours_between_posts || 2;
  const preferredPlatforms = state.context?.preferred_platforms || ['instagram'];
  const bestTimes = state.context?.best_posting_times || ['10:00', '14:00', '19:00'];
  const successPatterns = state.context?.success_patterns || [];
  
  // Check if weekly goals are met
  const totalGoals = state.weeklyGoals.videos + state.weeklyGoals.carousels + 
                     state.weeklyGoals.news + state.weeklyGoals.images;
  const totalProgress = state.weeklyProgress.videos + state.weeklyProgress.carousels + 
                        state.weeklyProgress.news + state.weeklyProgress.images;
  
  console.log(`[AGENT] Meta semanal: ${totalProgress}/${totalGoals} posts`);
  console.log(`[AGENT] Limite diário: ${state.postsToday}/${dailyLimit} posts CRIADOS hoje`);
  console.log(`[AGENT] Próximo tipo de conteúdo: ${state.nextContentType || 'meta completa'}`);
  
  // *** MUDANÇA: Limite diário - se atingiu, parar por hoje ***
  if (state.postsToday >= dailyLimit) {
    console.log('[AGENT] Limite diário atingido - PARAR por hoje');
    return {
      decision: 'NO_POST',
      reason: `🎯 Meta diária alcançada! ${state.postsToday}/${dailyLimit} posts criados hoje. Voltarei amanhã para continuar.`,
      hypothesis: 'Respeitar limites diários melhora a qualidade e evita spam.'
    };
  }
  
  // Tempo mínimo entre posts
  if (state.lastPostHours < minHoursBetween) {
    console.log('[AGENT] Tempo mínimo não atingido - decisão local');
    return {
      decision: 'WAIT',
      reason: `Tempo insuficiente desde o último post (${state.lastPostHours.toFixed(1)}h). Mínimo: ${minHoursBetween}h.`,
      hypothesis: 'Respeitar intervalos melhora o alcance de cada post.'
    };
  }
  
  // Check if weekly goals are complete
  if (!state.nextContentType) {
    console.log('[AGENT] Meta semanal completa!');
    return {
      decision: 'NO_POST',
      reason: `🏆 Meta semanal de ${totalGoals} posts alcançada! Vídeos: ${state.weeklyProgress.videos}/${state.weeklyGoals.videos}, Carrosséis: ${state.weeklyProgress.carousels}/${state.weeklyGoals.carousels}, Notícias: ${state.weeklyProgress.news}/${state.weeklyGoals.news}, Imagens: ${state.weeklyProgress.images}/${state.weeklyGoals.images}`
    };
  }
  
  // Determine content type and format based on distribution
  const contentTypeMap: Record<ContentType, { mediaType: string; format: string; theme: string }> = {
    'video': { mediaType: 'reels', format: 'storytelling', theme: 'tendência tecnológica impactante' },
    'carousel': { mediaType: 'carousel', format: 'educacional', theme: 'dicas práticas de tecnologia' },
    'news': { mediaType: 'image', format: 'noticia', theme: 'notícia tecnologia inteligência artificial' },
    'image': { mediaType: 'image', format: 'engajamento', theme: 'reflexão sobre tecnologia e futuro' }
  };
  
  const selectedType = contentTypeMap[state.nextContentType];
  
  console.log(`[AGENT] Tipo selecionado: ${state.nextContentType} -> ${selectedType.format} (${selectedType.mediaType})`);
  
  // Build content plan based on selected type
  const contentPlan: ContentPlan = {
    theme: selectedType.theme,
    format: selectedType.format as any,
    mediaType: selectedType.mediaType as any,
    cta: 'Comente sua opinião!',
    tone: 'profissional e envolvente',
    objective: 'engajamento',
    platforms: preferredPlatforms,
    contentType: state.nextContentType
  };
  
  // Use AI to refine the theme based on trends
  const systemPrompt = `Você é um especialista em conteúdo tech. 
O agente precisa criar um ${state.nextContentType.toUpperCase()} (${selectedType.format}).

PROGRESSO SEMANAL:
- Vídeos: ${state.weeklyProgress.videos}/${state.weeklyGoals.videos}
- Carrosséis: ${state.weeklyProgress.carousels}/${state.weeklyGoals.carousels}
- Notícias: ${state.weeklyProgress.news}/${state.weeklyGoals.news}  
- Imagens: ${state.weeklyProgress.images}/${state.weeklyGoals.images}

CONTEXTO:
- Engajamento médio: ${state.avgEngagement.toFixed(2)}%
- Formatos vencedores: ${state.bestPerformingTypes.join(', ') || 'dados insuficientes'}
- Evitar temas: ${state.saturatedTopics.join(', ') || 'nenhum'}

Sugira um tema ESPECÍFICO e atual para o ${state.nextContentType}.
Responda em JSON: { "theme": "tema específico", "cta": "CTA do post", "tone": "tom sugerido" }`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite', // Use lite for speed
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Crie um tema para ${state.nextContentType}. JSON only.` }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (response.ok) {
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      if (content) {
        try {
          const themeData = JSON.parse(content);
          contentPlan.theme = themeData.theme || contentPlan.theme;
          contentPlan.cta = themeData.cta || contentPlan.cta;
          contentPlan.tone = themeData.tone || contentPlan.tone;
          console.log('[AGENT] Tema refinado pela IA:', contentPlan.theme);
        } catch {
          console.log('[AGENT] Usando tema padrão');
        }
      }
    }
  } catch (e) {
    console.log('[AGENT] Erro ao refinar tema, usando padrão:', e);
  }

  // Return decision with content plan (no need for another AI call - we already decided based on distribution)
  const remainingForType = {
    'video': state.weeklyGoals.videos - state.weeklyProgress.videos,
    'carousel': state.weeklyGoals.carousels - state.weeklyProgress.carousels,
    'news': state.weeklyGoals.news - state.weeklyProgress.news,
    'image': state.weeklyGoals.images - state.weeklyProgress.images
  };
  
  return {
    decision: 'POST',
    reason: `Criando ${state.nextContentType} (${remainingForType[state.nextContentType]} restante na meta semanal). Tema: "${contentPlan.theme}"`,
    contentPlan,
    hypothesis: `${state.nextContentType} sobre "${contentPlan.theme}" deve gerar engajamento`,
    expectedEngagement: state.avgEngagement > 0 ? state.avgEngagement * 1.1 : 5
  };
}

// ETAPA 3 & 4: PLANEJAMENTO E EXECUÇÃO
async function executeContentPlan(
  supabase: any, 
  plan: ContentPlan, 
  userId: string,
  workspaceId: string,
  supabaseUrl: string,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Etapa 3-4: Executando plano de conteúdo...');
  console.log('[AGENT] Plano:', JSON.stringify(plan, null, 2));
  console.log('[AGENT] Tipo de conteúdo:', plan.contentType);
  console.log('[AGENT] Auto-publish:', autoPublish);
  console.log('[AGENT] workspaceId:', workspaceId);
  
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceRoleKey}`
  };
  
  // Route to appropriate content creation based on contentType
  switch (plan.contentType) {
    case 'video':
      return createVideoContent(supabase, plan, userId, workspaceId, supabaseUrl, headers, autoPublish);
    case 'carousel':
      return createCarouselContent(supabase, plan, userId, workspaceId, supabaseUrl, headers, autoPublish);
    case 'news':
      return createNewsContent(supabase, plan, userId, workspaceId, supabaseUrl, headers, autoPublish);
    case 'image':
    default:
      return createImageContent(supabase, plan, userId, workspaceId, supabaseUrl, headers, autoPublish);
  }
}

// Create VIDEO content (reels/slideshow) - EXTERNAL RENDER ARCHITECTURE
// Lovable apenas ORQUESTRA - renderização é feita por serviço externo FFmpeg
async function createVideoContent(
  supabase: any,
  plan: ContentPlan,
  userId: string,
  workspaceId: string,
  supabaseUrl: string,
  headers: any,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Criando vídeo/reels:', plan.theme);
  
  // STEP 1: Get THEMED images using search-images-for-video (Pexels/Unsplash)
  const images: string[] = [];
  const titles: string[] = [];
  
  // First, search for theme-related images from Pexels/Unsplash
  console.log('[AGENT] Buscando imagens temáticas para vídeo:', plan.theme);
  try {
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/search-images-for-video`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: plan.theme,
        limit: 6,
        orientation: 'portrait'
      })
    });
    
    if (searchResponse.ok) {
      const searchResult = await searchResponse.json();
      if (searchResult.images && searchResult.images.length > 0) {
        for (const img of searchResult.images.slice(0, 4)) {
          const imgUrl = img.imageUrl || img.url || img;
          if (imgUrl && typeof imgUrl === 'string') {
            images.push(imgUrl);
            titles.push(plan.theme);
          }
        }
        console.log(`[AGENT] ${images.length} imagens temáticas encontradas via Pexels/Unsplash`);
      }
    }
  } catch (e) {
    console.log('[AGENT] Erro na busca temática:', e);
  }
  
  // Fallback: If not enough themed images, supplement with RSS library
  if (images.length < 3) {
    console.log('[AGENT] Complementando com imagens da biblioteca RSS...');
    try {
      await fetch(`${supabaseUrl}/functions/v1/fetch-rss`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ workspaceId, userId, limit: 30 })
      });
    } catch (e) {
      console.log('[AGENT] Erro ao atualizar RSS:', e);
    }
    
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: rssItems } = await supabase
      .from('rss_items')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_used', false)
      .eq('has_image', true)
      .gte('published_at', twoDaysAgo)
      .order('published_at', { ascending: false })
      .limit(20);
    
    if (rssItems && rssItems.length > 0) {
      // Filter by theme keywords if possible
      const themeWords = plan.theme.toLowerCase().split(' ').filter(w => w.length > 3);
      const themeMatched = rssItems.filter((item: any) => {
        const titleLower = (item.title || '').toLowerCase();
        return themeWords.some(w => titleLower.includes(w));
      });
      
      // Use theme-matched first, then fall back to scored
      const itemsToUse = themeMatched.length > 0 ? themeMatched : rssItems;
      const scored = itemsToUse.map((item: any) => ({
        item,
        score: calculateNewsRankingScore(item)
      })).sort((a: any, b: any) => b.score - a.score);
      
      const needed = 4 - images.length;
      for (const { item } of scored.slice(0, needed)) {
        if (item.image_url) {
          try {
            const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/upload-external-image`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ imageUrl: item.image_url })
            });
            if (uploadResponse.ok) {
              const uploadResult = await uploadResponse.json();
              if (uploadResult.publicUrl) {
                images.push(uploadResult.publicUrl);
                titles.push(item.title);
              }
            }
          } catch (e) {
            console.log('[AGENT] Erro upload imagem video:', e);
          }
        }
        await supabase.from('rss_items').update({ is_used: true }).eq('id', item.id);
      }
    }
  }
  
  console.log(`[AGENT] Total de imagens da biblioteca para vídeo: ${images.length}`);
  
  // STEP 2: Gerar caption
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: plan.theme,
      postType: 'entretenimento',
      customInstructions: `Este é um REELS/vídeo curto. ${plan.cta}`
    })
  });
  
  let caption = `🎬 ${plan.theme}`;
  let hashtags: string[] = ['#tecnologia', '#reels', '#viral', '#ia'];
  
  if (captionResponse.ok) {
    const captionData = await captionResponse.json();
    caption = captionData.caption || caption;
    hashtags = captionData.hashtags || hashtags;
  }
  
  // STEP 3: Criar post (status draft, sem video_url ainda)
  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    workspace_id: workspaceId,
    caption,
    hashtags,
    post_type: 'entretenimento',
    media_type: 'reels',
    platforms: plan.platforms || ['instagram'],
    status: 'draft',
    image_url: images[0] || null, // Thumbnail
    carousel_images: images, // Todas as imagens para o slideshow
    overlay_metadata: {
      type: 'external_render_slideshow',
      images,
      duration_per_image: 3,
      resolution: '1080x1920',
      platform: 'instagram_reels',
      transition: 'fade',
      needs_processing: true,
      created_by_agent: true,
      publish_after_render: autoPublish
    },
    ai_model_used: 'gemini-2.5-flash'
  }).select().single();
  
  if (error) throw error;
  console.log('[AGENT] Post de vídeo criado:', post.id);
  
  // STEP 4: Tentar renderização externa (se RENDER_SERVICE_URL configurado)
  if (images.length >= 2) {
    console.log('[AGENT] Solicitando renderização externa...');
    
    try {
      const renderResponse = await fetch(`${supabaseUrl}/functions/v1/request-video-render`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          images,
          duration_per_image: 3,
          resolution: '1080x1920',
          platform: 'instagram_reels',
          transition: 'fade',
          post_id: post.id,
          workspace_id: workspaceId
        })
      });
      
      const renderResult = await renderResponse.json();
      
      if (renderResult.success && renderResult.video_url) {
        // Sucesso! Vídeo renderizado externamente
        console.log('[AGENT] ✅ Vídeo renderizado externamente:', renderResult.video_url);
        
        await supabase.from('posts').update({
          video_url: renderResult.video_url,
          status: autoPublish ? 'scheduled' : 'draft',
          scheduled_for: autoPublish ? new Date().toISOString() : null,
          overlay_metadata: {
            ...post.overlay_metadata,
            needs_processing: false,
            render_source: 'external',
            rendered_at: new Date().toISOString()
          }
        }).eq('id', post.id);
        
      } else {
        // Serviço externo não disponível ou falhou
        console.log('[AGENT] Renderização externa não disponível:', renderResult.error || 'sem resposta');
        console.log('[AGENT] Vídeo salvo como rascunho - aguardando configuração do serviço de renderização');
        
        // Atualizar post com mensagem informativa
        await supabase.from('posts').update({
          error_message: 'Aguardando serviço de renderização externo (RENDER_SERVICE_URL)',
          overlay_metadata: {
            ...post.overlay_metadata,
            needs_processing: true,
            render_status: 'pending_external_service'
          }
        }).eq('id', post.id);
      }
    } catch (renderError: any) {
      console.log('[AGENT] Erro ao solicitar renderização:', renderError.message);
    }
  } else {
    console.log('[AGENT] Imagens insuficientes para vídeo:', images.length);
    await supabase.from('posts').update({
      status: 'draft',
      error_message: 'Imagens insuficientes para gerar slideshow (mínimo: 2)'
    }).eq('id', post.id);
  }
  
  return post;
}

// Create CAROUSEL content - NOW USES LIBRARY (RSS) images
async function createCarouselContent(
  supabase: any,
  plan: ContentPlan,
  userId: string,
  workspaceId: string,
  supabaseUrl: string,
  headers: any,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Criando carrossel (da biblioteca RSS):', plan.theme);
  
  // Get multiple RSS items for carousel slides
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  
  // First refresh RSS
  try {
    await fetch(`${supabaseUrl}/functions/v1/fetch-rss`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ workspaceId, userId, limit: 30 })
    });
  } catch (e) {
    console.log('[AGENT] Erro ao atualizar RSS:', e);
  }
  
  const { data: rssItems } = await supabase
    .from('rss_items')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_used', false)
    .eq('has_image', true)
    .gte('published_at', twoDaysAgo)
    .order('published_at', { ascending: false })
    .limit(20);
  
  if (!rssItems || rssItems.length < 2) {
    console.log('[AGENT] ⚠️ Notícias insuficientes para carrossel');
    const { data: post, error } = await supabase.from('posts').insert({
      user_id: userId,
      workspace_id: workspaceId,
      caption: '⚠️ Notícias insuficientes para carrossel',
      hashtags: ['#tecnologia'],
      post_type: 'educacional',
      media_type: 'carousel',
      platforms: plan.platforms || ['instagram'],
      status: 'failed',
      error_message: 'Menos de 2 notícias com imagem na biblioteca. Adicione mais fontes RSS.',
      ai_model_used: 'none'
    }).select().single();
    if (error) throw error;
    return post;
  }
  
  // Score and rank, pick top 4
  const scored = rssItems.map((item: any) => ({
    item,
    score: calculateNewsRankingScore(item)
  })).sort((a: any, b: any) => b.score - a.score);
  
  const selectedItems = scored.slice(0, Math.min(4, scored.length));
  const carouselImages: string[] = [];
  const titles: string[] = [];
  
  for (const { item } of selectedItems) {
    if (item.image_url) {
      // Apply overlay to each image
      try {
        const overlayResponse = await fetch(`${supabaseUrl}/functions/v1/apply-text-overlay`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            imageUrl: item.image_url,
            title: item.title,
            watermarkText: 'Neural Update',
            generateHeadline: true
          })
        });
        
        if (overlayResponse.ok) {
          const overlayResult = await overlayResponse.json();
          if (overlayResult.publicUrl) {
            carouselImages.push(overlayResult.publicUrl);
            titles.push(item.title);
          }
        }
      } catch (e) {
        console.log('[AGENT] Erro overlay slide:', e);
      }
      
      // Fallback: use original image
      if (carouselImages.length < titles.length + 1 && item.image_url) {
        try {
          const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/upload-external-image`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ imageUrl: item.image_url })
          });
          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            if (uploadResult.publicUrl) {
              carouselImages.push(uploadResult.publicUrl);
              titles.push(item.title);
            }
          }
        } catch (e) {
          console.log('[AGENT] Erro upload slide:', e);
        }
      }
    }
    
    // Mark as used
    await supabase.from('rss_items').update({ is_used: true }).eq('id', item.id);
  }
  
  console.log(`[AGENT] Carrossel com ${carouselImages.length} slides da biblioteca`);
  
  // Generate caption
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: `Resumo das principais notícias: ${titles.join('; ')}`,
      postType: 'noticia',
      customInstructions: `Este é um CARROSSEL com ${carouselImages.length} notícias da biblioteca. Faça um resumo envolvente.`
    })
  });
  
  let caption = `📰 As principais notícias de hoje`;
  let hashtags: string[] = ['#carrossel', '#tecnologia', '#noticias', '#ia'];
  
  if (captionResponse.ok) {
    const captionData = await captionResponse.json();
    caption = captionData.caption || caption;
    hashtags = captionData.hashtags || hashtags;
  }
  
  const canPublish = autoPublish && carouselImages.length >= 2;
  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    workspace_id: workspaceId,
    caption,
    hashtags,
    post_type: 'noticia',
    media_type: 'carousel',
    platforms: plan.platforms || ['instagram'],
    status: carouselImages.length >= 2 ? (canPublish ? 'scheduled' : 'draft') : 'failed',
    scheduled_for: canPublish ? new Date().toISOString() : null,
    image_url: carouselImages[0] || null,
    carousel_images: carouselImages,
    overlay_metadata: {
      type: 'library_carousel',
      titles,
      ranking_scores: selectedItems.map((s: any) => s.score)
    },
    ai_model_used: 'gemini-2.5-flash'
  }).select().single();
  
  if (error) throw error;
  console.log('[AGENT] Carrossel criado:', post.id, 'slides:', carouselImages.length);
  return post;
}

// Calculate news ranking score (0-100) for RSS items
function calculateNewsRankingScore(item: any): number {
  let score = 50; // Base score
  
  const titleLower = (item.title || '').toLowerCase();
  const descLower = (item.description || '').toLowerCase();
  const combined = titleLower + ' ' + descLower;
  
  // Recency bonus (0-25 points)
  if (item.published_at) {
    const hoursAgo = (Date.now() - new Date(item.published_at).getTime()) / (1000 * 60 * 60);
    if (hoursAgo < 3) score += 25;
    else if (hoursAgo < 6) score += 20;
    else if (hoursAgo < 12) score += 15;
    else if (hoursAgo < 24) score += 10;
    else score += 5;
  }
  
  // Viral/trending keywords bonus (0-15 points)
  const viralKeywords = ['ia', 'inteligência artificial', 'gpt', 'openai', 'google', 'apple', 'nvidia', 
    'elon musk', 'tesla', 'meta', 'microsoft', 'chatgpt', 'gemini', 'robô', 'robot',
    'lança', 'anuncia', 'revela', 'urgente', 'breaking', 'exclusivo', 'viral',
    'milhões', 'bilhões', 'recorde', 'primeiro', 'inédito', 'revolucion'];
  const matchedKeywords = viralKeywords.filter(kw => combined.includes(kw));
  score += Math.min(15, matchedKeywords.length * 5);
  
  // Image quality bonus (0-10 points)
  if (item.has_image && item.image_url) {
    score += 10;
  }
  
  // Description completeness bonus (0-5 points)  
  if (item.description && item.description.length > 100) score += 5;
  else if (item.description && item.description.length > 50) score += 3;
  
  return Math.min(100, score);
}

// Select best RSS item using ranking
async function selectBestRssItem(supabase: any, workspaceId: string, supabaseUrl: string, headers: any, userId: string): Promise<{ item: any; score: number } | null> {
  // Refresh RSS feeds first
  try {
    await fetch(`${supabaseUrl}/functions/v1/fetch-rss`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ workspaceId, userId, limit: 30 })
    });
    console.log('[AGENT] RSS atualizado');
  } catch (e) {
    console.log('[AGENT] Erro ao atualizar RSS:', e);
  }
  
  // Get unused RSS items from the last 48 hours (wider window)
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: rssItems } = await supabase
    .from('rss_items')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_used', false)
    .eq('has_image', true)
    .gte('published_at', twoDaysAgo)
    .order('published_at', { ascending: false })
    .limit(30);
  
  if (!rssItems || rssItems.length === 0) {
    console.log('[AGENT] Nenhum item RSS disponível');
    return null;
  }
  
  // Score and rank all items
  const scoredItems = rssItems.map((item: any) => ({
    item,
    score: calculateNewsRankingScore(item)
  })).sort((a: any, b: any) => b.score - a.score);
  
  console.log('[AGENT] RSS ranking (top 5):');
  scoredItems.slice(0, 5).forEach((s: any, i: number) => {
    console.log(`  ${i + 1}. [${s.score}pts] ${s.item.title?.substring(0, 60)}...`);
  });
  
  return scoredItems[0];
}

// Create NEWS content - ONLY FROM LIBRARY (RSS)
async function createNewsContent(
  supabase: any,
  plan: ContentPlan,
  userId: string,
  workspaceId: string,
  supabaseUrl: string,
  headers: any,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Criando post de notícia (APENAS da biblioteca RSS):', plan.theme);
  
  let selectedArticle: any = null;
  let selectedImage: string | null = null;
  let sourceDomain = '';
  let sourceUrl = '';
  
  // STEP 1: Select best RSS item using ranking
  const bestItem = await selectBestRssItem(supabase, workspaceId, supabaseUrl, headers, userId);
  
  if (bestItem) {
    const rssItem = bestItem.item;
    selectedArticle = {
      title: rssItem.title,
      description: rssItem.description,
      url: rssItem.link,
      images: rssItem.image_url ? [rssItem.image_url] : []
    };
    selectedImage = rssItem.image_url;
    sourceUrl = rssItem.link;
    sourceDomain = rssItem.source_name || new URL(rssItem.source_url).hostname.replace('www.', '');
    
    // Mark RSS item as used
    await supabase
      .from('rss_items')
      .update({ is_used: true })
      .eq('id', rssItem.id);
    
    console.log(`[AGENT] Notícia selecionada (score: ${bestItem.score}): ${selectedArticle.title}`);
  }
  
  // NO FALLBACK to Firecrawl - library only!
  if (!selectedArticle) {
    console.log('[AGENT] ⚠️ Sem notícias na biblioteca! Post não será criado.');
    // Create a draft post with error message
    const { data: post, error } = await supabase.from('posts').insert({
      user_id: userId,
      workspace_id: workspaceId,
      caption: '⚠️ Nenhuma notícia disponível na biblioteca',
      hashtags: ['#tecnologia'],
      post_type: 'noticia',
      media_type: 'image',
      platforms: plan.platforms || ['instagram'],
      status: 'failed',
      error_message: 'Sem notícias na biblioteca RSS. Adicione mais fontes RSS na aba Biblioteca.',
      ai_model_used: 'none'
    }).select().single();
    if (error) throw error;
    return post;
  }
  
  console.log('[AGENT] Artigo selecionado:', selectedArticle?.title || 'nenhum');
  console.log('[AGENT] Imagem real encontrada:', selectedImage ? 'sim' : 'não');
  
  // STEP 3 & 4: Apply text overlay via CODE (not AI image generation)
  // The apply-text-overlay function:
  // - Downloads the real image
  // - LLM generates ONLY the headline TEXT (string)
  // - Code applies the text as overlay (fixed font, color, layout)
  let imageUrl = null;
  if (selectedImage && selectedArticle?.title) {
    console.log('[AGENT] Aplicando overlay de texto via código...');
    try {
      const overlayResponse = await fetch(`${supabaseUrl}/functions/v1/apply-text-overlay`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageUrl: selectedImage,
          title: selectedArticle.title,
          watermarkText: 'Neural Update',
          generateHeadline: true
        })
      });
      
      if (overlayResponse.ok) {
        const overlayResult = await overlayResponse.json();
        imageUrl = overlayResult.publicUrl;
        console.log('[AGENT] Overlay aplicado com sucesso, headline:', overlayResult.headline);
      } else {
        console.error('[AGENT] Overlay falhou (status:', overlayResponse.status, ')');
      }
    } catch (overlayErr) {
      console.error('[AGENT] Erro ao aplicar overlay:', overlayErr);
    }
    
    // FALLBACK 1: Use add-watermark if overlay failed (no AI credits needed)
    if (!imageUrl) {
      console.log('[AGENT] Fallback: aplicando watermark programático...');
      try {
        const wmResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            imageUrl: selectedImage,
            watermarkText: 'Neural Update'
          })
        });
        if (wmResponse.ok) {
          const wmResult = await wmResponse.json();
          imageUrl = wmResult.publicUrl;
          console.log('[AGENT] Watermark programático aplicado ✅');
        }
      } catch (wmErr) {
        console.log('[AGENT] Watermark também falhou:', wmErr);
      }
    }
  }
  
  // FALLBACK 2: Just upload the original image
  if (!imageUrl && selectedImage) {
    console.log('[AGENT] Fallback: usando imagem original sem overlay');
    try {
      const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/upload-external-image`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageUrl: selectedImage })
      });
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        imageUrl = uploadResult.publicUrl;
      }
    } catch (e) {
      console.log('[AGENT] Erro upload fallback:', e);
    }
  }
  
  // DO NOT generate AI image for news - only use real images
  // If no real image found, post will be text-only (draft status)
  if (!imageUrl) {
    console.log('[AGENT] AVISO: Nenhuma imagem real encontrada. Post será salvo como draft.');
  }
  
  // Generate caption with source attribution (3-block editorial structure)
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: `${selectedArticle?.title || plan.theme}. ${selectedArticle?.description || ''}`,
      postType: 'noticia',
      sourceUrl: sourceUrl,
      sourceName: sourceDomain,
      customInstructions: `Esta é uma notícia REAL com imagem real do site. 
      
Estrutura OBRIGATÓRIA da legenda (3 blocos):
1. HOOK DE IMPACTO - Uma frase curta e impactante (sem emoji no início)
2. CONTEXTO MÍNIMO - 1-2 frases explicando o essencial
3. REFLEXÃO/PERGUNTA - Engajamento com o leitor

OBRIGATÓRIO ao final:
📰 Fonte: ${sourceDomain}
🔗 ${sourceUrl}`
    })
  });
  
  let caption = `📰 ${selectedArticle?.title || plan.theme}`;
  let hashtags: string[] = ['#tecnologia', '#noticias', '#ia', '#tech'];
  
  if (captionResponse.ok) {
    const captionData = await captionResponse.json();
    caption = captionData.caption || caption;
    hashtags = captionData.hashtags || hashtags;
  }
  
  // ALWAYS ensure source is in caption for news posts
  const hasSourceInCaption = caption.includes('Fonte:') || caption.includes('🔗');
  if (!hasSourceInCaption && selectedArticle) {
    if (sourceUrl) {
      caption += `\n\n📰 Fonte: ${sourceDomain}\n🔗 ${sourceUrl}`;
    } else if (sourceDomain && sourceDomain !== 'fonte') {
      caption += `\n\n📰 Fonte: ${sourceDomain}`;
    }
  }
  
  // Create post - publish directly if autoPublish and has real image
  const canPublish = autoPublish && imageUrl;
  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    workspace_id: workspaceId,
    caption,
    hashtags,
    post_type: 'noticia',
    media_type: 'image',
    platforms: plan.platforms || ['instagram'],
    status: imageUrl ? (canPublish ? 'scheduled' : 'draft') : 'draft', // No image = draft
    scheduled_for: canPublish ? new Date().toISOString() : null,
    image_url: imageUrl,
    overlay_metadata: {
      type: 'news_overlay',
      source_url: sourceUrl,
      source_domain: sourceDomain,
      original_title: selectedArticle?.title,
      used_real_image: !!selectedImage,
      text_applied_by_code: true // Flag indicating text was applied programmatically
    },
    ai_model_used: 'gemini-2.5-flash' // For headline generation only
  }).select().single();
  
  if (error) throw error;
  console.log('[AGENT] Post de notícia criado:', post.id, 'com imagem real:', !!imageUrl);
  return post;
}

// Create IMAGE content - NOW USES LIBRARY (RSS) instead of AI generation
async function createImageContent(
  supabase: any,
  plan: ContentPlan,
  userId: string,
  workspaceId: string,
  supabaseUrl: string,
  headers: any,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Criando post de imagem (da biblioteca RSS):', plan.theme);
  
  // Use RSS library to get content
  const bestItem = await selectBestRssItem(supabase, workspaceId, supabaseUrl, headers, userId);
  
  if (!bestItem) {
    console.log('[AGENT] ⚠️ Sem notícias na biblioteca para post de imagem!');
    const { data: post, error } = await supabase.from('posts').insert({
      user_id: userId,
      workspace_id: workspaceId,
      caption: '⚠️ Nenhuma notícia disponível na biblioteca',
      hashtags: ['#tecnologia'],
      post_type: plan.format,
      media_type: 'image',
      platforms: plan.platforms || ['instagram'],
      status: 'failed',
      error_message: 'Sem notícias na biblioteca RSS. Adicione mais fontes RSS.',
      ai_model_used: 'none'
    }).select().single();
    if (error) throw error;
    return post;
  }
  
  const rssItem = bestItem.item;
  const selectedImage = rssItem.image_url;
  const sourceUrl = rssItem.link;
  const sourceDomain = rssItem.source_name || 'fonte';
  
  // Mark as used
  await supabase.from('rss_items').update({ is_used: true }).eq('id', rssItem.id);
  
  console.log(`[AGENT] Usando notícia da biblioteca (score: ${bestItem.score}): ${rssItem.title}`);
  
  // Apply text overlay with fallback
  let imageUrl = null;
  if (selectedImage && rssItem.title) {
    // Try overlay first
    try {
      const overlayResponse = await fetch(`${supabaseUrl}/functions/v1/apply-text-overlay`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageUrl: selectedImage,
          title: rssItem.title,
          watermarkText: 'Neural Update',
          generateHeadline: true
        })
      });
      
      if (overlayResponse.ok) {
        const overlayResult = await overlayResponse.json();
        imageUrl = overlayResult.publicUrl;
      }
    } catch (e) {
      console.log('[AGENT] Overlay falhou para imagem:', e);
    }
    
    // Fallback 1: watermark programático
    if (!imageUrl) {
      try {
        const wmResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            imageUrl: selectedImage,
            watermarkText: 'Neural Update'
          })
        });
        if (wmResponse.ok) {
          const wmResult = await wmResponse.json();
          imageUrl = wmResult.publicUrl;
          console.log('[AGENT] Watermark programático aplicado ✅');
        }
      } catch (e) {
        console.log('[AGENT] Watermark falhou:', e);
      }
    }
    
    // Fallback 2: upload original
    if (!imageUrl) {
      try {
        const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/upload-external-image`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ imageUrl: selectedImage })
        });
        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json();
          imageUrl = uploadResult.publicUrl;
        }
      } catch (e) {
        console.log('[AGENT] Upload fallback falhou:', e);
      }
    }
  }
  
  // Generate caption
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: `${rssItem.title}. ${rssItem.description || ''}`,
      postType: plan.format,
      sourceUrl,
      sourceName: sourceDomain,
      customInstructions: `Tom: ${plan.tone}. CTA: ${plan.cta}. OBRIGATÓRIO ao final: 📰 Fonte: ${sourceDomain}`
    })
  });
  
  let caption = `📰 ${rssItem.title}`;
  let hashtags: string[] = ['#tecnologia', '#ia', '#futuro', '#inovacao'];
  
  if (captionResponse.ok) {
    const captionData = await captionResponse.json();
    caption = captionData.caption || caption;
    hashtags = captionData.hashtags || hashtags;
  }
  
  // Ensure source attribution
  if (!caption.includes('Fonte:') && sourceUrl) {
    caption += `\n\n📰 Fonte: ${sourceDomain}\n🔗 ${sourceUrl}`;
  }
  
  const canPublish = autoPublish && imageUrl;
  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    workspace_id: workspaceId,
    caption,
    hashtags,
    post_type: 'noticia',
    media_type: 'image',
    platforms: plan.platforms || ['instagram'],
    status: imageUrl ? (canPublish ? 'scheduled' : 'draft') : 'draft',
    scheduled_for: canPublish ? new Date().toISOString() : null,
    image_url: imageUrl,
    overlay_metadata: {
      type: 'library_post',
      source_url: sourceUrl,
      source_domain: sourceDomain,
      original_title: rssItem.title,
      ranking_score: bestItem.score,
      used_real_image: true,
      text_applied_by_code: true
    },
    ai_model_used: 'gemini-2.5-flash'
  }).select().single();
  
  if (error) throw error;
  console.log('[AGENT] Post de imagem (biblioteca) criado:', post.id);
  return post;
}

// ETAPA 5: MEMÓRIA E APRENDIZADO
async function recordDecisionAndLearn(
  supabase: any,
  decision: AgentDecision,
  state: AgentState,
  postId: string | null,
  userId: string,
  workspaceId: string
): Promise<void> {
  console.log('[AGENT] Etapa 5: Registrando decisão e aprendizados...');
  
  // Salvar decisão - incluir workspace_id
  const { error: decisionError } = await supabase.from('agent_decisions').insert({
    user_id: userId,
    workspace_id: workspaceId,
    metrics_snapshot: {
      avgEngagement: state.avgEngagement,
      lastPostHours: state.lastPostHours,
      postsToday: state.postsToday,
      bestPerformingTypes: state.bestPerformingTypes,
      saturatedTopics: state.saturatedTopics
    },
    decision: decision.decision,
    decision_reason: decision.reason,
    content_plan: decision.contentPlan || null,
    hypothesis: decision.hypothesis || null,
    expected_engagement: decision.expectedEngagement || null,
    post_id: postId
  });
  
  if (decisionError) {
    console.error('[AGENT] Erro ao salvar decisão:', decisionError);
  } else {
    console.log('[AGENT] Decisão registrada com sucesso');
  }
  
  // Atualizar contexto do agente se houve sucesso - usar workspace_id
  if (decision.decision === 'POST' && state.avgEngagement > 5) {
    const newPatterns = [...(state.context.success_patterns || [])];
    if (decision.reason && !newPatterns.includes(decision.reason)) {
      newPatterns.push(decision.reason);
    }
    
    await supabase
      .from('agent_context')
      .update({
        success_patterns: newPatterns.slice(-10), // Keep last 10
        updated_at: new Date().toISOString()
      })
      .eq('workspace_id', workspaceId);
    
    console.log('[AGENT] Contexto atualizado com novo padrão de sucesso');
  }
}

// NOVA FUNÇÃO: Gerar análise e insights quando não posta
async function generateInsightsAndAnalysis(
  supabase: any,
  userId: string,
  state: AgentState,
  lovableApiKey: string,
  supabaseUrl: string
): Promise<string | null> {
  console.log('[AGENT] Gerando análise e insights...');
  
  try {
    // 1. Buscar notícias recentes sobre IA para pesquisa
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`
    };
    
    let aiNews: string[] = [];
    try {
      const searchResponse = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: 'inteligência artificial novidades tecnologia 2025',
          limit: 5,
          lang: 'pt-BR'
        })
      });
      
      if (searchResponse.ok) {
        const searchResult = await searchResponse.json();
        aiNews = (searchResult.data || []).slice(0, 3).map((a: any) => a.title || a.url).filter(Boolean);
      }
    } catch (e) {
      console.log('[AGENT] Erro ao buscar notícias:', e);
    }
    
    // 2. Preparar dados de performance
    const totalProgress = state.weeklyProgress.videos + state.weeklyProgress.carousels + 
                          state.weeklyProgress.news + state.weeklyProgress.images;
    const totalGoals = state.weeklyGoals.videos + state.weeklyGoals.carousels + 
                       state.weeklyGoals.news + state.weeklyGoals.images;
    
    // 3. Gerar análise com IA
    const analysisPrompt = `Você é um analista de conteúdo digital. Analise os dados e gere insights curtos e acionáveis.

DADOS DE PERFORMANCE:
- Engajamento médio: ${state.avgEngagement.toFixed(2)}%
- Posts criados hoje: ${state.postsToday}
- Progresso semanal: ${totalProgress}/${totalGoals} posts
- Vídeos: ${state.weeklyProgress.videos}/${state.weeklyGoals.videos}
- Carrosséis: ${state.weeklyProgress.carousels}/${state.weeklyGoals.carousels}
- Notícias: ${state.weeklyProgress.news}/${state.weeklyGoals.news}
- Imagens: ${state.weeklyProgress.images}/${state.weeklyGoals.images}
- Tipos que performam melhor: ${state.bestPerformingTypes.join(', ') || 'dados insuficientes'}
- Temas recentes: ${state.saturatedTopics.join(', ') || 'variados'}

${aiNews.length > 0 ? `TENDÊNCIAS EM IA (notícias recentes):
${aiNews.map((n, i) => `${i + 1}. ${n}`).join('\n')}` : ''}

Gere uma análise CURTA (máximo 3 parágrafos) com:
1. 📊 Status atual (1 frase)
2. 💡 1-2 insights práticos sobre o que melhorar
3. 🎯 1 sugestão de conteúdo baseada nas tendências

Seja direto e conversacional. Use emojis com moderação.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: 'Você é um analista de marketing digital especializado em crescimento orgânico.' },
          { role: 'user', content: analysisPrompt }
        ]
      })
    });

    if (response.ok) {
      const result = await response.json();
      const insights = result.choices?.[0]?.message?.content;
      if (insights) {
        console.log('[AGENT] Insights gerados com sucesso');
        return insights;
      }
    } else if (response.status === 402 || response.status === 429) {
      console.log('[AGENT] Sem créditos para gerar insights, pulando...');
      return null;
    }
    
    return null;
  } catch (error) {
    console.error('[AGENT] Erro ao gerar insights:', error);
    return null;
  }
}

// MAIN HANDLER
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[AGENT] ===== CICLO DO AGENTE INICIADO =====');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Parse request body
    let userId: string | null = null;
    let workspaceId: string | null = null;
    let trigger = 'manual';
    let forceContentType: ContentType | null = null;
    
    try {
      const body = await req.json();
      userId = body.userId;
      workspaceId = body.workspaceId;
      trigger = body.trigger || 'manual';
      forceContentType = body.forceContentType as ContentType | null;
      if (forceContentType) {
        console.log('[AGENT] FORÇANDO tipo de conteúdo:', forceContentType);
      }
    } catch {
      // No body or invalid JSON
    }
    
    // If triggered by cron, process all workspaces with auto_post_enabled
    if (trigger === 'cron' && !userId) {
      console.log('[AGENT] Trigger: CRON - Processando todos os workspaces ativos...');
      
      const { data: activeContexts } = await supabase
        .from('agent_context')
        .select('user_id, workspace_id')
        .eq('auto_post_enabled', true)
        .not('workspace_id', 'is', null);
      
      if (!activeContexts || activeContexts.length === 0) {
        console.log('[AGENT] Nenhum workspace com auto_post ativo');
        return new Response(
          JSON.stringify({ success: true, message: 'Nenhum workspace ativo' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const results = [];
      for (const ctx of activeContexts) {
        try {
          const result = await processWorkspace(supabase, ctx.user_id, ctx.workspace_id, lovableApiKey, supabaseUrl, 'cron');
          results.push({ workspaceId: ctx.workspace_id, userId: ctx.user_id, ...result });
        } catch (e) {
          console.error(`[AGENT] Erro ao processar workspace ${ctx.workspace_id}:`, e);
          results.push({ workspaceId: ctx.workspace_id, userId: ctx.user_id, error: String(e) });
        }
      }
      
      console.log('[AGENT] ===== CICLO CRON FINALIZADO =====');
      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Single workspace processing - require workspaceId
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId é obrigatório para trigger manual' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: 'workspaceId é obrigatório para trigger manual' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const result = await processWorkspace(supabase, userId, workspaceId, lovableApiKey, supabaseUrl, trigger, forceContentType);
    
    console.log('[AGENT] ===== CICLO FINALIZADO =====');
    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    const errorMessage = error?.message || error?.code || JSON.stringify(error) || String(error);
    console.error('[AGENT] Erro fatal:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Process a single workspace
async function processWorkspace(
  supabase: any, 
  userId: string, 
  workspaceId: string,
  lovableApiKey: string,
  supabaseUrl: string,
  trigger: string = 'manual',
  forceContentType: ContentType | null = null
): Promise<any> {
  console.log(`[AGENT] Processando workspace: ${workspaceId} (user: ${userId})`);
  
  // Get agent name for conversational messages
  const { data: contextData } = await supabase
    .from('agent_context')
    .select('agent_name')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const agentName = contextData?.agent_name || 'Agente';
  
  // Create execution report record
  const { data: reportRecord } = await supabase
    .from('agent_execution_reports')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      trigger,
      status: 'running',
      started_at: new Date().toISOString()
    })
    .select()
    .single();
  
  const reportId = reportRecord?.id;
  
  try {
    // Send initial chat message (conversational style)
    await sendChatMessage(supabase, userId, getConversationalUpdate(agentName, 'analyzing'));
    
    // ETAPA 1: Análise - passar workspaceId para buscar dados corretos
    const state = await analyzeCurrentState(supabase, userId, workspaceId);
    
    // If forceContentType is set, override the state's nextContentType
    if (forceContentType) {
      console.log(`[AGENT] Sobrescrevendo tipo: ${state.nextContentType} -> ${forceContentType}`);
      state.nextContentType = forceContentType;
    }
    
    // Send decision update
    await sendChatMessage(supabase, userId, getConversationalUpdate(agentName, 'deciding', {
      nextType: state.nextContentType
    }));
    
    // ETAPA 2: Decisão
    const decision = await makeStrategicDecision(state, lovableApiKey);
    
    let post = null;
    
    // ETAPA 3 & 4: Execução (se decisão for POST)
    if (decision.decision === 'POST' && decision.contentPlan) {
      // Send creating message
      const mediaTypeName = decision.contentPlan.mediaType === 'reels' ? 'Reels' : 
                            decision.contentPlan.mediaType === 'carousel' ? 'Carrossel' :
                            decision.contentPlan.mediaType === 'video' ? 'Vídeo' : 'Post';
      
      await sendChatMessage(supabase, userId, getConversationalUpdate(agentName, 'creating', {
        type: mediaTypeName,
        theme: decision.contentPlan.theme
      }));
      
      // Check if auto_post is enabled - pass to executeContentPlan
      const autoPublish = state.context?.auto_post_enabled || false;
      post = await executeContentPlan(supabase, decision.contentPlan, userId, workspaceId, supabaseUrl, autoPublish);
      
      console.log(`[AGENT] Post criado: ${post.id}, status: ${post.status}, autoPublish: ${autoPublish}`);
      
      // Send completion message
      const isReels = decision.contentPlan.mediaType === 'reels' || decision.contentPlan.mediaType === 'video';
      await sendChatMessage(supabase, userId, getConversationalUpdate(agentName, 'created', {
        type: mediaTypeName,
        theme: decision.contentPlan.theme,
        status: post?.status,
        needsRender: isReels && !post?.video_url
      }));
      
    } else if (decision.decision === 'NO_POST' || decision.decision === 'WAIT') {
      // Send waiting message
      await sendChatMessage(supabase, userId, getConversationalUpdate(agentName, 'waiting', {
        reason: decision.reason
      }));
      
      // *** NOVO: Gerar análise e insights quando não posta ***
      const insights = await generateInsightsAndAnalysis(supabase, userId, state, lovableApiKey, supabaseUrl);
      if (insights) {
        await sendChatMessage(supabase, userId, getConversationalUpdate(agentName, 'insights', {
          insights
        }));
      }
    }
    
    // ETAPA 5: Registro de decisão - passar workspaceId
    await recordDecisionAndLearn(supabase, decision, state, post?.id || null, userId, workspaceId);
    
    // Generate friendly summary for the user
    const summary = generateExecutionSummary(decision, state, post);
    
    // Send final summary with stats
    const totalGoals = state.weeklyGoals.videos + state.weeklyGoals.carousels + 
                       state.weeklyGoals.news + state.weeklyGoals.images;
    const totalProgress = state.weeklyProgress.videos + state.weeklyProgress.carousels + 
                          state.weeklyProgress.news + state.weeklyProgress.images;
    
    await sendChatMessage(supabase, userId, getConversationalUpdate(agentName, 'completed', {
      weeklyProgress: totalProgress,
      weeklyGoals: totalGoals,
      avgEngagement: state.avgEngagement.toFixed(1)
    }));
    
    // Update execution report with results
    if (reportId) {
      await supabase
        .from('agent_execution_reports')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          metrics_snapshot: {
            avgEngagement: state.avgEngagement,
            lastPostHours: state.lastPostHours,
            postsToday: state.postsToday,
            bestPerformingTypes: state.bestPerformingTypes,
            saturatedTopics: state.saturatedTopics
          },
          decision: decision.decision,
          decision_reason: decision.reason,
          content_plan: decision.contentPlan || null,
          post_id: post?.id || null,
          summary,
          hypothesis: decision.hypothesis || null
        })
        .eq('id', reportId);
    }
    
    return {
      decision: decision.decision,
      reason: decision.reason,
      hypothesis: decision.hypothesis,
      expectedEngagement: decision.expectedEngagement,
      postId: post?.id,
      contentPlan: decision.contentPlan,
      summary
    };
  } catch (error) {
    const errorStr = String(error);
    let userFriendlySummary = `Erro durante execução: ${errorStr}`;
    
    // Provide user-friendly error messages
    if (errorStr.includes('CREDITS_EXHAUSTED')) {
      userFriendlySummary = '⚠️ Créditos da IA esgotados. Adicione mais créditos no painel do Lovable (Settings > Workspace > Usage) para continuar usando o agente autônomo.';
    } else if (errorStr.includes('RATE_LIMITED')) {
      userFriendlySummary = '⏳ Limite de requisições atingido. O agente tentará novamente no próximo ciclo.';
    } else if (errorStr.includes('402')) {
      userFriendlySummary = '⚠️ Créditos insuficientes para executar o agente. Recarregue seus créditos em Settings > Workspace > Usage.';
    }
    
    // Send error message via chat
    await sendChatMessage(supabase, userId, getConversationalUpdate(agentName, 'error', {
      error: userFriendlySummary
    }));
    
    // Update report with error status
    if (reportId) {
      await supabase
        .from('agent_execution_reports')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          summary: userFriendlySummary
        })
        .eq('id', reportId);
    }
    throw error;
  }
}

// Generate a friendly summary message for the execution
function generateExecutionSummary(decision: AgentDecision, state: AgentState, post: any): string {
  const agentName = state.context?.agent_name || 'Agente';
  const now = new Date();
  const hour = now.getHours();
  
  let greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  
  if (decision.decision === 'POST' && post) {
    const wasPublished = state.context?.auto_post_enabled;
    if (wasPublished) {
      return `${greeting}! 🚀 ${agentName} publicou um novo conteúdo sobre "${decision.contentPlan?.theme || 'tendências'}". O engajamento médio está em ${state.avgEngagement.toFixed(1)}% e decidi testar ${decision.hypothesis || 'um novo formato'}.`;
    } else {
      return `${greeting}! 📝 ${agentName} criou um rascunho sobre "${decision.contentPlan?.theme || 'tendências'}" para sua aprovação. Ative o modo automático para publicar sem intervenção.`;
    }
  } else if (decision.decision === 'NO_POST') {
    return `${greeting}! 🧠 ${agentName} analisou o cenário e decidiu não postar agora. Motivo: ${decision.reason}. Próxima análise será feita em breve.`;
  } else if (decision.decision === 'WAIT') {
    return `${greeting}! ⏳ ${agentName} está aguardando o momento ideal. Último post foi há ${Math.round(state.lastPostHours)}h. ${decision.reason}`;
  }
  
  return `${agentName} completou a análise. ${decision.reason}`;
}
