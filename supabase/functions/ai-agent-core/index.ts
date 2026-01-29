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
      `✅ Pronto! Criei um ${details?.type || 'post'} sobre "${details?.theme || 'tendências'}". ${details?.needsRender ? 'Precisa só renderizar o vídeo quando puder! 🎬' : details?.published ? 'Publicado! 🚀' : ''}`,
      `🎉 Feito! Novo ${details?.type || 'conteúdo'} criado. ${details?.status === 'published' ? 'Já foi publicado!' : details?.status === 'scheduled' ? 'Agendado!' : 'Está nos rascunhos.'}`,
      `👍 Concluído! ${details?.type || 'Post'} sobre "${details?.theme || 'tech'}" ${details?.status === 'published' ? 'no ar!' : 'pronto pra revisão.'}`
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
async function analyzeCurrentState(supabase: any, userId: string): Promise<AgentState> {
  console.log('[AGENT] Etapa 1: Analisando estado atual...');
  
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
  
  // Busca posts das últimas 72h (publicados para métricas)
  const { data: posts72h, error: postsError } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'published')
    .gte('published_at', hours72Ago.toISOString())
    .order('published_at', { ascending: false });
  
  if (postsError) {
    console.error('[AGENT] Erro ao buscar posts:', postsError);
  }
  
  const recentPosts = posts72h || [];
  
  // *** FIX: Contar TODOS os posts criados HOJE (draft, scheduled, published) para limite diário ***
  const { data: todayPosts } = await supabase
    .from('posts')
    .select('id, status')
    .eq('user_id', userId)
    .gte('created_at', todayStartUTC.toISOString());
  
  const postsCreatedToday = (todayPosts || []).length;
  console.log(`[AGENT] Posts criados HOJE: ${postsCreatedToday} (draft+scheduled+published)`);
  
  // Busca posts desta semana para tracking de distribuição
  const { data: weekPosts } = await supabase
    .from('posts')
    .select('media_type, post_type, status')
    .eq('user_id', userId)
    .in('status', ['published', 'scheduled', 'draft'])
    .gte('created_at', weekStartUTC.toISOString());
  
  const postsThisWeek = weekPosts || [];
  
  // Carrega contexto do agente
  const { data: context, error: contextError } = await supabase
    .from('agent_context')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  
  if (contextError) {
    console.error('[AGENT] Erro ao buscar contexto:', contextError);
  }
  
  // Se não existe contexto, cria um
  if (!context) {
    console.log('[AGENT] Criando contexto inicial...');
    await supabase
      .from('agent_context')
      .insert({ user_id: userId })
      .select()
      .single();
    
    return analyzeCurrentState(supabase, userId);
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
    .eq('user_id', userId)
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
  
  // Determine next content type based on which has most remaining quota (proportional)
  const getRemaining = (type: ContentType): number => {
    const goal = weeklyGoals[type === 'video' ? 'videos' : type === 'carousel' ? 'carousels' : type === 'news' ? 'news' : 'images'];
    const progress = weeklyProgress[type === 'video' ? 'videos' : type === 'carousel' ? 'carousels' : type === 'news' ? 'news' : 'images'];
    return Math.max(0, goal - progress);
  };
  
  const remainingByType = [
    { type: 'video' as ContentType, remaining: getRemaining('video'), priority: 4 },     // Higher priority
    { type: 'carousel' as ContentType, remaining: getRemaining('carousel'), priority: 3 },
    { type: 'news' as ContentType, remaining: getRemaining('news'), priority: 2 },
    { type: 'image' as ContentType, remaining: getRemaining('image'), priority: 1 }
  ].filter(t => t.remaining > 0)
   .sort((a, b) => {
     // Sort by remaining (descending) then by priority (descending)
     if (b.remaining !== a.remaining) return b.remaining - a.remaining;
     return b.priority - a.priority;
   });
  
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
  supabaseUrl: string,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Etapa 3-4: Executando plano de conteúdo...');
  console.log('[AGENT] Plano:', JSON.stringify(plan, null, 2));
  console.log('[AGENT] Tipo de conteúdo:', plan.contentType);
  console.log('[AGENT] Auto-publish:', autoPublish);
  
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceRoleKey}`
  };
  
  // Route to appropriate content creation based on contentType
  switch (plan.contentType) {
    case 'video':
      return createVideoContent(supabase, plan, userId, supabaseUrl, headers, autoPublish);
    case 'carousel':
      return createCarouselContent(supabase, plan, userId, supabaseUrl, headers, autoPublish);
    case 'news':
      return createNewsContent(supabase, plan, userId, supabaseUrl, headers, autoPublish);
    case 'image':
    default:
      return createImageContent(supabase, plan, userId, supabaseUrl, headers, autoPublish);
  }
}

// Create VIDEO content (reels/narrated video)
async function createVideoContent(
  supabase: any,
  plan: ContentPlan,
  userId: string,
  supabaseUrl: string,
  headers: any,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Criando vídeo/reels:', plan.theme);
  
  // Generate script for video
  const scriptResponse = await fetch(`${supabaseUrl}/functions/v1/generate-story-script`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: plan.theme,
      segmentCount: 4,
      wordsPerSegment: 12,
      totalDuration: 20,
      style: plan.tone || 'impactante'
    })
  });
  
  let script = null;
  let thumbnailUrl = null;
  
  if (scriptResponse.ok) {
    script = await scriptResponse.json();
    console.log('[AGENT] Script gerado:', script.title);
    
    // Generate thumbnail from first segment
    if (script.segments?.[0]?.imagePrompt) {
      const imgResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: `${script.segments[0].imagePrompt}. Cinematic, vertical 9:16 aspect ratio.`,
          format: 'portrait',
          model: 'gemini'
        })
      });
      
      if (imgResponse.ok) {
        const imgData = await imgResponse.json();
        thumbnailUrl = imgData.imageUrl;
      }
    }
  }
  
  // Generate caption
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: script?.title || plan.theme,
      postType: 'entretenimento',
      customInstructions: `Este é um REELS/vídeo curto. ${plan.cta}`
    })
  });
  
  let caption = `🎬 ${script?.title || plan.theme}`;
  let hashtags: string[] = ['#tecnologia', '#reels', '#viral', '#ia'];
  
  if (captionResponse.ok) {
    const captionData = await captionResponse.json();
    caption = captionData.caption || caption;
    hashtags = captionData.hashtags || hashtags;
  }
  
  // Create post with video metadata (needs_processing for frontend render)
  // Videos always stay as draft because they need client-side rendering
  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    caption,
    hashtags,
    post_type: 'entretenimento',
    media_type: 'reels',
    platforms: plan.platforms || ['instagram'],
    status: 'draft', // Videos ALWAYS draft - need frontend render
    image_url: thumbnailUrl,
    overlay_metadata: {
      type: 'narrated_video',
      script,
      topic: plan.theme,
      needs_processing: true,
      created_by_agent: true,
      publish_after_render: autoPublish // Publish after frontend renders
    },
    ai_model_used: 'gemini-2.5-flash'
  }).select().single();
  
  if (error) throw error;
  console.log('[AGENT] Vídeo criado (aguardando render):', post.id);
  return post;
}

// Create CAROUSEL content
async function createCarouselContent(
  supabase: any,
  plan: ContentPlan,
  userId: string,
  supabaseUrl: string,
  headers: any,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Criando carrossel:', plan.theme);
  
  // Generate 4 images for carousel
  const slidePrompts = [
    `Slide 1: Introdução visual para ${plan.theme}. Clean, modern, tech aesthetic.`,
    `Slide 2: Dados ou estatísticas sobre ${plan.theme}. Infographic style.`,
    `Slide 3: Benefícios ou aplicações de ${plan.theme}. Professional design.`,
    `Slide 4: Conclusão ou CTA sobre ${plan.theme}. Impactful, memorable.`
  ];
  
  const carouselImages: string[] = [];
  
  for (const prompt of slidePrompts) {
    const imgResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt,
        format: 'square',
        model: 'gemini'
      })
    });
    
    if (imgResponse.ok) {
      const imgData = await imgResponse.json();
      if (imgData.imageUrl) {
        carouselImages.push(imgData.imageUrl);
      }
    }
  }
  
  // Generate caption
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: plan.theme,
      postType: 'educacional',
      customInstructions: `Este é um CARROSSEL com ${carouselImages.length} slides. ${plan.cta}`
    })
  });
  
  let caption = `📚 ${plan.theme}`;
  let hashtags: string[] = ['#carrossel', '#tecnologia', '#dicas', '#educacional'];
  
  if (captionResponse.ok) {
    const captionData = await captionResponse.json();
    caption = captionData.caption || caption;
    hashtags = captionData.hashtags || hashtags;
  }
  
  // Create carousel post - can publish directly if has enough images and autoPublish
  const canPublish = autoPublish && carouselImages.length >= 2;
  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    caption,
    hashtags,
    post_type: 'educacional',
    media_type: 'carousel',
    platforms: plan.platforms || ['instagram'],
    status: carouselImages.length >= 2 ? (canPublish ? 'scheduled' : 'draft') : 'failed',
    scheduled_for: canPublish ? new Date().toISOString() : null, // Immediate schedule for publish
    image_url: carouselImages[0] || null,
    carousel_images: carouselImages,
    ai_model_used: 'gemini-2.5-flash'
  }).select().single();
  
  if (error) throw error;
  console.log('[AGENT] Carrossel criado:', post.id, 'slides:', carouselImages.length);
  return post;
}

// Create NEWS content (using Firecrawl)
async function createNewsContent(
  supabase: any,
  plan: ContentPlan,
  userId: string,
  supabaseUrl: string,
  headers: any,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Criando post de notícia:', plan.theme);
  
  // Search for news using Firecrawl
  const searchResponse = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: `${plan.theme} notícia recente tecnologia`,
      limit: 10,
      lang: 'pt-BR',
      country: 'BR'
    })
  });
  
  let selectedArticle = null;
  let selectedImage = null;
  let sourceDomain = '';
  let sourceUrl = '';
  
  if (searchResponse.ok) {
    const searchResult = await searchResponse.json();
    const articles = searchResult.data || [];
    
    // Find article with best images
    const withImages = articles.filter((a: any) => a.images?.length > 0)
      .sort((a: any, b: any) => (b.images?.length || 0) - (a.images?.length || 0));
    
    selectedArticle = withImages[0] || articles[0];
    
    if (selectedArticle) {
      sourceUrl = selectedArticle.url || '';
      try {
        sourceDomain = new URL(sourceUrl).hostname.replace('www.', '');
      } catch { sourceDomain = 'fonte'; }
      
      // Select best image (filter icons/logos)
      if (selectedArticle.images?.length > 0) {
        const qualityImages = selectedArticle.images.filter((img: string) =>
          img && !img.includes('icon') && !img.includes('logo') && 
          !img.includes('avatar') && !img.includes('favicon')
        );
        selectedImage = qualityImages[0] || selectedArticle.images[0];
      }
    }
  }
  
  console.log('[AGENT] Artigo selecionado:', selectedArticle?.title || 'nenhum');
  
  // Process image with watermark
  let imageUrl = null;
  if (selectedImage) {
    const watermarkResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        imageUrl: selectedImage,
        watermarkText: 'Neural Update'
      })
    });
    
    if (watermarkResponse.ok) {
      const wmResult = await watermarkResponse.json();
      imageUrl = wmResult.publicUrl || wmResult.url || wmResult.imageUrl;
    }
  }
  
  // Generate image if no article image
  if (!imageUrl) {
    const imgResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: `News illustration: ${selectedArticle?.title || plan.theme}. Professional journalism style.`,
        format: 'square',
        model: 'gemini'
      })
    });
    
    if (imgResponse.ok) {
      const imgData = await imgResponse.json();
      imageUrl = imgData.imageUrl;
    }
  }
  
  // Generate caption with source attribution
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: `${selectedArticle?.title || plan.theme}. ${selectedArticle?.description || ''}`,
      postType: 'noticia',
      sourceUrl: sourceUrl,
      sourceName: sourceDomain,
      customInstructions: `Esta é uma notícia REAL. OBRIGATÓRIO incluir fonte: 📰 Fonte: ${sourceDomain}\n🔗 ${sourceUrl}`
    })
  });
  
  let caption = `📰 ${selectedArticle?.title || plan.theme}`;
  let hashtags: string[] = ['#tecnologia', '#noticias', '#ia', '#tech'];
  
  if (captionResponse.ok) {
    const captionData = await captionResponse.json();
    caption = captionData.caption || caption;
    hashtags = captionData.hashtags || hashtags;
  }
  
  // Ensure source is in caption
  if (!caption.includes(sourceUrl) && sourceUrl) {
    caption += `\n\n📰 Fonte: ${sourceDomain}\n🔗 ${sourceUrl}`;
  }
  
  // Create post - publish directly if autoPublish and has image
  const canPublish = autoPublish && imageUrl;
  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    caption,
    hashtags,
    post_type: 'noticia',
    media_type: 'image',
    platforms: plan.platforms || ['instagram'],
    status: canPublish ? 'scheduled' : 'draft',
    scheduled_for: canPublish ? new Date().toISOString() : null,
    image_url: imageUrl,
    ai_model_used: 'gemini-2.5-flash'
  }).select().single();
  
  if (error) throw error;
  console.log('[AGENT] Post de notícia criado:', post.id);
  return post;
}

// Create IMAGE content (simple static post)
async function createImageContent(
  supabase: any,
  plan: ContentPlan,
  userId: string,
  supabaseUrl: string,
  headers: any,
  autoPublish: boolean = false
): Promise<any> {
  console.log('[AGENT] Criando post de imagem:', plan.theme);
  
  // Generate image
  const imgResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: `Professional social media post about: ${plan.theme}. Modern, tech aesthetic, engaging.`,
      format: 'square',
      model: 'gemini'
    })
  });
  
  let imageUrl = null;
  if (imgResponse.ok) {
    const imgData = await imgResponse.json();
    imageUrl = imgData.imageUrl;
  }
  
  // Generate caption
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: plan.theme,
      postType: plan.format,
      customInstructions: `Tom: ${plan.tone}. CTA: ${plan.cta}`
    })
  });
  
  let caption = plan.theme;
  let hashtags: string[] = ['#tecnologia', '#ia', '#futuro', '#inovacao'];
  
  if (captionResponse.ok) {
    const captionData = await captionResponse.json();
    caption = captionData.caption || caption;
    hashtags = captionData.hashtags || hashtags;
  }
  
  // Create post - publish directly if autoPublish and has image
  const canPublish = autoPublish && imageUrl;
  const { data: post, error } = await supabase.from('posts').insert({
    user_id: userId,
    caption,
    hashtags,
    post_type: plan.format,
    media_type: 'image',
    platforms: plan.platforms || ['instagram'],
    status: canPublish ? 'scheduled' : 'draft',
    scheduled_for: canPublish ? new Date().toISOString() : null,
    image_url: imageUrl,
    ai_model_used: 'gemini-2.5-flash'
  }).select().single();
  
  if (error) throw error;
  console.log('[AGENT] Post de imagem criado:', post.id);
  return post;
}

// ETAPA 5: MEMÓRIA E APRENDIZADO
async function recordDecisionAndLearn(
  supabase: any,
  decision: AgentDecision,
  state: AgentState,
  postId: string | null,
  userId: string
): Promise<void> {
  console.log('[AGENT] Etapa 5: Registrando decisão e aprendizados...');
  
  // Salvar decisão
  const { error: decisionError } = await supabase.from('agent_decisions').insert({
    user_id: userId,
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
  
  // Atualizar contexto do agente se houve sucesso
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
      .eq('user_id', userId);
    
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
    let trigger = 'manual';
    
    try {
      const body = await req.json();
      userId = body.userId;
      trigger = body.trigger || 'manual';
    } catch {
      // No body or invalid JSON
    }
    
    // If triggered by cron, process all users with auto_post_enabled
    if (trigger === 'cron' && !userId) {
      console.log('[AGENT] Trigger: CRON - Processando todos os usuários ativos...');
      
      const { data: activeContexts } = await supabase
        .from('agent_context')
        .select('user_id')
        .eq('auto_post_enabled', true);
      
      if (!activeContexts || activeContexts.length === 0) {
        console.log('[AGENT] Nenhum usuário com auto_post ativo');
        return new Response(
          JSON.stringify({ success: true, message: 'Nenhum usuário ativo' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const results = [];
      for (const ctx of activeContexts) {
        try {
          const result = await processUser(supabase, ctx.user_id, lovableApiKey, supabaseUrl, 'cron');
          results.push({ userId: ctx.user_id, ...result });
        } catch (e) {
          console.error(`[AGENT] Erro ao processar usuário ${ctx.user_id}:`, e);
          results.push({ userId: ctx.user_id, error: String(e) });
        }
      }
      
      console.log('[AGENT] ===== CICLO CRON FINALIZADO =====');
      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Single user processing
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId é obrigatório para trigger manual' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const result = await processUser(supabase, userId, lovableApiKey, supabaseUrl);
    
    console.log('[AGENT] ===== CICLO FINALIZADO =====');
    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[AGENT] Erro fatal:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Process a single user
async function processUser(
  supabase: any, 
  userId: string, 
  lovableApiKey: string,
  supabaseUrl: string,
  trigger: string = 'manual'
): Promise<any> {
  console.log(`[AGENT] Processando usuário: ${userId}`);
  
  // Get agent name for conversational messages
  const { data: contextData } = await supabase
    .from('agent_context')
    .select('agent_name')
    .eq('user_id', userId)
    .maybeSingle();
  const agentName = contextData?.agent_name || 'Agente';
  
  // Create execution report record
  const { data: reportRecord } = await supabase
    .from('agent_execution_reports')
    .insert({
      user_id: userId,
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
    
    // ETAPA 1: Análise
    const state = await analyzeCurrentState(supabase, userId);
    
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
      post = await executeContentPlan(supabase, decision.contentPlan, userId, supabaseUrl, autoPublish);
      
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
    
    // ETAPA 5: Registro de decisão
    await recordDecisionAndLearn(supabase, decision, state, post?.id || null, userId);
    
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
