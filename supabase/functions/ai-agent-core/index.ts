import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Content distribution types
type ContentType = 'video' | 'carousel' | 'news' | 'image' | 'marketing';

interface ContentDistribution {
  videos: number;
  carousels: number;
  news: number;
  images: number;
  marketing: number;
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

interface HistoricalPerformance {
  avgReachPerPost: number;
  avgEngagement: number;
  totalPosts: number;
  bestMediaType: string | null;
  bestMediaTypeAvgReach: number;
  worstMediaType: string | null;
  topPostCaption: string | null;
  topPostReach: number;
  reelsAvgReach: number;
  newsAvgReach: number;
  carouselAvgReach: number;
  imageAvgReach: number;
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
  // 30-day historical analysis
  historical30d: HistoricalPerformance;
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
  // 💰 METAS REDUZIDAS: de 46 para 11 posts/semana (corte de 76% nos custos)
  const weeklyGoals: ContentDistribution = {
    videos: context.content_distribution_videos || 2,
    carousels: context.content_distribution_carousels || 1,
    news: context.content_distribution_news || 4,
    images: context.content_distribution_images || 2,
    marketing: 1, // 1 post de marketing por semana (intercalado a cada ~4 posts regulares)
  };
  
  // Count progress this week by media type
  const weeklyProgress: ContentDistribution = {
    videos: postsThisWeek.filter((p: any) => p.media_type === 'reels' || p.media_type === 'video').length,
    carousels: postsThisWeek.filter((p: any) => p.media_type === 'carousel').length,
    news: postsThisWeek.filter((p: any) => p.post_type === 'noticia' && p.media_type !== 'carousel').length,
    images: postsThisWeek.filter((p: any) => p.media_type === 'image' && p.post_type !== 'noticia' && p.post_type !== 'afiliado').length,
    marketing: postsThisWeek.filter((p: any) => p.post_type === 'afiliado').length,
  };
  
  // Determine next content type based on COMPLETION PERCENTAGE (lower = higher priority)
  // This ensures diversity: a type with 0/2 (0%) gets priority over 13/14 (93%)
  const getCompletionStats = (type: ContentType): { remaining: number; percentage: number; goal: number } => {
    const keyMap = { video: 'videos', carousel: 'carousels', news: 'news', image: 'images', marketing: 'marketing' } as const;
    const key = keyMap[type];
    const goal = weeklyGoals[key] || 1;
    const progress = weeklyProgress[key] || 0;
    const remaining = Math.max(0, goal - progress);
    const percentage = goal > 0 ? (progress / goal) * 100 : 100;
    return { remaining, percentage, goal };
  };
  
  // MARKETING INTERCALATION: check if it's time for a marketing post
  // Rule: 1 marketing post for every 4 regular posts
  const totalRegularPosts = weeklyProgress.videos + weeklyProgress.carousels + weeklyProgress.news + weeklyProgress.images;
  const marketingDue = totalRegularPosts >= 4 && weeklyProgress.marketing === 0;
  const marketingOverdue = totalRegularPosts >= 8 && weeklyProgress.marketing <= 1;
  
  // Check if there are active affiliate links
  const { data: activeAffiliateLinks } = await supabase
    .from('affiliate_links')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .limit(1);
  
  const hasAffiliateLinks = (activeAffiliateLinks?.length || 0) > 0;
  
  const typeStats = [
    { type: 'video' as ContentType, ...getCompletionStats('video'), priority: 4 },
    { type: 'carousel' as ContentType, ...getCompletionStats('carousel'), priority: 3 },
    { type: 'news' as ContentType, ...getCompletionStats('news'), priority: 2 },
    { type: 'image' as ContentType, ...getCompletionStats('image'), priority: 1 },
    // Marketing only appears if there are active affiliate links
    ...(hasAffiliateLinks ? [{ type: 'marketing' as ContentType, ...getCompletionStats('marketing'), priority: 5 }] : []),
  ];
  
  // Log BEFORE filtering for debugging
  console.log('[AGENT] Content type stats BEFORE filter:', typeStats.map(t => 
    `${t.type}: ${t.remaining}/${t.goal} (${Math.round(t.percentage)}%, priority ${t.priority})`
  ).join(' | '));
  
  const remainingTypes = typeStats.filter(t => t.remaining > 0);
  
  // Sort: lowest completion % first, then highest priority as tiebreaker
  // IMPORTANT: Use explicit number comparison to avoid JS sort instability
  const remainingByType = remainingTypes.sort((a, b) => {
    const pctDiff = a.percentage - b.percentage;
    if (Math.abs(pctDiff) > 0.01) return pctDiff;
    // Same percentage → higher priority first (video > carousel > news > image)
    return b.priority - a.priority;
  });
  
  console.log('[AGENT] Content distribution AFTER sort:', remainingByType.map(t => 
    `${t.type}: ${Math.round(t.percentage)}% (${t.goal - t.remaining}/${t.goal})`
  ).join(', '));
  
  // MARKETING INTERCALATION: Force marketing if it's overdue
  let nextContentType: ContentType | null;
  if (hasAffiliateLinks && (marketingDue || marketingOverdue) && weeklyProgress.marketing < weeklyGoals.marketing) {
    nextContentType = 'marketing';
    console.log(`[AGENT] ⚡ MARKETING INTERCALATION: ${totalRegularPosts} regular posts done, forcing marketing post`);
  } else {
    nextContentType = remainingByType.length > 0 ? remainingByType[0].type : null;
  }
  console.log('[AGENT] ➡️ NEXT CONTENT TYPE SELECTED:', nextContentType);
  
  // ===== 30-DAY HISTORICAL ANALYSIS (like a senior marketer would do) =====
  const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { data: histPosts } = await supabase
    .from('posts')
    .select('reach, likes_count, comments_count, saves_count, media_type, post_type, caption, instagram_post_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'published')
    .not('instagram_post_id', 'is', null)
    .gt('reach', 10) // Only real synced metrics
    .gte('published_at', days30Ago.toISOString())
    .order('reach', { ascending: false });
  
  const realPosts = histPosts || [];
  
  // Analyze by media type
  const typeAnalysis: Record<string, { totalReach: number; count: number; totalEng: number }> = {};
  for (const p of realPosts) {
    const mt = (p.media_type === 'reels' || p.media_type === 'reel') ? 'reels' 
      : p.post_type === 'noticia' ? 'news' 
      : p.media_type === 'carousel' ? 'carousel' 
      : 'image';
    if (!typeAnalysis[mt]) typeAnalysis[mt] = { totalReach: 0, count: 0, totalEng: 0 };
    typeAnalysis[mt].totalReach += (p.reach || 0);
    typeAnalysis[mt].count += 1;
    typeAnalysis[mt].totalEng += (p.likes_count || 0) + (p.comments_count || 0) + (p.saves_count || 0);
  }
  
  const getTypeAvgReach = (t: string) => typeAnalysis[t] ? Math.round(typeAnalysis[t].totalReach / typeAnalysis[t].count) : 0;
  
  const sortedTypes = Object.entries(typeAnalysis).sort(([,a],[,b]) => (b.totalReach / b.count) - (a.totalReach / a.count));
  const totalReach30d = realPosts.reduce((s, p: any) => s + (p.reach || 0), 0);
  const totalEng30d = realPosts.reduce((s, p: any) => s + (p.likes_count || 0) + (p.comments_count || 0) + (p.saves_count || 0), 0);
  
  const historical30d: HistoricalPerformance = {
    avgReachPerPost: realPosts.length > 0 ? Math.round(totalReach30d / realPosts.length) : 0,
    avgEngagement: realPosts.length > 0 ? Math.round((totalEng30d / totalReach30d) * 1000) / 10 : 0,
    totalPosts: realPosts.length,
    bestMediaType: sortedTypes[0]?.[0] || null,
    bestMediaTypeAvgReach: sortedTypes[0] ? Math.round(sortedTypes[0][1].totalReach / sortedTypes[0][1].count) : 0,
    worstMediaType: sortedTypes.length > 1 ? sortedTypes[sortedTypes.length - 1][0] : null,
    topPostCaption: realPosts[0]?.caption?.substring(0, 80) || null,
    topPostReach: realPosts[0]?.reach || 0,
    reelsAvgReach: getTypeAvgReach('reels'),
    newsAvgReach: getTypeAvgReach('news'),
    carouselAvgReach: getTypeAvgReach('carousel'),
    imageAvgReach: getTypeAvgReach('image'),
  };
  
  console.log('[AGENT] 📊 30-day analysis:', {
    totalRealPosts: historical30d.totalPosts,
    avgReach: historical30d.avgReachPerPost,
    bestType: historical30d.bestMediaType,
    bestAvgReach: historical30d.bestMediaTypeAvgReach,
    reels: `${getTypeAvgReach('reels')} avg (${typeAnalysis['reels']?.count || 0} posts)`,
    news: `${getTypeAvgReach('news')} avg (${typeAnalysis['news']?.count || 0} posts)`,
  });
  
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
    nextContentType,
    historical30d
  };
}

// Calculate dynamic daily post limit based on macro objectives
function calculateDynamicDailyLimit(state: AgentState): number {
  const goalType = state.context?.goal_type || 'macro';
  
  // Legacy fixed mode ONLY
  if (goalType === 'fixed') {
    return state.context?.daily_post_limit || 2;
  }
  
  // ALL OTHER MODES (macro, growth, reach, authority, conversion) use dynamic limits
  const goalViews = state.context?.goal_weekly_views || 10000;
  const goalEngagement = state.context?.goal_weekly_engagement || 5.0;
  
  // Use SYNCED values from agent_context (updated by sync-instagram-metrics)
  const currentWeeklyViews = state.context?.current_weekly_views || 0;
  const currentWeeklyEngagement = state.context?.current_weekly_engagement || 0;
  
  const viewsProgress = goalViews > 0 ? (currentWeeklyViews / goalViews) * 100 : 100;
  const engagementProgress = goalEngagement > 0 ? (currentWeeklyEngagement / goalEngagement) * 100 : 100;
  
  // Also check CONTENT distribution progress (how many posts done vs goal)
  const totalGoals = (state.weeklyGoals?.videos || 0) + (state.weeklyGoals?.carousels || 0) + 
                     (state.weeklyGoals?.news || 0) + (state.weeklyGoals?.images || 0) + (state.weeklyGoals?.marketing || 0);
  const totalProgress = (state.weeklyProgress?.videos || 0) + (state.weeklyProgress?.carousels || 0) + 
                         (state.weeklyProgress?.news || 0) + (state.weeklyProgress?.images || 0) + (state.weeklyProgress?.marketing || 0);
  const contentProgress = totalGoals > 0 ? (totalProgress / totalGoals) * 100 : 100;
  
  // Day of week (0=Sun, 6=Sat) - how many days left in the week
  const now = new Date();
  const brasiliaOffset = -3 * 60 * 60 * 1000;
  const todayBrasilia = new Date(now.getTime() + brasiliaOffset);
  const dayOfWeek = todayBrasilia.getDay();
  const daysLeftInWeek = Math.max(1, 7 - dayOfWeek);
  
  // Use MINIMUM of ALL progress metrics - if ANY goal is behind, push harder
  const minProgress = Math.min(viewsProgress, engagementProgress, contentProgress);
  
  console.log(`[AGENT] Dynamic limit calc: views ${currentWeeklyViews}/${goalViews} (${Math.round(viewsProgress)}%), engagement ${currentWeeklyEngagement}%/${goalEngagement}% (${Math.round(engagementProgress)}%), content ${totalProgress}/${totalGoals} (${Math.round(contentProgress)}%)`);
  console.log(`[AGENT] MIN progress: ${Math.round(minProgress)}%, days left: ${daysLeftInWeek}, goalType: ${goalType}`);
  
  // Dynamic daily limit based on how far behind we are
  let dynamicLimit: number;
  if (minProgress >= 100) {
    // ALL goals met - maintenance mode
    dynamicLimit = 1;
  } else if (minProgress >= 70) {
    dynamicLimit = 2;
  } else if (minProgress >= 40) {
    dynamicLimit = 3;
  } else {
    // Far behind - maximum effort
    dynamicLimit = daysLeftInWeek <= 2 ? 5 : 4;
  }
  
  console.log(`[AGENT] ➡️ Dynamic daily limit: ${dynamicLimit} (minProgress=${Math.round(minProgress)}%)`);
  
  // Hard cap at 5 posts/day to avoid spam
  return Math.min(5, dynamicLimit);
}

// ETAPA 2: DECISÃO ESTRATÉGICA
async function makeStrategicDecision(state: AgentState, lovableApiKey: string): Promise<AgentDecision> {
  console.log('[AGENT] Etapa 2: Tomando decisão estratégica...');
  
  const goalType = state.context?.goal_type || 'macro';
  const dynamicDailyLimit = calculateDynamicDailyLimit(state);
  const minHoursBetween = state.context?.min_hours_between_posts || 2;
  const preferredPlatforms = state.context?.preferred_platforms || ['instagram'];
  const bestTimes = state.context?.best_posting_times || ['10:00', '14:00', '19:00'];
  const successPatterns = state.context?.success_patterns || [];
  
  // Check if weekly goals are met
  const totalGoals = state.weeklyGoals.videos + state.weeklyGoals.carousels + 
                     state.weeklyGoals.news + state.weeklyGoals.images + state.weeklyGoals.marketing;
  const totalProgress = state.weeklyProgress.videos + state.weeklyProgress.carousels + 
                     state.weeklyProgress.news + state.weeklyProgress.images + state.weeklyProgress.marketing;
  
  // Macro objectives info - use SYNCED data from agent_context
  const goalViews = state.context?.goal_weekly_views || 10000;
  const goalFollowers = state.context?.goal_weekly_followers || 100;
  const goalEngagement = state.context?.goal_weekly_engagement || 5.0;
  const weeklyReach = state.context?.current_weekly_views || 0;
  const currentEngagement = state.context?.current_weekly_engagement || state.avgEngagement;
  
  console.log(`[AGENT] Modo: ${goalType.toUpperCase()}`);
  console.log(`[AGENT] Meta semanal: ${totalProgress} posts criados`);
  console.log(`[AGENT] Limite diário dinâmico: ${state.postsToday}/${dynamicDailyLimit} posts CRIADOS hoje`);
  console.log(`[AGENT] Objetivos macro (synced): views ${weeklyReach}/${goalViews}, engagement ${currentEngagement}%/${goalEngagement}%`);
  console.log(`[AGENT] 📊 30d history: ${state.historical30d.totalPosts} posts reais, avg reach ${state.historical30d.avgReachPerPost}, best type: ${state.historical30d.bestMediaType}`);
  console.log(`[AGENT] Próximo tipo de conteúdo: ${state.nextContentType || 'meta completa'}`);
  
  // Dynamic daily limit check
  if (state.postsToday >= dynamicDailyLimit) {
    console.log(`[AGENT] Limite diário dinâmico atingido (${dynamicDailyLimit}) - PARAR por hoje`);
    return {
      decision: 'NO_POST',
      reason: `🎯 Limite diário inteligente atingido! ${state.postsToday}/${dynamicDailyLimit} posts hoje. Objetivos: Views ${weeklyReach.toLocaleString()}/${goalViews.toLocaleString()} (${Math.round((weeklyReach/goalViews)*100)}%), Engajamento ${currentEngagement}%/${goalEngagement}%. Análise 30d: melhor formato = ${state.historical30d.bestMediaType || 'N/A'} (avg ${state.historical30d.bestMediaTypeAvgReach} alcance).`,
      hypothesis: 'O agente ajusta automaticamente a frequência com base nos objetivos macro e histórico de 30 dias.'
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
  
  // For ALL non-fixed goal types (macro, growth, reach, authority, conversion):
  // Don't stop at weekly content goals - keep posting if macro objectives not met
  if (!state.nextContentType && goalType !== 'fixed') {
    // Check if macro objectives are met
    const viewsMet = weeklyReach >= goalViews;
    const engagementMet = currentEngagement >= goalEngagement;
    
    if (viewsMet && engagementMet) {
      console.log('[AGENT] Objetivos macro alcançados!');
      return {
        decision: 'NO_POST',
        reason: `🏆 Objetivos alcançados! Views: ${weeklyReach.toLocaleString()}/${goalViews.toLocaleString()}, Engajamento: ${currentEngagement}%/${goalEngagement}%. Modo manutenção ativo.`
      };
    }
    
    // Objectives NOT met - override nextContentType based on goal type
    // For growth/reach: prioritize reels (higher reach potential)
    // For authority/conversion: prioritize news (builds credibility)
    const overrideType: ContentType = (goalType === 'growth' || goalType === 'reach') ? 'video' : 'news';
    console.log(`[AGENT] Metas de tipo completas mas objetivos NÃO atingidos (${goalType}) - continuando com ${overrideType}`);
    state.nextContentType = overrideType;
  } else if (!state.nextContentType) {
    console.log('[AGENT] Meta semanal completa (modo fixo)!');
    return {
      decision: 'NO_POST',
      reason: `🏆 Meta semanal de ${totalGoals} posts alcançada! Vídeos: ${state.weeklyProgress.videos}/${state.weeklyGoals.videos}, Carrosséis: ${state.weeklyProgress.carousels}/${state.weeklyGoals.carousels}, Notícias: ${state.weeklyProgress.news}/${state.weeklyGoals.news}, Imagens: ${state.weeklyProgress.images}/${state.weeklyGoals.images}, Marketing: ${state.weeklyProgress.marketing}/${state.weeklyGoals.marketing}`
    };
  }
  
  // Determine content type and format based on distribution
  const contentTypeMap: Record<ContentType, { mediaType: string; format: string; theme: string }> = {
    'video': { mediaType: 'reels', format: 'storytelling', theme: 'tendência tecnológica impactante' },
    'carousel': { mediaType: 'carousel', format: 'educacional', theme: 'dicas práticas de tecnologia' },
    'news': { mediaType: 'image', format: 'noticia', theme: 'notícia tecnologia inteligência artificial' },
    'image': { mediaType: 'image', format: 'engajamento', theme: 'reflexão sobre tecnologia e futuro' },
    'marketing': { mediaType: 'image', format: 'vendas', theme: 'produto afiliado' }
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
  
  // For 'news' type: skip AI theme refinement - the RSS ranking already picks the best article
  // This saves 1 AI call per news post (significant cost reduction)
  if (state.nextContentType !== 'news') {
    const h = state.historical30d;
    const systemPrompt = `Você é um diretor de marketing digital sênior especializado em growth hacking para Instagram.
O agente precisa criar um ${state.nextContentType.toUpperCase()} (${selectedType.format}).

📊 ANÁLISE DE 30 DIAS (dados reais do Instagram):
- ${h.totalPosts} posts com métricas reais sincronizadas
- Alcance médio por post: ${h.avgReachPerPost.toLocaleString()}
- Engajamento médio: ${h.avgEngagement}%
- Melhor formato: ${h.bestMediaType || 'N/A'} (alcance médio: ${h.bestMediaTypeAvgReach.toLocaleString()})
- Pior formato: ${h.worstMediaType || 'N/A'}
- Reels: avg ${h.reelsAvgReach.toLocaleString()} alcance | Notícias: avg ${h.newsAvgReach.toLocaleString()} | Carrosséis: avg ${h.carouselAvgReach.toLocaleString()} | Imagens: avg ${h.imageAvgReach.toLocaleString()}
${h.topPostCaption ? `- Post de maior alcance (${h.topPostReach.toLocaleString()}): "${h.topPostCaption}..."` : ''}

📈 PROGRESSO SEMANAL:
- Vídeos: ${state.weeklyProgress.videos}/${state.weeklyGoals.videos}
- Carrosséis: ${state.weeklyProgress.carousels}/${state.weeklyGoals.carousels}
- Notícias: ${state.weeklyProgress.news}/${state.weeklyGoals.news}  
- Imagens: ${state.weeklyProgress.images}/${state.weeklyGoals.images}
- Marketing: ${state.weeklyProgress.marketing}/${state.weeklyGoals.marketing}

🎯 OBJETIVOS MACRO:
- Views: ${weeklyReach.toLocaleString()}/${goalViews.toLocaleString()} (${Math.round((weeklyReach/goalViews)*100)}%)
- Engajamento: ${currentEngagement}%/${goalEngagement}%

INSIGHTS DO AGENTE: ${(state.context?.success_patterns || []).join(' | ') || 'Coletando dados...'}

Com base nesses dados REAIS, sugira um tema ESPECÍFICO e atual que maximize o alcance para ${state.nextContentType}.
Priorize temas que funcionaram bem no histórico. Responda em JSON: { "theme": "tema específico", "cta": "CTA do post", "tone": "tom sugerido" }`;

    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
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
  } else {
    console.log('[AGENT] Tipo "news": tema definido pelo RSS ranking (sem chamada de IA extra)');
  }

  // Return decision with content plan (no need for another AI call - we already decided based on distribution)
  const remainingForType: Record<ContentType, number> = {
    'video': state.weeklyGoals.videos - state.weeklyProgress.videos,
    'carousel': state.weeklyGoals.carousels - state.weeklyProgress.carousels,
    'news': state.weeklyGoals.news - state.weeklyProgress.news,
    'image': state.weeklyGoals.images - state.weeklyProgress.images,
    'marketing': state.weeklyGoals.marketing - state.weeklyProgress.marketing,
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
    case 'video': {
      // For video content, fetch the best RSS item to use as article context
      // This enables intelligent real-image curation instead of generic stock photos
      let rssArticle: { url: string; title: string; description?: string } | undefined;
      try {
        const bestItem = await selectBestRssItem(supabase, workspaceId, supabaseUrl, headers, userId);
        if (bestItem?.item) {
          rssArticle = {
            url: bestItem.item.link,
            title: bestItem.item.title,
            description: bestItem.item.description || '',
          };
          // Update plan theme to match the actual news article
          plan.theme = bestItem.item.title;
          console.log(`[AGENT] Video usando artigo RSS: ${rssArticle.title}`);
          // Mark as used so it won't be reused
          await supabase.from('rss_items').update({ is_used: true }).eq('id', bestItem.item.id);
        }
      } catch (e) {
        console.log('[AGENT] Sem artigo RSS para video, usando tema genérico:', e);
      }
      try {
        return await createVideoContent(supabase, plan, userId, workspaceId, supabaseUrl, headers, autoPublish, rssArticle);
      } catch (videoError: any) {
        console.error('[AGENT] ❌ VIDEO CREATION FAILED:', videoError?.message || videoError);
        // Don't silently fail - create a draft with error info
        const { data: fallbackPost } = await supabase.from('posts').insert({
          user_id: userId,
          workspace_id: workspaceId,
          caption: `🎬 ${plan.theme}`,
          hashtags: ['#tecnologia', '#reels'],
          post_type: 'entretenimento',
          media_type: 'reels',
          platforms: plan.platforms || ['instagram'],
          status: 'failed',
          error_message: `Erro na criação de vídeo: ${videoError?.message || 'Unknown error'}`,
          ai_model_used: 'none'
        }).select().single();
        return fallbackPost;
      }
    }
    case 'carousel':
      return createCarouselContent(supabase, plan, userId, workspaceId, supabaseUrl, headers, autoPublish);
    case 'news':
      return createNewsContent(supabase, plan, userId, workspaceId, supabaseUrl, headers, autoPublish);
    case 'marketing':
      return createMarketingContent(supabase, plan, userId, workspaceId, supabaseUrl, headers, autoPublish);
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
  autoPublish: boolean = false,
  rssArticle?: { url: string; title: string; description?: string } // Optional RSS article context
): Promise<any> {
  console.log('[AGENT] Criando vídeo/reels:', plan.theme);
  
  const images: string[] = [];
  const titles: string[] = [];

  // STEP 1: Generate 4 AI images via Gemini Flash Image
  // Uses search-images-for-video in AI GENERATION MODE (no articleUrl/useArticleMode)
  // This ensures visual consistency and relevance instead of random stock photos
  const articleTitle = rssArticle?.title || plan.theme;
  const articleDesc = rssArticle?.description || '';
  
  // Build 4 progressive segments with Neural Update visual identity
  const progressivePhases = [
    { text: `Contexto e cenário: ${articleTitle}`, imagePrompt: `Hook visual forte — cena impactante que introduza ${articleTitle}, ambiente tecnológico, sensação de novidade e descoberta, curiosidade imediata` },
    { text: `Desenvolvimento: ${articleDesc || articleTitle}`, imagePrompt: `Expansão do tema — continuação direta, mesmo universo visual, novos elementos de evolução sobre ${articleTitle}, detalhes, interfaces, dados visuais` },
    { text: `Impacto e consequências de ${articleTitle}`, imagePrompt: `Consequência e escala — impacto de ${articleTitle} no mundo/mercado, cena maior e mais intensa, transformação, poder` },
    { text: `Conclusão e futuro: ${articleTitle}`, imagePrompt: `Visão futura — projeção futurista sobre ${articleTitle}, composição limpa e simbólica, reflexão, encerramento forte` },
  ];
  
  console.log('[AGENT] 🎨 AI GENERATION MODE: Gerando 4 imagens por IA para vídeo');
  try {
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/search-images-for-video`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        topic: articleTitle,
        segments: progressivePhases,
      })
    });

    if (searchResponse.ok) {
      const searchResult = await searchResponse.json();
      if (searchResult.images && searchResult.images.length > 0) {
        for (const img of searchResult.images) {
          const imgUrl = img.imageUrl || img.url;
          if (imgUrl && typeof imgUrl === 'string') {
            images.push(imgUrl);
            titles.push(articleTitle);
          }
        }
        console.log(`[AGENT] ✅ ${images.length} imagens IA geradas (stats: ${JSON.stringify(searchResult.stats)})`);
      }
    }
  } catch (e) {
    console.log('[AGENT] Erro na geração IA de imagens:', e);
  }

  console.log(`[AGENT] Total de imagens para vídeo: ${images.length}`);
  
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
  // Build script segments matching EXACTLY the format useNarrativeStory expects
  const scriptSegments = progressivePhases.map((phase, i) => ({
    text: phase.text,
    imagePrompt: phase.imagePrompt,
  }));

  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    workspace_id: workspaceId,
    caption,
    hashtags,
    post_type: 'entretenimento',
    media_type: 'reels',
    platforms: plan.platforms || ['instagram'],
    status: 'draft',
    image_url: images[0] || null,
    carousel_images: images,
    overlay_metadata: {
      type: 'narrated_video',
      topic: articleTitle,
      script: {
        title: articleTitle,
        segments: scriptSegments,
        segmentCount: 4,
        totalDuration: 20,
      },
      article_url: rssArticle?.url || null,
      article_image_url: null,
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

// Create CAROUSEL content - USES AI-GENERATED IMAGES for visual consistency
async function createCarouselContent(
  supabase: any,
  plan: ContentPlan,
  userId: string,
  workspaceId: string,
  supabaseUrl: string,
  headers: any,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Criando carrossel (imagens IA):', plan.theme);
  
  // Get top 4 RSS items for content/captions (but NOT for images)
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  
  // Refresh RSS
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
      error_message: 'Menos de 2 notícias na biblioteca. Adicione mais fontes RSS.',
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
  const titles: string[] = selectedItems.map((s: any) => s.item.title);
  
  // Mark as used
  for (const { item } of selectedItems) {
    await supabase.from('rss_items').update({ is_used: true }).eq('id', item.id);
  }
  
  // Generate 4 AI images based on the selected news articles
  // Uses search-images-for-video in AI GENERATION MODE
  const carouselSceneDirections = [
    'Hook visual forte — cena impactante, ambiente tecnológico, curiosidade imediata',
    'Expansão — continuação direta, novos elementos de evolução, detalhes e interfaces',
    'Impacto — escala e transformação, cena mais ampla e intensa',
    'Conclusão — visão futurista, composição limpa e simbólica, encerramento forte',
  ];
  const segments = selectedItems.map((s: any, i: number) => ({
    text: s.item.title,
    imagePrompt: `${carouselSceneDirections[i] || carouselSceneDirections[0]} sobre: ${s.item.title}. ${s.item.description || ''}`,
  }));
  
  console.log('[AGENT] 🎨 Gerando 4 imagens IA para carrossel...');
  const carouselImages: string[] = [];
  
  try {
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/search-images-for-video`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        topic: titles.join('; '),
        segments,
      })
    });
    
    if (searchResponse.ok) {
      const searchResult = await searchResponse.json();
      if (searchResult.images && searchResult.images.length > 0) {
        for (const img of searchResult.images) {
          const imgUrl = img.imageUrl || img.url;
          if (imgUrl && typeof imgUrl === 'string') {
            carouselImages.push(imgUrl);
          }
        }
        console.log(`[AGENT] ✅ ${carouselImages.length} imagens IA para carrossel`);
      }
    }
  } catch (e) {
    console.log('[AGENT] Erro geração IA carrossel:', e);
  }
  
  console.log(`[AGENT] Carrossel com ${carouselImages.length} slides (IA)`);
  
  // Generate caption
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: `Resumo das principais notícias: ${titles.join('; ')}`,
      postType: 'noticia',
      customInstructions: `Este é um CARROSSEL com ${carouselImages.length} notícias. Faça um resumo envolvente.`
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
      type: 'ai_carousel',
      titles,
      ranking_scores: selectedItems.map((s: any) => s.score),
      ai_generated: true,
    },
    ai_model_used: 'gemini-2.5-flash-image'
  }).select().single();
  
  if (error) throw error;
  console.log('[AGENT] Carrossel IA criado:', post.id, 'slides:', carouselImages.length);
  return post;
}

// Create MARKETING content - uses affiliate_links table
// Picks the affiliate with fewest recent posts and generates a promotional post
async function createMarketingContent(
  supabase: any,
  plan: ContentPlan,
  userId: string,
  workspaceId: string,
  supabaseUrl: string,
  headers: any,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Criando post de MARKETING/AFILIADO');
  
  // 1. Get active affiliate links, ordered by least recently posted
  const { data: affiliateLinks, error: affErr } = await supabase
    .from('affiliate_links')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('last_posted_at', { ascending: true, nullsFirst: true })
    .limit(5);
  
  if (affErr || !affiliateLinks || affiliateLinks.length === 0) {
    console.log('[AGENT] ⚠️ Nenhum link de afiliado ativo!');
    return supabase.from('posts').insert({
      user_id: userId,
      workspace_id: workspaceId,
      caption: '⚠️ Nenhum link de afiliado ativo para criar post de marketing',
      hashtags: ['#marketing'],
      post_type: 'afiliado',
      media_type: 'image',
      platforms: plan.platforms || ['instagram'],
      status: 'failed',
      error_message: 'Sem links de afiliado ativos. Adicione produtos na aba Marketing.',
      ai_model_used: 'none'
    }).select().single().then((r: any) => r.data);
  }
  
  // Pick the one with fewest posts (or never posted)
  const selectedAffiliate = affiliateLinks[0];
  console.log(`[AGENT] Afiliado selecionado: ${selectedAffiliate.product_name} (${selectedAffiliate.posts_count || 0} posts anteriores)`);
  
  // 2. Research the product via Firecrawl for accurate selling points
  let productResearch = '';
  try {
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: `${selectedAffiliate.product_name} review análise vale a pena`,
        limit: 3,
        lang: 'pt-BR'
      })
    });
    
    if (searchResponse.ok) {
      const searchResult = await searchResponse.json();
      const articles = (searchResult.data || []).slice(0, 3);
      productResearch = articles.map((a: any) => `${a.title}: ${a.description || ''}`).join('\n');
      console.log(`[AGENT] Pesquisa do produto: ${articles.length} resultados`);
    }
  } catch (e) {
    console.log('[AGENT] Pesquisa Firecrawl falhou, usando descrição do cadastro:', e);
  }
  
  // 3. Generate caption with AI
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: selectedAffiliate.product_name,
      postType: 'vendas',
      customInstructions: `Este é um post de MARKETING/AFILIADO para o produto: ${selectedAffiliate.product_name}.
Descrição do produto: ${selectedAffiliate.description || 'Sem descrição'}
Estratégia: ${selectedAffiliate.marketing_strategy || 'Promover com naturalidade'}
${productResearch ? `\nPesquisa web sobre o produto:\n${productResearch}` : ''}

REGRAS:
1. NÃO pareça um anúncio - seja autêntico e genuíno
2. Conte uma experiência ou situação real onde o produto ajuda
3. Use tom conversacional, como recomendação de amigo
4. Inclua o link no final: ${selectedAffiliate.affiliate_url}
5. Use emojis com moderação
6. Máximo 3 parágrafos
7. CTA natural no final (sem "clique aqui" genérico)`
    })
  });
  
  let caption = `🔥 ${selectedAffiliate.product_name}\n\n${selectedAffiliate.description || ''}\n\n🔗 ${selectedAffiliate.affiliate_url}`;
  let hashtags: string[] = ['#recomendacao', '#tecnologia', '#review'];
  
  if (captionResponse.ok) {
    const captionData = await captionResponse.json();
    caption = captionData.caption || caption;
    hashtags = captionData.hashtags || hashtags;
    // Ensure affiliate link is in caption
    if (!caption.includes(selectedAffiliate.affiliate_url)) {
      caption += `\n\n🔗 ${selectedAffiliate.affiliate_url}`;
    }
  }
  
  // 4. Get product image (use affiliate's image or generate)
  let imageUrl = selectedAffiliate.image_url || null;
  
  // If affiliate has an image, upload it to storage
  if (imageUrl) {
    try {
      const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/upload-external-image`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageUrl })
      });
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        imageUrl = uploadResult.publicUrl || imageUrl;
      }
    } catch (e) {
      console.log('[AGENT] Upload de imagem do afiliado falhou:', e);
    }
  }
  
  // 5. Create the post
  const canPublish = autoPublish && imageUrl;
  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    workspace_id: workspaceId,
    caption,
    hashtags,
    post_type: 'afiliado',
    media_type: 'image',
    platforms: plan.platforms || ['instagram'],
    status: imageUrl ? (canPublish ? 'scheduled' : 'draft') : 'draft',
    scheduled_for: canPublish ? new Date().toISOString() : null,
    image_url: imageUrl,
    overlay_metadata: {
      type: 'marketing_affiliate',
      affiliate_id: selectedAffiliate.id,
      product_name: selectedAffiliate.product_name,
      affiliate_url: selectedAffiliate.affiliate_url,
      created_by_agent: true
    },
    ai_model_used: 'gemini-2.5-flash-lite'
  }).select().single();
  
  if (error) throw error;
  
  // 6. Update affiliate link counters
  await supabase
    .from('affiliate_links')
    .update({
      posts_count: (selectedAffiliate.posts_count || 0) + 1,
      last_posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', selectedAffiliate.id);
  
  console.log(`[AGENT] ✅ Post de marketing criado: ${post.id} para ${selectedAffiliate.product_name}`);
  return post;
}

// Calculate news ranking score (0-100) for RSS items
// PRIORIZA conteúdo de TECNOLOGIA, IA, INOVAÇÃO - penaliza off-topic
function calculateNewsRankingScore(item: any): number {
  let score = 30; // Base score (lower to make tech bonus more impactful)
  
  const titleLower = (item.title || '').toLowerCase();
  const descLower = (item.description || '').toLowerCase();
  const combined = titleLower + ' ' + descLower;
  
  // ===== TECH RELEVANCE FILTER (most important) =====
  // Core tech keywords (high priority) - +20 points each match (max 30)
  const coreTechKeywords = [
    'inteligência artificial', 'ia ', ' ia,', ' ia.', 'machine learning', 'deep learning',
    'gpt', 'openai', 'chatgpt', 'gemini', 'claude', 'llm', 'modelo de linguagem',
    'nvidia', 'chip', 'processador', 'semicondut', 'quantum', 'quântic',
    'ciberseguranç', 'hacker', 'ransomware', 'dados pessoais', 'privacidade digital',
    'robô', 'robot', 'automação', 'automat', 'algoritmo',
    'blockchain', 'criptomoeda', 'bitcoin', 'ethereum', 'web3',
    'realidade virtual', 'realidade aumentada', 'metaverso', 'vr ', ' ar ',
    'spacex', 'foguete', 'satélite', 'starlink', '5g', '6g',
    'programação', 'desenvolvedor', 'software', 'código', 'api',
    'startup', 'fintech', 'healthtech', 'edtech', 'agritech',
    'rede neural', 'visão computacional', 'nlp', 'processamento de linguagem'
  ];
  const coreTechMatches = coreTechKeywords.filter(kw => combined.includes(kw));
  score += Math.min(30, coreTechMatches.length * 15);
  
  // Big tech companies (medium priority) - +10 points each (max 20)
  const bigTechKeywords = [
    'google', 'apple', 'microsoft', 'meta', 'amazon', 'tesla',
    'samsung', 'intel', 'amd', 'qualcomm', 'ibm', 'oracle',
    'elon musk', 'sam altman', 'mark zuckerberg', 'tim cook', 'satya nadella',
    'alibaba', 'tencent', 'bytedance', 'tiktok', 'huawei'
  ];
  const bigTechMatches = bigTechKeywords.filter(kw => combined.includes(kw));
  score += Math.min(20, bigTechMatches.length * 10);
  
  // General tech terms (lower priority) - +5 points each (max 15)
  const generalTechKeywords = [
    'tecnologia', 'inovação', 'digital', 'internet', 'aplicativo', 'app ',
    'celular', 'smartphone', 'computador', 'notebook', 'gadget',
    'lança', 'anuncia', 'revela', 'atualização', 'update',
    'milhões', 'bilhões', 'recorde', 'primeiro', 'inédito', 'revolucion'
  ];
  const generalTechMatches = generalTechKeywords.filter(kw => combined.includes(kw));
  score += Math.min(15, generalTechMatches.length * 5);
  
  // ===== PENALTY: Non-tech content (HEAVY penalty) =====
  const nonTechKeywords = [
    'novela', 'bbb', 'big brother', 'reality show', 'celebridade', 'fofoca',
    'futebol', 'campeonato', 'seleção', 'gol ', 'copa ', 'libertadores',
    'político', 'eleição', 'deputado', 'senador', 'presidente', 'congresso',
    'netflix serie', 'temporada', 'episódio', 'anime', 'manga',
    'triângulo amoroso', 'namoro', 'separação', 'casamento', 'romance',
    'horóscopo', 'signo', 'astrolog', 'receita', 'culinária',
    'moda', 'beleza', 'maquiagem', 'skincare', 'fitness',
    'música', 'cantor', 'show', 'festival', 'álbum', 'clipe'
  ];
  const nonTechMatches = nonTechKeywords.filter(kw => combined.includes(kw));
  if (nonTechMatches.length > 0) {
    // Heavy penalty: -30 per match, but check if it's also tech-related
    const isAlsoTech = coreTechMatches.length > 0 || bigTechMatches.length > 0;
    if (!isAlsoTech) {
      score -= nonTechMatches.length * 30; // Strong penalty for pure non-tech
      console.log(`[AGENT] ⚠️ Non-tech penalty for: "${titleLower.substring(0, 50)}" (-${nonTechMatches.length * 30}pts)`);
    }
  }
  
  // Recency bonus (0-25 points)
  if (item.published_at) {
    const hoursAgo = (Date.now() - new Date(item.published_at).getTime()) / (1000 * 60 * 60);
    if (hoursAgo < 3) score += 25;
    else if (hoursAgo < 6) score += 20;
    else if (hoursAgo < 12) score += 15;
    else if (hoursAgo < 24) score += 10;
    else score += 5;
  }
  
  // Image quality bonus (0-10 points)
  if (item.has_image && item.image_url) {
    score += 10;
  }
  
  // Description completeness bonus (0-5 points)  
  if (item.description && item.description.length > 100) score += 5;
  else if (item.description && item.description.length > 50) score += 3;
  
  return Math.max(0, Math.min(100, score)); // Clamp 0-100
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
  
  // Validate image accessibility (HEAD request to check for 404/broken images)
  if (selectedImage) {
    try {
      const imgCheck = await fetch(selectedImage, { method: 'HEAD', redirect: 'follow' });
      const contentType = imgCheck.headers.get('content-type') || '';
      if (!imgCheck.ok || (!contentType.startsWith('image/') && !contentType.includes('octet-stream'))) {
        console.warn(`[AGENT] ⚠️ Imagem RSS quebrada (${imgCheck.status}, type: ${contentType}): ${selectedImage.substring(0, 60)}`);
        selectedImage = null; // Will trigger fallback below
      } else {
        console.log('[AGENT] ✅ Imagem RSS válida:', imgCheck.status, contentType);
      }
    } catch (imgErr) {
      console.warn('[AGENT] ⚠️ Imagem RSS inacessível:', imgErr);
      selectedImage = null;
    }
  }
  
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
        if (overlayResult.hasOverlay) {
          imageUrl = overlayResult.publicUrl;
          console.log('[AGENT] ✅ Overlay com headline aplicado:', overlayResult.headline);
        } else {
          // Overlay returned image but WITHOUT headline (e.g. 402 credits)
          console.log('[AGENT] ⚠️ Overlay sem headline (créditos?), tentando add-watermark com headline...');
          // Try add-watermark WITH the headline text
          try {
            const wmResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                imageUrl: selectedImage,
                watermarkText: 'Neural Update',
                headlineText: overlayResult.headline || selectedArticle?.title
              })
            });
            if (wmResponse.ok) {
              const wmResult = await wmResponse.json();
              if (wmResult.hasHeadline) {
                imageUrl = wmResult.publicUrl;
                console.log('[AGENT] ✅ Headline aplicada via add-watermark');
              } else {
                // add-watermark also failed to apply headline, use overlay's image
                imageUrl = overlayResult.publicUrl;
                console.log('[AGENT] ⚠️ add-watermark sem headline, usando imagem sem overlay');
              }
            } else {
              imageUrl = overlayResult.publicUrl;
            }
          } catch (wmErr) {
            console.log('[AGENT] add-watermark falhou:', wmErr);
            imageUrl = overlayResult.publicUrl;
          }
        }
      } else {
        console.error('[AGENT] Overlay falhou (status:', overlayResponse.status, ')');
      }
    } catch (overlayErr) {
      console.error('[AGENT] Erro ao aplicar overlay:', overlayErr);
    }
    
    // FALLBACK 1: Use add-watermark if overlay completely failed
    if (!imageUrl) {
      console.log('[AGENT] Fallback: aplicando watermark com headline...');
      try {
        const wmResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            imageUrl: selectedImage,
            watermarkText: 'Neural Update',
            headlineText: selectedArticle?.title // Pass headline text!
          })
        });
        if (wmResponse.ok) {
          const wmResult = await wmResponse.json();
          imageUrl = wmResult.publicUrl;
          console.log('[AGENT] Watermark' + (wmResult.hasHeadline ? ' + headline' : '') + ' aplicado ✅');
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
        success_patterns: newPatterns.slice(-10),
        updated_at: new Date().toISOString()
      })
      .eq('workspace_id', workspaceId);
    
    console.log('[AGENT] Contexto atualizado com novo padrão de sucesso');
  }
  
  // ===== AUTO-EVOLUTION: Adjust content_distribution based on performance =====
  await autoEvolveStrategy(supabase, state, workspaceId);
}

// ===== AUTO-EVOLVE STRATEGY =====
// Analyzes which media types perform best relative to the user's goal_type
// and adjusts content_distribution accordingly
async function autoEvolveStrategy(
  supabase: any,
  state: AgentState,
  workspaceId: string
): Promise<void> {
  console.log('[AGENT] Auto-evolving strategy based on performance...');
  
  try {
    const goalType = state.context?.goal_type || 'growth';
    
    // Get recent published posts with metrics (last 14 days)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    const { data: recentPosts } = await supabase
      .from('posts')
      .select('media_type, post_type, likes_count, comments_count, saves_count, reach, impressions, shares_count')
      .eq('workspace_id', workspaceId)
      .eq('status', 'published')
      .gte('published_at', twoWeeksAgo.toISOString())
      .gt('reach', 0);
    
    if (!recentPosts || recentPosts.length < 5) {
      console.log('[AGENT] Not enough data to evolve strategy (need 5+ posts with metrics)');
      return;
    }
    
    // Aggregate performance per media type
    const perfByType: Record<string, { count: number; totalScore: number }> = {
      video: { count: 0, totalScore: 0 },
      carousel: { count: 0, totalScore: 0 },
      news: { count: 0, totalScore: 0 },
      image: { count: 0, totalScore: 0 },
    };
    
    for (const post of recentPosts) {
      const likes = post.likes_count || 0;
      const comments = post.comments_count || 0;
      const saves = post.saves_count || 0;
      const reach = post.reach || 1;
      const shares = post.shares_count || 0;
      
      // Score depends on goal
      let score = 0;
      if (goalType === 'growth') {
        // Growth: saves + shares matter most (viral potential)
        score = (saves * 3 + shares * 3 + likes + comments * 2) / reach * 100;
      } else if (goalType === 'reach') {
        // Reach: raw reach + impressions
        score = reach + (post.impressions || 0);
      } else if (goalType === 'authority') {
        // Authority: saves + comments (depth of engagement)
        score = (saves * 4 + comments * 3 + likes) / reach * 100;
      } else if (goalType === 'conversion') {
        // Conversion: shares + comments (action-oriented)
        score = (shares * 4 + comments * 2 + saves * 2) / reach * 100;
      } else {
        score = (likes + comments + saves) / reach * 100;
      }
      
      // Map media_type to bucket
      const mt = post.media_type || 'image';
      const isNews = post.post_type === 'noticia';
      
      if (mt === 'reels' || mt === 'video') {
        perfByType.video.count++;
        perfByType.video.totalScore += score;
      } else if (mt === 'carousel') {
        perfByType.carousel.count++;
        perfByType.carousel.totalScore += score;
      } else if (isNews) {
        perfByType.news.count++;
        perfByType.news.totalScore += score;
      } else {
        perfByType.image.count++;
        perfByType.image.totalScore += score;
      }
    }
    
    // Calculate averages
    const avgScores: Record<string, number> = {};
    for (const [type, data] of Object.entries(perfByType)) {
      avgScores[type] = data.count > 0 ? data.totalScore / data.count : 0;
    }
    
    console.log(`[AGENT] Performance scores by type (goal=${goalType}):`, avgScores);
    
    // Only redistribute if we have meaningful data
    const typesWithData = Object.values(perfByType).filter(d => d.count > 0).length;
    if (typesWithData < 2) {
      console.log('[AGENT] Not enough variety to evolve. Skipping.');
      return;
    }
    
    // Get current totals — use balanced defaults matching weekly goals
    const currentTotal = (state.context?.content_distribution_videos || 2) +
      (state.context?.content_distribution_carousels || 1) +
      (state.context?.content_distribution_news || 5) +
      (state.context?.content_distribution_images || 3);
    
    // Calculate new distribution based on scores (weighted)
    const totalScore = Object.values(avgScores).reduce((a, b) => a + b, 0);
    
    if (totalScore === 0) {
      console.log('[AGENT] No meaningful scores. Skipping evolution.');
      return;
    }
    
    // BALANCED DISTRIBUTION: min 1 slot, max 50% of total per type
    // This prevents any single type from dominating (e.g., 90% Reels)
    const MIN_SLOTS = 1;
    const MAX_PERCENT = 0.50; // No type can exceed 50% of total
    const MAX_SLOTS = Math.max(MIN_SLOTS + 1, Math.floor(currentTotal * MAX_PERCENT));
    
    const distributableSlots = currentTotal - (4 * MIN_SLOTS);
    
    const rawDist = {
      videos: MIN_SLOTS + Math.round((avgScores.video / totalScore) * distributableSlots),
      carousels: MIN_SLOTS + Math.round((avgScores.carousel / totalScore) * distributableSlots),
      news: MIN_SLOTS + Math.round((avgScores.news / totalScore) * distributableSlots),
      images: MIN_SLOTS + Math.round((avgScores.image / totalScore) * distributableSlots),
    };
    
    // Apply cap: no type above MAX_SLOTS
    const newDist = { ...rawDist };
    let excess = 0;
    const types = ['videos', 'carousels', 'news', 'images'] as const;
    for (const t of types) {
      if (newDist[t] > MAX_SLOTS) {
        excess += newDist[t] - MAX_SLOTS;
        newDist[t] = MAX_SLOTS;
      }
    }
    
    // Redistribute excess to types below cap, proportionally
    if (excess > 0) {
      const belowCap = types.filter(t => newDist[t] < MAX_SLOTS);
      while (excess > 0 && belowCap.length > 0) {
        for (const t of belowCap) {
          if (excess <= 0) break;
          if (newDist[t] < MAX_SLOTS) {
            newDist[t]++;
            excess--;
          }
        }
        // Safety: avoid infinite loop if all at cap
        if (belowCap.every(t => newDist[t] >= MAX_SLOTS)) break;
      }
    }
    
    // Ensure total matches
    const newTotal = newDist.videos + newDist.carousels + newDist.news + newDist.images;
    if (newTotal !== currentTotal) {
      // Adjust the highest type (but respect cap)
      const sorted = [...types].sort((a, b) => newDist[b] - newDist[a]);
      const diff = currentTotal - newTotal;
      for (const t of diff > 0 ? sorted.reverse() : sorted) {
        const canAdjust = diff > 0 ? (newDist[t] < MAX_SLOTS) : (newDist[t] > MIN_SLOTS);
        if (canAdjust) {
          newDist[t] += diff > 0 ? 1 : -1;
          break;
        }
      }
    }
    
    console.log(`[AGENT] Distribution cap applied: max ${MAX_SLOTS}/${currentTotal} per type. Result:`, newDist);
    
    // Only update if distribution actually changed
    const changed = newDist.videos !== (state.context?.content_distribution_videos || 2) ||
      newDist.carousels !== (state.context?.content_distribution_carousels || 1) ||
      newDist.news !== (state.context?.content_distribution_news || 5) ||
      newDist.images !== (state.context?.content_distribution_images || 3);
    
    if (changed) {
      const { error } = await supabase
        .from('agent_context')
        .update({
          content_distribution_videos: newDist.videos,
          content_distribution_carousels: newDist.carousels,
          content_distribution_news: newDist.news,
          content_distribution_images: newDist.images,
          updated_at: new Date().toISOString()
        })
        .eq('workspace_id', workspaceId);
      
      if (error) {
        console.error('[AGENT] Error updating strategy:', error);
      } else {
        console.log(`[AGENT] ✅ Strategy evolved! Videos=${newDist.videos}, Carousels=${newDist.carousels}, News=${newDist.news}, Images=${newDist.images}`);
      }
    } else {
      console.log('[AGENT] Strategy unchanged. No evolution needed.');
    }
  } catch (error) {
    console.error('[AGENT] Error in autoEvolveStrategy:', error);
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
                          state.weeklyProgress.news + state.weeklyProgress.images + state.weeklyProgress.marketing;
    const totalGoals = state.weeklyGoals.videos + state.weeklyGoals.carousels + 
                       state.weeklyGoals.news + state.weeklyGoals.images + state.weeklyGoals.marketing;
    
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
- Marketing: ${state.weeklyProgress.marketing}/${state.weeklyGoals.marketing}
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
      const mediaTypeName = decision.contentPlan.contentType === 'marketing' ? 'Marketing' :
                            decision.contentPlan.mediaType === 'reels' ? 'Reels' : 
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
      
      // Send completion message with VIDEO-SPECIFIC notification
      const isReels = decision.contentPlan.mediaType === 'reels' || decision.contentPlan.mediaType === 'video';
      const actualTheme = post?.caption?.split('\n')[0]?.replace(/[🚀📰🎬✅⚡🤯💾🧠💻]/g, '').trim().substring(0, 80) || decision.contentPlan.theme;
      
      if (isReels && !post?.video_url) {
        // Send special video notification so user knows they need to render
        await sendChatMessage(supabase, userId, 
          `🎬 **Novo Reels criado!** "${actualTheme}"\n\n` +
          `📌 Abra a aba **Fila** e clique em **"Gerar Vídeo"** para renderizar.\n` +
          `O vídeo já tem ${post?.carousel_images?.length || 4} imagens IA e roteiro pronto!`
        );
      } else {
        await sendChatMessage(supabase, userId, getConversationalUpdate(agentName, 'created', {
          type: mediaTypeName,
          theme: actualTheme,
          status: post?.status,
          needsRender: false
        }));
      }
      
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
                       state.weeklyGoals.news + state.weeklyGoals.images + state.weeklyGoals.marketing;
    const totalProgress = state.weeklyProgress.videos + state.weeklyProgress.carousels + 
                          state.weeklyProgress.news + state.weeklyProgress.images + state.weeklyProgress.marketing;
    
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
    // Use ACTUAL post content for summary, not planned theme
    // For news posts, the RSS title may differ from the planned theme
    const actualCaption = post.caption || '';
    const actualTitle = actualCaption.split('\n')[0]?.replace(/[🚀📰🎬✅⚡🤯💾🧠💻]/g, '').trim().substring(0, 80) || 
                        decision.contentPlan?.theme || 'tendências';
    
    const mediaTypeName = post.post_type === 'afiliado' ? 'Marketing' :
                          post.media_type === 'reels' ? 'Reels' : 
                          post.media_type === 'carousel' ? 'Carrossel' :
                          post.post_type === 'noticia' ? 'Notícia' : 'Post';
    
    const wasPublished = state.context?.auto_post_enabled;
    if (wasPublished) {
      return `${greeting}! 🚀 ${agentName} publicou ${mediaTypeName}: "${actualTitle}". Engajamento médio: ${state.avgEngagement.toFixed(1)}%. ${decision.hypothesis || ''}`;
    } else {
      return `${greeting}! 📝 ${agentName} criou ${mediaTypeName} como rascunho: "${actualTitle}". Ative o modo automático para publicar sem intervenção.`;
    }
  } else if (decision.decision === 'NO_POST') {
    return `${greeting}! 🧠 ${agentName} analisou o cenário e decidiu não postar agora. Motivo: ${decision.reason}. Próxima análise será feita em breve.`;
  } else if (decision.decision === 'WAIT') {
    return `${greeting}! ⏳ ${agentName} está aguardando o momento ideal. Último post foi há ${Math.round(state.lastPostHours)}h. ${decision.reason}`;
  }
  
  return `${agentName} completou a análise. ${decision.reason}`;
}
