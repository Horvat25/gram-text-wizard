import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Content distribution types
type ContentType = 'video' | 'carousel' | 'news' | 'news_video' | 'image' | 'marketing';

interface ContentDistribution {
  videos: number;
  carousels: number;
  news: number;
  news_videos: number;
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

// Helper: Review text with review-portuguese to fix spelling errors
async function reviewText(
  text: string, 
  type: 'headline' | 'caption' | 'script' | 'cta' | 'general',
  supabaseUrl: string,
  headers: any,
  context?: string
): Promise<string> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/review-portuguese`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, type, context })
    });
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.corrected) {
        if (result.wasModified) {
          console.log(`[AGENT] 📝 Texto revisado (${type}): "${text.substring(0, 30)}..." → "${result.corrected.substring(0, 30)}..."`);
        }
        return result.corrected;
      }
    }
  } catch (e) {
    console.warn('[AGENT] review-portuguese falhou (não-bloqueante):', e);
  }
  return text;
}

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
  
  // Contar posts criados HOJE para limite diário
  // EXCLUIR draft reels (ficam presos sem renderização) para não desperdiçar slots
  const { data: todayPosts } = await supabase
    .from('posts')
    .select('id, status, media_type, post_type')
    .eq('workspace_id', workspaceId)
    .gte('created_at', todayStartUTC.toISOString());
  
  // Only count posts that actually published/scheduled OR are publishable (non-reels drafts)
  // Draft reels without video_url are stuck and should NOT consume daily quota
  const postsCreatedToday = (todayPosts || []).filter((p: any) => {
    // Published or scheduled = always count
    if (p.status === 'published' || p.status === 'scheduled') return true;
    // Failed posts = don't count (wasted)
    if (p.status === 'failed') return false;
    // Draft reels = don't count (stuck without render service)
    if (p.status === 'draft' && (p.media_type === 'reels' || p.media_type === 'video')) return false;
    // Other drafts (carousel, image, news) = count
    return true;
  }).length;
  
  // Track which content types were already posted TODAY for diversity rotation
  const todayContentTypes: ContentType[] = (todayPosts || []).map((p: any) => {
    if ((p.media_type === 'reels' || p.media_type === 'video') && p.post_type === 'noticia') return 'news_video' as ContentType;
    if (p.media_type === 'reels' || p.media_type === 'video') return 'video' as ContentType;
    if (p.media_type === 'carousel') return 'carousel' as ContentType;
    if (p.post_type === 'afiliado') return 'marketing' as ContentType;
    if (p.post_type === 'noticia') return 'news' as ContentType;
    return 'image' as ContentType;
  });
  console.log(`[AGENT] Posts criados HOJE: ${postsCreatedToday} (tipos: ${todayContentTypes.join(', ') || 'nenhum'})`);
  
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
  // 📈 META: ~28 posts/semana (4 posts/dia)
  const rawWeeklyGoals: ContentDistribution = {
    videos: context.content_distribution_videos || 3,
    carousels: context.content_distribution_carousels || 3,
    news: context.content_distribution_news || 8,
    news_videos: context.content_distribution_news_video || 2,
    images: context.content_distribution_images || 7,
    marketing: context.content_distribution_marketing || 2,
  };
  
  // USE FULL WEEKLY GOALS - daily limit (4/day) is the primary control
  // Prorating was causing the agent to stop posting mid-week because goals appeared "met"
  // The daily limit already ensures we don't over-post on any given day
  const weeklyGoals: ContentDistribution = { ...rawWeeklyGoals };
  
  const dayOfWeekNow = todayBrasilia.getDay(); // 0=Sun
  const daysRemainingInWeek = Math.max(1, 7 - dayOfWeekNow);
  
  console.log(`[AGENT] 📅 Dia da semana: ${dayOfWeekNow} (${daysRemainingInWeek} dias restantes)`);
  console.log(`[AGENT] 📊 Goals (full week): V${weeklyGoals.videos} C${weeklyGoals.carousels} N${weeklyGoals.news} NV${weeklyGoals.news_videos} I${weeklyGoals.images} M${weeklyGoals.marketing}`);
  // Count progress this week by media type
  // Exclude draft reels (stuck without render) from video progress to avoid false "goal met"
  const publishableWeekPosts = postsThisWeek.filter((p: any) => {
    if ((p.media_type === 'reels' || p.media_type === 'video') && p.status === 'draft') return false;
    if (p.status === 'failed') return false;
    return true;
  });
  const weeklyProgress: ContentDistribution = {
    videos: publishableWeekPosts.filter((p: any) => (p.media_type === 'reels' || p.media_type === 'video') && p.post_type !== 'noticia').length,
    carousels: publishableWeekPosts.filter((p: any) => p.media_type === 'carousel').length,
    news: publishableWeekPosts.filter((p: any) => p.post_type === 'noticia' && p.media_type !== 'carousel' && p.media_type !== 'reels' && p.media_type !== 'video').length,
    news_videos: publishableWeekPosts.filter((p: any) => p.post_type === 'noticia' && (p.media_type === 'reels' || p.media_type === 'video')).length,
    images: publishableWeekPosts.filter((p: any) => p.media_type === 'image' && p.post_type !== 'noticia' && p.post_type !== 'afiliado').length,
    marketing: publishableWeekPosts.filter((p: any) => p.post_type === 'afiliado').length,
  };
  
  // Determine next content type based on COMPLETION PERCENTAGE (lower = higher priority)
  // This ensures diversity: a type with 0/2 (0%) gets priority over 13/14 (93%)
  const getCompletionStats = (type: ContentType): { remaining: number; percentage: number; goal: number } => {
    const keyMap = { video: 'videos', carousel: 'carousels', news: 'news', news_video: 'news_videos', image: 'images', marketing: 'marketing' } as const;
    const key = keyMap[type];
    const goal = weeklyGoals[key] || 1;
    const progress = weeklyProgress[key] || 0;
    const remaining = Math.max(0, goal - progress);
    const percentage = goal > 0 ? (progress / goal) * 100 : 100;
    return { remaining, percentage, goal };
  };
  
  // MARKETING INTERCALATION: check if it's time for a marketing post
  // Rule: 1 marketing post for every 4 regular posts
  const totalRegularPosts = weeklyProgress.videos + weeklyProgress.carousels + weeklyProgress.news + weeklyProgress.news_videos + weeklyProgress.images;
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
  
  // Check if video rendering is available (RENDER_SERVICE_URL must be configured)
  // Without it, reels get stuck as drafts and waste daily post slots
  const renderServiceAvailable = !!Deno.env.get('RENDER_SERVICE_URL');
  if (!renderServiceAvailable) {
    console.log('[AGENT] ⚠️ RENDER_SERVICE_URL não configurado - tipo "video" desabilitado (reels ficam como drafts inúteis)');
  }
  
  const typeStats = [
    // Creative video (AI themes) - only if render service is available
    ...(renderServiceAvailable ? [{ type: 'video' as ContentType, ...getCompletionStats('video'), priority: 4 }] : []),
    // News video (RSS broadcast Reels) - also needs render service
    ...(renderServiceAvailable ? [{ type: 'news_video' as ContentType, ...getCompletionStats('news_video'), priority: 3.5 }] : []),
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
  
  // DAILY DIVERSITY: Penalize types already posted today to force rotation
  // If a type was posted today, add a penalty to its percentage so OTHER types get priority
  const DAILY_REPEAT_PENALTY = 50; // 50% penalty per repeat today
  const remainingByType = remainingTypes
    .map(t => {
      const timesPostedToday = todayContentTypes.filter(ct => ct === t.type).length;
      const diversityPenalty = timesPostedToday * DAILY_REPEAT_PENALTY;
      return { ...t, effectivePercentage: t.percentage + diversityPenalty, timesPostedToday };
    })
    .sort((a, b) => {
      // Sort by effective percentage (includes diversity penalty)
      const pctDiff = a.effectivePercentage - b.effectivePercentage;
      if (Math.abs(pctDiff) > 0.01) return pctDiff;
      // Same effective percentage → higher priority first
      return b.priority - a.priority;
    });
  
  console.log('[AGENT] Content distribution WITH diversity:', remainingByType.map(t => 
    `${t.type}: ${Math.round(t.percentage)}% real + ${t.timesPostedToday}x today penalty = ${Math.round(t.effectivePercentage)}% effective (${t.goal - t.remaining}/${t.goal})`
  ).join(', '));
  
  // MARKETING INTERCALATION: Force marketing if it's overdue
  let nextContentType: ContentType | null;
  if (hasAffiliateLinks && (marketingDue || marketingOverdue) && weeklyProgress.marketing < weeklyGoals.marketing) {
    nextContentType = 'marketing';
    console.log(`[AGENT] ⚡ MARKETING INTERCALATION: ${totalRegularPosts} regular posts done, forcing marketing post`);
  } else {
    // Pick the type with lowest EFFECTIVE percentage (considers both weekly progress AND daily diversity)
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
                     (state.weeklyGoals?.news || 0) + (state.weeklyGoals?.news_videos || 0) + (state.weeklyGoals?.images || 0) + (state.weeklyGoals?.marketing || 0);
  const totalProgress = (state.weeklyProgress?.videos || 0) + (state.weeklyProgress?.carousels || 0) + 
                         (state.weeklyProgress?.news || 0) + (state.weeklyProgress?.news_videos || 0) + (state.weeklyProgress?.images || 0) + (state.weeklyProgress?.marketing || 0);
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
  
  // MINIMUM 4 posts/day ALWAYS - the user explicitly wants consistent daily output
  // Even when all weekly goals are met, maintain at least 4 posts/day
  const MINIMUM_DAILY_POSTS = 4;
  
  // Dynamic daily limit based on how far behind we are
  let dynamicLimit: number;
  if (minProgress >= 100) {
    // ALL goals met - still maintain minimum cadence
    dynamicLimit = MINIMUM_DAILY_POSTS;
  } else if (minProgress >= 70) {
    dynamicLimit = MINIMUM_DAILY_POSTS;
  } else if (minProgress >= 40) {
    dynamicLimit = MINIMUM_DAILY_POSTS;
  } else {
    // Far behind - maximum effort
    dynamicLimit = daysLeftInWeek <= 2 ? 5 : MINIMUM_DAILY_POSTS;
  }
  
  console.log(`[AGENT] ➡️ Dynamic daily limit: ${dynamicLimit} (minProgress=${Math.round(minProgress)}%, MIN=${MINIMUM_DAILY_POSTS})`);
  
  // Hard cap at 5 posts/day to avoid spam, floor at MINIMUM_DAILY_POSTS
  return Math.max(MINIMUM_DAILY_POSTS, Math.min(5, dynamicLimit));
}

// ETAPA 2: DECISÃO ESTRATÉGICA
async function makeStrategicDecision(state: AgentState, lovableApiKey: string): Promise<AgentDecision> {
  console.log('[AGENT] Etapa 2: Tomando decisão estratégica...');
  
  // ===== PEAK HOURS GUARD (Brasília UTC-3) =====
  // Only allow posting between 7h and 22h Brasília time
  const now = new Date();
  const brasiliaOffset = -3 * 60 * 60 * 1000;
  const brasiliaTime = new Date(now.getTime() + brasiliaOffset);
  const brasiliaHour = brasiliaTime.getUTCHours();
  
  // Peak/active hours: 7h-22h BRT
  // Optimal peaks: 9h, 12h, 15h, 18h, 20h
  const ACTIVE_START = 7;
  const ACTIVE_END = 22;
  
  if (brasiliaHour < ACTIVE_START || brasiliaHour >= ACTIVE_END) {
    console.log(`[AGENT] ⏰ Fora do horário ativo! Brasília: ${brasiliaHour}h (permitido: ${ACTIVE_START}h-${ACTIVE_END}h)`);
    return {
      decision: 'NO_POST',
      reason: `🌙 Fora do horário de pico (${brasiliaHour}h BRT). O agente só posta entre ${ACTIVE_START}h e ${ACTIVE_END}h para maximizar o alcance. Próxima janela: ${brasiliaHour >= ACTIVE_END ? `${ACTIVE_START}h amanhã` : `${ACTIVE_START}h hoje`}.`,
      hypothesis: 'Postar fora do horário ativo reduz significativamente o alcance e engajamento.'
    };
  }
  
  console.log(`[AGENT] ✅ Horário ativo: ${brasiliaHour}h BRT (janela ${ACTIVE_START}h-${ACTIVE_END}h)`);
  
  const goalType = state.context?.goal_type || 'macro';
  const dynamicDailyLimit = calculateDynamicDailyLimit(state);
  const minHoursBetween = state.context?.min_hours_between_posts || 2;
  const preferredPlatforms = state.context?.preferred_platforms || ['instagram'];
  const bestTimes = state.context?.best_posting_times || ['10:00', '14:00', '19:00'];
  const successPatterns = state.context?.success_patterns || [];
  
  // Check if weekly goals are met
  const totalGoals = state.weeklyGoals.videos + state.weeklyGoals.carousels + 
                     state.weeklyGoals.news + state.weeklyGoals.news_videos + state.weeklyGoals.images + state.weeklyGoals.marketing;
  const totalProgress = state.weeklyProgress.videos + state.weeklyProgress.carousels + 
                     state.weeklyProgress.news + state.weeklyProgress.news_videos + state.weeklyProgress.images + state.weeklyProgress.marketing;
  
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
  // NEVER fully stop posting - always maintain daily cadence
  // The agent should keep posting as long as daily limit isn't reached
  if (!state.nextContentType) {
    if (goalType === 'fixed') {
      // Fixed mode: strict weekly goals, but still maintain minimum 1 post/day
      if (state.postsToday >= 1) {
        console.log('[AGENT] Meta semanal completa (modo fixo) e já postou hoje');
        return {
          decision: 'NO_POST',
          reason: `🏆 Meta semanal de ${totalGoals} posts alcançada! Vídeos: ${state.weeklyProgress.videos}/${state.weeklyGoals.videos}, Carrosséis: ${state.weeklyProgress.carousels}/${state.weeklyGoals.carousels}, Notícias: ${state.weeklyProgress.news}/${state.weeklyGoals.news}, Imagens: ${state.weeklyProgress.images}/${state.weeklyGoals.images}, Marketing: ${state.weeklyProgress.marketing}/${state.weeklyGoals.marketing}`
        };
      }
    }
    
    // Weekly content goals met - override with best-performing type to maintain cadence
    // This ensures the agent NEVER stops posting during active hours if daily limit allows
    const bestType = state.historical30d.bestMediaType;
    const overrideType: ContentType = bestType === 'reels' ? 'video' 
      : bestType === 'carousel' ? 'carousel'
      : bestType === 'news' ? 'news'
      : (goalType === 'growth' || goalType === 'reach') ? 'video' : 'news';
    
    console.log(`[AGENT] 🔄 Meta semanal atingida mas ainda dentro do limite diário (${state.postsToday}/${dynamicDailyLimit}) - continuando com ${overrideType} (melhor tipo: ${bestType || 'N/A'})`);
    state.nextContentType = overrideType;
  }
  
  // Determine content type and format based on distribution
  const contentTypeMap: Record<ContentType, { mediaType: string; format: string; theme: string }> = {
    'video': { mediaType: 'reels', format: 'storytelling', theme: 'tendência tecnológica impactante' },
    'carousel': { mediaType: 'carousel', format: 'educacional', theme: 'dicas práticas de tecnologia' },
    'news': { mediaType: 'image', format: 'noticia', theme: 'notícia tecnologia inteligência artificial' },
    'news_video': { mediaType: 'reels', format: 'noticia', theme: 'notícia para reels estilo telejornal' },
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
  if (state.nextContentType !== 'news' && state.nextContentType !== 'news_video') {
    // ===== WEB INTELLIGENCE: Search trending topics & competitor viral content =====
    let webTrends: string[] = [];
    let competitorInsights: string[] = [];
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (firecrawlKey) {
      const niche = state.context?.industry_niche || 'tecnologia';
      
      // ⏱️ TIMEOUT: 6 seconds max for web searches to prevent edge function timeout
      const firecrawlTimeout = 6000;
      const makeFirecrawlSearch = async (query: string) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), firecrawlTimeout);
        try {
          const r = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit: 3, lang: 'pt-BR', country: 'BR' }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          return await r.json();
        } catch (e: any) {
          clearTimeout(timer);
          console.log(`[AGENT] ⏱️ Firecrawl timeout/error: ${e.name || e.message}`);
          return null;
        }
      };
      
      // Run both searches in parallel with timeout
      const [trendsResult, competitorResult] = await Promise.allSettled([
        makeFirecrawlSearch(`trending ${niche} ${new Date().toISOString().slice(0, 10)} viral Instagram`),
        makeFirecrawlSearch(`perfil Instagram ${niche} viral reels engajamento 2026`),
      ]);
      
      if (trendsResult.status === 'fulfilled' && trendsResult.value?.data) {
        webTrends = trendsResult.value.data
          .slice(0, 3)
          .map((r: any) => `${r.title || ''}: ${(r.description || '').substring(0, 80)}`)
          .filter(Boolean);
        console.log(`[AGENT] 🌐 Web trends found: ${webTrends.length}`);
      }
      
      if (competitorResult.status === 'fulfilled' && competitorResult.value?.data) {
        competitorInsights = competitorResult.value.data
          .slice(0, 3)
          .map((r: any) => r.title || r.description || '')
          .filter(Boolean);
        console.log(`[AGENT] 🔍 Competitor insights found: ${competitorInsights.length}`);
      }
    } else {
      console.log('[AGENT] ⚠️ FIRECRAWL_API_KEY não configurada - sem pesquisa web');
    }
    
    const h = state.historical30d;
    const webTrendsSection = webTrends.length > 0 
      ? `\n🌐 TENDÊNCIAS EM TEMPO REAL (pesquisa web última 24h):\n${webTrends.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n` 
      : '';
    const competitorSection = competitorInsights.length > 0 
      ? `\n🔍 CONTEÚDO VIRAL NO NICHO (análise de concorrentes):\n${competitorInsights.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n` 
      : '';
    
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
- Vídeos Criativos: ${state.weeklyProgress.videos}/${state.weeklyGoals.videos}
- Vídeos Notícia: ${state.weeklyProgress.news_videos}/${state.weeklyGoals.news_videos}
- Carrosséis: ${state.weeklyProgress.carousels}/${state.weeklyGoals.carousels}
- Notícias (imagem): ${state.weeklyProgress.news}/${state.weeklyGoals.news}  
- Imagens: ${state.weeklyProgress.images}/${state.weeklyGoals.images}
- Marketing: ${state.weeklyProgress.marketing}/${state.weeklyGoals.marketing}

🎯 OBJETIVOS MACRO:
- Views: ${weeklyReach.toLocaleString()}/${goalViews.toLocaleString()} (${Math.round((weeklyReach/goalViews)*100)}%)
- Engajamento: ${currentEngagement}%/${goalEngagement}%
${webTrendsSection}${competitorSection}
INSIGHTS DO AGENTE: ${(state.context?.success_patterns || []).join(' | ') || 'Coletando dados...'}

REGRAS IMPORTANTES:
1. Use as TENDÊNCIAS EM TEMPO REAL para escolher um tema que está bombando AGORA
2. Analise o CONTEÚDO VIRAL DOS CONCORRENTES para identificar formatos e abordagens que estão funcionando
3. Cruze os dados de performance do perfil (30 dias) com as tendências para encontrar o SWEET SPOT
4. O tema deve ser ESPECÍFICO e ATUAL (mencione nomes, produtos, eventos reais)
5. Priorize temas que combinem com o que já funcionou bem no histórico

Responda em JSON: { "theme": "tema específico e atual", "cta": "CTA do post", "tone": "tom sugerido", "trend_source": "qual tendência inspirou" }`;

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
            console.log('[AGENT] 🧠 Tema refinado com Web Intelligence:', contentPlan.theme);
            if (themeData.trend_source) {
              console.log('[AGENT] 📡 Inspirado por tendência:', themeData.trend_source);
            }
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
    'news_video': state.weeklyGoals.news_videos - state.weeklyProgress.news_videos,
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
      // CREATIVE VIDEO: AI-generated themes from internet trends (NEVER uses RSS)
      console.log(`[AGENT] 🎬 Creating CREATIVE video Reel (AI-generated theme)...`);
      try {
        return await createVideoContent(supabase, plan, userId, workspaceId, supabaseUrl, headers, autoPublish);
      } catch (videoError: any) {
        console.error('[AGENT] ❌ VIDEO CREATION FAILED:', videoError?.message || videoError);
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
    case 'news_video': {
      // NEWS VIDEO: RSS news-broadcast style Reels (editorial telejornal)
      console.log(`[AGENT] 📺 Creating NEWS BROADCAST video Reel...`);
      try {
        const bestRssItem = await selectBestRssItem(supabase, workspaceId, supabaseUrl, headers, userId);
        if (!bestRssItem || bestRssItem.score < 30) {
          console.log('[AGENT] ⚠️ No suitable RSS article for news_video - skipping');
          // Fallback: create as regular news image instead
          return await createNewsContent(supabase, plan, userId, workspaceId, supabaseUrl, headers, autoPublish);
        }
        
        const rssArticle = {
          url: bestRssItem.item.link,
          title: bestRssItem.item.title,
          description: bestRssItem.item.description || '',
        };
        await supabase.from('rss_items').update({ is_used: true }).eq('id', bestRssItem.item.id);
        plan.theme = bestRssItem.item.title;
        (plan as any)._rssItemId = bestRssItem.item.id;
        console.log(`[AGENT] 📰 News-broadcast Reel: "${rssArticle.title}" (score: ${bestRssItem.score})`);
        
        return await createVideoContent(supabase, plan, userId, workspaceId, supabaseUrl, headers, autoPublish, rssArticle);
      } catch (videoError: any) {
        console.error('[AGENT] ❌ NEWS VIDEO CREATION FAILED:', videoError?.message || videoError);
        const { data: fallbackPost } = await supabase.from('posts').insert({
          user_id: userId,
          workspace_id: workspaceId,
          caption: `📺 ${plan.theme}`,
          hashtags: ['#tecnologia', '#reels', '#noticias'],
          post_type: 'noticia',
          media_type: 'reels',
          platforms: plan.platforms || ['instagram'],
          status: 'failed',
          error_message: `Erro na criação de vídeo notícia: ${videoError?.message || 'Unknown error'}`,
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
  const isNewsBroadcast = !!rssArticle;
  
  const images: string[] = [];
  const titles: string[] = [];
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

  const articleTitle = rssArticle?.title || plan.theme;
  const articleDesc = rssArticle?.description || '';
  
  // STEP 1: Generate broadcast-style narration script via AI
  // News Reels get editorial broadcast narration; regular Reels get storytelling
  let scriptSegments: { text: string; imagePrompt: string }[] = [];
  
  if (isNewsBroadcast && lovableApiKey) {
    console.log('[AGENT] 📺 Generating NEWS BROADCAST script for Reel...');
    try {
      const broadcastPrompt = `Você é um roteirista de telejornal de tecnologia para Reels do Instagram.
Crie um roteiro de narração editorial para um Reel de ~25 segundos sobre esta notícia:

TÍTULO: ${articleTitle}
CONTEXTO: ${articleDesc}

ESTRUTURA OBRIGATÓRIA (4 cenas):
1. HOOK (3-4s): Frase provocativa de abertura. Deve prender atenção instantaneamente. Ex: "A guerra da IA acaba de mudar de patamar."
2. CONTEXTO (6-8s): Explique o que aconteceu de forma concisa e direta. Como um âncora de TV.
3. ANÁLISE (6-8s): POR QUE isso é importante. Qual o impacto real. Defenda uma tese clara.
4. CONCLUSÃO (4-5s): Frase de encerramento forte. Provocativa. Sem CTA genérico.

REGRAS CRÍTICAS:
- TOM: Jornalístico editorial, como um âncora inteligente (não robótico, não YouTuber)
- JAMAIS mencione URLs, links, sites ou "acesse"
- JAMAIS diga "clique", "comente", "compartilhe", "link na bio"
- Cada segmento deve ter entre 15 e 40 palavras (para narração natural)
- Use linguagem PT-BR formal mas acessível
- Mencione nomes reais (empresas, pessoas, produtos)
- imagePrompt: descrição visual cinematográfica em inglês para cada cena

Responda em JSON:
{
  "segments": [
    { "text": "narração em português", "imagePrompt": "visual description in english" },
    { "text": "...", "imagePrompt": "..." },
    { "text": "...", "imagePrompt": "..." },
    { "text": "...", "imagePrompt": "..." }
  ]
}`;

      const scriptResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: broadcastPrompt }],
          response_format: { type: 'json_object' }
        })
      });

      if (scriptResponse.ok) {
        const scriptResult = await scriptResponse.json();
        const content = scriptResult.choices?.[0]?.message?.content;
        if (content) {
          try {
            const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleanContent);
            if (parsed.segments && Array.isArray(parsed.segments) && parsed.segments.length >= 4) {
              // Validate each segment has actual text (not just topic repetition)
              const validSegments = parsed.segments.filter((s: any) => 
                s.text && typeof s.text === 'string' && s.text.length > 10
              );
              if (validSegments.length >= 4) {
                scriptSegments = validSegments.slice(0, 4);
                console.log('[AGENT] ✅ News broadcast script generated (4 segments)');
              } else {
                console.log('[AGENT] ⚠️ Script segments too short or invalid, using fallback');
              }
            }
          } catch (parseErr) {
            console.log('[AGENT] ⚠️ Failed to parse broadcast script JSON:', parseErr);
          }
        }
      }
    } catch (e) {
      console.log('[AGENT] Error generating broadcast script:', e);
    }
  }
  
  // Fallback: generate meaningful narration segments (NOT raw topic text)
  if (scriptSegments.length < 4) {
    // Extract a clean, short topic name for narration
    const shortTopic = articleTitle.length > 60 ? articleTitle.substring(0, 60).replace(/\s\S*$/, '') : articleTitle;
    
    if (isNewsBroadcast) {
      scriptSegments = [
        { text: `Atenção para esta notícia que pode mudar o cenário da tecnologia.`, imagePrompt: `Breaking news technology announcement, dramatic lighting, screens showing data` },
        { text: `${shortTopic}. Essa é a novidade que está movimentando o mercado agora.`, imagePrompt: `Technology innovation concept, futuristic interfaces, dynamic composition` },
        { text: `As consequências dessa mudança vão afetar milhões de pessoas nos próximos meses.`, imagePrompt: `Global impact visualization, world map with connections, dramatic scale` },
        { text: `O futuro da tecnologia está sendo escrito agora. E você precisa acompanhar.`, imagePrompt: `Futuristic cityscape, forward-looking composition, clean and symbolic` },
      ];
    } else {
      scriptSegments = [
        { text: `Você precisa saber o que está acontecendo com ${shortTopic}.`, imagePrompt: `Hook visual forte, impactful tech scene, curiosity and discovery` },
        { text: `Especialistas estão chamando isso de revolução silenciosa na tecnologia.`, imagePrompt: `Innovation breakthrough concept, futuristic lab, progress visualization` },
        { text: `O impacto disso é maior do que parece e vai transformar o mercado inteiro.`, imagePrompt: `Market transformation, dramatic scale, power and change visualization` },
        { text: `A grande questão não é se isso vai acontecer. É se você vai estar preparado.`, imagePrompt: `Future vision, clean symbolic composition, thought-provoking ending` },
      ];
    }
  }

  // STEP 2: Generate 4 AI images
  console.log('[AGENT] 🎨 AI GENERATION MODE: Gerando 4 imagens por IA para vídeo');
  try {
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/search-images-for-video`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        topic: articleTitle,
        segments: scriptSegments,
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
        console.log(`[AGENT] ✅ ${images.length} imagens IA geradas`);
      }
    }
  } catch (e) {
    console.log('[AGENT] Erro na geração IA de imagens:', e);
  }

  console.log(`[AGENT] Total de imagens para vídeo: ${images.length}`);
  
  // STEP 3: Generate caption (with URL for news, without URL in video)
  const captionInstructions = isNewsBroadcast
    ? `Este é um REELS de notícia estilo telejornal. 
Estrutura da legenda:
1. HOOK curto (1 frase impactante)
2. CONTEXTO (2-3 frases sobre a notícia)
3. OPINIÃO (sua análise)
4. Fonte e link no final

OBRIGATÓRIO ao final:
📰 Fonte: ${rssArticle ? new URL(rssArticle.url).hostname.replace('www.', '') : 'Tech News'}
🔗 ${rssArticle?.url || ''}`
    : `Este é um REELS/vídeo curto. ${plan.cta}`;
  
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: plan.theme,
      postType: isNewsBroadcast ? 'noticia' : 'entretenimento',
      customInstructions: captionInstructions
    })
  });
  
  let caption = `🎬 ${plan.theme}`;
  let hashtags: string[] = ['#tecnologia', '#reels', '#viral', '#ia'];
  
  if (captionResponse.ok) {
    const captionData = await captionResponse.json();
    caption = captionData.caption || caption;
    hashtags = captionData.hashtags || hashtags;
  }
  
  // Ensure news Reels have source URL in caption
  if (isNewsBroadcast && rssArticle?.url) {
    const hasSource = caption.includes('Fonte:') || caption.includes('🔗');
    if (!hasSource) {
      const sourceDomain = new URL(rssArticle.url).hostname.replace('www.', '');
      caption += `\n\n📰 Fonte: ${sourceDomain}\n🔗 ${rssArticle.url}`;
    }
  }
  
  // STEP 4: Create post
  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    workspace_id: workspaceId,
    caption,
    hashtags,
    post_type: isNewsBroadcast ? 'noticia' : 'entretenimento',
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
        totalDuration: 25,
      },
      article_url: rssArticle?.url || null,
      article_image_url: null,
      is_news_broadcast: isNewsBroadcast,
      needs_processing: true,
      created_by_agent: true,
      publish_after_render: autoPublish
    },
    ai_model_used: 'gemini-2.5-flash'
  }).select().single();
  
  if (error) throw error;
  console.log('[AGENT] Post de vídeo criado:', post.id);
  
  // Link RSS item to post
  if ((plan as any)._rssItemId) {
    await supabase.from('rss_items').update({ used_in_post_id: post.id }).eq('id', (plan as any)._rssItemId);
  }
  
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

// Create CAROUSEL content - ONE unified theme with 4 progressive educational slides
async function createCarouselContent(
  supabase: any,
  plan: ContentPlan,
  userId: string,
  workspaceId: string,
  supabaseUrl: string,
  headers: any,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Criando carrossel EDUCACIONAL unificado:', plan.theme);
  
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  // STEP 1: Pick the BEST single RSS article as the carousel theme
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
  
  if (!rssItems || rssItems.length === 0) {
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
      error_message: 'Sem notícias na biblioteca. Adicione mais fontes RSS.',
      ai_model_used: 'none'
    }).select().single();
    if (error) throw error;
    return post;
  }
  
  // Pick THE BEST single article as the unified theme
  const scored = rssItems.map((item: any) => ({
    item,
    score: calculateNewsRankingScore(item)
  })).sort((a: any, b: any) => b.score - a.score);
  
  const bestArticle = scored[0].item;
  console.log(`[AGENT] 📰 Tema único do carrossel: "${bestArticle.title}"`);
  
  // Mark as used
  await supabase.from('rss_items').update({ is_used: true }).eq('id', bestArticle.id);
  
  // STEP 2: Use AI to generate 4 PROGRESSIVE slides about this ONE topic
  // Each slide builds on the previous one: Contexto → O que é → Impacto → O que fazer
  let slideContents: { slideTitle: string; slideText: string; imagePrompt: string }[] = [];
  
  if (lovableApiKey) {
    try {
      const carouselPrompt = `Você é um criador de conteúdo educacional viral para Instagram.

TEMA DO CARROSSEL: "${bestArticle.title}"
CONTEXTO: ${bestArticle.description || bestArticle.title}
FONTE: ${bestArticle.source_name || 'Tech News'}

Crie um carrossel EDUCACIONAL de 4 slides sobre esse ÚNICO tema. Cada slide deve aprofundar progressivamente:

SLIDE 1 - HOOK: Título impactante que gera curiosidade. Deve fazer a pessoa parar de rolar o feed.
SLIDE 2 - CONTEXTO: Explicação clara do que está acontecendo e por quê é importante.
SLIDE 3 - IMPACTO: Como isso afeta a vida das pessoas, empresas ou o futuro.
SLIDE 4 - AÇÃO: O que as pessoas devem saber/fazer. Conclusão forte com insight valioso.

REGRAS:
- Todos os 4 slides são sobre o MESMO tema, aprofundando progressivamente
- slideTitle: máximo 8 palavras, impactante, em CAIXA ALTA
- slideText: 2-3 frases curtas e diretas por slide (texto que aparece no slide)
- imagePrompt: descrição visual para gerar imagem IA coerente com o slide (em inglês)
- As 4 imagens devem ter CONSISTÊNCIA VISUAL (mesmo estilo, cores, ambiente)

Responda em JSON:
{
  "slides": [
    { "slideTitle": "...", "slideText": "...", "imagePrompt": "..." },
    { "slideTitle": "...", "slideText": "...", "imagePrompt": "..." },
    { "slideTitle": "...", "slideText": "...", "imagePrompt": "..." },
    { "slideTitle": "...", "slideText": "...", "imagePrompt": "..." }
  ]
}`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'user', content: carouselPrompt }
          ],
          response_format: { type: 'json_object' }
        })
      });

      if (response.ok) {
        const result = await response.json();
        const content = result.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed.slides && Array.isArray(parsed.slides) && parsed.slides.length >= 4) {
            slideContents = parsed.slides.slice(0, 4);
            console.log('[AGENT] ✅ 4 slides educacionais gerados pela IA');
          }
        }
      }
    } catch (e) {
      console.log('[AGENT] Erro ao gerar slides com IA:', e);
    }
  }
  
  // Fallback if AI failed
  if (slideContents.length < 4) {
    const topic = bestArticle.title;
    slideContents = [
      { slideTitle: 'VOCÊ PRECISA SABER DISSO', slideText: topic, imagePrompt: `Dramatic tech scene, futuristic environment, strong visual hook about: ${topic}` },
      { slideTitle: 'O QUE ESTÁ ACONTECENDO', slideText: bestArticle.description || topic, imagePrompt: `Informative tech visualization, data flows and connections about: ${topic}` },
      { slideTitle: 'POR QUE ISSO IMPORTA', slideText: `O impacto dessa mudança vai além do que você imagina.`, imagePrompt: `Impact visualization, global scale technology transformation about: ${topic}` },
      { slideTitle: 'O QUE VOCÊ DEVE FAZER', slideText: `Fique atento e se prepare para as mudanças que vêm por aí.`, imagePrompt: `Conclusion scene, person looking at future tech horizon, hopeful and determined about: ${topic}` },
    ];
  }
  
  // STEP 3: Generate 4 AI images with VISUAL CONSISTENCY
  console.log('[AGENT] 🎨 Gerando 4 imagens IA com consistência visual...');
  const carouselImages: string[] = [];
  
  // Build segments for search-images-for-video (AI generation mode)
  const segments = slideContents.map((slide, i) => ({
    text: slide.slideTitle,
    imagePrompt: `${slide.imagePrompt}. Style: dark tech aesthetic, neon accents, consistent color palette across all 4 slides. Slide ${i + 1} of 4. Square format 1080x1080. NO TEXT in image.`,
  }));
  
  try {
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/search-images-for-video`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        topic: bestArticle.title,
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
        console.log(`[AGENT] ✅ ${carouselImages.length} imagens IA consistentes para carrossel`);
      }
    }
  } catch (e) {
    console.log('[AGENT] Erro geração IA carrossel:', e);
  }
  
  // STEP 4: Apply text overlays to each slide (headline burned into image)
  const overlaidImages: string[] = [];
  for (let i = 0; i < Math.min(carouselImages.length, slideContents.length); i++) {
    try {
      const overlayResponse = await fetch(`${supabaseUrl}/functions/v1/apply-text-overlay`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageUrl: carouselImages[i],
          headlineText: slideContents[i].slideTitle,
          watermarkText: i === carouselImages.length - 1 ? 'Neural Update' : undefined, // Watermark only on last slide
        })
      });
      
      if (overlayResponse.ok) {
        const overlayResult = await overlayResponse.json();
        overlaidImages.push(overlayResult.publicUrl || carouselImages[i]);
      } else {
        overlaidImages.push(carouselImages[i]);
      }
    } catch (e) {
      console.log(`[AGENT] Overlay slide ${i} falhou:`, e);
      overlaidImages.push(carouselImages[i]);
    }
  }
  
  // Use overlaid images if available, otherwise raw images
  const finalImages = overlaidImages.length >= 2 ? overlaidImages : carouselImages;
  
  console.log(`[AGENT] Carrossel com ${finalImages.length} slides finais`);
  
  // STEP 5: Generate RICH educational caption
  let caption = '';
  let hashtags: string[] = ['#tecnologia', '#ia', '#inovacao', '#futuro', '#carrossel'];
  
  const captionPrompt = `Crie uma legenda RICA e EDUCACIONAL para um carrossel do Instagram sobre: "${bestArticle.title}"

Os 4 slides do carrossel cobrem:
1. ${slideContents[0]?.slideTitle}: ${slideContents[0]?.slideText}
2. ${slideContents[1]?.slideTitle}: ${slideContents[1]?.slideText}
3. ${slideContents[2]?.slideTitle}: ${slideContents[2]?.slideText}
4. ${slideContents[3]?.slideTitle}: ${slideContents[3]?.slideText}

ESTRUTURA DA LEGENDA (obrigatória):
🔥 HOOK (1 linha): Frase impactante que complementa o slide 1 sem repetir
📌 CONTEXTO (2-3 linhas): Explicação concisa do tema com dados ou fatos
💡 INSIGHT VALIOSO (2-3 linhas): Análise profunda, opinião ou previsão que agrega valor real
👉 CTA (1 linha): Pergunta que convida ao debate

REGRAS:
- Legenda com VALOR REAL, não genérica
- Tom: especialista acessível, não robótico
- Máximo 250 palavras
- Use emojis com moderação (máx 5)
- Inclua fonte: ${bestArticle.source_name || 'Tech News'}
- Gere 8-12 hashtags relevantes

Responda em JSON: { "caption": "...", "hashtags": ["...", "..."] }`;

  try {
    const captionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: captionPrompt }],
        response_format: { type: 'json_object' }
      })
    });

    if (captionResponse.ok) {
      const captionResult = await captionResponse.json();
      const captionContent = captionResult.choices?.[0]?.message?.content;
      if (captionContent) {
        const parsed = JSON.parse(captionContent);
        caption = parsed.caption || caption;
        hashtags = parsed.hashtags || hashtags;
      }
    }
  } catch (e) {
    console.log('[AGENT] Erro ao gerar legenda do carrossel:', e);
  }
  
  // Fallback caption
  if (!caption) {
    caption = `🔥 ${slideContents[0]?.slideTitle || bestArticle.title}\n\n${slideContents.map((s, i) => `${i + 1}. ${s.slideText}`).join('\n')}\n\n💡 Deslize para entender o impacto completo.\n\n📰 Fonte: ${bestArticle.source_name || 'Tech News'}\n\n👉 O que você acha? Comente!`;
  }
  
  const canPublish = autoPublish && finalImages.length >= 2;
  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    workspace_id: workspaceId,
    caption,
    hashtags,
    post_type: 'educacional',
    media_type: 'carousel',
    platforms: plan.platforms || ['instagram'],
    status: finalImages.length >= 2 ? (canPublish ? 'scheduled' : 'draft') : 'failed',
    scheduled_for: canPublish ? new Date().toISOString() : null,
    image_url: finalImages[0] || null,
    carousel_images: finalImages,
    overlay_metadata: {
      type: 'educational_carousel',
      unified_theme: bestArticle.title,
      source: bestArticle.source_name,
      article_url: bestArticle.link,
      slide_titles: slideContents.map(s => s.slideTitle),
      ai_generated: true,
      has_text_overlay: overlaidImages.length > 0,
    },
    ai_model_used: 'gemini-2.5-flash'
  }).select().single();
  
  if (error) throw error;
  
  // Link RSS item to post
  if (post?.id) {
    await supabase.from('rss_items').update({ used_in_post_id: post.id }).eq('id', bestArticle.id);
  }
  
  console.log('[AGENT] ✅ Carrossel educacional unificado criado:', post.id, 'slides:', finalImages.length);
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
  
  // 2. Research the product via Firecrawl for accurate selling points (with timeout)
  let productResearch = '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: `${selectedAffiliate.product_name} review análise vale a pena`,
        limit: 3,
        lang: 'pt-BR'
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    
    if (searchResponse.ok) {
      const searchResult = await searchResponse.json();
      const articles = (searchResult.data || []).slice(0, 3);
      productResearch = articles.map((a: any) => `${a.title}: ${a.description || ''}`).join('\n');
      console.log(`[AGENT] Pesquisa do produto: ${articles.length} resultados`);
    }
  } catch (e: any) {
    console.log(`[AGENT] Pesquisa Firecrawl falhou (${e.name || e.message}), usando descrição do cadastro`);
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

  // 3.5 REVIEW caption with review-portuguese to fix spelling errors
  try {
    console.log('[AGENT] 📝 Revisando caption de marketing com review-portuguese...');
    const reviewResponse = await fetch(`${supabaseUrl}/functions/v1/review-portuguese`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text: caption,
        type: 'caption',
        context: `Post de marketing para o produto "${selectedAffiliate.product_name}". Mantenha o link ${selectedAffiliate.affiliate_url} intacto.`
      })
    });
    if (reviewResponse.ok) {
      const reviewResult = await reviewResponse.json();
      if (reviewResult.success && reviewResult.corrected) {
        if (reviewResult.wasModified) {
          console.log(`[AGENT] ✅ Caption revisada: "${caption.substring(0, 40)}..." → "${reviewResult.corrected.substring(0, 40)}..."`);
        }
        caption = reviewResult.corrected;
      }
    }
  } catch (e) {
    console.warn('[AGENT] Review-portuguese falhou (não-bloqueante):', e);
  }
  
  // 4. Get product image (use affiliate's image, or generate via AI)
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
      imageUrl = null; // Force AI generation
    }
  }
  
  // FALLBACK: Generate AI image WITHOUT TEXT, then apply text overlay programmatically
  // This prevents spelling errors from AI-generated text in images
  if (!imageUrl) {
    console.log('[AGENT] 🎨 Gerando imagem AI para post de afiliado (SEM TEXTO)...');
    try {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (lovableApiKey) {
        const imgResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            modalities: ["image", "text"],
            messages: [{
              role: "user",
              content: `Crie uma imagem profissional de marketing para Instagram (1080x1080) para o produto: "${selectedAffiliate.product_name}".
Descrição: ${selectedAffiliate.description || 'Produto de tecnologia'}.

REGRAS OBRIGATÓRIAS:
1. ⛔ NÃO INCLUA NENHUM TEXTO NA IMAGEM ⛔ - Sem palavras, letras, números ou símbolos escritos
2. Estilo: design de marketing premium, fundo escuro com gradiente tecnológico
3. Visual persuasivo: mostre o conceito do produto com ícones e elementos gráficos
4. Cores vibrantes de destaque (amarelo, azul, verde neon) sobre fundo escuro
5. NÃO use fotos de pessoas
6. Composição limpa com espaço para texto ser adicionado depois
7. Estética moderna, futurista, profissional`
            }]
          }),
        });

        if (imgResponse.ok) {
          const imgData = await imgResponse.json();
          const generatedImgUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          
          if (generatedImgUrl && generatedImgUrl.startsWith('data:image/')) {
            const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
            const b64 = generatedImgUrl.split('base64,')[1];
            if (b64) {
              const imageData = decode(b64);
              const filename = `marketing-base-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
              
              const { error: upErr } = await supabase.storage
                .from('post-images')
                .upload(filename, imageData, { contentType: 'image/jpeg', upsert: false });
              
              if (!upErr) {
                const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(filename);
                const baseImageUrl = publicUrl;
                console.log('[AGENT] ✅ Imagem base gerada (sem texto):', baseImageUrl);
                
                // Apply text overlay programmatically (review-portuguese built-in)
                try {
                  const overlayResponse = await fetch(`${supabaseUrl}/functions/v1/apply-text-overlay`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                      imageUrl: baseImageUrl,
                      title: selectedAffiliate.product_name,
                      watermarkText: 'Neural Update',
                      generateHeadline: true,
                      context: `Marketing do produto "${selectedAffiliate.product_name}". ${selectedAffiliate.description || ''}`
                    })
                  });
                  
                  if (overlayResponse.ok) {
                    const overlayResult = await overlayResponse.json();
                    imageUrl = overlayResult.publicUrl || baseImageUrl;
                    console.log('[AGENT] ✅ Overlay de marketing com headline aplicado:', overlayResult.headline);
                  } else {
                    imageUrl = baseImageUrl;
                  }
                } catch (overlayErr) {
                  console.warn('[AGENT] Overlay falhou, usando imagem base:', overlayErr);
                  imageUrl = baseImageUrl;
                }
              }
            }
          }
        }
      }
    } catch (imgErr) {
      console.log('[AGENT] ⚠️ AI image generation failed for affiliate:', imgErr);
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
  
  // ── AI COHERENCE CHECK: Verify og:image matches article content ──
  if (selectedImage && selectedArticle?.title) {
    console.log('[AGENT] 🧠 Running AI coherence check on RSS image...');
    try {
      const coherenceResponse = await fetch(`${supabaseUrl}/functions/v1/validate-image-coherence`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageUrl: selectedImage,
          headline: selectedArticle.title,
          caption: selectedArticle.description || '',
          articleTitle: selectedArticle.title,
        })
      });
      if (coherenceResponse.ok) {
        const coherenceResult = await coherenceResponse.json();
        console.log(`[AGENT] 🧠 Coherence: ${coherenceResult.coherent} (${coherenceResult.confidence}) — ${coherenceResult.reason}`);
        
        if (!coherenceResult.coherent && coherenceResult.confidence >= 0.6) {
          console.log('[AGENT] ⛔ RSS image REJECTED by AI coherence — will use fallback');
          selectedImage = null; // Triggers fallback below
        }
      }
    } catch (cohErr) {
      console.warn('[AGENT] Coherence check failed (non-blocking):', cohErr);
    }
  }

  // Fallback: if image was rejected by coherence check, search for a relevant stock image
  if (!selectedImage && selectedArticle) {
    console.log('[AGENT] 🔍 Searching for coherent fallback image...');
    try {
      const imgSearchResponse = await fetch(`${supabaseUrl}/functions/v1/search-images-for-video`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          articleTitle: selectedArticle.title,
          articleDescription: selectedArticle.description || '',
          articleUrl: selectedArticle.url,
          useArticleMode: true,
          skipWatermark: true,
        })
      });
      if (imgSearchResponse.ok) {
        const imgResult = await imgSearchResponse.json();
        if (imgResult.images && imgResult.images.length > 0) {
          selectedImage = imgResult.images[0].imageUrl;
          console.log('[AGENT] ✅ Coherent fallback image from:', imgResult.images[0].source || 'stock');
        }
      }
    } catch (e) {
      console.warn('[AGENT] Fallback image search failed:', e);
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
  
  // Link RSS item to post for source ranking
  if (post?.id && bestItem?.item?.id) {
    await supabase.from('rss_items').update({ used_in_post_id: post.id }).eq('id', bestItem.item.id);
  }
  
  console.log('[AGENT] Post de notícia criado:', post.id, 'com imagem real:', !!imageUrl);
  return post;
}

// Create IMAGE content - USES AI-GENERATED IMAGE for original visual content
// DIFERENTE de news: image posts são conteúdo ORIGINAL de reflexão/opinião com imagem IA
async function createImageContent(
  supabase: any,
  plan: ContentPlan,
  userId: string,
  workspaceId: string,
  supabaseUrl: string,
  headers: any,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Criando post de IMAGEM ORIGINAL (IA):', plan.theme);
  
  // STEP 1: Get trending topic from RSS for inspiration (but NOT for image)
  const bestItem = await selectBestRssItem(supabase, workspaceId, supabaseUrl, headers, userId);
  
  const inspirationTopic = bestItem ? bestItem.item.title : plan.theme;
  const inspirationDesc = bestItem ? bestItem.item.description : '';
  
  // Mark RSS as used if we used it for inspiration
  if (bestItem) {
    await supabase.from('rss_items').update({ is_used: true }).eq('id', bestItem.item.id);
  }
  
  // STEP 2: Generate AI image based on topic
  let imageUrl = null;
  try {
    console.log('[AGENT] 🎨 Gerando imagem IA para post de reflexão...');
    const imageResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: `Imagem futurista e impactante sobre: ${inspirationTopic}. Estilo editorial tech, cores vibrantes, composição cinematográfica, sem texto na imagem`,
        width: 1080,
        height: 1080,
      })
    });
    
    if (imageResponse.ok) {
      const imageResult = await imageResponse.json();
      imageUrl = imageResult.publicUrl || imageResult.url || imageResult.image_url;
      console.log('[AGENT] ✅ Imagem IA gerada:', imageUrl ? 'sim' : 'não');
    }
  } catch (e) {
    console.log('[AGENT] Erro ao gerar imagem IA:', e);
  }
  
  // Fallback: use RSS image if AI generation failed
  if (!imageUrl && bestItem?.item?.image_url) {
    console.log('[AGENT] Fallback: usando imagem RSS');
    try {
      const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/upload-external-image`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageUrl: bestItem.item.image_url })
      });
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        imageUrl = uploadResult.publicUrl;
      }
    } catch (e) {
      console.log('[AGENT] Upload fallback falhou:', e);
    }
  }
  
  // STEP 3: Generate OPINION/REFLECTION caption (NOT news format)
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: `${inspirationTopic}. ${inspirationDesc}`,
      postType: 'engajamento',
      customInstructions: `Este é um post de REFLEXÃO/OPINIÃO sobre tecnologia, NÃO uma notícia.
      
Estrutura:
1. PROVOCAÇÃO - Uma afirmação forte ou pergunta provocativa sobre o tema
2. CONTEXTO PESSOAL - Sua análise/opinião como especialista em tech
3. CTA DE ENGAJAMENTO - Pergunta aberta para gerar discussão nos comentários

Tom: ${plan.tone || 'provocativo e visionário'}
NÃO inclua "Fonte:" ou links de artigos. Este é conteúdo ORIGINAL, não curadoria.
Use emojis com moderação. ${plan.cta || ''}`
    })
  });
  
  let caption = `💡 ${inspirationTopic}`;
  let hashtags: string[] = ['#tecnologia', '#reflexao', '#futuro', '#ia', '#inovacao'];
  
  if (captionResponse.ok) {
    const captionData = await captionResponse.json();
    caption = captionData.caption || caption;
    hashtags = captionData.hashtags || hashtags;
  }
  
  const canPublish = autoPublish && imageUrl;
  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    workspace_id: workspaceId,
    caption,
    hashtags,
    post_type: 'engajamento', // NOT 'noticia' — this is original content
    media_type: 'image',
    platforms: plan.platforms || ['instagram'],
    status: imageUrl ? (canPublish ? 'scheduled' : 'draft') : 'draft',
    scheduled_for: canPublish ? new Date().toISOString() : null,
    image_url: imageUrl,
    overlay_metadata: {
      type: 'original_image',
      inspiration_topic: inspirationTopic,
      ai_generated_image: true,
      created_by_agent: true
    },
    ai_model_used: 'gemini-2.5-flash'
  }).select().single();
  
  if (error) throw error;
  
  // Link RSS item to post for source ranking
  if (post?.id && bestItem?.item?.id) {
    await supabase.from('rss_items').update({ used_in_post_id: post.id }).eq('id', bestItem.item.id);
  }
  
  console.log('[AGENT] Post de imagem ORIGINAL (IA) criado:', post.id);
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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const searchResponse = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: 'inteligência artificial novidades tecnologia 2026',
          limit: 3,
          lang: 'pt-BR'
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      
      if (searchResponse.ok) {
        const searchResult = await searchResponse.json();
        aiNews = (searchResult.data || []).slice(0, 3).map((a: any) => a.title || a.url).filter(Boolean);
      }
    } catch (e: any) {
      console.log(`[AGENT] Erro ao buscar notícias (${e.name || e.message})`);
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
      
      // CLEANUP: Mark any stuck "running" reports older than 10 minutes as timed_out
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: stuckReports } = await supabase
        .from('agent_execution_reports')
        .update({
          status: 'timed_out',
          finished_at: new Date().toISOString(),
          summary: '⏱️ Execução expirou (timeout). O agente tentará novamente no próximo ciclo.'
        })
        .eq('status', 'running')
        .lt('started_at', tenMinAgo)
        .select('id');
      
      if (stuckReports && stuckReports.length > 0) {
        console.log(`[AGENT] Limpou ${stuckReports.length} relatórios travados como "running"`);
      }
      
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
        } catch (e: any) {
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
